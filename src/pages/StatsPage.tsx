import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { Share2, BarChart3, WifiOff, Zap, ChevronLeft, ChevronRight, Leaf } from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import { LastSync, SampleRate, CalcAudit, type DataSource } from '../components/DataTrust'
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
  dateLabel?: string
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

// ─── Demo/Mock 数据 — 来自 Sierro 1000 真实模拟 CSV ───

/** 3-point weighted moving average, applied `passes` times */
function smooth(arr: number[], passes = 2): number[] {
  let out = [...arr]
  for (let p = 0; p < passes; p++) {
    const tmp = [...out]
    for (let i = 0; i < tmp.length; i++) {
      const prev = tmp[Math.max(0, i - 1)]
      const next = tmp[Math.min(tmp.length - 1, i + 1)]
      out[i] = Math.round((prev * 0.25 + tmp[i] * 0.5 + next * 0.25) * 10) / 10
    }
  }
  return out
}

// ── Paginated demo data arrays ──

// Real SIERRO 2000 simulation logs (sierro2000_4days/4weeks/4months.csv)
const DAY_PAGES = [
  { dateLabel: 'Jul 4, 2026', insight: 'Sunny day — battery topped up by mid-morning',
    rawInput:  [0,0,1000,0,0,1000,0,1164,1584,1568,1548,1566,1578,1582,1574,1562,1579,1164,0,0,1000,0,0,1000],
    rawOutput: [77,48,64,47,70,50,82,59,84,68,48,66,78,82,74,62,79,58,67,66,80,64,53,80],
    rawSoc:    [96.2,93.8,100.0,97.6,94.2,100.0,95.9,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,96.7,93.4,100.0,96.8,94.1,100.0] },
  { dateLabel: 'Jul 3, 2026', insight: 'Overcast day — relied on grid top-ups, low solar',
    rawInput:  [0,0,1000,0,0,1000,0,207,399,565,692,772,800,772,692,565,399,207,0,0,1000,0,0,1000],
    rawOutput: [67,69,60,56,56,74,57,59,52,77,52,47,65,81,77,65,78,47,60,45,59,78,59,75],
    rawSoc:    [96.6,93.2,100.0,97.2,94.4,100.0,97.2,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,97.0,94.8,100.0,96.1,93.1,100.0] },
  { dateLabel: 'Jul 2, 2026', insight: 'Partly cloudy — SOC dipped to 83% overnight',
    rawInput:  [0,0,1000,0,0,1000,0,517,999,1414,1578,1582,1554,1569,1564,1414,999,517,0,0,0,0,0,1000],
    rawOutput: [60,74,65,76,74,51,45,60,48,81,78,82,54,69,64,79,80,69,76,48,54,83,77,82],
    rawSoc:    [97.0,93.3,100.0,96.2,92.5,100.0,97.8,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,96.2,93.8,91.1,87.0,83.1,100.0] },
  { dateLabel: 'Jul 1, 2026', insight: 'Full solar day — battery fully charged by morning',
    rawInput:  [0,0,0,1000,0,0,1000,1294,1557,1573,1547,1558,1572,1577,1552,1577,1552,1294,0,0,1000,0,0,1000],
    rawOutput: [46,51,71,58,58,74,73,50,57,73,47,58,72,77,52,77,52,65,78,83,70,49,62,54],
    rawSoc:    [97.7,95.2,91.6,100.0,97.1,93.4,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,96.1,92.0,100.0,97.6,94.4,100.0] },
]

