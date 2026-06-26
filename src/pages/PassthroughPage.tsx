/**
 * Modbus 数据透传页
 * 路由：/device/:id/passthrough
 *
 * 功能：
 * - 预设常用 Modbus 报文（点击自动发送）
 * - 自定义十六进制帧输入
 * - 收发日志 + 响应自动解析摘要
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Send, Loader2, Terminal, Zap, Settings2 } from 'lucide-react'
import { passthroughDevice } from '../api/deviceApi'
import {
  FRAMES,
  buildWriteSingleFrame,
  parseReadResponse,
  parseRunState,
  parseWarnCode1,
  parseResponseToParams,
  toInt16,
  fromHexString,
  toHexString,
  REG_CONFIG,
  REG_STATUS,
  type ParsedParam,
} from '../protocols/modbusProtocol'

// ─── 预设报文分组 ─────────────────────────────────────────────────────────────

interface Preset {
  label: string
  frame: string
  desc: string
  type: 'read' | 'write' | 'ctrl'
}

const PRESET_GROUPS: { title: string; presets: Preset[] }[] = [
  {
    title: 'Read Data',
    presets: [
      { label: 'Read Run Params',    frame: FRAMES.READ_ALL_PARAMS,    desc: '0x0000 × 18 registers', type: 'read' },
      { label: 'Read Live Status',    frame: FRAMES.READ_ALL_STATUS,    desc: '0x0100 × 56 (voltage/power/SOC/temp)', type: 'read' },
      { label: 'Read Fault/Alarm',   frame: FRAMES.READ_FAULT_BLOCK,   desc: '0x0126 × 9 (status word + alarm code)', type: 'read' },
      { label: 'Read Cell Temp/Current', frame: FRAMES.READ_TEMP_CURR,     desc: '0x0120 × 6 registers', type: 'read' },
      { label: 'Read Cell Voltages', frame: FRAMES.READ_CELL_VOLTAGES, desc: '0x0108 × 16 (16 cells)', type: 'read' },
      { label: 'Read Hardware Version',    frame: FRAMES.READ_HW_VERSION,    desc: '0x0200 × 4 registers', type: 'read' },
      { label: 'Read Software Version',    frame: FRAMES.READ_MCU_VERSION,   desc: '0x0204 × 4 registers', type: 'read' },
    ],
  },
  {
    title: 'Switch Control',
    presets: [
      { label: 'AC On', frame: FRAMES.AC_POWER_ON,  desc: '0x0080 write 0x01AA', type: 'ctrl' },
      { label: 'AC Off', frame: FRAMES.AC_POWER_OFF, desc: '0x0080 write 0xAA01', type: 'ctrl' },
      { label: 'DC On', frame: FRAMES.DC_POWER_ON,  desc: '0x0080 write 0x02AA', type: 'ctrl' },
      { label: 'DC Off', frame: FRAMES.DC_POWER_OFF, desc: '0x0080 write 0xAA02', type: 'ctrl' },
    ],
  },
  {
    title: 'Parameter Settings',
    presets: [
      {
        label: 'Trigger Full Charge',
        frame: FRAMES.TRIGGER_FULL_CHARGE,
        desc: '0x0050 write 1, trigger one full charge',
        type: 'write',
      },
      {
        label: 'Enable Power On',
        frame: FRAMES.ENABLE_POWER_ON,
        desc: '0x0051 write 0',
        type: 'write',
      },
      {
        label: 'Disable Power On',
        frame: FRAMES.DISABLE_POWER_ON,
        desc: '0x0051 write 1',
        type: 'write',
      },
      {
        // 额定交流充电功率：0x0024，默认 300W，单位 W
        label: 'Set AC Charge Power 300W',
        frame: toHexString(buildWriteSingleFrame(REG_CONFIG.AC_CHARGE_POWER, 300)),
        desc: '0x0024 write 300 (W), customize below',
        type: 'write',
      },
    ],
  },
]

// ─── 响应解析摘要 ─────────────────────────────────────────────────────────────

function summarizeResponse(hexResp: string, sentHex: string): string | null {
  try {
    const buf = fromHexString(hexResp)
    const res = parseReadResponse(buf)
    if (!res || !res.crcOk || res.registers.length === 0) return null
    const sentBuf = fromHexString(sentHex)
    const startAddr = (sentBuf[2] << 8) | sentBuf[3]

    if (startAddr === 0x0100) {
      const r = res.registers
      const acInV  = (r[REG_STATUS.AC_IN_VOLTAGE  - 0x0100] ?? 0) * 0.1
      const acOutV = (r[REG_STATUS.AC_OUT_VOLTAGE - 0x0100] ?? 0) * 0.1
      const acOutP = r[REG_STATUS.AC_OUT_POWER    - 0x0100] ?? 0
      const pvV    = (r[REG_STATUS.PV_IN_VOLTAGE  - 0x0100] ?? 0) * 0.1
      const pvP    = r[REG_STATUS.PV_CHARGE_POWER - 0x0100] ?? 0
      const soc    = (r[REG_STATUS.CELL_SOC_PCT   - 0x0100] ?? 0) * 0.1
      return `AC In ${acInV.toFixed(1)}V  AC Out ${acOutV.toFixed(1)}V / ${acOutP}W  PV ${pvV.toFixed(1)}V / ${pvP}W  SOC ${soc.toFixed(1)}%`
    }
    if (startAddr === 0x0126) {
      const state = parseRunState(res.registers[0] ?? 0)
      const warn1 = parseWarnCode1(res.registers[1] ?? 0)
      const flags = [
        state.pvCharging    && 'PV Charging',
        state.acCharging    && 'AC Charging',
        state.acOutput      && 'AC Output',
        state.bypass        && 'Bypass',
        warn1.mpptTempHigh  && '⚠MPPT Overtemp',
        warn1.pvOverVoltage && '⚠PV Overvoltage',
        warn1.gridOverVolt  && '⚠Grid Overvoltage',
        warn1.cellUnder3V   && '⚠Cell <3V',
      ].filter(Boolean)
      return flags.length ? flags.join('  ') : 'Normal'
    }
    if (startAddr === 0x0120) {
      const r = res.registers
      const curr  = toInt16(r[0] ?? 0) * 0.01
      const mpptT = toInt16(r[1] ?? 0) * 0.1
      const cell1T = toInt16(r[3] ?? 0) * 0.1
      return `Cell Current ${curr.toFixed(2)}A  MPPT ${mpptT.toFixed(1)}℃  Cell 1 Temp ${cell1T.toFixed(1)}℃`
    }
    return res.registers.slice(0, 8)
      .map(v => `0x${v.toString(16).toUpperCase().padStart(4, '0')}`)
      .join(' ')
  } catch {
    return null
  }
}

// ─── 日志条目 ─────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number
  dir: 'tx' | 'rx' | 'err'
  label?: string
  text: string
  summary?: string
  ts: number
}
let entryId = 0

// ─── 充电功率设置区块 ─────────────────────────────────────────────────────────

const CHARGE_QUICK = [100, 200, 300, 500, 1000]

interface ChargePowerSectionProps {
  deviceId: string
  sendFrame: (hex: string, label?: string) => Promise<void>
  loading: string | null
}

interface PowerRow {
  label: string
  reg: number
  defaultW: number
  max: number
  desc: string
}

const POWER_ROWS: PowerRow[] = [
  { label: 'AC Charge Power',       reg: REG_CONFIG.AC_CHARGE_POWER,    defaultW: 300, max: 1000, desc: 'Register 0x0024, unit W' },
  { label: 'PV Charge Power',       reg: REG_CONFIG.PV_CHARGE_POWER,    defaultW: 300, max: 1000, desc: 'Register 0x0025, unit W' },
  { label: 'AC+PV Charge Power',  reg: REG_CONFIG.AC_PV_CHARGE_POWER, defaultW: 400, max: 2000, desc: 'Register 0x0026, unit W' },
]

function ChargePowerSection({ deviceId: _deviceId, sendFrame, loading }: ChargePowerSectionProps) {
  const [values, setValues] = useState<Record<number, string>>({
    [REG_CONFIG.AC_CHARGE_POWER]:    '300',
    [REG_CONFIG.PV_CHARGE_POWER]:    '300',
    [REG_CONFIG.AC_PV_CHARGE_POWER]: '400',
  })

  const write = (row: PowerRow) => {
    const val = Math.max(0, Math.min(row.max, Number(values[row.reg]) || 0))
    const frame = toHexString(buildWriteSingleFrame(row.reg, val))
    sendFrame(frame, `${row.label} ${val}W`)
  }

  return (
    <div className="px-4 pt-5">
      <p className="text-caption font-semibold text-[#8C8C8C] mb-2 uppercase tracking-wide">
        Charge Power Settings
      </p>
      <div className="rounded-l bg-[#262626] overflow-hidden divide-y divide-[rgba(255,255,255,0.04)]">
        {POWER_ROWS.map(row => {
          const cur = Math.max(0, Math.min(row.max, Number(values[row.reg]) || 0))
          const frame = toHexString(buildWriteSingleFrame(row.reg, cur))
          const busyKey = `${row.label} ${cur}W`
          return (
            <div key={row.reg} className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-body-md font-medium text-white">{row.label}</p>
                  <p className="text-caption text-[#595959] mt-0.5">{row.desc}, default {row.defaultW}W</p>
                </div>
              </div>

              {/* 快速预设 */}
              <div className="flex gap-1.5 flex-wrap">
                {CHARGE_QUICK.filter(v => v <= row.max).map(v => (
                  <button
                    key={v}
                    onClick={() => {
                      setValues(prev => ({ ...prev, [row.reg]: String(v) }))
                    }}
                    className={`px-3 py-1 rounded-pill text-caption font-semibold transition-colors
                      ${Number(values[row.reg]) === v
                        ? 'bg-[#01D6BE] text-[#000]'
                        : 'bg-[rgba(255,255,255,0.06)] text-[#8C8C8C] active:bg-[rgba(1,214,190,0.15)]'
                      }`}
                  >
                    {v}W
                  </button>
                ))}
              </div>

              {/* 输入 + 写入 */}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center bg-[#141414] border border-[rgba(1,214,190,0.2)] rounded-m px-3">
                  <input
                    type="number"
                    min={0}
                    max={row.max}
                    value={values[row.reg]}
                    onChange={e => setValues(prev => ({ ...prev, [row.reg]: e.target.value }))}
                    className="flex-1 bg-transparent text-white text-body-md py-2 focus:outline-none"
                    placeholder={`0~${row.max}`}
                  />
                  <span className="text-[#8C8C8C] text-caption ml-1">W</span>
                </div>
                <button
                  onClick={() => write(row)}
                  disabled={loading !== null}
                  className="px-4 py-2 rounded-m bg-[#01D6BE] text-[#000] text-body-md font-semibold
                    disabled:opacity-40 flex items-center gap-1.5 active:scale-[0.97] transition-all"
                >
                  {loading === busyKey
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Zap size={14} />
                  }
                  Write
                </button>
              </div>

              {/* 帧预览 */}
              <p className="text-tiny text-[#454545] font-mono break-all">{frame}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function PassthroughPage() {
  const { id: deviceId = '' } = useParams()
  const navigate = useNavigate()

  const [customHex, setCustomHex] = useState('')
  const [loading, setLoading] = useState<string | null>(null)  // tracks which preset is sending
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [parsedParams, setParsedParams] = useState<ParsedParam[]>([])

  const addLog = (dir: LogEntry['dir'], text: string, label?: string, summary?: string) =>
    setLogs(prev => [...prev.slice(-200), { id: entryId++, dir, text, label, summary, ts: Date.now() }])

  const sendFrame = async (hex: string, label?: string) => {
    const payload = hex.trim()
    if (!payload) return
    const key = label ?? 'custom'
    setLoading(key)
    addLog('tx', payload, label)
    try {
      const res = await passthroughDevice(deviceId, { data: payload })
      if (res.code === 0 || res.code === '0') {
        // 解码响应：base64 → Hex
        const b64ToHex = (b64: string) => {
          const bin = atob(b64.trim())
          return Array.from(bin).map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(' ')
        }
        const isBase64 = (s: string) => /^[A-Za-z0-9+/]+=*$/.test(s.trim()) && s.trim().length % 4 === 0

        let rxHex = ''
        const d = res.data as Record<string, unknown> | string | null | undefined
        if (typeof d === 'string' && isBase64(d)) {
          rxHex = b64ToHex(d)
        } else if (d && typeof d === 'object') {
          const b64 = (d as Record<string, string>).base64Output ?? (d as Record<string, string>).data ?? (d as Record<string, string>).content ?? ''
          if (b64 && isBase64(b64)) {
            rxHex = b64ToHex(b64)
          } else {
            rxHex = b64 || JSON.stringify(d)
          }
        } else {
          rxHex = String(d ?? '(empty)')
        }

        const summary = summarizeResponse(rxHex, payload)
        addLog('rx', rxHex, label, summary ?? undefined)
        // 解析为参数列表
        const params = parseResponseToParams(payload, rxHex)
        if (params.length > 0) setParsedParams(params)
      } else {
        addLog('err', `Code ${res.code}: ${res.message ?? res.msg ?? 'Error'}`, label)
      }
    } catch (e) {
      addLog('err', e instanceof Error ? e.message : 'Network error', label)
    } finally {
      setLoading(null)
    }
  }

  const dirColor = (dir: LogEntry['dir']) =>
    dir === 'tx' ? 'text-[#01D6BE]' : dir === 'rx' ? 'text-[#34C759]' : 'text-[#FF3530]'

  const typeColor = (type: Preset['type']) =>
    type === 'read' ? 'text-[#01D6BE] bg-[rgba(1,214,190,0.1)]'
    : type === 'ctrl' ? 'text-[#FF9500] bg-[rgba(255,149,0,0.1)]'
    : 'text-[#8C8C8C] bg-[rgba(255,255,255,0.06)]'

  return (
    <div className="fixed inset-0 z-50 bg-[#141414] flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3 relative border-b border-[rgba(255,255,255,0.06)]">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#262626]"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          <Terminal size={15} className="text-[#01D6BE]" />
          <h1 className="text-title-lg font-semibold text-white">Modbus Passthrough</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">

        {/* ── 预设报文分组 ── */}
        {PRESET_GROUPS.map(group => (
          <div key={group.title} className="px-4 pt-5">
            <p className="text-caption font-semibold text-[#8C8C8C] mb-2 uppercase tracking-wide">
              {group.title}
            </p>
            <div className="rounded-l bg-[#262626] overflow-hidden divide-y divide-[rgba(255,255,255,0.04)]">
              {group.presets.map(p => {
                const isBusy = loading === p.label
                return (
                  <button
                    key={p.label}
                    onClick={() => sendFrame(p.frame, p.label)}
                    disabled={loading !== null}
                    className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-[rgba(255,255,255,0.04)] transition-colors disabled:opacity-50"
                  >
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-body-md font-medium text-white">{p.label}</span>
                        <span className={`text-tiny font-semibold px-1.5 py-0.5 rounded-pill ${typeColor(p.type)}`}>
                          {p.type === 'read' ? 'READ' : p.type === 'ctrl' ? 'CTRL' : 'WRITE'}
                        </span>
                      </div>
                      <p className="text-caption text-[#595959] mt-0.5 font-mono">{p.desc}</p>
                    </div>
                    {isBusy
                      ? <Loader2 size={16} className="text-[#01D6BE] animate-spin flex-shrink-0" />
                      : <Send size={15} className="text-[#454545] flex-shrink-0" />
                    }
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* ── 充电功率设置 ── */}
        <ChargePowerSection deviceId={deviceId} sendFrame={sendFrame} loading={loading} />

        {/* ── 自定义帧 ── */}
        <div className="px-4 pt-5">
          <p className="text-caption font-semibold text-[#8C8C8C] mb-2 uppercase tracking-wide">
            Custom Hex Frame
          </p>
          <div className="rounded-l bg-[#262626] p-4 space-y-3">
            <textarea
              value={customHex}
              onChange={e => setCustomHex(e.target.value)}
              placeholder={'e.g. 01 03 01 00 00 12 XX XX\nwith or without spaces'}
              rows={2}
              className="w-full px-3 py-2.5 rounded-m bg-[#141414] border border-[rgba(255,255,255,0.06)]
                text-[#BFBFBF] text-caption placeholder:text-[#454545] font-mono
                focus:outline-none focus:border-[rgba(1,214,190,0.4)] resize-none"
            />
            <button
              onClick={() => sendFrame(customHex, 'custom')}
              disabled={loading !== null || !customHex.trim()}
              className="w-full py-3 rounded-m bg-[#01D6BE] text-[#000] text-body-md font-semibold
                disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              {loading === 'custom'
                ? <><Loader2 size={15} className="animate-spin" />Sending…</>
                : <><Send size={15} />Send Custom Frame</>
              }
            </button>
          </div>
        </div>

        {/* ── 解析参数列表 ── */}
        {parsedParams.length > 0 && (() => {
          const groups: Record<string, ParsedParam[]> = {}
          for (const p of parsedParams) {
            if (!groups[p.group]) groups[p.group] = []
            groups[p.group].push(p)
          }
          const GROUP_ORDER = ['AC Live', 'PV Live', 'Battery Live', 'Temp/Current', 'Cell Voltage', 'Run State', 'Alarm/Fault', 'AC Config', 'PV Config', 'Battery Config']
          const ordered = [...GROUP_ORDER.filter(g => groups[g]), ...Object.keys(groups).filter(g => !GROUP_ORDER.includes(g))]
          return (
            <div className="px-4 pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-caption font-semibold text-[#8C8C8C] uppercase tracking-wide flex items-center gap-1.5">
                  <Settings2 size={11} className="text-[#01D6BE]" />
                  Parsed Params
                </p>
                <button onClick={() => setParsedParams([])} className="text-caption text-[#595959] active:text-[#FF3530]">
                  Clear
                </button>
              </div>
              <div className="space-y-3">
                {ordered.map(grp => (
                  <div key={grp} className="rounded-l bg-[#262626] overflow-hidden">
                    <div className="px-3 py-2 bg-[rgba(1,214,190,0.08)] border-b border-[rgba(255,255,255,0.04)]">
                      <span className="text-caption font-semibold text-[#01D6BE]">{grp}</span>
                    </div>
                    <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                      {groups[grp].map(p => (
                        <div key={p.addr} className="flex items-center justify-between px-3 py-2.5 gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-body-md text-[#D9D9D9] text-sm">{p.name}</span>
                            <span className="text-tiny text-[#454545] font-mono ml-2">
                              0x{p.addr.toString(16).toUpperCase().padStart(4, '0')}
                            </span>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            {p.unit ? (
                              <>
                                <span className="text-body-md font-semibold text-white">{p.value}</span>
                                <span className="text-caption text-[#8C8C8C] ml-1">{p.unit}</span>
                              </>
                            ) : (
                              <span className={`text-caption font-medium ${p.value === 'Normal' || p.value === 'No Alarm' || p.value === 'No Fault' ? 'text-[#34C759]' : 'text-[#FF9500]'}`}>
                                {p.value}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── 收发日志 ── */}
        <div className="px-4 pt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-caption font-semibold text-[#8C8C8C] uppercase tracking-wide">TX/RX Log</p>
            {logs.length > 0 && (
              <button onClick={() => setLogs([])} className="text-caption text-[#595959] active:text-[#FF3530]">
                Clear
              </button>
            )}
          </div>
          <div className="rounded-l bg-[#1A1A1A] border border-[rgba(255,255,255,0.04)] p-3 min-h-[80px] max-h-80 overflow-y-auto font-mono space-y-2">
            {logs.length === 0 ? (
              <p className="text-caption text-[#454545] text-center py-4">No data — tap a button above to send a frame</p>
            ) : (
              logs.map(l => (
                <div key={l.id} className="space-y-0.5">
                  <div className="flex gap-2 text-tiny">
                    <span className="text-[#454545] flex-shrink-0">
                      {new Date(l.ts).toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                    <span className={`flex-shrink-0 font-bold ${dirColor(l.dir)}`}>
                      {l.dir === 'tx' ? '→' : l.dir === 'rx' ? '←' : '!'}
                    </span>
                    {l.label && (
                      <span className="text-[#595959] flex-shrink-0">[{l.label}]</span>
                    )}
                    <span className={`${dirColor(l.dir)} break-all`}>{l.text}</span>
                  </div>
                  {l.summary && (
                    <div className="ml-[4.5rem] text-tiny text-[#01D6BE] bg-[rgba(1,214,190,0.06)] rounded px-2 py-0.5">
                      {l.summary}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
