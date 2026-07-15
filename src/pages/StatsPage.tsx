import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Share2, BarChart3, WifiOff, Zap, ChevronLeft, ChevronRight, Leaf, RefreshCw } from 'lucide-react'
import html2canvas from 'html2canvas'
import { LastSync, CalcAudit } from '../components/DataTrust'
import { useDeviceStore } from '../stores/deviceStore'
import { fetchDeviceRecordHistory, type DeviceAttributeRecord } from '../api/deviceApi'
import { isApiSuccess } from '../utils/apiClient'

const periods = ['Day', 'Week', 'Month', 'Range'] as const
type Period = typeof periods[number]

// ─── Helpers ───

function weekStart(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const s = new Date(d)
  s.setDate(d.getDate() + diff)
  s.setHours(0, 0, 0, 0)
  return s
}

// ISO 8601 字符串（带本地时区偏移），供 record/list 接口的 fromTime/toTime 使用
function toIsoTz(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const tz = sign + String(Math.floor(Math.abs(off) / 60)).padStart(2, '0') + ':' + String(Math.abs(off) % 60).padStart(2, '0')
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
    'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0') + tz
}

// 从一条历史记录里取某个属性值（真实后端把值嵌套在 fields[key].value 里）。缺失/非数返回 0。
function fieldVal(rec: DeviceAttributeRecord, key: string): number {
  const f = rec.fields?.[key]
  if (f === undefined || f === null) return 0
  const raw = typeof f === 'object' && f !== null && 'value' in f ? (f as { value?: unknown }).value : f
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

// ─── DayCalendar component ───

interface DayCalendarProps {
  period: Period
  selectedDate: Date
  rangeStart: Date | null
  rangeEnd: Date | null
  rangePickStep: 'start' | 'end'
  viewDate: Date
  onViewDateChange: (d: Date) => void
  onDaySelect: (d: Date) => void
}

function DayCalendar({
  period, selectedDate, rangeStart, rangeEnd, rangePickStep,
  viewDate, onViewDateChange, onDaySelect,
}: DayCalendarProps) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const dayCount = new Date(year, month + 1, 0).getDate()
  const rawFirst = new Date(year, month, 1).getDay()
  const firstDayCol = rawFirst === 0 ? 6 : rawFirst - 1 // Mon=0

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const prevMonth = () => { const d = new Date(viewDate); d.setMonth(d.getMonth() - 1); onViewDateChange(d) }
  const nextMonth = () => { const d = new Date(viewDate); d.setMonth(d.getMonth() + 1); onViewDateChange(d) }
  const canNavNext = year < today.getFullYear() ||
    (year === today.getFullYear() && month < today.getMonth())

  const ws = weekStart(selectedDate)
  const we = new Date(ws); we.setDate(ws.getDate() + 6)

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink-11 text-ink-4">
          <ChevronLeft size={16} />
        </button>
        <span className="text-body-md font-semibold text-ink-1">
          {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={nextMonth} disabled={!canNavNext}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink-11 text-ink-4 disabled:opacity-30">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Range hint */}
      {period === 'Range' && (
        <p className="text-label text-primary text-center mb-2">
          {rangePickStep === 'start' ? 'Tap start date' : 'Tap end date'}
        </p>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
          <div key={d} className="text-center text-tiny text-ink-6 py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {Array.from({ length: firstDayCol }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: dayCount }, (_, i) => {
          const day = i + 1
          const date = new Date(year, month, day); date.setHours(0, 0, 0, 0)
          const isFuture = date > today
          const colIdx = (firstDayCol + i) % 7

          let bg = ''
          let textCls = isFuture ? 'text-ink-8' : 'text-ink-2'
          let rounding = 'rounded-full'

          if (!isFuture) {
            if (period === 'Day') {
              if (date.toDateString() === selectedDate.toDateString()) {
                bg = 'bg-primary'; textCls = 'text-ink-13 font-semibold'
              }
            } else if (period === 'Week') {
              if (date >= ws && date <= we) {
                bg = 'bg-primary/20'; textCls = 'text-primary font-semibold'
                rounding = colIdx === 0 ? 'rounded-l-full' : colIdx === 6 ? 'rounded-r-full' : 'rounded-none'
              }
            } else if (period === 'Range') {
              const isStart = rangeStart && date.toDateString() === rangeStart.toDateString()
              const isEnd = rangeEnd && date.toDateString() === rangeEnd.toDateString()
              const inRange = rangeStart && rangeEnd && date > rangeStart && date < rangeEnd
              if (isStart || isEnd) {
                bg = 'bg-primary'; textCls = 'text-ink-13 font-semibold'; rounding = 'rounded-full'
              } else if (inRange) {
                bg = 'bg-primary/20'; textCls = 'text-primary'; rounding = 'rounded-none'
              }
            }
          }

          return (
            <div
              key={day}
              onClick={() => !isFuture && onDaySelect(new Date(year, month, day))}
              className={`flex items-center justify-center h-9 ${bg} ${rounding} ${isFuture ? 'cursor-not-allowed' : 'cursor-pointer active:opacity-70'}`}
            >
              <span className={`text-body-md ${textCls}`}>{day}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── MonthGridPicker component ───

function MonthGridPicker({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (d: Date) => void }) {
  const [pickerYear, setPickerYear] = useState(selectedDate.getFullYear())
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const now = new Date()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setPickerYear(y => y - 1)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink-11 text-ink-4">
          <ChevronLeft size={16} />
        </button>
        <span className="text-body-md font-semibold text-ink-1">{pickerYear}</span>
        <button onClick={() => setPickerYear(y => y + 1)} disabled={pickerYear >= now.getFullYear()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink-11 text-ink-4 disabled:opacity-30">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {months.map((m, i) => {
          const isFuture = pickerYear > now.getFullYear() ||
            (pickerYear === now.getFullYear() && i > now.getMonth())
          const isSel = selectedDate.getMonth() === i && selectedDate.getFullYear() === pickerYear
          return (
            <button key={m} disabled={isFuture}
              onClick={() => onSelect(new Date(pickerYear, i, 1))}
              className={`h-10 rounded-m text-body-md font-semibold transition-colors
                ${isSel ? 'bg-primary text-ink-13' : ''}
                ${!isSel && !isFuture ? 'text-ink-1 hover:bg-ink-11' : ''}
                ${isFuture ? 'text-ink-8 cursor-not-allowed' : ''}`}>
              {m}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── 图表数据结构（从 API 历史记录聚合而来） ───

interface ChartFrame {
  input: number[]
  output: number[]
  remainingBatteryCapacity: number[]
  labels: string[]
  co2Kg: number
  totalInputKwh: number
  totalOutputKwh: number
  insight: string
  ecoInsight: string
  hasData: boolean
}

// ─── 把 record/list 历史记录按所选时间段聚合成图表帧 ───
// 无数据时返回一条全 0 的曲线（保持坐标轴/标签完整），而不是回退到任何模拟数据。

function buildFrameFromRecords(
  records: DeviceAttributeRecord[],
  period: Period,
  selectedDate: Date,
  rangeStart: Date | null,
  rangeEnd: Date | null,
): ChartFrame {
  // 1) 固定标签栅格 + 分桶函数（保证无数据也有完整坐标轴）
  let labels: string[]
  let bucketCount: number
  let bucketOf: (d: Date) => number
  let hoursPerBucket: number

  if (period === 'Day') {
    labels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
    bucketCount = 24
    hoursPerBucket = 1
    const sel = new Date(selectedDate); sel.setHours(0, 0, 0, 0)
    bucketOf = (d) => {
      const dd = new Date(d); dd.setHours(0, 0, 0, 0)
      return dd.getTime() === sel.getTime() ? d.getHours() : -1
    }
  } else if (period === 'Week') {
    labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    bucketCount = 7
    hoursPerBucket = 24
    const ws = weekStart(selectedDate)
    const we = new Date(ws); we.setDate(ws.getDate() + 6); we.setHours(23, 59, 59, 999)
    bucketOf = (d) => (d >= ws && d <= we ? (d.getDay() + 6) % 7 : -1)
  } else if (period === 'Month') {
    const y = selectedDate.getFullYear(), m = selectedDate.getMonth()
    const days = new Date(y, m + 1, 0).getDate()
    labels = Array.from({ length: days }, (_, i) => `${m + 1}/${i + 1}`)
    bucketCount = days
    hoursPerBucket = 24
    bucketOf = (d) => (d.getFullYear() === y && d.getMonth() === m ? d.getDate() - 1 : -1)
  } else {
    // Range：按天分桶
    const start = rangeStart ? new Date(rangeStart) : new Date(Date.now() - 30 * 86400000)
    start.setHours(0, 0, 0, 0)
    const end = rangeEnd ? new Date(rangeEnd) : new Date()
    end.setHours(0, 0, 0, 0)
    const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1)
    labels = Array.from({ length: days }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i)
      return `${d.getMonth() + 1}/${d.getDate()}`
    })
    bucketCount = days
    hoursPerBucket = 24
    bucketOf = (d) => {
      const dd = new Date(d); dd.setHours(0, 0, 0, 0)
      const idx = Math.floor((dd.getTime() - start.getTime()) / 86400000)
      return idx >= 0 && idx < days ? idx : -1
    }
  }

  // 2) 累加各桶的均值
  const solarSum = new Array(bucketCount).fill(0)
  const outSum = new Array(bucketCount).fill(0)
  const socSum = new Array(bucketCount).fill(0)
  const cnt = new Array(bucketCount).fill(0)

  for (const rec of records) {
    const t = rec.time ? new Date(rec.time) : null
    if (!t || isNaN(t.getTime())) continue
    const b = bucketOf(t)
    if (b < 0 || b >= bucketCount) continue
    solarSum[b] += fieldVal(rec, 'generationPower')
    outSum[b] += fieldVal(rec, 'outputPower')
    socSum[b] += fieldVal(rec, 'remainingBatteryCapacity')
    cnt[b] += 1
  }

  const input = solarSum.map((s, i) => (cnt[i] ? s / cnt[i] : 0))
  const output = outSum.map((s, i) => (cnt[i] ? s / cnt[i] : 0))
  const remainingBatteryCapacity = socSum.map((s, i) => (cnt[i] ? s / cnt[i] : 0))

  // 3) 汇总（W 均值 × 桶时长 → kWh）
  const round1 = (n: number) => Math.round(n * 10) / 10
  const totalInputKwh = round1(input.reduce((s, v) => s + (v * hoursPerBucket) / 1000, 0))
  const totalOutputKwh = round1(output.reduce((s, v) => s + (v * hoursPerBucket) / 1000, 0))
  const co2Kg = round1(totalInputKwh * 0.5)

  const hasData = input.some(v => v > 0) || output.some(v => v > 0)

  let insight = 'No power data for this period'
  if (hasData) {
    const maxOutput = Math.max(...output)
    const idx = output.indexOf(maxOutput)
    if (idx >= 0) {
      if (period === 'Day') insight = `Peak output around ${labels[idx]}`
      else if (period === 'Week') insight = `Highest output on ${labels[idx]}`
      else insight = `Output peaked on ${labels[idx]}`
    } else insight = 'Power usage data from device'
  }

  const ecoInsight = totalOutputKwh > 0
    ? `Equivalent to driving ${Math.round(totalOutputKwh * 3.5)} fewer miles`
    : 'Connect solar to reduce carbon footprint'

  return { input, output, remainingBatteryCapacity, labels, co2Kg, totalInputKwh, totalOutputKwh, insight, ecoInsight, hasData }
}

// ─── 加载骨架屏 ───

function DaysSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-4 mb-2">
      <div className="h-12 w-44 bg-ink-10 rounded-m animate-pulse mb-3" />
      <div className="h-3 w-52 bg-ink-10 rounded-s animate-pulse" />
    </motion.div>
  )
}

function ChartSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-ink-10 rounded-l p-5 mb-4">
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

function ChartAreaSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-ink-10 rounded-l p-5 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="h-5 w-32 bg-[rgba(255,255,255,0.05)] rounded-s animate-pulse" />
        <div className="h-3 w-28 bg-[rgba(255,255,255,0.03)] rounded-s animate-pulse" />
      </div>
      <div className="h-3 w-40 bg-[rgba(255,255,255,0.03)] rounded-s animate-pulse mb-4" />
      <div className="h-[160px] bg-[rgba(255,255,255,0.02)] rounded-m animate-pulse" />
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════
// StatsPage
// ═══════════════════════════════════════════════════════

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('Day')
  const [sharing, setSharing] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  // ── Date picker state ──
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [rangeStart, setRangeStart] = useState<Date | null>(null)
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [rangePickStep, setRangePickStep] = useState<'start' | 'end'>('start')
  const [pickerViewDate, setPickerViewDate] = useState<Date>(new Date())

  // Reset on period change
  useEffect(() => {
    setSelectedDate(new Date())
    setShowPicker(false)
    if (period === 'Range') {
      setRangeStart(null)
      setRangeEnd(null)
      setRangePickStep('start')
    }
  }, [period])

  const [lastSyncAt, setLastSyncAt] = useState<number | undefined>(undefined)
  const chartSvgRef = useRef<SVGSVGElement>(null)
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)

  const { devices, loadDevices } = useDeviceStore()

  // 历史记录（record/list）本地状态
  const [records, setRecords] = useState<DeviceAttributeRecord[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 始终使用第一个添加的设备（按 createdAt 最早排序）
  const deviceId = useMemo(() => {
    if (devices.length === 0) return null
    const sorted = [...devices].sort((a, b) => {
      if (a.createdAt && b.createdAt) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return 0
    })
    return String(sorted[0].id)
  }, [devices])

  useEffect(() => {
    if (devices.length === 0) loadDevices(1, 50, { orderByCreatedAtAsc: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Can navigate forward ──
  const canGoForward = useMemo(() => {
    if (period === 'Range') return false
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const sel = new Date(selectedDate); sel.setHours(0, 0, 0, 0)
    if (period === 'Day') return sel < today
    if (period === 'Week') return weekStart(sel) < weekStart(today)
    const tMonth = today.getFullYear() * 12 + today.getMonth()
    const sMonth = sel.getFullYear() * 12 + sel.getMonth()
    return sMonth < tMonth
  }, [period, selectedDate])

  // ── Date label ──
  const dateLabel = useMemo(() => {
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    switch (period) {
      case 'Day': return fmt(selectedDate)
      case 'Week': {
        const start = weekStart(selectedDate)
        const end = new Date(start); end.setDate(start.getDate() + 6)
        if (start.getMonth() === end.getMonth())
          return `${fmtShort(start)} – ${end.getDate()}, ${end.getFullYear()}`
        return `${fmtShort(start)} – ${fmtShort(end)}, ${end.getFullYear()}`
      }
      case 'Month': return selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      case 'Range':
        if (rangeStart && rangeEnd) return `${fmtShort(rangeStart)} – ${fmtShort(rangeEnd)}`
        if (rangeStart) return `${fmtShort(rangeStart)} – ?`
        return 'Select date range'
    }
  }, [period, selectedDate, rangeStart, rangeEnd])

  // ── Load history from POST /deviceState/attribute/record/list ──
  const loadHistory = useCallback(async () => {
    if (!deviceId) { setRecords([]); return }

    // Range 未选完整区间时不请求
    if (period === 'Range' && (!rangeStart || !rangeEnd)) { setRecords([]); return }

    let from: Date, to: Date
    const now = new Date(); now.setHours(23, 59, 59, 999)
    switch (period) {
      case 'Day':
        from = new Date(selectedDate); from.setHours(0, 0, 0, 0)
        to = new Date(selectedDate); to.setHours(23, 59, 59, 999)
        break
      case 'Week':
        from = weekStart(selectedDate)
        to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999)
        break
      case 'Month':
        from = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
        to = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59, 999)
        break
      default: // Range
        from = new Date(rangeStart as Date); from.setHours(0, 0, 0, 0)
        to = new Date(rangeEnd as Date); to.setHours(23, 59, 59, 999)
        break
    }

    setLoading(true); setError(null)
    try {
      const all: DeviceAttributeRecord[] = []
      const PAGE = 300
      for (let page = 1; page <= 20; page++) {
        const res = await fetchDeviceRecordHistory({
          deviceId: String(deviceId),
          fromTime: toIsoTz(from),
          toTime: toIsoTz(to),
          page,
          count: PAGE,
          orderByTimeAsc: true,
        })
        if (!isApiSuccess(res.code)) {
          if (page === 1) throw new Error(res.message || 'Failed to load history')
          break
        }
        const listPage = res.data?.list ?? []
        all.push(...listPage)
        const totalPages = res.data?.total ?? 1
        if (page >= totalPages || listPage.length === 0) break
      }
      setRecords(all)
      setLastSyncAt(Date.now())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [deviceId, period, selectedDate, rangeStart, rangeEnd])

  useEffect(() => { loadHistory() }, [loadHistory])

  const chartFrame = useMemo(
    () => buildFrameFromRecords(records ?? [], period, selectedDate, rangeStart, rangeEnd),
    [records, period, selectedDate, rangeStart, rangeEnd],
  )

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

  const hasDevice = deviceId !== null

  const deviceDays = useMemo(() => {
    if (!deviceId) return 0
    const dev = devices.find(d => String(d.id) === String(deviceId))
    if (!dev?.installedAt) return 0
    const installed = new Date(dev.installedAt)
    if (isNaN(installed.getTime())) return 0
    return Math.max(1, Math.floor((Date.now() - installed.getTime()) / (24 * 3600 * 1000)))
  }, [deviceId, devices])

  const installedYearLabel = useMemo(() => {
    const dev = devices.find(d => String(d.id) === String(deviceId))
    if (!dev?.installedAt) return null
    const d = new Date(dev.installedAt)
    if (isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }, [deviceId, devices])

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden pt-6">
      {/* Header */}
      <div className="px-4 pt-8 pb-2 safe-area-top flex justify-between items-start">
        <div>
          <h1 className="text-display font-display text-ink-1 leading-none">Insights</h1>
          <div className="flex items-center gap-2 mt-2">
            <LastSync lastSyncAt={lastSyncAt} />
          </div>
        </div>
        <button
          aria-label="Share"
          disabled={sharing}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-ink-10 text-ink-6 hover:text-primary transition-colors disabled:opacity-50"
          onClick={async () => {
            if (!shareRef.current || sharing) return
            setSharing(true)
            try {
              const canvas = await html2canvas(shareRef.current, {
                backgroundColor: '#141414',
                scale: 2,
                useCORS: true,
                logging: false,
              })
              // Watermark
              const ctx = canvas.getContext('2d')!
              ctx.fillStyle = 'rgba(255,255,255,0.35)'
              ctx.font = `bold ${14 * 2}px Inter, sans-serif`
              ctx.textAlign = 'right'
              ctx.fillText('Sierro Energy', canvas.width - 24, canvas.height - 24)

              const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
              if (!blob) return
              const file = new File([blob], 'sierro-insights.png', { type: 'image/png' })
              if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Sierro Energy Insights' })
              } else {
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = 'sierro-insights.png'; a.click()
                URL.revokeObjectURL(url)
              }
            } catch (err) {
              console.error('[StatsPage] Share failed:', err)
            } finally {
              setSharing(false)
            }
          }}
        >
          <Share2 size={18} />
        </button>
      </div>

      <div ref={shareRef} className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-4">
        {!hasDevice && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 px-8">
            <div className="w-16 h-16 rounded-2xl bg-ink-10 flex items-center justify-center mb-4">
              <BarChart3 size={32} className="text-ink-7" />
            </div>
            <h3 className="text-[16px] font-bold text-ink-1 mb-2">No Data Yet</h3>
            <p className="text-body-md text-ink-6 text-center leading-relaxed mb-6">
              Connect a device to start tracking energy usage and statistics.
            </p>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-ink-10 border border-[rgba(255,255,255,0.06)]">
              <WifiOff size={14} className="text-ink-7" />
              <span className="text-[12px] text-ink-7">No device connected</span>
            </div>
          </motion.div>
        )}

        {hasDevice && (
          <>
            {/* Days overview */}
            {loading && records === null ? <DaysSkeleton /> : (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center text-center py-5">
                <div className="flex items-baseline justify-center gap-2">
                  <Zap size={32} className="text-primary fill-primary self-center" />
                  <span className="text-headline-xl font-semibold text-ink-1 leading-none tnum">{deviceDays}</span>
                  <span className="text-title-md text-ink-6">Days</span>
                </div>
                <p className="text-body-md text-ink-6 mt-3">
                  {installedYearLabel ? `Reliable backup power since ${installedYearLabel}` : 'Reliable backup power'}
                </p>
              </motion.div>
            )}

            {/* Segmented period control */}
            <div className="flex bg-ink-10 rounded-pill p-1 mb-3">
              {periods.map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`flex-1 text-body-md font-semibold py-2 rounded-pill active:scale-[0.96] transition-[color,background-color,transform] duration-200
                    ${period === p ? 'bg-ink-3 text-ink-13' : 'text-ink-6 hover:text-ink-1'}`}>
                  {p}
                </button>
              ))}
            </div>

            {/* ── Date navigator ── */}
            <div className="mb-4">
              <div className="flex items-center justify-center gap-3">
                <button
                  aria-label="Previous"
                  onClick={() => setSelectedDate(prev => {
                    const d = new Date(prev)
                    if (period === 'Day') d.setDate(d.getDate() - 1)
                    else if (period === 'Week') d.setDate(d.getDate() - 7)
                    else if (period === 'Month') d.setMonth(d.getMonth() - 1)
                    return d
                  })}
                  disabled={period === 'Range'}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-10 text-ink-4 hover:text-ink-1 transition-colors disabled:opacity-0 disabled:pointer-events-none"
                >
                  <ChevronLeft size={18} />
                </button>

                <button
                  onClick={() => { setPickerViewDate(new Date(selectedDate)); setShowPicker(v => !v) }}
                  className="flex-1 text-center text-title-md font-semibold text-ink-1 hover:text-primary transition-colors py-1"
                >
                  {dateLabel}
                </button>

                <button
                  aria-label="Next"
                  onClick={() => setSelectedDate(prev => {
                    const d = new Date(prev)
                    if (period === 'Day') d.setDate(d.getDate() + 1)
                    else if (period === 'Week') d.setDate(d.getDate() + 7)
                    else if (period === 'Month') d.setMonth(d.getMonth() + 1)
                    return d
                  })}
                  disabled={!canGoForward || period === 'Range'}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-10 text-ink-4 hover:text-ink-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Inline calendar picker */}
              <AnimatePresence>
                {showPicker && (
                  <motion.div key="picker"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden">
                    <div className="bg-ink-10 rounded-l p-4 mt-2">
                      {period === 'Month' ? (
                        <MonthGridPicker
                          selectedDate={selectedDate}
                          onSelect={d => { setSelectedDate(d); setShowPicker(false) }}
                        />
                      ) : (
                        <DayCalendar
                          period={period}
                          selectedDate={selectedDate}
                          rangeStart={rangeStart}
                          rangeEnd={rangeEnd}
                          rangePickStep={rangePickStep}
                          viewDate={pickerViewDate}
                          onViewDateChange={setPickerViewDate}
                          onDaySelect={d => {
                            if (period === 'Range') {
                              if (rangePickStep === 'start') {
                                setRangeStart(d); setRangeEnd(null); setRangePickStep('end')
                              } else {
                                if (rangeStart && d < rangeStart) { setRangeStart(d); setRangePickStep('end') }
                                else { setRangeEnd(d); setShowPicker(false); setRangePickStep('start') }
                              }
                            } else {
                              setSelectedDate(d); setShowPicker(false)
                            }
                          }}
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Loading skeleton */}
            {loading && <><ChartSkeleton /><ChartAreaSkeleton /></>}

            {/* Data loaded — chart always renders; no data => flat 0 line */}
            {!loading && (
              <>
                {/* 加载失败时的轻量重试条（真无数据时不显示，只显示 0） */}
                {error && (
                  <div className="flex items-center justify-between gap-2 bg-ink-10 rounded-l px-4 py-3 mb-4">
                    <span className="text-label text-ink-6">Couldn't load history data.</span>
                    <button onClick={loadHistory}
                      className="flex items-center gap-1.5 text-label font-semibold text-primary active:opacity-70">
                      <RefreshCw size={13} /> Retry
                    </button>
                  </div>
                )}

                {/* CO2 Card */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-ink-10 rounded-l p-5 mb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-headline-lg font-semibold text-ink-1 leading-none tnum">{chartFrame.co2Kg}</span>
                        <span className="text-body-md text-ink-6">Kg</span>
                      </div>
                      <p className="text-body-md text-ink-6 mt-2">{chartFrame.ecoInsight}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Leaf size={14} className="text-success" />
                      <span className="text-body-lg text-ink-4">CO₂ Reduced</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <CalcAudit
                      formula={`Solar generated: ${chartFrame.totalInputKwh} kWh\nGrid CO2 factor: 0.5 kg CO₂/kWh (US EPA average)\nCO₂ avoided: ${chartFrame.totalInputKwh} kWh × 0.5 kg/kWh = ${chartFrame.co2Kg} kg\n\nData source: US EPA eGRID 2024 average emission rate`}
                      label="How we calculated CO₂"
                    />
                  </div>
                </motion.div>

                {/* Input vs Output Chart */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                  className="bg-ink-10 rounded-l p-4 mb-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-title-md font-semibold text-ink-1">Input vs. Output</div>
                      <p className="text-label text-ink-6 mt-1">{chartFrame.insight}</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex items-center gap-1.5 text-label text-ink-4">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary" /><span>Input</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-label text-ink-4">
                        <div className="w-2.5 h-2.5 rounded-full bg-warning" /><span>Output</span>
                      </div>
                    </div>
                  </div>

                  {period === 'Week' ? (
                    <div>
                      <div className="flex items-end gap-2 h-[160px]">
                        {chartFrame.input.map((input, i) => {
                          const maxVal = Math.max(...chartFrame.input, ...chartFrame.output, 1)
                          return (
                            <div key={i} className="flex-1 flex items-end justify-center gap-1 h-full">
                              <div className="flex-1 max-w-[12px] rounded-t-s bg-primary min-h-[2px] transition-[height] duration-500"
                                style={{ height: `${(input / maxVal) * 100}%` }} />
                              <div className="flex-1 max-w-[12px] rounded-t-s bg-warning min-h-[2px] transition-[height] duration-500"
                                style={{ height: `${(chartFrame.output[i] / maxVal) * 100}%` }} />
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
                    <div>
                      <svg ref={chartSvgRef} viewBox="0 0 340 160" className="w-full h-[160px] touch-none select-none"
                        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); updateScrubFromClientX(e.clientX) }}
                        onPointerMove={e => { if (e.buttons || e.pointerType !== 'mouse') updateScrubFromClientX(e.clientX) }}
                        onPointerUp={() => setScrubIndex(null)}
                        onPointerLeave={() => setScrubIndex(null)}
                        onPointerCancel={() => setScrubIndex(null)}
                      >
                        {[0, 1, 2, 3, 4].map((g) => (
                          <line key={g} x1="0" x2="340" y1={4 + (g / 4) * 152} y2={4 + (g / 4) * 152}
                            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                        ))}
                        {(() => {
                          const { linePath, areaPath } = generateAreaPath(chartFrame.output, 340, 160)
                          return <g><path d={areaPath} fill="rgba(255,149,0,0.18)" /><path d={linePath} fill="none" stroke="#FF9500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></g>
                        })()}
                        {(() => {
                          const { linePath } = generateAreaPath(chartFrame.input, 340, 160)
                          return <path d={linePath} fill="none" stroke="#01D6BE" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />
                        })()}
                        {scrubIndex !== null && (() => {
                          const { points: inputPts } = generateAreaPathWithPoints(chartFrame.input, 340, 160)
                          const { points: outputPts } = generateAreaPathWithPoints(chartFrame.output, 340, 160)
                          const inPt = inputPts[scrubIndex]
                          const outPt = outputPts[scrubIndex]
                          if (!inPt || !outPt) return null
                          const inVal = chartFrame.input[scrubIndex] ?? 0
                          const outVal = chartFrame.output[scrubIndex] ?? 0
                          const text1 = `In ${Math.round(inVal)} W`
                          const text2 = `Out ${Math.round(outVal)} W`
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

                  {/* 无数据时的说明（曲线保持在 0） */}
                  {!chartFrame.hasData && (
                    <p className="text-label text-ink-7 text-center mt-3">
                      No power history for this period yet.
                    </p>
                  )}
                </motion.div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
