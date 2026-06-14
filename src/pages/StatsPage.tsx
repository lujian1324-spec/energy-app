import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Share2, BarChart3, WifiOff, Zap, ChevronLeft, ChevronRight, Leaf } from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import { DataSourceTag, LastSync, SampleRate, CalcAudit, type DataSource } from '../components/DataTrust'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime, type HistoryDataResponse } from '../api/deviceApi'

const periods = ['Day', 'Week', 'Month', 'Range'] as const
type Period = typeof periods[number]

// ─── 图表数据结构（从 API 数据转换而来） ───

interface ChartFrame {
  input: number[]
  output: number[]
  soc: number[]
  labels: string[]
  co2Kg: number
  totalInputKwh: number
  totalOutputKwh: number
  insight: string
  ecoInsight: string
}

// ─── 按时间段采样/聚合历史数据 ───

function aggregateHistory(
  raw: HistoryDataResponse,
  period: Period
): ChartFrame | null {
  const solar = raw['solarPower'] ?? []
  const output = raw['outputPower'] ?? []
  const socArr = raw['soc'] ?? []

  if (solar.length === 0 && output.length === 0) return null

  // 将原始数据点按时间排序
  const byTime = new Map<string, { solar: number[]; output: number[]; soc: number[] }>()

  const timeToBucket = (ts: string): string => {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ts.slice(0, 10)
    switch (period) {
      case 'Day':
        return `${String(d.getHours()).padStart(2, '0')}:00`
      case 'Week': {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        return days[d.getDay()]
      }
      case 'Month':
        return `${d.getMonth() + 1}/${d.getDate()}`
      case 'Range':
        return `${d.getMonth() + 1}/${d.getDate()}`
    }
  }

  for (const pt of solar) {
    const bucket = timeToBucket(pt.time)
    const entry = byTime.get(bucket) ?? { solar: [], output: [], soc: [] }
    entry.solar.push(Number(pt.value) || 0)
    byTime.set(bucket, entry)
  }
  for (const pt of output) {
    const bucket = timeToBucket(pt.time)
    const entry = byTime.get(bucket) ?? { solar: [], output: [], soc: [] }
    entry.output.push(Number(pt.value) || 0)
    byTime.set(bucket, entry)
  }
  for (const pt of socArr) {
    const bucket = timeToBucket(pt.time)
    const entry = byTime.get(bucket) ?? { solar: [], output: [], soc: [] }
    entry.soc.push(Number(pt.value) || 0)
    byTime.set(bucket, entry)
  }

  // 按时间排序并生成数组
  let entries: [string, { solar: number[]; output: number[]; soc: number[] }][]
  if (period === 'Week') {
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    entries = [...byTime.entries()].sort(
      ([a], [b]) => dayOrder.indexOf(a) - dayOrder.indexOf(b)
    )
  } else {
    entries = [...byTime.entries()].sort()
  }

  // 限制点数
  const maxPoints = period === 'Day' ? 24 : period === 'Week' ? 7 : period === 'Month' ? 30 : 12
  const step = Math.max(1, Math.ceil(entries.length / maxPoints))
  const sampled: typeof entries = []
  for (let i = 0; i < entries.length; i += step) {
    sampled.push(entries[i])
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0)

  const inputData = sampled.map(([, v]) => avg(v.solar))
  const outputData = sampled.map(([, v]) => avg(v.output))
  const socData = sampled.map(([, v]) => avg(v.soc))
  const labels = sampled.map(([k]) => {
    if (period === 'Day') return k // "HH:00"
    if (period === 'Week') return k // "Mon"-"Sun"
    return k // "M/D"
  })

  // 估算总电量 (kWh): 假设每小时采样 → 功率(W) * 1h / 1000
  const hoursPerBucket = period === 'Day' ? 1 : period === 'Week' ? 24 : period === 'Month' ? 24 : 72
  const totalInputKwh = inputData.reduce((s, v) => s + (v * hoursPerBucket) / 1000, 0)
  const totalOutputKwh = outputData.reduce((s, v) => s + (v * hoursPerBucket) / 1000, 0)
  // CO2 估算: ~0.5 kg CO2 per kWh (grid average)
  const co2Kg = (totalInputKwh * 0.5).toFixed(1)

  // 生成 insight
  const maxOutput = Math.max(...outputData, 0)
  const maxOutputIdx = outputData.indexOf(maxOutput)
  let insight = 'Power usage data from device'
  if (period === 'Week' && maxOutputIdx >= 0) {
    insight = `Highest output on ${labels[maxOutputIdx]}`
  } else if (period === 'Day' && maxOutputIdx >= 0) {
    insight = `Peak output around ${labels[maxOutputIdx]}`
  } else if (period === 'Month' && maxOutputIdx >= 0) {
    insight = `Output peaked on ${labels[maxOutputIdx]}`
  }

  const ecoInsight = totalOutputKwh > 0
    ? `Equivalent to driving ${Math.round(totalOutputKwh * 3.5)} fewer miles`
    : 'Connect solar to reduce carbon footprint'

  return {
    input: inputData,
    output: outputData,
    soc: socData,
    labels,
    co2Kg: parseFloat(co2Kg),
    totalInputKwh,
    totalOutputKwh,
    insight,
    ecoInsight,
  }
}

