import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronDown, Check, Settings, Bell, Sun, PlugZap } from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime, type HistoryDataResponse } from '../api/deviceApi'
import { batteryTimeLabel } from '../utils/batteryTime'
import { getDemoDayCurve } from '../data/demoData'

// ─── Chart metric tabs ────────────────────────────────────────────────────────
type Metric = 'battery' | 'ac' | 'solar' | 'output'

interface Tab {
  id: Metric
  label: string
  Icon: React.FC<{ size?: number; className?: string }>
  historyKey: 'remainingBatteryCapacity' | 'exchangeChargingPower' | 'generationPower' | 'outputPower'
  unit: string
  color: string
  /** 固定纵坐标范围：Battery [0,100]%，AC/Solar/Output [0,1000]W */
  domain: [number, number]
}

const TABS: Tab[] = [
  // Battery 曲线 → remainingBatteryCapacity，纵坐标 0–100%
  { id: 'battery', label: 'Battery', Icon: ({ size, className }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}><rect x="2" y="7" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M20 10h2v4h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>, historyKey: 'remainingBatteryCapacity', unit: '%', color: '#FFFFFF', domain: [0, 100] },
  // AC 曲线 → exchangeChargingPower，纵坐标 0–1000W
  { id: 'ac', label: 'AC', Icon: PlugZap, historyKey: 'exchangeChargingPower', unit: 'W', color: '#01D6BE', domain: [0, 1000] },
  // 太阳能曲线 → generationPower，纵坐标 0–1000W
  { id: 'solar', label: 'Solar', Icon: Sun, historyKey: 'generationPower', unit: 'W', color: '#FFD700', domain: [0, 1000] },
  // 输出曲线 → outputPower，纵坐标 0–1000W
  { id: 'output', label: 'Output', Icon: ({ size, className }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}><rect x="5" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>, historyKey: 'outputPower', unit: 'W', color: '#FF9500', domain: [0, 1000] },
]

// ─── Real-Time Power 历史数据本地缓存（按设备 + 当日日期） ─────────────────────────
const RT_HISTORY_KEYS = TABS.map(t => t.historyKey)
const RT_CACHE_PREFIX = 'sierro-rtpower-'

function rtCacheKey(deviceId: string): string {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD（当日）
  return `${RT_CACHE_PREFIX}${deviceId}-${today}`
}

function loadCachedRtHistory(deviceId: string): HistoryDataResponse | null {
  try {
    const raw = localStorage.getItem(rtCacheKey(deviceId))
    return raw ? (JSON.parse(raw) as HistoryDataResponse) : null
  } catch {
    return null
  }
}

function saveCachedRtHistory(deviceId: string, data: HistoryDataResponse): void {
  try {
    localStorage.setItem(rtCacheKey(deviceId), JSON.stringify(data))
    // 清理过期（非当日）缓存
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(RT_CACHE_PREFIX) && k !== rtCacheKey(deviceId) && k.includes(`${RT_CACHE_PREFIX}${deviceId}-`)) {
        localStorage.removeItem(k)
      }
    }
  } catch {
    /* 忽略配额/序列化错误 */
  }
}

// ─── Real-Time 实时采样缓冲（按设备 + 当日日期，本地累积） ──────────────────────────
// 实时读取设备状态参数并保存在本地，逐步绘制当日曲线（即使历史接口无数据也能成图）
interface RtSample {
  t: number       // 采样时间戳（ms）
  battery: number // remainingBatteryCapacity %
  ac: number      // exchangeChargingPower W
  solar: number   // generationPower W
  output: number  // outputPower W
}

const RT_SAMPLES_PREFIX = 'sierro-rtsamples-'
const RT_SAMPLE_MIN_GAP_MS = 25 * 1000   // 最小采样间隔（与 30s 轮询配合）
const RT_SAMPLE_MAX = 600                 // 当日最多保留点数

function rtSamplesKey(deviceId: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `${RT_SAMPLES_PREFIX}${deviceId}-${today}`
}