const WEEK_PAGES = [
  { dateLabel: 'Jul 22 – 28, 2026', insight: 'Best week — steady solar, 90–97% min SOC daily',
    rawInput:  [3.463, 3.523, 3.461, 3.716, 3.590, 3.654, 3.534],
    rawOutput: [1.418, 1.514, 1.439, 1.587, 1.525, 1.541, 1.481],
    rawSoc:    [95, 92, 95, 97, 96, 90, 94] },
  { dateLabel: 'Jul 15 – 21, 2026', insight: 'Cloudy stretch — solar output nearly halved',
    rawInput:  [1.676, 1.881, 1.652, 1.638, 1.606, 1.729, 1.684],
    rawOutput: [1.476, 1.545, 1.450, 1.438, 1.532, 1.529, 1.520],
    rawSoc:    [84, 91, 96, 80, 97, 75, 93] },
  { dateLabel: 'Jul 8 – 14, 2026', insight: 'Strong solar week — battery rarely below 91%',
    rawInput:  [3.636, 3.686, 3.605, 3.505, 3.393, 3.647, 3.685],
    rawOutput: [1.532, 1.539, 1.459, 1.416, 1.595, 1.544, 1.565],
    rawSoc:    [95, 93, 95, 93, 91, 97, 97] },
  { dateLabel: 'Jul 1 – 7, 2026', insight: 'Solid solar week — steady 3.3–3.6 kWh/day input',
    rawInput:  [3.626, 3.422, 3.520, 3.337, 3.448, 3.489, 3.448],
    rawOutput: [1.544, 1.293, 1.509, 1.269, 1.328, 1.476, 1.439],
    rawSoc:    [91, 96, 90, 94, 97, 96, 92] },
]

/** Deterministic, smoothly-varying daily series for month charts (no day-level CSV available — only monthly totals) */
function monthSeries(avgW: number, seed: number): number[] {
  return Array.from({ length: 30 }, (_, i) =>
    Math.round(avgW * (1 + 0.18 * Math.sin((i + seed) * 0.7)) * 10) / 10
  )
}

const MONTH_PAGES = [
  { dateLabel: 'October 2026', monthNum: 10,
    totalInputKwh: 42.6, totalOutputKwh: 42.1,
    insight: 'Oct steady output — 39.8 kWh solar, low grid use',
    rawInput:  monthSeries(57.3, 1),
    rawOutput: monthSeries(56.6, 4),
    rawSoc:    monthSeries(90, 7) },
  { dateLabel: 'September 2026', monthNum: 9,
    totalInputKwh: 45.5, totalOutputKwh: 45.0,
    insight: 'Sep peak green ratio — 42.0 kWh solar, 3.5 kWh grid',
    rawInput:  monthSeries(63.2, 2),
    rawOutput: monthSeries(62.5, 5),
    rawSoc:    monthSeries(91, 8) },
  { dateLabel: 'August 2026', monthNum: 8,
    totalInputKwh: 49.7, totalOutputKwh: 48.2,
    insight: 'Aug heaviest grid use (11.2 kWh) — lower solar',
    rawInput:  monthSeries(66.8, 3),
    rawOutput: monthSeries(64.8, 6),
    rawSoc:    monthSeries(88, 9) },
  { dateLabel: 'July 2026', monthNum: 7,
    totalInputKwh: 46.5, totalOutputKwh: 46.5,
    insight: 'Jul highest combined input — 46.5 kWh total',
    rawInput:  monthSeries(62.5, 4),
    rawOutput: monthSeries(62.5, 7),
    rawSoc:    monthSeries(92, 10) },
]