// ─── Demo/Mock 数据（API 失败时的 fallback） ───

function getDemoChartFrame(period: Period): ChartFrame {
  const rng = (min: number, max: number) =>
    Math.round((min + Math.random() * (max - min)) * 10) / 10

  if (period === 'Day') {
    // 24 个点（0:00-23:00），模拟日间太阳能 + 早晚用电高峰
    const labels: string[] = []
    const input: number[] = []
    const output: number[] = []
    const soc: number[] = []
    for (let h = 0; h < 24; h++) {
      labels.push(`${String(h).padStart(2, '0')}:00`)
      // 太阳能：6:00-18:00 有值，正午峰值 ~1200W
      input.push(h >= 6 && h <= 18 ? Math.round(1200 * Math.sin((h - 6) * Math.PI / 12)) : 0)
      // 用电：早晨 6-9 和傍晚 17-22 有峰值
      const isPeak = (h >= 6 && h <= 9) || (h >= 17 && h <= 22)
      output.push(isPeak ? rng(400, 900) : rng(50, 200))
      // SOC：白天充电上升，晚上放电下降，20%-95% 之间
      const socBase = 60 + 30 * Math.sin((h - 8) * Math.PI / 16)
      soc.push(Math.round(Math.max(20, Math.min(95, socBase + rng(-5, 5)))))
    }
    const totalInputKwh = input.reduce((s, v) => s + (v * 1) / 1000, 0)
    const totalOutputKwh = output.reduce((s, v) => s + (v * 1) / 1000, 0)
    const maxOutputIdx = output.indexOf(Math.max(...output))
    return {
      input, output, soc, labels,
      co2Kg: parseFloat((totalInputKwh * 0.5).toFixed(1)),
      totalInputKwh, totalOutputKwh,
      insight: `Peak output around ${labels[maxOutputIdx]}`,
      ecoInsight: `Equivalent to driving ${Math.round(totalOutputKwh * 3.5)} fewer miles`,
    }
  }

  if (period === 'Week') {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const input = labels.map(() => rng(800, 3500))
    const output = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(() => rng(2500, 5000))
      .concat(['Sat', 'Sun'].map(() => rng(1200, 3000)))
    const soc = labels.map(() => rng(30, 90))
    const totalInputKwh = input.reduce((s, v) => s + (v * 24) / 1000, 0)
    const totalOutputKwh = output.reduce((s, v) => s + (v * 24) / 1000, 0)
    const maxOutputIdx = output.indexOf(Math.max(...output))
    return {
      input, output, soc, labels,
      co2Kg: parseFloat((totalInputKwh * 0.5).toFixed(1)),
      totalInputKwh, totalOutputKwh,
      insight: `Highest output on ${labels[maxOutputIdx]}`,
      ecoInsight: `Equivalent to driving ${Math.round(totalOutputKwh * 3.5)} fewer miles`,
    }
  }

  // Month / Range：生成合理的多天数据
  const days = period === 'Month' ? 30 : 90
  const labels: string[] = []
  const input: number[] = []
  const output: number[] = []
  const soc: number[] = []
  for (let i = 0; i < days; i++) {
    const m = Math.floor(i / 30) + 1
    const d = (i % 30) + 1
    labels.push(`${m}/${d}`)
    input.push(rng(1200, 6000))
    output.push(rng(800, 4500))
    soc.push(rng(25, 92))
  }
  // 采样到 maxPoints
  const maxPoints = period === 'Month' ? 30 : 12
  const step = Math.max(1, Math.ceil(labels.length / maxPoints))
  const sLabels = labels.filter((_, i) => i % step === 0)
  const sInput = input.filter((_, i) => i % step === 0)
  const sOutput = output.filter((_, i) => i % step === 0)
  const sSoc = soc.filter((_, i) => i % step === 0)

  const hoursPerBucket = period === 'Month' ? 24 : 72
  const totalInputKwh = sInput.reduce((s, v) => s + (v * hoursPerBucket) / 1000, 0)
  const totalOutputKwh = sOutput.reduce((s, v) => s + (v * hoursPerBucket) / 1000, 0)
  const maxOutputIdx = sOutput.indexOf(Math.max(...sOutput))
  return {
    input: sInput, output: sOutput, soc: sSoc, labels: sLabels,
    co2Kg: parseFloat((totalInputKwh * 0.5).toFixed(1)),
    totalInputKwh, totalOutputKwh,
    insight: `Output peaked on ${sLabels[maxOutputIdx]}`,
    ecoInsight: `Equivalent to driving ${Math.round(totalOutputKwh * 3.5)} fewer miles`,
  }
}

