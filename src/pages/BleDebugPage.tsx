/**
 * 蓝牙配网调试页（临时）
 *
 * 显示蓝牙配网全过程的各项参数、命令收发、应答内容及报错。
 * 路由: /ble-debug
 *
 * ⚠️ 临时调试页面，正式发布前可移除。
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Bluetooth, Loader2, Trash2, Copy, Download,
  CheckCircle2, XCircle, AlertTriangle, Wifi,
} from 'lucide-react'
import { getProvisionManager, destroyProvisionManager } from '../protocols/bleProvision'
import { computeAesKey } from '../utils/bleCrypto'
import { parseBleName } from '../utils/dtuidParser'
import { BLE_PROVISION_UUIDS, BLE_PROVISION_MTU, type BleWifiAp } from '../types/protocol'

interface LogEntry {
  id: number
  ts: number
  level: 'info' | 'cmd' | 'resp' | 'error' | 'success'
  msg: string
  detail?: string
}

let logCounter = 0

export default function BleDebugPage() {
  const navigate = useNavigate()

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // ── 设备参数 ──
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [dtuid, setDtuid] = useState<string | null>(null)
  const [aesKey, setAesKey] = useState<string | null>(null)
  const [bleStatus, setBleStatus] = useState<number | null>(null)
  const [version, setVersion] = useState<{ SV?: string; HV?: string } | null>(null)
  const [apList, setApList] = useState<BleWifiAp[]>([])

  // ── WiFi 配置输入 ──
  const [ssid, setSsid] = useState('')
  const [wifiPwd, setWifiPwd] = useState('')
  const [bleKey, setBleKey] = useState('')

  const logEndRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((level: LogEntry['level'], msg: string, detail?: string) => {
    setLogs(prev => [...prev.slice(-200), { id: logCounter++, ts: Date.now(), level, msg, detail }])
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // ── 连接 ──
  const handleConnect = useCallback(async () => {
    setBusy('connect')
    addLog('info', 'Scanning and connecting to BLE device...')
    addLog('info', `Service=${BLE_PROVISION_UUIDS.SERVICE}`)
    addLog('info', `Write(TX)=${BLE_PROVISION_UUIDS.WRITE_TX}  Indicate(RX)=${BLE_PROVISION_UUIDS.INDICATE_RX}`)
    addLog('info', `MTU=${BLE_PROVISION_MTU}`)
    destroyProvisionManager()
    try {
      const manager = getProvisionManager({
        onLog: (m) => addLog('info', m),
        onDisconnected: () => { addLog('error', 'Device disconnected'); setConnected(false) },
      })
      await manager.connect()
      const name = manager.btDevice?.name ?? null
      const id = manager.getDuid()
      setDeviceName(name)
      setDtuid(id)
      if (name) {
        const parsed = parseBleName(name)
        if (parsed) {
          setBleStatus(parsed.status)
          addLog('info', `BLE name parsed: prefix=${parsed.prefix} status=${parsed.status} dtuid=${parsed.dtuid}`)
        } else {
          addLog('error', `Cannot parse BLE name: "${name}"`)
        }
      }
      if (id) {
        const key = computeAesKey(id)
        setAesKey(key)
        addLog('info', `AES Key = MD5("${id}SEC_") = ${key}`)
      }
      setConnected(true)
      addLog('success', `Connected: ${name ?? '(no name)'} DTUID=${id ?? 'unknown'}`)
    } catch (err) {
      addLog('error', 'Connection failed', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      setConnected(false)
    } finally {
      setBusy(null)
    }
  }, [addLog])

  const handleDisconnect = useCallback(() => {
    destroyProvisionManager()
    setConnected(false)
    setVersion(null)
    setApList([])
    addLog('info', 'Disconnected manually')
  }, [addLog])

  // ── 通用命令执行 ──
  const runCmd = useCallback(async <T,>(
    label: string,
    fn: () => Promise<T>,
    onResult?: (r: T) => void
  ) => {
    setBusy(label)
    const t0 = performance.now()
    addLog('cmd', `→ ${label}`)
    try {
      const resp = await fn()
      const dt = Math.round(performance.now() - t0)
      const r = resp as { RC?: number; CID?: number; PL?: unknown }
      const rc = r?.RC
      const rcText = rc === 0 ? 'OK' : rc === 9000 ? 'BLE password required' : rc === 9001 ? 'Wrong password' : rc === 1 ? 'Failed' : `RC=${rc}`
      addLog(
        rc === 0 ? 'resp' : 'error',
        `← ${label} [${dt}ms] CID=${r?.CID} RC=${rc} (${rcText})`,
        r?.PL !== undefined ? JSON.stringify(r.PL, null, 2) : undefined
      )
      onResult?.(resp)
      return resp
    } catch (err) {
      const dt = Math.round(performance.now() - t0)
      addLog('error', `← ${label} [${dt}ms] exception`, err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      return null
    } finally {
      setBusy(null)
    }
  }, [addLog])

  const handleGetVersion = useCallback(() => {
    const m = getProvisionManager()
    runCmd('GET_VER (30001)', () => m.getVersion(), (resp) => {
      if (resp.RC === 0 && resp.PL) setVersion(resp.PL)
    })
  }, [runCmd])

  const handleScanAp = useCallback(() => {
    const m = getProvisionManager()
    runCmd('GET_SCAN (30003)', () => m.scanAp(), (resp) => {
      if (resp.RC === 0 && Array.isArray(resp.PL)) {
        setApList(resp.PL)
        if (resp.PL.length && !ssid) setSsid(resp.PL[0].SSID)
      }
    })
  }, [runCmd, ssid])

  const handleConfig = useCallback(() => {
    const m = getProvisionManager()
    addLog('info', `Config params: SSID="${ssid}" Key length=${wifiPwd.length}`)
    runCmd(`SET_CONFIG (30005)`, () => m.configWifi(ssid, wifiPwd))
  }, [runCmd, ssid, wifiPwd, addLog])

  const handleWifiStatus = useCallback(() => {
    const m = getProvisionManager()
    runCmd('GET_WIFI_ST (30020)', () => m.getWifiStatus())
  }, [runCmd])

  const handleConfirmBleKey = useCallback(() => {
    const m = getProvisionManager()
    runCmd('CONFIRM_BLE_KEY (30050)', () => m.confirmBleKey(bleKey))
  }, [runCmd, bleKey])

  const handleRestart = useCallback(() => {
    const m = getProvisionManager()
    runCmd('RESTART (30007)', () => m.restart())
  }, [runCmd])

  // ── 日志操作 ──
  const handleCopyLogs = useCallback(() => {
    const text = logs.map(l =>
      `[${new Date(l.ts).toLocaleTimeString()}.${String(l.ts % 1000).padStart(3, '0')}] [${l.level.toUpperCase()}] ${l.msg}${l.detail ? '\n' + l.detail : ''}`
    ).join('\n')
    navigator.clipboard?.writeText(text).then(
      () => addLog('success', 'Logs copied to clipboard'),
      () => addLog('error', 'Copy failed')
    )
  }, [logs, addLog])

  const handleExportLogs = useCallback(() => {
    const text = logs.map(l =>
      `[${new Date(l.ts).toISOString()}] [${l.level.toUpperCase()}] ${l.msg}${l.detail ? '\n' + l.detail : ''}`
    ).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ble-debug-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [logs])

  const supported = typeof navigator !== 'undefined' && !!navigator.bluetooth

  // ── 命令按钮配置 ──
  const commands: { label: string; onClick: () => void; key: string }[] = [
    { label: 'GET_VER', onClick: handleGetVersion, key: 'GET_VER (30001)' },
    { label: 'GET_SCAN', onClick: handleScanAp, key: 'GET_SCAN (30003)' },
    { label: 'SET_CONFIG', onClick: handleConfig, key: 'SET_CONFIG (30005)' },
    { label: 'GET_WIFI_ST', onClick: handleWifiStatus, key: 'GET_WIFI_ST (30020)' },
    { label: 'CONFIRM_KEY', onClick: handleConfirmBleKey, key: 'CONFIRM_BLE_KEY (30050)' },
    { label: 'RESTART', onClick: handleRestart, key: 'RESTART (30007)' },
  ]

  const levelStyle: Record<LogEntry['level'], string> = {
    info: 'text-ink-5',
    cmd: 'text-primary',
    resp: 'text-success',
    error: 'text-danger',
    success: 'text-membership',
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3 safe-area-top border-b border-[rgba(255,255,255,0.06)]">
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="flex-1">
          <h1 className="text-title-md font-semibold text-white">BLE Provisioning Debug</h1>
          <p className="text-caption text-ink-6">Temporary debug page · /ble-debug</p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-semibold
          ${connected ? 'bg-[rgba(52,199,89,0.15)] text-success' : 'bg-ink-10 text-ink-6'}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-ink-6'}`} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* 浏览器支持提示 */}
        {!supported && (
          <div className="m-4 flex items-start gap-2 bg-[rgba(255,53,48,0.08)] rounded-l px-4 py-3">
            <AlertTriangle size={16} className="text-danger mt-0.5 flex-shrink-0" />
            <span className="text-body-md text-danger">
              This browser does not support Web Bluetooth. Use Chrome or Edge on Android/desktop (iOS Safari is not supported).
            </span>
          </div>
        )}

        {/* 连接控制 */}
        <div className="px-4 pt-4">
          {!connected ? (
            <button onClick={handleConnect} disabled={busy === 'connect' || !supported}
              className="w-full h-12 rounded-pill bg-primary text-black text-body-lg font-semibold
                disabled:opacity-50 flex items-center justify-center gap-2">
              {busy === 'connect' ? <Loader2 size={18} className="animate-spin" /> : <Bluetooth size={18} />}
              Scan & Connect
            </button>
          ) : (
            <button onClick={handleDisconnect}
              className="w-full h-12 rounded-pill bg-ink-10 text-danger text-body-lg font-semibold
                flex items-center justify-center gap-2">
              <XCircle size={18} /> Disconnect
            </button>
          )}
        </div>

        {/* 设备参数 */}
        <div className="px-4 pt-4">
          <p className="text-caption font-bold text-ink-6 tracking-widest uppercase mb-2">Device Params</p>
          <div className="bg-ink-10 rounded-l p-3 space-y-2 text-body-md">
            <ParamRow label="BLE Name" value={deviceName} />
            <ParamRow label="DTUID" value={dtuid} mono />
            <ParamRow label="AES Key" value={aesKey} mono />
            <ParamRow label="Connection Status" value={bleStatus === null ? null :
              `${bleStatus} (${bleStatus === 0 ? 'WiFi disconnected' : bleStatus === 1 ? 'WiFi connected' : bleStatus === 3 ? 'MQTT connected' : 'Reserved'})`} />
            <ParamRow label="Software Version (SV)" value={version?.SV ?? null} />
            <ParamRow label="Hardware Version (HV)" value={version?.HV ?? null} />
          </div>
        </div>

        {/* 命令按钮 */}
        <div className="px-4 pt-4">
          <p className="text-caption font-bold text-ink-6 tracking-widest uppercase mb-2">Commands</p>
          <div className="grid grid-cols-3 gap-2">
            {commands.map(c => (
              <button key={c.key} onClick={c.onClick} disabled={!connected || !!busy}
                className="h-11 rounded-m bg-ink-10 text-body-md font-semibold text-white
                  disabled:opacity-40 active:opacity-70 flex items-center justify-center gap-1">
                {busy === c.key ? <Loader2 size={14} className="animate-spin" /> : null}
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* WiFi 扫描结果 */}
        {apList.length > 0 && (
          <div className="px-4 pt-4">
            <p className="text-caption font-bold text-ink-6 tracking-widest uppercase mb-2">
              WiFi List ({apList.length})
            </p>
            <div className="bg-ink-10 rounded-l divide-y divide-[rgba(255,255,255,0.06)]">
              {apList.map((ap, i) => (
                <button key={`${ap.SSID}-${i}`} onClick={() => setSsid(ap.SSID)}
                  className="w-full px-3 py-2.5 flex items-center justify-between active:opacity-70">
                  <div className="flex items-center gap-2">
                    <Wifi size={14} className="text-primary" />
                    <span className={`text-body-md ${ssid === ap.SSID ? 'text-primary font-semibold' : 'text-white'}`}>
                      {ap.SSID || '(hidden network)'}
                    </span>
                  </div>
                  <span className="text-caption text-ink-6">{ap.Secu === 1 ? 'Encrypted' : 'Open'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 配置输入 */}
        <div className="px-4 pt-4 space-y-2">
          <p className="text-caption font-bold text-ink-6 tracking-widest uppercase mb-2">Config Input</p>
          <DebugInput label="SSID" value={ssid} onChange={setSsid} placeholder="WiFi name" />
          <DebugInput label="WiFi Password" value={wifiPwd} onChange={setWifiPwd} placeholder="WiFi password" />
          <DebugInput label="BLE Password" value={bleKey} onChange={setBleKey} placeholder="BLE Key (required when RC=9000)" />
        </div>

        {/* 日志 */}
        <div className="px-4 pt-4 pb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-caption font-bold text-ink-6 tracking-widest uppercase">
              Process Log ({logs.length})
            </p>
            <div className="flex items-center gap-2">
              <button onClick={handleCopyLogs} className="w-8 h-8 rounded-full bg-ink-10 flex items-center justify-center text-ink-5">
                <Copy size={14} />
              </button>
              <button onClick={handleExportLogs} className="w-8 h-8 rounded-full bg-ink-10 flex items-center justify-center text-ink-5">
                <Download size={14} />
              </button>
              <button onClick={() => setLogs([])} className="w-8 h-8 rounded-full bg-ink-10 flex items-center justify-center text-danger">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="bg-black rounded-l p-3 font-mono text-tiny leading-relaxed min-h-[200px] max-h-[400px] overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-ink-7">No logs yet. Tap "Scan & Connect" to start...</p>
            ) : (
              logs.map(l => {
                const time = new Date(l.ts)
                const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}.${String(l.ts % 1000).padStart(3, '0')}`
                return (
                  <div key={l.id} className="mb-1">
                    <span className="text-ink-7">{timeStr} </span>
                    <span className={levelStyle[l.level]}>
                      {l.level === 'error' && <XCircle size={10} className="inline mb-0.5 mr-0.5" />}
                      {l.level === 'success' && <CheckCircle2 size={10} className="inline mb-0.5 mr-0.5" />}
                      {l.msg}
                    </span>
                    {l.detail && (
                      <pre className="text-ink-5 whitespace-pre-wrap break-all mt-0.5 pl-2 border-l border-ink-9">{l.detail}</pre>
                    )}
                  </div>
                )
              })
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 子组件 ──

function ParamRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-ink-6 flex-shrink-0">{label}</span>
      <span className={`text-white text-right break-all ${mono ? 'font-mono text-caption' : ''}`}>
        {value ?? <span className="text-ink-7">—</span>}
      </span>
    </div>
  )
}

function DebugInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="bg-ink-10 rounded-m px-3 py-2">
      <p className="text-caption text-ink-6 mb-1">{label}</p>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-transparent text-body-md text-white placeholder:text-ink-7 outline-none" />
    </div>
  )
}
