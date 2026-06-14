import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronDown, Settings, Bell, Zap, Sun, PlugZap, ArrowUpRight } from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime } from '../api/deviceApi'

// ─── Chart metric tabs ────────────────────────────────────────────────────────
type Metric = 'battery' | 'ac' | 'solar' | 'output'

interface Tab {
  id: Metric
  label: string
  Icon: React.FC<{ size?: number; className?: string }>
  historyKey: 'soc' | 'batteryPower' | 'solarPower' | 'outputPower'
  unit: string
  color: string
}

const TABS: Tab[] = [
  { id: 'battery', label: 'Battery', Icon: ({ size, className }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}><rect x="2" y="7" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M20 10h2v4h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>, historyKey: 'soc', unit: '%', color: '#FFFFFF' },
  { id: 'ac', label: 'AC', Icon: PlugZap, historyKey: 'batteryPower', unit: 'W', color: '#01D6BE' },
  { id: 'solar', label: 'Solar', Icon: Sun, historyKey: 'solarPower', unit: 'W', color: '#FFD700' },
  { id: 'output', label: 'Output', Icon: ({ size, className }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}><rect x="5" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>, historyKey: 'outputPower', unit: 'W', color: '#FF9500' },
]

// ─── SVG Area Chart ───────────────────────────────────────────────────────────
function AreaChart({ data, color, width = 340, height = 130 }: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  if (!data.length) return null
  const pad = { t: 8, b: 2, l: 0, r: 0 }
  const w = width - pad.l - pad.r
  const h = height - pad.t - pad.b
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pts = data.map((v, i) => ({
    x: pad.l + (i / (data.length - 1)) * w,
    y: pad.t + h - ((v - min) / range) * h,
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const fillPath = `${linePath} L${pts[pts.length - 1].x},${(pad.t + h).toFixed(1)} L${pts[0].x},${(pad.t + h).toFixed(1)} Z`

  const gradId = `grad-${color.replace('#', '')}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DeviceMonitorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Metric>('battery')

  const {
    devices,
    selectedDeviceState,
    historyData,
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

  // Chart data from history
  const chartData = useMemo(() => {
    if (!historyData) return []
    const tab = TABS.find(t => t.id === activeTab)!
    const series = historyData[tab.historyKey]
    if (!series || !series.length) return []
    return series.map(p => p.value)
  }, [historyData, activeTab])

  // Time labels: pick ~7 evenly spaced
  const timeLabels = useMemo(() => {
    if (!historyData?.soc?.length) return []
    const pts = historyData.soc
    const step = Math.floor(pts.length / 6)
    const indices = [0, step, step * 2, step * 3, step * 4, step * 5, pts.length - 1]
    return indices.map(i => {
      const d = new Date(pts[Math.min(i, pts.length - 1)].time)
      const h = d.getHours()
      const label = h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
      return label
    })
  }, [historyData])

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
        <button className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-1">
            <span className="text-title-md font-semibold text-white">
              {device?.name ?? 'Device'}
            </span>
            <ChevronDown size={16} className="text-white" />
          </div>
          <span className="text-label text-[#01D6BE]">
            {isOnline ? 'Connected' : 'Offline'}
          </span>
        </button>

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

          {/* Input / Output row */}
          <div className="flex items-end justify-between">
            {/* Input */}
            <div>
              <p className="text-label text-[#A0A0A5] mb-2">Input</p>
              <div className="flex items-center gap-2">
                <div className="bg-[#1F1F1F] rounded-m px-3 py-2 text-center">
                  <span className="text-title-md font-semibold text-white">{fmtW(acPower)}</span>
                  <span className="text-label text-[#A0A0A5]">w</span>
                  <p className="text-tiny text-[#636366] mt-0.5">AC</p>
                </div>
                <span className="text-[#636366] text-body-md font-semibold">+</span>
                <div className="bg-[#1F1F1F] rounded-m px-3 py-2 text-center">
                  <span className="text-title-md font-semibold text-white">{fmtW(solarPower)}</span>
                  <span className="text-label text-[#A0A0A5]">w</span>
                  <p className="text-tiny text-[#636366] mt-0.5">Solar</p>
                </div>
              </div>
            </div>

            {/* Output */}
            <div className="text-right">
              <p className="text-label text-[#A0A0A5] mb-2">Output</p>
              <div className="bg-[#1F1F1F] rounded-m px-4 py-2 inline-block">
                <span className="text-title-md font-semibold text-white">{fmtW(outputPower)}</span>
                <span className="text-label text-[#A0A0A5]">w</span>
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

        {/* ─── Quick stats row ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.14 }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="bg-[#262626] rounded-l p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={14} className="text-[#01D6BE]" />
              <span className="text-tiny text-[#A0A0A5] uppercase tracking-wider">Daily Produced</span>
            </div>
            <p className="text-title-lg font-semibold text-white">
              {device?.dailyProducedQuantity?.toFixed(1) ?? '--'}<span className="text-label text-[#A0A0A5] ml-1">kWh</span>
            </p>
          </div>
          <div className="bg-[#262626] rounded-l p-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight size={14} className="text-[#34C759]" />
              <span className="text-tiny text-[#A0A0A5] uppercase tracking-wider">Total Produced</span>
            </div>
            <p className="text-title-lg font-semibold text-white">
              {device?.totalProducedQuantity?.toFixed(0) ?? '--'}<span className="text-label text-[#A0A0A5] ml-1">kWh</span>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