// ─── 加载骨架屏 ───

// Days overview skeleton (top, borderless on app bg)
function DaysSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col items-center py-4 mb-2">
      <div className="h-12 w-44 bg-ink-10 rounded-m animate-pulse mb-3" />
      <div className="h-3 w-52 bg-ink-10 rounded-s animate-pulse" />
    </motion.div>
  )
}

// CO2 stat card skeleton
function ChartSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="bg-ink-10 rounded-l p-5 mb-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-11 w-28 bg-[rgba(255,255,255,0.05)] rounded-m animate-pulse" />
          <div className="h-3 w-40 bg-[rgba(255,255,255,0.03)] rounded-s animate-pulse mt-3" />
        </div>
        <div className="h-4 w-24 bg-[rgba(255,255,255,0.05)] rounded-s animate-pulse mt-2" />
      </div>
    </motion.div>
  )
}

// Chart card skeleton
function ChartAreaSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="bg-ink-10 rounded-l p-5 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="h-5 w-32 bg-[rgba(255,255,255,0.05)] rounded-s animate-pulse" />
        <div className="h-3 w-28 bg-[rgba(255,255,255,0.03)] rounded-s animate-pulse" />
      </div>
      <div className="h-3 w-40 bg-[rgba(255,255,255,0.03)] rounded-s animate-pulse mb-4" />
      <div className="h-[160px] bg-[rgba(255,255,255,0.02)] rounded-m animate-pulse" />
    </motion.div>
  )
}

// ─── 空状态（无历史数据） ───

