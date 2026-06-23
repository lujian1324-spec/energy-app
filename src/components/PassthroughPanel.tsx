/**
 * 设备数据透传面板
 * POST /remote/device/passthrough?deviceId=
 * 支持十六进制或原始字符串透传，显示响应内容
 */
import { useState } from 'react'
import { Send, Loader2, AlertCircle, CheckCircle2, Terminal } from 'lucide-react'
import { passthroughDevice } from '../api/deviceApi'

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

export default function PassthroughPanel({ deviceId }: Props) {
  const [data, setData] = useState('')
  const [protocol, setProtocol] = useState('')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])

  const addLog = (dir: LogEntry['dir'], text: string) =>
    setLogs(prev => [...prev.slice(-100), { id: entryId++, dir, text, ts: Date.now() }])

  const handleSend = async () => {
    const payload = data.trim()
    if (!payload) return
    setLoading(true)
    addLog('tx', payload)
    try {
      const res = await passthroughDevice(deviceId, {
        data: payload,
        ...(protocol.trim() ? { protocol: protocol.trim() } : {}),
      })
      if (res.code === 0 || res.code === '0') {
        addLog('rx', res.data?.data ?? JSON.stringify(res.data ?? '(empty)'))
      } else {
        addLog('err', `Code ${res.code}: ${res.message ?? res.msg ?? 'Error'}`)
      }
    } catch (e) {
      addLog('err', e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const dirColor = (dir: LogEntry['dir']) => {
    if (dir === 'tx') return 'text-[#01D6BE]'
    if (dir === 'rx') return 'text-[#34C759]'
    return 'text-[#FF3530]'
  }

  const dirIcon = (dir: LogEntry['dir']) => {
    if (dir === 'tx') return '→'
    if (dir === 'rx') return '←'
    return '!'
  }

  return (
    <div className="bg-[#1F1F1F] rounded-l border border-[rgba(255,255,255,0.06)] p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Terminal size={14} className="text-[#01D6BE]" />
        <span className="text-[12px] font-semibold text-[#BFBFBF]">Data Passthrough</span>
      </div>

      {/* Protocol (optional) */}
      <div>
        <label className="text-[10px] font-semibold text-[#595959] mb-1 block">Protocol (optional)</label>
        <input
          type="text"
          value={protocol}
          onChange={e => setProtocol(e.target.value)}
          placeholder="e.g. modbus"
          className="w-full px-3 py-2 rounded-m bg-[#141414] border border-[rgba(255,255,255,0.06)]
            text-[#BFBFBF] text-[12px] placeholder:text-[#454545]
            focus:outline-none focus:border-[rgba(1,214,190,0.4)]"
        />
      </div>

      {/* Data input + send */}
      <div>
        <label className="text-[10px] font-semibold text-[#595959] mb-1 block">Payload (hex / string)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={data}
            onChange={e => setData(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
            placeholder="e.g. 01 03 00 00 00 0A C5 CD"
            className="flex-1 px-3 py-2 rounded-m bg-[#141414] border border-[rgba(255,255,255,0.06)]
              text-[#BFBFBF] text-[12px] placeholder:text-[#454545]
              focus:outline-none focus:border-[rgba(1,214,190,0.4)] font-mono"
          />
          <button
            onClick={handleSend}
            disabled={loading || !data.trim()}
            className="px-4 py-2 rounded-m bg-[#01D6BE] text-[#000] text-[12px] font-semibold
              disabled:opacity-40 flex items-center gap-1.5 active:scale-[0.97] transition-all"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Send
          </button>
        </div>
      </div>

      {/* Log window */}
      {logs.length > 0 && (
        <div className="rounded-m bg-[#141414] border border-[rgba(255,255,255,0.04)] p-3 space-y-1.5 max-h-48 overflow-y-auto font-mono">
          {logs.map(l => (
            <div key={l.id} className="flex gap-2 text-[11px]">
              <span className="text-[#454545] flex-shrink-0">
                {new Date(l.ts).toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <span className={`flex-shrink-0 ${dirColor(l.dir)}`}>{dirIcon(l.dir)}</span>
              <span className={dirColor(l.dir)}>{l.text}</span>
            </div>
          ))}
        </div>
      )}

      {logs.length === 0 && (
        <p className="text-[11px] text-[#454545] text-center py-2">No messages yet</p>
      )}
    </div>
  )
}
