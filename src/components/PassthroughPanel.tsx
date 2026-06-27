/**
 * 设备数据透传面板
 * POST /remote/device/passthrough?deviceId=
 * 内置 FYK3001000W Modbus RTU 常用报文，支持自定义十六进制透传
 */
import { useState } from 'react'
import { Send, Loader2, Terminal, ChevronDown } from 'lucide-react'
import { passthroughDevice } from '../api/deviceApi'
import {
  FRAMES,
  parseReadResponse,
  parseRunState,
  parseWarnCode1,
  toInt16,
  fromHexString,
  REG_STATUS,
} from '../protocols/modbusProtocol'

interface Props {
  deviceId: string | number
}

interface LogEntry {
  id: number
  dir: 'tx' | 'rx' | 'err'
  text: string
  ts: number
}

let entryId = 0

// 预设报文列表
const PRESETS: { label: string; frame: string; desc: string }[] = [
  { label: 'Read Run Params',    frame: FRAMES.READ_ALL_PARAMS,   desc: '0x0000 × 18 registers (config params)' },
  { label: 'Read Live Status',    frame: FRAMES.READ_ALL_STATUS,   desc: '0x0100 × 56 registers (voltage/power/SOC/temp)' },
  { label: 'Read Fault/Alarm',   frame: FRAMES.READ_FAULT_BLOCK,  desc: '0x0126 × 9 registers (status word + alarm code)' },
  { label: 'Read Cell Temp/Current', frame: FRAMES.READ_TEMP_CURR,    desc: '0x0120 × 6 registers' },
  { label: 'Read Cell Voltages', frame: FRAMES.READ_CELL_VOLTAGES,desc: '0x0108 × 16 registers' },
  { label: 'Read Hardware Version',    frame: FRAMES.READ_HW_VERSION,   desc: '0x0200 × 4 registers' },
  { label: 'Read Software Version',    frame: FRAMES.READ_MCU_VERSION,  desc: '0x0204 × 4 registers' },
  { label: 'AC On',        frame: FRAMES.AC_POWER_ON,       desc: '0x0080 write 0x01AA' },
  { label: 'AC Off',        frame: FRAMES.AC_POWER_OFF,      desc: '0x0080 write 0xAA01' },
  { label: 'DC On',        frame: FRAMES.DC_POWER_ON,       desc: '0x0080 write 0x02AA' },
  { label: 'DC Off',        frame: FRAMES.DC_POWER_OFF,      desc: '0x0080 write 0xAA02' },
  { label: 'Trigger Full Charge',    frame: FRAMES.TRIGGER_FULL_CHARGE, desc: '0x0050 write 1' },
]

/** 尝试把 FC03 响应解析成人类可读摘要 */
function summarizeResponse(hexResp: string, sentHex: string): string | null {
  try {
    const buf = fromHexString(hexResp)
    const res = parseReadResponse(buf)
    if (!res || !res.crcOk || res.registers.length === 0) return null

    // 根据发送帧的起始地址决定如何解读
    const sentBuf = fromHexString(sentHex)
    const startAddr = ((sentBuf[2] << 8) | sentBuf[3])

    if (startAddr === 0x0100) {
      // 实时状态块
      const r = res.registers
      const acInV  = (r[REG_STATUS.AC_IN_VOLTAGE  - 0x0100] ?? 0) * 0.1
      const acOutV = (r[REG_STATUS.AC_OUT_VOLTAGE - 0x0100] ?? 0) * 0.1
      const acOutP = r[REG_STATUS.AC_OUT_POWER    - 0x0100] ?? 0
      const pvV    = (r[REG_STATUS.PV_IN_VOLTAGE  - 0x0100] ?? 0) * 0.1
      const pvP    = r[REG_STATUS.PV_CHARGE_POWER - 0x0100] ?? 0
      const soc    = (r[REG_STATUS.CELL_SOC_PCT   - 0x0100] ?? 0) * 0.1
      return `AC In ${acInV.toFixed(1)}V  AC Out ${acOutV.toFixed(1)}V ${acOutP}W  PV ${pvV.toFixed(1)}V ${pvP}W  SOC ${soc.toFixed(1)}%`
    }

    if (startAddr === 0x0126) {
      // 故障/状态块
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
      const curr = toInt16(r[0] ?? 0) * 0.01
      const mpptT = toInt16(r[1] ?? 0) * 0.1
      const cell1T = toInt16(r[3] ?? 0) * 0.1
      return `Cell Current ${curr.toFixed(2)}A  MPPT ${mpptT.toFixed(1)}℃  Cell 1 Temp ${cell1T.toFixed(1)}℃`
    }

    // 通用：显示前 8 个寄存器原始值
    return res.registers.slice(0, 8).map(v => `0x${v.toString(16).toUpperCase().padStart(4,'0')}`).join(' ')
  } catch {
    return null
  }
}