function ChartEmptyState({ message }: { message: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-12 px-6 bg-ink-10 rounded-l mb-4">
      <div className="w-14 h-14 rounded-l bg-[rgba(255,255,255,0.03)] flex items-center justify-center mb-3">
        <BarChart3 size={28} className="text-ink-7" />
      </div>
      <p className="text-body-md font-semibold text-ink-1 mb-1">No history data yet</p>
      <p className="text-label text-ink-6 text-center">{message}</p>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════
// StatsPage
// ═══════════════════════════════════════════════════════

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('Day')
  // PRD v1.1 §8.2: 上次同步时间
  const [lastSyncAt, setLastSyncAt] = useState<number | undefined>(Date.now())
  const {
    devices,
    selectedDeviceId,
    selectedDeviceState,
    loadDevices,
    historyData,
    historyLoading,
    historyError,
    loadHistoryData,
  } = useDeviceStore()

  // PRD v1.1 §8.2: 当 historyError 出现时, 自动进入 Demo 模式
  const useDemo = !!historyError && !historyLoading

  // 确定当前设备 ID
  const deviceId = useMemo(() => {
    if (selectedDeviceId) return Number(selectedDeviceId)
    return devices[0]?.id ?? null
  }, [selectedDeviceId, devices])

  // 组件挂载时加载设备列表
  useEffect(() => {
    if (devices.length === 0) {
      loadDevices()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 获取实时设备状态（用于 Battery Health）
  const deviceRealtime = useMemo(() => {
    if (!selectedDeviceState?.fields) return null
    return mapFieldsToRealtime(selectedDeviceState.fields)
  }, [selectedDeviceState])

  // 加载历史数据
  const loadHistory = useCallback(async () => {
    if (!deviceId) return
    // 调用 store 里的 loadHistoryData
    const now = new Date()
    let fromTime: Date
    let count: number
    switch (period) {
      case 'Day':
        fromTime = new Date(now.getTime() - 24 * 3600 * 1000)
        count = 288
        break
      case 'Week':
        fromTime = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
        count = 336
        break
      case 'Month':
        fromTime = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
        count = 720
        break
      case 'Range':
        fromTime = new Date(now.getTime() - 90 * 24 * 3600 * 1000)
        count = 720
        break
    }
    loadHistoryData(
      deviceId,
      fromTime.toISOString(),
      now.toISOString(),
      ['solarPower', 'outputPower', 'soc', 'batteryTemp'],
      count
    )
  }, [deviceId, period, loadHistoryData])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // 解析图表数据（仅使用 API 数据，无 demo 降级）
  const chartFrame = useMemo(() => {
    if (historyData) return aggregateHistory(historyData, period)
    return null
  }, [historyData, period])

  // 生成 SVG path
  const generateAreaPath = (data: number[], width: number, height: number) => {
    const max = Math.max(...data, 1)
    const padding = 4
    const usableWidth = width - padding * 2
    const usableHeight = height - padding * 2

    const points = data.map((val, i) => ({
      x: padding + (i / (data.length - 1)) * usableWidth,
      y: padding + usableHeight - (val / max) * usableHeight,
    }))

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`

    return { linePath, areaPath }
  }

  // ═══════════════════════════════════════════════════
  // 设备相关数据
  // ═══════════════════════════════════════════════════
  const hasDevice = deviceId !== null
  const soc = deviceRealtime?.soc ?? 0
  const batteryTemp = deviceRealtime?.batteryTemp ?? 0
  const batteryHealth = 95 // 默认值，API 不直接返回
  const isDataLoaded = chartFrame !== null

  // 设备名称
  const deviceName = useMemo(() => {
    if (!deviceId) return null
    const dev = devices.find(d => d.id === deviceId)
    return dev?.name ?? dev?.serialNumber ?? `Device #${deviceId}`
  }, [deviceId, devices])

  // 总运行天数（从设备安装日期估算）
  const deviceDays = useMemo(() => {
    if (!deviceId) return 0
    const dev = devices.find(d => d.id === deviceId)
    if (!dev?.installedAt) return 0
    const installed = new Date(dev.installedAt)
    if (isNaN(installed.getTime())) return 0
    return Math.max(1, Math.floor((Date.now() - installed.getTime()) / (24 * 3600 * 1000)))
  }, [deviceId, devices])

  // 安装年份（用于 Days 副标题）
  const installedYearLabel = useMemo(() => {
    const dev = devices.find(d => d.id === deviceId)
    if (!dev?.installedAt) return null
    const d = new Date(dev.installedAt)
    if (isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }, [deviceId, devices])

  // 时间标题（display-only，格式随 period 变化）— 不改变取数逻辑
  const dateTitle = useMemo(() => {
    const now = new Date()
    const mdy = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    switch (period) {
      case 'Day':
        return mdy(now)
      case 'Week': {
        const start = new Date(now)
        start.setDate(now.getDate() - now.getDay())
        const end = new Date(start)
        end.setDate(start.getDate() + 6)
        const sameMonth = start.getMonth() === end.getMonth()
        const sameYear = start.getFullYear() === end.getFullYear()
        if (sameMonth) return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.getDate()}, ${end.getFullYear()}`
        if (sameYear) return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${mdy(end)}`
        return `${mdy(start)} – ${mdy(end)}`
      }
      case 'Month':
        return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      case 'Range': {
        const start = new Date(now)
        start.setMonth(now.getMonth() - 2)
        start.setDate(1)
        return `${mdy(start)} – ${mdy(now)}`
      }
    }
  }, [period])

  // ═══════════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════════

  // 无设备
  const noDevice = (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 px-8">
      <div className="w-16 h-16 rounded-2xl bg-[#262626] flex items-center justify-center mb-4">
        <BarChart3 size={32} className="text-[#636366]" />
      </div>
      <h3 className="text-[16px] font-bold text-[#FFFFFF] mb-2">No Data Yet</h3>
      <p className="text-[13px] text-[#A0A0A5] text-center leading-relaxed mb-6">
        Connect a device to start tracking energy usage and statistics.
      </p>
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#262626] border border-[rgba(255,255,255,0.06)]">
        <WifiOff size={14} className="text-[#636366]" />
        <span className="text-[12px] text-[#636366]">No device connected</span>
      </div>
    </motion.div>
  )

  // 空历史：API 返回空数据且无设备时显示
  const emptyHistory = !historyLoading && !isDataLoaded
    ? (
      <ChartEmptyState
        message={
          hasDevice
            ? `Historical power data will appear here after your device has been running for a while.`
            : `Select a device to view its energy statistics.`
        }
      />
    ) : null

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden pt-6">
      {/* Header */}
      <div className="px-4 pt-8 pb-2 safe-area-top flex justify-between items-start">
        <div>
          <h1 className="text-display font-display text-ink-1 leading-none">Insights</h1>
          {/* PRD v1.1 §8: 数据来源 + 同步时间 */}
          <div className="flex items-center gap-2 mt-2">
            <DataSourceTag source={useDemo ? 'demo' : 'cloud'} />
            <LastSync lastSyncAt={lastSyncAt} />
          </div>
        </div>
        <button
          aria-label="Share"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-ink-10 text-ink-6 hover:text-primary transition-colors"
          onClick={() => {
            if (navigator.share && chartFrame) {
              navigator.share({
                title: 'Sierro Energy Stats',
                text: `CO2 Reduced: ${chartFrame.co2Kg} kg`,
                url: window.location.href,
              }).catch(err => console.error('[StatsPage] Share failed:', err))
            }
          }}
        >
          <Share2 size={18} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-4">
        {!hasDevice && noDevice}

        {hasDevice && (
          <>
            {/* ── Days overview (NOT controlled by period) ── */}
            {historyLoading ? (
              <DaysSkeleton />
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center text-center py-5"
              >
                <div className="flex items-baseline justify-center gap-2">
                  <Zap size={32} className="text-primary fill-primary self-center" />
                  <span className="text-headline-xl font-display text-ink-1 leading-none">{deviceDays}</span>
                  <span className="text-title-md text-ink-6">Days</span>
                </div>
                <p className="text-body-md text-ink-6 mt-3">
                  {installedYearLabel
                    ? `Reliable backup power since ${installedYearLabel}`
                    : 'Reliable backup power'}
                </p>
              </motion.div>
            )}

            {/* ── Segmented time-range control (full width) ── */}
            <div className="flex bg-ink-10 rounded-pill p-1 mb-3">
              {periods.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`flex-1 text-body-md font-semibold py-2 rounded-pill transition-all duration-200
                    ${period === p ? 'bg-ink-3 text-ink-13' : 'text-ink-6 hover:text-ink-1'}`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* ── Date navigator ── */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <button
                aria-label="Previous"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-10 text-ink-4 hover:text-ink-1 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-title-md font-semibold text-ink-1">{dateTitle}</span>
              <button
                aria-label="Next"
                disabled
                className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-10 text-ink-9 opacity-40 cursor-not-allowed"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Loading skeleton */}
            {historyLoading && (
              <>
                <ChartSkeleton />
                <ChartAreaSkeleton />
              </>
            )}

            {/* Error or empty */}
            {!historyLoading && !isDataLoaded && emptyHistory}

            {/* Data loaded */}
            {!historyLoading && isDataLoaded && chartFrame && (
              <>
                {/* CO2 Card (PRD §4.4.3) */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-ink-10 rounded-l p-5 mb-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-headline-lg font-display text-ink-1 leading-none">
                          {chartFrame.co2Kg}
                        </span>
                        <span className="text-body-md text-ink-6">Kg</span>
                      </div>
                      <p className="text-body-md text-ink-6 mt-2">{chartFrame.ecoInsight}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Leaf size={14} className="text-success" />
                      <span className="text-body-lg text-ink-4">CO₂ Reduced</span>
                    </div>
                  </div>
                  {/* PRD v1.1 §8.3: 计算逻辑可审计 */}
                  <div className="mt-3">
                    <CalcAudit
                      formula={`Solar generated: ${chartFrame.totalInputKwh} kWh
Grid CO2 factor: 0.5 kg CO₂/kWh (US EPA average)
CO₂ avoided: ${chartFrame.totalInputKwh} kWh × 0.5 kg/kWh = ${chartFrame.co2Kg} kg

Data source: US EPA eGRID 2024 average emission rate`}
                      label="How we calculated CO₂"
                    />
                  </div>
                </motion.div>

                {/* Input vs Output Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="bg-ink-10 rounded-l p-4 mb-4"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-title-md font-semibold text-ink-1">Input vs. Output</div>
                      <p className="text-label text-ink-6 mt-1">{chartFrame.insight}</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex items-center gap-1.5 text-label text-ink-4">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                        <span>Input</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-label text-ink-4">
                        <div className="w-2.5 h-2.5 rounded-full bg-warning" />
                        <span>Output</span>
                      </div>
                    </div>
                  </div>

                  {period === 'Week' ? (
                    /* Week: Dual Bar Chart */
                    <div>
                      <div className="flex items-end gap-2 h-[160px]">
                        {chartFrame.input.map((input, i) => {
                          const maxVal = Math.max(...chartFrame.input, ...chartFrame.output, 1)
                          return (
                            <div key={i} className="flex-1 flex items-end justify-center gap-1 h-full">
                              <div
                                className="flex-1 max-w-[12px] rounded-t-s bg-primary min-h-[2px] transition-all duration-500"
                                style={{ height: `${(input / maxVal) * 100}%` }}
                              />
                              <div
                                className="flex-1 max-w-[12px] rounded-t-s bg-warning min-h-[2px] transition-all duration-500"
                                style={{ height: `${(chartFrame.output[i] / maxVal) * 100}%` }}
                              />
                            </div>
                          )
                        })}
                      </div>
                      <div className="h-px bg-[rgba(255,255,255,0.08)] my-2" />
                      <div className="flex gap-2">
                        {chartFrame.labels.map((day) => (
                          <div key={day} className="flex-1 text-center text-tiny text-ink-6">{day}</div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Day/Month/Range: Line + Area Chart */
                    <div>
                      <svg viewBox="0 0 340 160" className="w-full h-[160px]">
                        {/* gridlines */}
                        {[0, 1, 2, 3, 4].map((g) => (
                          <line
                            key={g}
                            x1="0" x2="340"
                            y1={4 + (g / 4) * 152} y2={4 + (g / 4) * 152}
                            stroke="rgba(255,255,255,0.06)" strokeWidth="1"
                          />
                        ))}
                        {/* Output: orange solid line + area fill */}
                        {(() => {
                          const { linePath, areaPath } = generateAreaPath(chartFrame.output, 340, 160)
                          return (
                            <g>
                              <path d={areaPath} fill="rgba(255,149,0,0.18)" />
                              <path d={linePath} fill="none" stroke="#FF9500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </g>
                          )
                        })()}
                        {/* Input: teal dashed line */}
                        {(() => {
                          const { linePath } = generateAreaPath(chartFrame.input, 340, 160)
                          return (
                            <path d={linePath} fill="none" stroke="#01D6BE" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />
                          )
                        })()}
                      </svg>
                      <div className="flex justify-between px-1 mt-1">
                        {chartFrame.labels.filter((_, i) => i % Math.max(1, Math.floor(chartFrame.labels.length / 6)) === 0).map((label) => (
                          <span key={label} className="text-tiny text-ink-6">{label}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              </>
            )}

            {/* Battery Health Card (使用真实设备状态) */}
            {hasDevice && (
              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-[20px] p-4"
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="text-sm font-bold text-[#FFFFFF]">Battery Health</div>
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[rgba(52,199,89,0.12)] text-[#34C759] border border-[rgba(52,199,89,0.25)] text-[10px] font-semibold">
                    Good
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex-shrink-0">
                    <BatteryRing
                      percentage={soc}
                      size={160}
                      strokeWidth={18}
                      isCharging={false}
                      uid="stats-page"
                    />
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div className="text-center bg-[rgba(255,255,255,0.03)] rounded-[12px] p-2.5">
                      <div className="text-[14px] font-bold text-[#FFFFFF]">{soc}%</div>
                      <div className="text-[9px] text-[#A0A0A5] mt-0.5">Charge</div>
                    </div>
                    <div className="text-center bg-[rgba(255,255,255,0.03)] rounded-[12px] p-2.5">
                      <div className="text-[14px] font-bold text-[#34C759]">
                        {batteryTemp > 0 ? `${batteryTemp}°C` : '--'}
                      </div>
                      <div className="text-[9px] text-[#A0A0A5] mt-0.5">Temp</div>
                    </div>
                    <div className="text-center bg-[rgba(255,255,255,0.03)] rounded-[12px] p-2.5">
                      <div className="text-[14px] font-bold text-[#01D6BE]">{deviceDays}</div>
                      <div className="text-[9px] text-[#A0A0A5] mt-0.5">Days</div>
                    </div>
                    <div className="text-center bg-[rgba(255,255,255,0.03)] rounded-[12px] p-2.5">
                      <div className="text-[14px] font-bold text-[#FF9500]">{batteryHealth}%</div>
                      <div className="text-[9px] text-[#A0A0A5] mt-0.5">Health</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
