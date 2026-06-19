import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronDown, Check, Settings, Bell, Sun, PlugZap } from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime } from '../api/deviceApi'
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
}

const TABS: Tab[] = [
  { id: 'battery', label: 'Battery', Icon: ({ size, className }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}><rect x="2" y="7" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M20 10h2v4h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>, historyKey: 'remainingBatteryCapacity', unit: '%', color: '#FFFFFF' },
  { id: 'ac', label: 'AC', Icon: PlugZap, historyKey: 'exchangeChargingPower', unit: 'W', color: '#01D6BE' },
  { id: 'solar', label: 'Solar', Icon: Sun, historyKey: 'generationPower', unit: 'W', color: '#FFD700' },
  { id: 'output', label: 'Output', Icon: ({ size, className }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}><rect x="5" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>, historyKey: 'outputPower', unit: 'W', color: '#FF9500' },
]

// ─── SVG Area Chart ───────────────────────────────────────────────────────────
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
            <text x={active.x} y={pad.t + h + 14} textAnchor="middle" fontSize="9" fill="#A0A0A5">
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
  const [activeTab, setActiveTab] = useState<Metric>('battery')
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false)

  const {
    devices,
    selectedDeviceState,
    historyLoading,
    selectDevice,
    loadDeviceState,
    loadHistoryData,
  } = useDeviceStore()

  const device = devices.find(d => String(d.id) === id)

  // Select this device and load its state + history
  useEffect(() => {
    if (!id) return
    selectDevice(id)
    loadDeviceState(id)

    const now = new Date()
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    loadHistoryData(id, from.toISOString(), now.toISOString(), undefined, 288, true)
  }, [id])

  // Map realtime fields
  const rt = useMemo(() => {
    if (!selectedDeviceState?.fields) return null
    return mapFieldsToRealtime(selectedDeviceState.fields)
  }, [selectedDeviceState])

  const soc = rt?.soc ?? 0
  const acPower = rt?.acPower ?? 0
  const solarPower = rt?.solarPower ?? 0
  const outputPower = rt?.outputPower ?? 0
  const batteryPower = rt?.batteryPower ?? 0
  const isCharging = batteryPower > 0
  const isOnline = device?.isOnline ?? true

  // Estimate remaining time (rough: kWh capacity * soc% / outputPower)
  const capacityWh = (device?.ratedPower ?? 5000)
  const remainMinutes = outputPower > 0 ? Math.round((capacityWh * soc) / 100 / outputPower * 60) : null
  const timeStr = remainMinutes
    ? `${Math.floor(remainMinutes / 60)}h ${remainMinutes % 60}m remaining`
    : isCharging ? 'Charging' : '--'

  // Real-Time Power chart: fixed 0am→24pm day curve (x-axis ticks fixed at 0/4/8/12/16/20/24h)
  const chartData = useMemo(() => {
    if (!id) return []
    const tab = TABS.find(t => t.id === activeTab)!
    // Battery tab uses the unified higher-smoothing sample count for all devices
    const points = activeTab === 'battery' ? 20000 : 2400
    return getDemoDayCurve(id, tab.historyKey, points)
  }, [id, activeTab])

  // Fixed x-axis labels: 12am, 4am, 8am, 12pm, 4pm, 8pm, 12am
  const timeLabels = useMemo(() => ['12am', '4am', '8am', '12pm', '4pm', '8pm', '12am'], [])

  // Current value badge
  const currentTab = TABS.find(t => t.id === activeTab)!
  const badgeValue = activeTab === 'battery'
    ? `${soc}%`
    : activeTab === 'ac'
      ? `${Math.abs(acPower)}W`
      : activeTab === 'solar'
        ? `${Math.abs(solarPower)}W`
        : `${Math.abs(outputPower)}W`

  const fmtW = (w: number) => Math.abs(Math.round(w))

  return (
    <div className="h-full flex flex-col bg-[#141414] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
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
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#FF3530] border-2 border-[#141414]" />
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
              percentage={soc}
              size={180}
              strokeWidth={12}
              isCharging={isCharging}
              connected={isOnline}
              timeRemaining={timeStr}
              timeToFull={timeStr}
            />
          </div>

          {/* Input / Output row — three equal-size value cards */}
          <div>
            <div className="flex items-center gap-1 mb-2">
              <p className="text-label text-[#A0A0A5] flex-1">Input</p>
              <span className="w-4 flex-shrink-0" />
              <p className="text-label text-[#A0A0A5] flex-1 text-right">Output</p>
            </div>
            <div className="grid grid-cols-[1fr_16px_1fr_1fr] gap-2 items-stretch">
              <div className="bg-[#1F1F1F] rounded-m px-3 py-3 text-center flex flex-col items-center justify-center">
                <div>
                  <span className="text-title-md font-semibold text-white">{fmtW(acPower)}</span>
                  <span className="text-label text-[#A0A0A5]">w</span>
                </div>
                <p className="text-tiny text-[#636366] mt-0.5">AC</p>
              </div>
              <span className="text-[#636366] text-body-md font-semibold self-center text-center">+</span>
              <div className="bg-[#1F1F1F] rounded-m px-3 py-3 text-center flex flex-col items-center justify-center">
                <div>
                  <span className="text-title-md font-semibold text-white">{fmtW(solarPower)}</span>
                  <span className="text-label text-[#A0A0A5]">w</span>
                </div>
                <p className="text-tiny text-[#636366] mt-0.5">Solar</p>
              </div>
              <div className="bg-[#1F1F1F] rounded-m px-3 py-3 text-center flex flex-col items-center justify-center">
                <div>
                  <span className="text-title-md font-semibold text-white">{fmtW(outputPower)}</span>
                  <span className="text-label text-[#A0A0A5]">w</span>
                </div>
                <p className="text-tiny text-[#636366] mt-0.5">AC</p>
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
            {historyLoading || !chartData.length ? (
              <div className="h-[130px] flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-[#01D6BE] border-t-transparent animate-spin" />
              </div>
            ) : (
              <div className="w-full">
                <AreaChart
                  data={chartData}
                  color={currentTab.color}
                  width={332}
                  height={130}
                  domain={activeTab === 'battery' ? [0, 100] : undefined}
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
                <span key={i} className="text-tiny text-[#636366]">{lbl}</span>
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
                    className={active ? 'text-white' : 'text-[#636366]'}
                  />
                  <span className={`text-tiny font-medium ${active ? 'text-white' : 'text-[#636366]'}`}>
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