function getDemoChartFrame(period: Period, pageOffset = 0): ChartFrame {
  const pageIdx = -pageOffset  // 0 = current, 1 = one back, 2 = two back, 3 = three back

  // ── Day ──
  if (period === 'Day') {
    const page = DAY_PAGES[Math.min(pageIdx, DAY_PAGES.length - 1)]
    const labels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
    const input  = smooth(page.rawInput, 2)
    const output = smooth(page.rawOutput, 2)
    const soc    = smooth(page.rawSoc, 1)
    const totalInputKwh  = page.rawInput.reduce((s, v) => s + v / 1000, 0)
    const totalOutputKwh = page.rawOutput.reduce((s, v) => s + v / 1000, 0)
    return {
      input, output, soc, labels,
      co2Kg: parseFloat((totalInputKwh * 0.5).toFixed(1)),
      totalInputKwh, totalOutputKwh,
      insight: page.insight,
      ecoInsight: `Equivalent to driving ${Math.round(totalOutputKwh * 3.5)} fewer miles`,
      dateLabel: page.dateLabel,
    }
  }

  // ── Week ──
  if (period === 'Week') {
    const page = WEEK_PAGES[Math.min(pageIdx, WEEK_PAGES.length - 1)]
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const input  = smooth(page.rawInput, 2)
    const output = smooth(page.rawOutput, 2)
    const soc    = smooth(page.rawSoc, 1)
    const totalInputKwh  = page.rawInput.reduce((s, v) => s + v, 0)
    const totalOutputKwh = page.rawOutput.reduce((s, v) => s + v, 0)
    return {
      input, output, soc, labels,
      co2Kg: parseFloat((totalInputKwh * 0.5).toFixed(1)),
      totalInputKwh, totalOutputKwh,
      insight: page.insight,
      ecoInsight: `Equivalent to driving ${Math.round(totalOutputKwh * 3.5)} fewer miles`,
      dateLabel: page.dateLabel,
    }
  }

  // ── Month ──
  if (period === 'Month') {
    const page = MONTH_PAGES[Math.min(pageIdx, MONTH_PAGES.length - 1)]
    const labels = Array.from({ length: 30 }, (_, i) => `${page.monthNum}/${i + 1}`)
    const rawIn  = page.rawInput.slice(0, 30)
    const rawOut = page.rawOutput.slice(0, 30)
    const rawSoc = page.rawSoc.slice(0, 30)
    const input  = smooth(rawIn, 3)
    const output = smooth(rawOut, 3)
    const soc    = smooth(rawSoc, 2)
    return {
      input, output, soc, labels,
      co2Kg: parseFloat((page.totalInputKwh * 0.5).toFixed(1)),
      totalInputKwh: page.totalInputKwh,
      totalOutputKwh: page.totalOutputKwh,
      insight: page.insight,
      ecoInsight: `Equivalent to driving ${Math.round(page.totalOutputKwh * 3.5)} fewer miles`,
      dateLabel: page.dateLabel,
    }
  }

  // ── Range: 4-month summary Jul–Oct (no pagination) ──
  const labels = ['Jul', 'Aug', 'Sep', 'Oct']
  const rawInput  = [46.5, 49.7, 45.5, 42.6]
  const rawOutput = [46.5, 48.2, 45.0, 42.1]
  const rawSoc    = [92.0, 88.0, 91.0, 90.0]
  const input  = smooth(rawInput, 1)
  const output = smooth(rawOutput, 1)
  const soc    = smooth(rawSoc, 1)
  const totalInputKwh  = rawInput.reduce((s, v) => s + v, 0)
  const totalOutputKwh = rawOutput.reduce((s, v) => s + v, 0)
  return {
    input, output, soc, labels,
    co2Kg: parseFloat((totalInputKwh * 0.5).toFixed(1)),
    totalInputKwh, totalOutputKwh,
    insight: 'Sep had the best green energy ratio — 42.0 kWh solar',
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
  const [pageOffset, setPageOffset] = useState(0) // 0=current, -1=prev, -2=two back, -3=oldest
  // Reset page when switching period
  useEffect(() => { setPageOffset(0) }, [period])
  // PRD v1.1 §8.2: 上次同步时间
  const [lastSyncAt, setLastSyncAt] = useState<number | undefined>(Date.now())
  // Scrub tooltip on the Input vs. Output line chart
  const chartSvgRef = useRef<SVGSVGElement>(null)
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)
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
    if (historyData) {
      const frame = aggregateHistory(historyData, period)
      if (frame) return frame
    }
    return getDemoChartFrame(period, pageOffset)
  }, [historyData, period, pageOffset])

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

  // Same scaling as generateAreaPath, but also exposes the raw point coordinates
  // (needed to position the scrub tooltip's dots/guide line).
  const generateAreaPathWithPoints = (data: number[], width: number, height: number) => {
    const max = Math.max(...data, 1)
    const padding = 4
    const usableWidth = width - padding * 2
    const usableHeight = height - padding * 2
    const points = data.map((val, i) => ({
      x: padding + (i / (data.length - 1)) * usableWidth,
      y: padding + usableHeight - (val / max) * usableHeight,
    }))
    return { points }
  }

  const updateScrubFromClientX = (clientX: number) => {
    const svg = chartSvgRef.current
    if (!svg || !chartFrame) return
    const rect = svg.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setScrubIndex(Math.round(ratio * (chartFrame.input.length - 1)))
  }

  // ═══════════════════════════════════════════════════
  // 设备相关数据
  // ═══════════════════════════════════════════════════
  const hasDevice = deviceId !== null
  const soc = deviceRealtime?.soc ?? 0
  const batteryTemp = deviceRealtime?.batteryTemp ?? 0
  const batteryHealth = 95 // 默认值，API 不直接返回
  const isDataLoaded = true

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

  // 空历史：仅当无 demo 且无真实数据时显示
  const emptyHistory = !historyLoading && !historyData && !useDemo
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
                  <span className="text-headline-xl font-semibold text-ink-1 leading-none">{deviceDays}</span>
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
                onClick={() => setPageOffset(v => Math.max(v - 1, -3))}
                disabled={pageOffset === -3 || period === 'Range'}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-10 text-ink-4 hover:text-ink-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-title-md font-semibold text-ink-1">{chartFrame?.dateLabel ?? dateTitle}</span>
              <button
                aria-label="Next"
                onClick={() => setPageOffset(v => Math.min(v + 1, 0))}
                disabled={pageOffset === 0 || period === 'Range'}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-10 text-ink-4 hover:text-ink-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                        <span className="text-headline-lg font-semibold text-ink-1 leading-none">
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
                      <svg
                        ref={chartSvgRef}
                        viewBox="0 0 340 160"
                        className="w-full h-[160px] touch-none select-none"
                        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); updateScrubFromClientX(e.clientX) }}
                        onPointerMove={e => { if (e.buttons || e.pointerType !== 'mouse') updateScrubFromClientX(e.clientX) }}
                        onPointerUp={() => setScrubIndex(null)}
                        onPointerLeave={() => setScrubIndex(null)}
                        onPointerCancel={() => setScrubIndex(null)}
                      >
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

                        {/* Scrub tooltip */}
                        {scrubIndex !== null && (() => {
                          const { points: inputPts } = generateAreaPathWithPoints(chartFrame.input, 340, 160)
                          const { points: outputPts } = generateAreaPathWithPoints(chartFrame.output, 340, 160)
                          const inPt = inputPts[scrubIndex]
                          const outPt = outputPts[scrubIndex]
                          const inVal = chartFrame.input[scrubIndex]
                          const outVal = chartFrame.output[scrubIndex]
                          const text1 = `In ${inVal.toFixed(1)} kWh`
                          const text2 = `Out ${outVal.toFixed(1)} kWh`
                          const boxW = Math.max(text1.length, text2.length) * 5.6 + 14
                          const boxX = Math.min(Math.max(inPt.x - boxW / 2, 2), 340 - boxW - 2)
                          return (
                            <g>
                              <line x1={inPt.x} x2={inPt.x} y1={4} y2={156} stroke="#FFFFFF" strokeWidth="1" strokeDasharray="3,3" opacity={0.4} />
                              <circle cx={inPt.x} cy={inPt.y} r={4} fill="#01D6BE" stroke="#141414" strokeWidth="1.5" />
                              <circle cx={outPt.x} cy={outPt.y} r={4} fill="#FF9500" stroke="#141414" strokeWidth="1.5" />
                              <rect x={boxX} y={4} width={boxW} height={32} rx={5} fill="#000000" opacity={0.85} />
                              <text x={boxX + boxW / 2} y={16} textAnchor="middle" fontSize="9" fontWeight="600" fill="#01D6BE">{text1}</text>
                              <text x={boxX + boxW / 2} y={28} textAnchor="middle" fontSize="9" fontWeight="600" fill="#FF9500">{text2}</text>
                            </g>
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