export default function PassthroughPanel({ deviceId }: Props) {
  const [data, setData] = useState('')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [showPresets, setShowPresets] = useState(false)

  const addLog = (dir: LogEntry['dir'], text: string) =>
    setLogs(prev => [...prev.slice(-100), { id: entryId++, dir, text, ts: Date.now() }])

  const sendFrame = async (hexPayload: string) => {
    const payload = hexPayload.trim()
    if (!payload) return
    setLoading(true)
    addLog('tx', payload)
    try {
      const res = await passthroughDevice(deviceId, { data: payload, protocol: 'modbus' })
      if (res.code === 0 || res.code === '0') {
        const raw = res.data?.data ?? JSON.stringify(res.data ?? '(empty)')
        const summary = summarizeResponse(raw, payload)
        addLog('rx', summary ? `${raw}\n  → ${summary}` : raw)
      } else {
        addLog('err', `Code ${res.code}: ${res.message ?? res.msg ?? 'Error'}`)
      }
    } catch (e) {
      addLog('err', e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const dirColor = (dir: LogEntry['dir']) =>
    dir === 'tx' ? 'text-primary' : dir === 'rx' ? 'text-success' : 'text-danger'

  return (
    <div className="bg-ink-11 rounded-l border border-[rgba(255,255,255,0.06)] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Terminal size={14} className="text-primary" />
        <span className="text-[12px] font-semibold text-ink-6">Modbus Passthrough</span>
      </div>

      {/* 预设报文选择器 */}
      <div>
        <button
          onClick={() => setShowPresets(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-m
            bg-ink-13 border border-[rgba(255,255,255,0.06)]
            text-ink-7 text-[12px] active:scale-[0.98] transition-all"
        >
          <span>Select Preset</span>
          <ChevronDown size={13} className={`transition-transform ${showPresets ? 'rotate-180' : ''}`} />
        </button>

        {showPresets && (
          <div className="mt-1 rounded-m bg-ink-13 border border-[rgba(255,255,255,0.06)] divide-y divide-[rgba(255,255,255,0.04)] max-h-52 overflow-y-auto">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => {
                  setData(p.frame)
                  setShowPresets(false)
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-[rgba(1,214,190,0.06)] transition-colors"
              >
                <div className="text-[12px] text-ink-6 font-medium">{p.label}</div>
                <div className="text-[10px] text-ink-8 mt-0.5 font-mono">{p.frame}</div>
                <div className="text-[10px] text-ink-9 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 自定义输入 + 发送 */}
      <div>
        <label className="text-[10px] font-semibold text-ink-8 mb-1 block">Custom Hex Frame</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={data}
            onChange={e => setData(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendFrame(data) }}
            placeholder="e.g. 01 03 00 00 00 12 C5 C7"
            className="flex-1 px-3 py-2 rounded-m bg-ink-13 border border-[rgba(255,255,255,0.06)]
              text-ink-6 text-[12px] placeholder:text-ink-9
              focus:outline-none focus:border-[rgba(1,214,190,0.4)] font-mono"
          />
          <button
            onClick={() => sendFrame(data)}
            disabled={loading || !data.trim()}
            className="px-4 py-2 rounded-m bg-primary text-[#000] text-[12px] font-semibold
              disabled:opacity-40 flex items-center gap-1.5 active:scale-[0.97] transition-all"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Send
          </button>
        </div>
      </div>

      {/* 收发日志 */}
      <div className="rounded-m bg-ink-13 border border-[rgba(255,255,255,0.04)] p-3 min-h-[60px] max-h-56 overflow-y-auto font-mono space-y-1.5">
        {logs.length === 0 ? (
          <p className="text-[11px] text-ink-9 text-center py-2">No data</p>
        ) : (
          logs.map(l => (
            <div key={l.id} className="flex gap-2 text-[11px]">
              <span className="text-ink-9 flex-shrink-0">
                {new Date(l.ts).toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <span className={`flex-shrink-0 font-bold ${dirColor(l.dir)}`}>
                {l.dir === 'tx' ? '→' : l.dir === 'rx' ? '←' : '!'}
              </span>
              <span className={`${dirColor(l.dir)} whitespace-pre-wrap break-all`}>{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
