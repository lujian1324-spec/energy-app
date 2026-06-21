import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Share2, BarChart3, WifiOff, Zap, ChevronLeft, ChevronRight, Leaf } from 'lucide-react'
import html2canvas from 'html2canvas'
import BatteryRing from '../components/BatteryRing'
import { LastSync, SampleRate, CalcAudit, type DataSource } from '../components/DataTrust'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime, type HistoryDataResponse } from '../api/deviceApi'

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

function aggregateHistory(raw: HistoryDataResponse, period: Period): ChartFrame | null {
  const solar = raw['generationPower'] ?? []
  const output = raw['outputPower'] ?? []
  const socArr = raw['remainingBatteryCapacity'] ?? []

  if (solar.length === 0 && output.length === 0) return null

  const byTime = new Map<string, { solar: number[]; output: number[]; soc: number[] }>()

  const timeToBucket = (ts: string): string => {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ts.slice(0, 10)
    switch (period) {
      case 'Day': return `${String(d.getHours()).padStart(2, '0')}:00`
      case 'Week': { const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; return days[d.getDay()] }
      case 'Month': return `${d.getMonth() + 1}/${d.getDate()}`
      case 'Range': return `${d.getMonth() + 1}/${d.getDate()}`
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

  let entries: [string, { solar: number[]; output: number[]; soc: number[] }][]
  if (period === 'Week') {
    const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    entries = [...byTime.entries()].sort(([a], [b]) => dayOrder.indexOf(a) - dayOrder.indexOf(b))
  } else {
    entries = [...byTime.entries()].sort()
  }

  const maxPoints = period === 'Day' ? 24 : period === 'Week' ? 7 : period === 'Month' ? 30 : 12
  const step = Math.max(1, Math.ceil(entries.length / maxPoints))
  const sampled: typeof entries = []
  for (let i = 0; i < entries.length; i += step) sampled.push(entries[i])

  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0)

  const inputData = sampled.map(([, v]) => avg(v.solar))
  const outputData = sampled.map(([, v]) => avg(v.output))
  const socData = sampled.map(([, v]) => avg(v.soc))
  const labels = sampled.map(([k]) => k)

  const hoursPerBucket = period === 'Day' ? 1 : period === 'Week' ? 24 : period === 'Month' ? 24 : 72
  const totalInputKwh = inputData.reduce((s, v) => s + (v * hoursPerBucket) / 1000, 0)
  const totalOutputKwh = outputData.reduce((s, v) => s + (v * hoursPerBucket) / 1000, 0)
  const co2Kg = (totalInputKwh * 0.5).toFixed(1)

  const maxOutput = Math.max(...outputData, 0)
  const maxOutputIdx = outputData.indexOf(maxOutput)
  let insight = 'Power usage data from device'
  if (period === 'Week' && maxOutputIdx >= 0) insight = `Highest output on ${labels[maxOutputIdx]}`
  else if (period === 'Day' && maxOutputIdx >= 0) insight = `Peak output around ${labels[maxOutputIdx]}`
  else if (period === 'Month' && maxOutputIdx >= 0) insight = `Output peaked on ${labels[maxOutputIdx]}`

  const ecoInsight = totalOutputKwh > 0
    ? `Equivalent to driving ${Math.round(totalOutputKwh * 3.5)} fewer miles`
    : 'Connect solar to reduce carbon footprint'

  return { input: inputData, output: outputData, soc: socData, labels, co2Kg: parseFloat(co2Kg), totalInputKwh, totalOutputKwh, insight, ecoInsight }
}

// ─── Demo/Mock 数据 — 来自 Sierro 1000 真实模拟 CSV ───

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

const DAY_PAGES = [
  { dateLabel: 'Jul 4, 2026', insight: 'Sunny day — battery topped up by mid-morning',
    rawInput:  [0,0,1000,0,0,1000,0,1164,1584,1568,1548,1566,1578,1582,1574,1562,1579,1164,0,0,1000,0,0,1000],
    rawOutput: [77,48,64,47,70,50,82,59,84,68,48,66,78,82,74,62,79,58,67,66,80,64,53,80],
    rawSoc:    [96.2,93.8,100,97.6,94.2,100,95.9,100,100,100,100,100,100,100,100,100,100,100,96.7,93.4,100,96.8,94.1,100] },
  { dateLabel: 'Jul 3, 2026', insight: 'Overcast day — relied on grid top-ups, low solar',
    rawInput:  [0,0,1000,0,0,1000,0,207,399,565,692,772,800,772,692,565,399,207,0,0,1000,0,0,1000],
    rawOutput: [67,69,60,56,56,74,57,59,52,77,52,47,65,81,77,65,78,47,60,45,59,78,59,75],
    rawSoc:    [96.6,93.2,100,97.2,94.4,100,97.2,100,100,100,100,100,100,100,100,100,100,100,97,94.8,100,96.1,93.1,100] },
  { dateLabel: 'Jul 2, 2026', insight: 'Partly cloudy — SOC dipped to 83% overnight',
    rawInput:  [0,0,1000,0,0,1000,0,517,999,1414,1578,1582,1554,1569,1564,1414,999,517,0,0,0,0,0,1000],
    rawOutput: [60,74,65,76,74,51,45,60,48,81,78,82,54,69,64,79,80,69,76,48,54,83,77,82],
    rawSoc:    [97,93.3,100,96.2,92.5,100,97.8,100,100,100,100,100,100,100,100,100,100,100,96.2,93.8,91.1,87,83.1,100] },
  { dateLabel: 'Jul 1, 2026', insight: 'Full solar day — battery fully charged by morning',
    rawInput:  [0,0,0,1000,0,0,1000,1294,1557,1573,1547,1558,1572,1577,1552,1577,1552,1294,0,0,1000,0,0,1000],
    rawOutput: [46,51,71,58,58,74,73,50,57,73,47,58,72,77,52,77,52,65,78,83,70,49,62,54],
    rawSoc:    [97.7,95.2,91.6,100,97.1,93.4,100,100,100,100,100,100,100,100,100,100,100,100,96.1,92,100,97.6,94.4,100] },
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

function monthSeries(avgW: number, seed: number): number[] {
  return Array.from({ length: 30 }, (_, i) =>
    Math.round(avgW * (1 + 0.18 * Math.sin((i + seed) * 0.7)) * 10) / 10
  )
}

const MONTH_PAGES = [
  { dateLabel: 'October 2026', monthNum: 10, totalInputKwh: 42.6, totalOutputKwh: 42.1,
    insight: 'Oct steady output — 39.8 kWh solar, low grid use',
    rawInput: monthSeries(57.3, 1), rawOutput: monthSeries(56.6, 4), rawSoc: monthSeries(90, 7) },
  { dateLabel: 'September 2026', monthNum: 9, totalInputKwh: 45.5, totalOutputKwh: 45.0,
    insight: 'Sep peak green ratio — 42.0 kWh solar, 3.5 kWh grid',
    rawInput: monthSeries(63.2, 2), rawOutput: monthSeries(62.5, 5), rawSoc: monthSeries(91, 8) },
  { dateLabel: 'August 2026', monthNum: 8, totalInputKwh: 49.7, totalOutputKwh: 48.2,
    insight: 'Aug heaviest grid use (11.2 kWh) — lower solar',
    rawInput: monthSeries(66.8, 3), rawOutput: monthSeries(64.8, 6), rawSoc: monthSeries(88, 9) },
  { dateLabel: 'July 2026', monthNum: 7, totalInputKwh: 46.5, totalOutputKwh: 46.5,
    insight: 'Jul highest combined input — 46.5 kWh total',
    rawInput: monthSeries(62.5, 4), rawOutput: monthSeries(62.5, 7), rawSoc: monthSeries(92, 10) },
]

function getDemoChartFrame(period: Period, pageOffset = 0): ChartFrame {
  const pageIdx = -pageOffset

  if (period === 'Day') {
    const page = DAY_PAGES[Math.min(pageIdx, DAY_PAGES.length - 1)]
    const labels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
    const input = smooth(page.rawInput, 2)
    const output = smooth(page.rawOutput, 2)
    const soc = smooth(page.rawSoc, 1)
    const totalInputKwh = page.rawInput.reduce((s, v) => s + v / 1000, 0)
    const totalOutputKwh = page.rawOutput.reduce((s, v) => s + v / 1000, 0)
    return { input, output, soc, labels, co2Kg: parseFloat((totalInputKwh * 0.5).toFixed(1)), totalInputKwh, totalOutputKwh, insight: page.insight, ecoInsight: `Equivalent to driving ${Math.round(totalOutputKwh * 3.5)} fewer miles`, dateLabel: page.dateLabel }
  }

  if (period === 'Week') {
    const page = WEEK_PAGES[Math.min(pageIdx, WEEK_PAGES.length - 1)]
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const input = smooth(page.rawInput, 2)
    const output = smooth(page.rawOutput, 2)
    const soc = smooth(page.rawSoc, 1)
    const totalInputKwh = page.rawInput.reduce((s, v) => s + v, 0)
    const totalOutputKwh = page.rawOutput.reduce((s, v) => s + v, 0)
    return { input, output, soc, labels, co2Kg: parseFloat((totalInputKwh * 0.5).toFixed(1)), totalInputKwh, totalOutputKwh, insight: page.insight, ecoInsight: `Equivalent to driving ${Math.round(totalOutputKwh * 3.5)} fewer miles`, dateLabel: page.dateLabel }
  }

  if (period === 'Month') {
    const page = MONTH_PAGES[Math.min(pageIdx, MONTH_PAGES.length - 1)]
    const labels = Array.from({ length: 30 }, (_, i) => `${page.monthNum}/${i + 1}`)
    const input = smooth(page.rawInput.slice(0, 30), 3)
    const output = smooth(page.rawOutput.slice(0, 30), 3)
    const soc = smooth(page.rawSoc.slice(0, 30), 2)
    return { input, output, soc, labels, co2Kg: parseFloat((page.totalInputKwh * 0.5).toFixed(1)), totalInputKwh: page.totalInputKwh, totalOutputKwh: page.totalOutputKwh, insight: page.insight, ecoInsight: `Equivalent to driving ${Math.round(page.totalOutputKwh * 3.5)} fewer miles`, dateLabel: page.dateLabel }
  }

  // Range: 4-month summary
  const labels = ['Jul', 'Aug', 'Sep', 'Oct']
  const rawInput = [46.5, 49.7, 45.5, 42.6]
  const rawOutput = [46.5, 48.2, 45.0, 42.1]
  const rawSoc = [92.0, 88.0, 91.0, 90.0]
  const input = smooth(rawInput, 1)
  const output = smooth(rawOutput, 1)
  const soc = smooth(rawSoc, 1)
  const totalInputKwh = rawInput.reduce((s, v) => s + v, 0)
  const totalOutputKwh = rawOutput.reduce((s, v) => s + v, 0)
  return { input, output, soc, labels, co2Kg: parseFloat((totalInputKwh * 0.5).toFixed(1)), totalInputKwh, totalOutputKwh, insight: 'Sep had the best green energy ratio — 42.0 kWh solar', ecoInsight: `Equivalent to driving ${Math.round(totalOutputKwh * 3.5)} fewer miles` }
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

  const [lastSyncAt] = useState<number | undefined>(Date.now())
  const chartSvgRef = useRef<SVGSVGElement>(null)
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)

  const { devices, selectedDeviceId, selectedDeviceState, loadDevices, historyData, historyLoading, historyError, loadHistoryData } = useDeviceStore()

  const useDemo = !!historyError && !historyLoading

  const deviceId = useMemo(() => {
    if (selectedDeviceId) return Number(selectedDeviceId)
    return devices[0]?.id ?? null
  }, [selectedDeviceId, devices])

  useEffect(() => {
    if (devices.length === 0) loadDevices()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const deviceRealtime = useMemo(() => {
    if (!selectedDeviceState?.fields) return null
    return mapFieldsToRealtime(selectedDeviceState.fields)
  }, [selectedDeviceState])

  // ── Derived pageOffset for demo data ──
  const pageOffset = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const sel = new Date(selectedDate); sel.setHours(0, 0, 0, 0)
    const days = Math.floor((today.getTime() - sel.getTime()) / 86400000)
    if (period === 'Day') return -Math.min(Math.max(days, 0), 3)
    if (period === 'Week') return -Math.min(Math.max(Math.floor(days / 7), 0), 3)
    if (period === 'Month') {
      const m = (today.getFullYear() - sel.getFullYear()) * 12 + (today.getMonth() - sel.getMonth())
      return -Math.min(Math.max(m, 0), 3)
    }
    return 0
  }, [period, selectedDate])

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

  // ── Load history ──
  const loadHistory = useCallback(async () => {
    if (!deviceId) return
    let from: Date, to: Date, count: number
    const now = new Date(); now.setHours(23, 59, 59, 999)
    switch (period) {
      case 'Day':
        from = new Date(selectedDate); from.setHours(0, 0, 0, 0)
        to = new Date(selectedDate); to.setHours(23, 59, 59, 999)
        count = 288; break
      case 'Week':
        from = weekStart(selectedDate)
        to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999)
        count = 336; break
      case 'Month':
        from = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
        to = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59, 999)
        count = 720; break
      case 'Range':
        from = rangeStart ? new Date(rangeStart) : new Date(now.getTime() - 30 * 86400000)
        to = rangeEnd ? new Date(rangeEnd) : now
        from.setHours(0, 0, 0, 0); to.setHours(23, 59, 59, 999)
        count = 720; break
    }
    loadHistoryData(deviceId, from.toISOString(), to.toISOString(),
      ['generationPower', 'outputPower', 'remainingBatteryCapacity', 'batteryTemp'], count)
  }, [deviceId, period, selectedDate, rangeStart, rangeEnd, loadHistoryData])

  useEffect(() => { loadHistory() }, [loadHistory])

  const chartFrame = useMemo(() => {
    if (historyData) {
      const frame = aggregateHistory(historyData, period)
      if (frame) return frame
    }
    return getDemoChartFrame(period, pageOffset)
  }, [historyData, period, pageOffset])

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
  const soc = deviceRealtime?.soc ?? 0
  const batteryTemp = deviceRealtime?.batteryTemp ?? 0
  const batteryHealth = 95
  const isDataLoaded = true

  const deviceName = useMemo(() => {
    if (!deviceId) return null
    const dev = devices.find(d => d.id === deviceId)
    return dev?.name ?? dev?.serialNumber ?? `Device #${deviceId}`
  }, [deviceId, devices])

  const deviceDays = useMemo(() => {
    if (!deviceId) return 0
    const dev = devices.find(d => d.id === deviceId)
    if (!dev?.installedAt) return 0
    const installed = new Date(dev.installedAt)
    if (isNaN(installed.getTime())) return 0
    return Math.max(1, Math.floor((Date.now() - installed.getTime()) / (24 * 3600 * 1000)))
  }, [deviceId, devices])

  const installedYearLabel = useMemo(() => {
    const dev = devices.find(d => d.id === deviceId)
    if (!dev?.installedAt) return null
    const d = new Date(dev.installedAt)
    if (isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }, [deviceId, devices])

  const emptyHistory = !historyLoading && !historyData && !useDemo
    ? <ChartEmptyState message={hasDevice ? 'Historical power data will appear here after your device has been running for a while.' : 'Select a device to view its energy statistics.'} />
    : null

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
            <div className="w-16 h-16 rounded-2xl bg-[#262626] flex items-center justify-center mb-4">
              <BarChart3 size={32} className="text-[#8C8C8C]" />
            </div>
            <h3 className="text-[16px] font-bold text-[#FFFFFF] mb-2">No Data Yet</h3>
            <p className="text-body-md text-[#BFBFBF] text-center leading-relaxed mb-6">
              Connect a device to start tracking energy usage and statistics.
            </p>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#262626] border border-[rgba(255,255,255,0.06)]">
              <WifiOff size={14} className="text-[#8C8C8C]" />
              <span className="text-[12px] text-[#8C8C8C]">No device connected</span>
            </div>
          </motion.div>
        )}

        {hasDevice && (
          <>
            {/* Days overview */}
            {historyLoading ? <DaysSkeleton /> : (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center text-center py-5">
                <div className="flex items-baseline justify-center gap-2">
                  <Zap size={32} className="text-primary fill-primary self-center" />
                  <span className="text-headline-xl font-semibold text-ink-1 leading-none">{deviceDays}</span>
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
                  className={`flex-1 text-body-md font-semibold py-2 rounded-pill transition-all duration-200
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
            {historyLoading && <><ChartSkeleton /><ChartAreaSkeleton /></>}

            {/* Error or empty */}
            {!historyLoading && !isDataLoaded && emptyHistory}

            {/* Data loaded */}
            {!historyLoading && isDataLoaded && chartFrame && (
              <>
                {/* CO2 Card */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-ink-10 rounded-l p-5 mb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-headline-lg font-semibold text-ink-1 leading-none">{chartFrame.co2Kg}</span>
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
                              <div className="flex-1 max-w-[12px] rounded-t-s bg-primary min-h-[2px] transition-all duration-500"
                                style={{ height: `${(input / maxVal) * 100}%` }} />
                              <div className="flex-1 max-w-[12px] rounded-t-s bg-warning min-h-[2px] transition-all duration-500"
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

            {/* Battery Health Card */}
            {hasDevice && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="bg-[#262626] border border-[rgba(1,214,190,0.08)] rounded-l p-4">
                <div className="flex justify-between items-center mb-3">
                  <div className="text-sm font-bold text-[#FFFFFF]">Battery Health</div>
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[rgba(52,199,89,0.12)] text-[#34C759] border border-[rgba(52,199,89,0.25)] text-[10px] font-semibold">Good</div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex-shrink-0">
                    <BatteryRing percentage={soc} size={160} strokeWidth={18} isCharging={false} uid="stats-page" />
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div className="text-center bg-[rgba(255,255,255,0.03)] rounded-l p-2.5">
                      <div className="text-[14px] font-bold text-[#FFFFFF]">{soc}%</div>
                      <div className="text-tiny text-[#BFBFBF] mt-0.5">Charge</div>
                    </div>
                    <div className="text-center bg-[rgba(255,255,255,0.03)] rounded-l p-2.5">
                      <div className="text-[14px] font-bold text-[#34C759]">{batteryTemp > 0 ? `${batteryTemp}°C` : '--'}</div>
                      <div className="text-tiny text-[#BFBFBF] mt-0.5">Temp</div>
                    </div>
                    <div className="text-center bg-[rgba(255,255,255,0.03)] rounded-l p-2.5">
                      <div className="text-[14px] font-bold text-[#01D6BE]">{deviceDays}</div>
                      <div className="text-tiny text-[#BFBFBF] mt-0.5">Days</div>
                    </div>
                    <div className="text-center bg-[rgba(255,255,255,0.03)] rounded-l p-2.5">
                      <div className="text-[14px] font-bold text-[#FF9500]">{batteryHealth}%</div>
                      <div className="text-tiny text-[#BFBFBF] mt-0.5">Health</div>
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