function loadRtSamples(deviceId: string): RtSample[] {
  try {
    const raw = localStorage.getItem(rtSamplesKey(deviceId))
    return raw ? (JSON.parse(raw) as RtSample[]) : []
  } catch {
    return []
  }
}

function saveRtSamples(deviceId: string, samples: RtSample[]): void {
  try {
    localStorage.setItem(rtSamplesKey(deviceId), JSON.stringify(samples.slice(-RT_SAMPLE_MAX)))
    // 清理该设备的过期（非当日）采样
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(`${RT_SAMPLES_PREFIX}${deviceId}-`) && k !== rtSamplesKey(deviceId)) {
        localStorage.removeItem(k)
      }
    }
  } catch {
    /* 忽略配额/序列化错误 */
  }
}

/** 从一条采样里取指定指标的数值 */
function metricOf(s: RtSample, metric: Metric): number {
  switch (metric) {
    case 'battery': return s.battery
    case 'ac': return s.ac
    case 'solar': return s.solar
    case 'output': return s.output
  }
}


export function AreaChart({ data, color, width = 340, height = 130, domain, unit = '', timeLabels }: {
  data: number[]
  color: string
  width?: number
  height?: number
  domain?: [number, number]
  unit?: string
  /** Fixed-clock labels spanning the data (e.g. ['12am', ..., '12am']) for the scrub tooltip's time text. */
  timeLabels?: string[]
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  if (!data.length) return null
  const pad = { t: 8, b: 2, l: 0, r: 0 }
  const w = width - pad.l - pad.r
  const h = height - pad.t - pad.b
  const min = domain ? domain[0] : Math.min(...data)
  const max = domain ? domain[1] : Math.max(...data)
  const range = max - min || 1

  const pts = data.map((v, i) => ({
    x: pad.l + (i / (data.length - 1)) * w,
    y: pad.t + h - ((v - min) / range) * h,
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const fillPath = `${linePath} L${pts[pts.length - 1].x},${(pad.t + h).toFixed(1)} L${pts[0].x},${(pad.t + h).toFixed(1)} Z`

  const gradId = `grad-${color.replace('#', '')}`

  const updateFromClientX = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const idx = Math.round(ratio * (data.length - 1))
    setActiveIndex(idx)
  }

  const scrubTime = (idx: number) => {
    if (!timeLabels || timeLabels.length < 2) return null
    const ratio = idx / (data.length - 1)
    const pos = ratio * (timeLabels.length - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(timeLabels.length - 1, lo + 1)
    return pos - lo < 0.5 ? timeLabels[lo] : timeLabels[hi]
  }

  const active = activeIndex !== null ? pts[activeIndex] : null
  const activeValue = activeIndex !== null ? data[activeIndex] : null
  const activeTime = activeIndex !== null ? scrubTime(activeIndex) : null
  const labelText = activeValue !== null ? `${Number.isInteger(activeValue) ? activeValue : activeValue.toFixed(1)}${unit}` : ''
  const tooltipW = Math.max(40, labelText.length * 7 + 16)
  const tooltipX = active ? Math.min(Math.max(active.x - tooltipW / 2, 0), w - tooltipW) : 0

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="touch-none select-none"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); updateFromClientX(e.clientX) }}
      onPointerMove={e => { if (e.buttons || e.pointerType !== 'mouse') updateFromClientX(e.clientX) }}
      onPointerUp={() => setActiveIndex(null)}
      onPointerLeave={() => setActiveIndex(null)}
      onPointerCancel={() => setActiveIndex(null)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {active && (
        <g>
          <line x1={active.x} y1={pad.t} x2={active.x} y2={pad.t + h} stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity={0.6} />
          <circle cx={active.x} cy={active.y} r={4} fill={color} stroke="#141414" strokeWidth="1.5" />
          <rect x={tooltipX} y={0} width={tooltipW} height={18} rx={4} fill="#000000" opacity={0.85} />
          <text x={tooltipX + tooltipW / 2} y={12.5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#FFFFFF">
            {labelText}
          </text>
          {activeTime && (
            <text x={active.x} y={pad.t + h + 14} textAnchor="middle" fontSize="9" fill="#BFBFBF">
              {activeTime}
            </text>
          )}
        </g>
      )}
    </svg>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DeviceMonitorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // ─── 返回始终回到 Device 列表页（不回退到任意历史页）───
  const backToDevices = useCallback(() => {
    navigate('/devices', { replace: true })
  }, [navigate])

  // 拦截浏览器/系统返回手势 → 回到 Device 列表页
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const onPopState = () => backToDevices()
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [backToDevices])

  const [activeTab, setActiveTab] = useState<Metric>('battery')
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false)
  // 实时采样变化计数器（用于触发图表重算）
  const [sampleTick, setSampleTick] = useState(0)

  const {
    devices,
    selectedDeviceState,
    historyData,
    historyLoading,
    isDemoMode,
    selectDevice,
    loadDeviceState,
    loadHistoryData,
  } = useDeviceStore()

  const device = devices.find(d => String(d.id) === id)

  // Select this device and load its state + today's history（按当日日期 00:00 → now）
  useEffect(() => {
    if (!id) return
    selectDevice(id)
    loadDeviceState(id)

    const now = new Date()
    const from = new Date(now)
    from.setHours(0, 0, 0, 0) // 当日零点
    loadHistoryData(id, from.toISOString(), now.toISOString(), RT_HISTORY_KEYS, 288, true)
  }, [id])

  // 每 30 秒轮询设备实时状态（与 Overview 一致），用于累积当日实时曲线
  useEffect(() => {
    if (!id) return
    const timer = setInterval(() => loadDeviceState(id), 30000)
    return () => clearInterval(timer)
  }, [id, loadDeviceState])

  // 历史数据返回后保存到本地（按设备 + 当日日期）
  useEffect(() => {
    if (id && historyData) saveCachedRtHistory(id, historyData)
  }, [id, historyData])

  // Map realtime fields
  const rt = useMemo(() => {
    if (!selectedDeviceState?.fields) return null
    return mapFieldsToRealtime(selectedDeviceState.fields)
  }, [selectedDeviceState])

  // 实时读取设备参数 → 累积保存到本地（按当日日期），逐步绘制当日曲线
  useEffect(() => {
    if (!id || !rt || isDemoMode) return
    const samples = loadRtSamples(id)
    const last = samples[samples.length - 1]
    const now = Date.now()
    // 节流：与 30s 轮询配合，避免同一状态重复写入
    if (last && now - last.t < RT_SAMPLE_MIN_GAP_MS) return
    samples.push({
      t: now,
      battery: Math.round(rt.remainingBatteryCapacity ?? 0),
      ac: Math.abs(Math.round(rt.acPower ?? 0)),
      solar: Math.abs(Math.round(rt.solarPower ?? 0)),
      output: Math.abs(Math.round(rt.outputPower ?? 0)),
    })
    saveRtSamples(id, samples)
    setSampleTick(x => x + 1)
  }, [id, rt, isDemoMode])

  const remainingBatteryCapacity = rt?.remainingBatteryCapacity ?? 0
  const acPower = rt?.acPower ?? 0
  const solarPower = rt?.solarPower ?? 0
  const outputPower = rt?.outputPower ?? 0
  const batteryPower = rt?.batteryPower ?? 0
  const isCharging = batteryPower > 0
  const isOnline = device?.isOnline ?? true

  // 统一口径：电池剩余/充满时间（见 utils/batteryTime）
  const timeStr = batteryTimeLabel({
    acPower, solarPower, outputPower,
    soc: remainingBatteryCapacity,
    ratedPowerKW: device?.ratedPower,
    isCharging,
  })

  // Real-Time Power chart：当日 API 历史 + 本地累积的实时采样，组合绘制当日曲线
  const { chartData, chartTimestamps } = useMemo(() => {
    if (!id) return { chartData: [], chartTimestamps: [] }
    const tab = TABS.find(t => t.id === activeTab)!

    // Demo 模式：直接用 demo 曲线
    if (isDemoMode) {
      const points = activeTab === 'battery' ? 20000 : 2400
      return { chartData: getDemoDayCurve(id, tab.historyKey, points), chartTimestamps: [] }
    }

    const out: number[] = []
    const ts: number[] = []

    // 1) 当日历史数据（API 实时返回或本地缓存）
    const source = historyData ?? loadCachedRtHistory(id)
    const series = source?.[tab.historyKey]
    let lastHistT = 0
    if (series && series.length > 0) {
      for (const pt of series) {
        const v = Number(pt.value)
        out.push(Number.isFinite(v) ? v : 0)
        const t = new Date(pt.time).getTime()
        ts.push(Number.isFinite(t) ? t : 0)
        if (Number.isFinite(t)) lastHistT = Math.max(lastHistT, t)
      }
    }

    // 2) 本地累积的实时采样（仅追加历史末尾之后的点）
    const samples = loadRtSamples(id)
    for (const s of samples) {
      if (s.t <= lastHistT) continue
      out.push(metricOf(s, activeTab))
      ts.push(s.t)
    }

    // 单点无法成线 → 复制为两点
    if (out.length === 1) return { chartData: [out[0], out[0]], chartTimestamps: [ts[0], ts[0]] }
    if (out.length >= 2) return { chartData: out, chartTimestamps: ts }

    // 暂无任何当日数据
    return { chartData: [], chartTimestamps: [] }
  }, [id, activeTab, historyData, isDemoMode, sampleTick])

  const timeLabels = ['12am', '4am', '8am', '12pm', '4pm', '8pm', '12am']

  // Current value badge
  const currentTab = TABS.find(t => t.id === activeTab)!
  const badgeValue = activeTab === 'battery'
    ? `${remainingBatteryCapacity}%`
    : activeTab === 'ac'
      ? `${Math.abs(acPower)}W`
      : activeTab === 'solar'
        ? `${Math.abs(solarPower)}W`
        : `${Math.abs(outputPower)}W`

  const fmtW = (w: number) => Math.abs(Math.round(w))

  return (
    <div
      className="h-full flex flex-col bg-[#141414] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={backToDevices}
          className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>

        {/* Device name + dropdown */}
        <div className="flex-1 flex flex-col items-center relative">
          <button
            onClick={() => setShowDeviceDropdown(v => !v)}
            className="flex flex-col items-center active:opacity-70 transition-opacity"
          >
            <div className="flex items-center gap-1">
              <span className="text-title-md font-semibold text-white">
                {device?.name ?? 'Device'}
              </span>
              <ChevronDown
                size={16}
                className={`text-white transition-transform duration-200 ${showDeviceDropdown ? 'rotate-180' : ''}`}
              />
            </div>
            <span className="text-label text-[#01D6BE]">
              {isOnline ? 'Connected' : 'Offline'}
            </span>
          </button>
          {showDeviceDropdown && devices.length > 1 && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-48 rounded-l bg-[#262626] border border-white/10 shadow-xl overflow-hidden">
              {devices.map(d => {
                const isSelected = String(d.id) === id
                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      setShowDeviceDropdown(false)
                      if (!isSelected) navigate(`/device/${d.id}`)
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between border-b border-white/5 last:border-0 active:bg-white/5"
                  >
                    <span className={`text-body-md ${isSelected ? 'text-[#01D6BE] font-semibold' : 'text-white'}`}>
                      {d.name}
                    </span>
                    {isSelected && <Check size={15} className="text-[#01D6BE]" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Settings + Bell */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/device/${id}/settings`)}
            className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center active:scale-95 transition-transform"
          >
            <Settings size={18} className="text-white" />
          </button>
          <button
            onClick={() => navigate('/notifications')}
            className="relative w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center active:scale-95 transition-transform"
          >
            <Bell size={18} className="text-white" />
            {device?.isAlarmed && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#FF3B30] border-2 border-[#141414]" />
            )}
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-6 space-y-3">
        {/* ─── SoC Card ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-[#262626] rounded-l p-5"
        >
          {/* Ring */}
          <div className="flex justify-center mb-5">
            <BatteryRing
              percentage={remainingBatteryCapacity}
              size={180}
              strokeWidth={12}
              isCharging={isCharging}
              connected={isOnline}
              timeRemaining={timeStr}
              timeToFull={timeStr}
              rawTimeLabel
            />
          </div>

          {/* Input / Output row — three equal-size value cards */}
          <div>
            <div className="flex items-center gap-1 mb-2">
              <p className="text-label text-[#BFBFBF] flex-1">Input</p>
              <span className="w-4 flex-shrink-0" />
              <p className="text-label text-[#BFBFBF] flex-1 text-right">Output</p>
            </div>
            <div className="grid grid-cols-[1fr_16px_1fr_1fr] gap-2 items-stretch">
              <div className="bg-[#1F1F1F] rounded-m px-3 py-3 text-center flex flex-col items-center justify-center">
                <div>
                  <span className="text-title-md font-semibold text-white tnum">{fmtW(acPower)}</span>
                  <span className="text-label text-[#BFBFBF]">w</span>
                </div>
                <p className="text-tiny text-[#8C8C8C] mt-0.5">AC</p>
              </div>
              <span className="text-[#8C8C8C] text-body-md font-semibold self-center text-center">+</span>
              <div className="bg-[#1F1F1F] rounded-m px-3 py-3 text-center flex flex-col items-center justify-center">
                <div>
                  <span className="text-title-md font-semibold text-white tnum">{fmtW(solarPower)}</span>
                  <span className="text-label text-[#BFBFBF]">w</span>
                </div>
                <p className="text-tiny text-[#8C8C8C] mt-0.5">Solar</p>
              </div>
              <div className="bg-[#1F1F1F] rounded-m px-3 py-3 text-center flex flex-col items-center justify-center">
                <div>
                  <span className="text-title-md font-semibold text-white tnum">{fmtW(outputPower)}</span>
                  <span className="text-label text-[#BFBFBF]">w</span>
                </div>
                <p className="text-tiny text-[#8C8C8C] mt-0.5">AC</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ─── Real-Time Power Chart Card ───────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="bg-[#262626] rounded-l p-4"
        >
          {/* Card header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-title-md font-semibold text-white">Real-Time Power</span>
            <span
              className="text-label font-semibold px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: activeTab === 'battery' ? '#3A3A3A' : `${currentTab.color}22`,
                color: activeTab === 'battery' ? '#FFFFFF' : currentTab.color,
              }}
            >
              {badgeValue}
            </span>
          </div>

          {/* Chart area */}
          <div className="overflow-hidden rounded-m -mx-1">
            {historyLoading && !chartData.length ? (
              <div className="h-[130px] flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-[#01D6BE] border-t-transparent animate-spin" />
              </div>
            ) : !chartData.length ? (
              <div className="h-[130px] flex flex-col items-center justify-center gap-1 text-center px-4">
                <span className="text-body-md text-[#8C8C8C]">Collecting today's data…</span>
                <span className="text-tiny text-[#636366]">Live readings appear here as the device reports them</span>
              </div>
            ) : (
              <div className="w-full">
                <AreaChart
                  data={chartData}
                  color={currentTab.color}
                  width={332}
                  height={130}
                  domain={currentTab.domain}
                  unit={currentTab.unit}
                  timeLabels={timeLabels}
                />
              </div>
            )}
          </div>

          {/* Time labels */}
          {timeLabels.length > 0 && (
            <div className="flex justify-between mt-1 px-1">
              {timeLabels.map((lbl, i) => (
                <span key={i} className="text-tiny text-[#8C8C8C]">{lbl}</span>
              ))}
            </div>
          )}

          {/* Metric tabs */}
          <div className="flex gap-2 mt-4">
            {TABS.map(tab => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-m transition-colors ${
                    active ? 'bg-[#3A3A3A]' : 'bg-transparent'
                  }`}
                >
                  <tab.Icon
                    size={18}
                    className={active ? 'text-white' : 'text-[#8C8C8C]'}
                  />
                  <span className={`text-tiny font-medium ${active ? 'text-white' : 'text-[#8C8C8C]'}`}>
                    {tab.label}
                  </span>
                </button>
              )
            })}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
