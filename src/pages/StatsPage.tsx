import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import { PageHeaderShell } from '../components/PageHeader'
import html2canvas from 'html2canvas'
import { toast } from '../components/Toast'
import BottomSheet from '../components/BottomSheet'
import { useDeviceStore } from '../stores/deviceStore'
import type { DeviceAttributeRecord } from '../api/deviceApi'
import { insightsDeviceId, loadInsightsRange, pointsToRecords } from '../utils/insightsCache'
import { useCountUp } from '../hooks/useCountUp'
import { toUserFacingError } from '../utils/uiCopy'
import { axisLabelIndexes, bucketAtX, buildInsightsFrame, formatWh, weekStart } from '../utils/insightsFrame'

const periods = ['Day', 'Week', 'Month', 'Range'] as const
type Period = typeof periods[number]

// ─── Helpers ───

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

/** Insights CO2 ? -> bottom sheet (Smart Schedule info pattern; ui-fix-co2-sheet). */
function Co2InfoSheet({
  onClose,
  solarKwh,
  co2Kg,
}: {
  onClose: () => void
  solarKwh: number
  co2Kg: number
}) {
  const solar = Number(solarKwh)
  const avoided = Number(co2Kg)
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  return (
    <BottomSheet ariaLabel="How CO2 reduction is calculated" onClose={onClose}>
      <div className="mt-[51px] px-4 pb-6">
        <div className="flex items-center gap-1">
          <Icon name="thunder" size={33} color="#01D6BE" />
          <h3 className="text-title-md font-semibold text-ink-2">
            How CO₂ reduction is calculated
          </h3>
        </div>
        <p className="mt-[9px] text-body-md text-ink-5">
          Your CO₂ reduction is estimated based on the solar energy generated and the
          average carbon emissions from grid electricity.
        </p>
        <ul className="mt-4 space-y-2 list-disc pl-[22px] marker:text-ink-3">
          <li className="text-body-md text-ink-3">
            Solar generated:{' '}
            <span className="text-primary">{fmt(solar)} kWh</span>
          </li>
          <li className="text-body-md text-ink-3">
            Grid CO₂ factor:{' '}
            <span className="text-primary">0.5 kg CO₂/kWh</span>
            <span className="text-ink-5"> (US EPA average)</span>
          </li>
          <li className="text-body-md text-ink-3">
            CO₂ avoided:{' '}
            <span className="text-primary">
              {fmt(solar)} kWh × 0.5 kg/kWh = {fmt(avoided)} kg
            </span>
          </li>
        </ul>
        <p className="mt-6 text-caption text-ink-7">
          Data source: US EPA eGRID 2024 average emission rate
        </p>
      </div>
    </BottomSheet>
  )
}

function DaysSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="-mx-4 h-[110px] flex flex-col items-center justify-center bg-ink-10">
      <div className="h-12 w-44 bg-ink-9 rounded-m animate-pulse mb-3" />
      <div className="h-3 w-52 bg-ink-9 rounded-s animate-pulse" />
    </motion.div>
  )
}

function ChartSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-ink-10 rounded-l p-5 mb-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-11 w-28 bg-white/[0.05] rounded-m animate-pulse" />
          <div className="h-3 w-40 bg-white/[0.03] rounded-s animate-pulse mt-3" />
        </div>
        <div className="h-4 w-24 bg-white/[0.05] rounded-s animate-pulse mt-2" />
      </div>
    </motion.div>
  )
}

function ChartAreaSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-ink-10 rounded-l p-5 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="h-5 w-32 bg-white/[0.05] rounded-s animate-pulse" />
        <div className="h-3 w-28 bg-white/[0.03] rounded-s animate-pulse" />
      </div>
      <div className="h-3 w-40 bg-white/[0.03] rounded-s animate-pulse mb-4" />
      <div className="h-[160px] bg-white/[0.02] rounded-m animate-pulse" />
    </motion.div>
  )
}

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('Day')
  const [sharing, setSharing] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [rangeStart, setRangeStart] = useState<Date | null>(null)
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [rangePickStep, setRangePickStep] = useState<'start' | 'end'>('start')
  const [pickerViewDate, setPickerViewDate] = useState<Date>(new Date())

  useEffect(() => {
    setSelectedDate(new Date())
    setShowPicker(false)
    if (period === 'Range') {
      setRangeStart(null)
      setRangeEnd(null)
      setRangePickStep('start')
    }
  }, [period])

  const chartSvgRef = useRef<SVGSVGElement>(null)
  // The chart box's real width (0 while this tab is hidden — then the last width stays).
  const [chartW, setChartW] = useState(340)
  const chartBoxObserver = useRef<ResizeObserver | null>(null)
  const chartBoxRef = useCallback((el: HTMLDivElement | null) => {
    chartBoxObserver.current?.disconnect()
    chartBoxObserver.current = null
    if (!el) return
    const update = () => { const w = Math.round(el.clientWidth); if (w > 0) setChartW(w) }
    update()
    if (typeof ResizeObserver !== 'undefined') {
      chartBoxObserver.current = new ResizeObserver(update)
      chartBoxObserver.current.observe(el)
    }
  }, [])
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)

  const { devices, loadDevices } = useDeviceStore()

  const [records, setRecords] = useState<DeviceAttributeRecord[] | null>(null)
  /** Some pages of the period failed or ran past the cap: totals are short. */
  const [historyPartial, setHistoryPartial] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCo2Info, setShowCo2Info] = useState(false)

  const deviceId = useMemo(() => insightsDeviceId(devices), [devices])
  /** Only the newest load may set the page (a quick period switch would otherwise flash an older one). */
  const loadSeq = useRef(0)

  useEffect(() => {
    if (devices.length === 0) loadDevices(1, 50, { orderByCreatedAtAsc: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const loadHistory = useCallback(async () => {
    if (!deviceId) { loadSeq.current++; setRecords([]); return }
    if (period === 'Range' && (!rangeStart || !rangeEnd)) { loadSeq.current++; setRecords([]); return }

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
      default:
        from = new Date(rangeStart as Date); from.setHours(0, 0, 0, 0)
        to = new Date(rangeEnd as Date); to.setHours(23, 59, 59, 999)
        break
    }

    /*
     * v4.21.0: the history comes from the on-phone cache (utils/insightsCache.ts),
     * which the app fills in the background on every open. A period whose days
     * are all cached paints at once; only the days that are not final (today,
     * or read before they settled) are then re-read and the chart updates.
     * A day that could not be read whole still says totals may be low
     * (APP-20260923-009) instead of showing short totals silently.
     */
    const seq = ++loadSeq.current
    setLoading(true); setError(null)
    let painted = false
    try {
      const res = await loadInsightsRange(deviceId, from.getTime(), to.getTime(), cached => {
        if (seq !== loadSeq.current) return
        painted = true
        setRecords(pointsToRecords(cached))
        setHistoryPartial(false)
        setLoading(false)
      })
      if (seq !== loadSeq.current) return
      if (res.failed && !painted) throw new Error('Failed to load history')
      if (!res.failed) setRecords(pointsToRecords(res.points))
      setHistoryPartial(res.partial || res.failed)
    } catch (e: unknown) {
      if (seq !== loadSeq.current) return
      console.error('[StatsPage] stats load failed:', e)
      // Already drawn from the cache: keep it, and say it may be short.
      if (painted) { setHistoryPartial(true); return }
      setError(toUserFacingError(e, 'Something went wrong'))
      setRecords([])
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [deviceId, period, selectedDate, rangeStart, rangeEnd])

  // This page stays mounted behind the other tabs (App.tsx). It reads only while
  // it is on screen, so it never competes with the page the user is on; the
  // background cache (utils/insightsPrefetch.ts) has the month ready by then.
  const insightsVisible = useLocation().pathname === '/insights'
  useEffect(() => { if (insightsVisible) loadHistory() }, [loadHistory, insightsVisible])

  const chartFrame = useMemo(
    () => buildInsightsFrame(records ?? [], period, selectedDate, rangeStart, rangeEnd),
    [records, period, selectedDate, rangeStart, rangeEnd],
  )

  /*
   * One scale for both series — input and output used to be normalised each
   * against its own maximum, so the two lines could not be compared — and gaps
   * left as gaps: a null bucket ends a segment instead of dropping to 0.
   */
  /*
   * v4.21.1: the chart is drawn at its real width. It used a fixed 340-wide
   * viewBox in a full-width SVG, so on any screen that was not 340 px the drawing
   * sat letterboxed in the middle while a tap was read against the whole width,
   * and the axis labels were spread with justify-between rather than placed under
   * their points — the selected point and its time on the axis could be a bucket
   * or more apart. Now one pixel is one unit, the tap is read in the same units
   * the points are drawn in, and every axis label sits under its own point.
   */
  const CHART_W = chartW, CHART_H = 160, CHART_PAD = 4
  const chartMax = Math.max(1, ...chartFrame.inputWh.map(v => v ?? 0), ...chartFrame.outputWh.map(v => v ?? 0))
  const pointAt = (i: number, v: number) => ({
    x: CHART_PAD + (chartFrame.labels.length > 1 ? i / (chartFrame.labels.length - 1) : 0.5) * (CHART_W - CHART_PAD * 2),
    y: CHART_PAD + (CHART_H - CHART_PAD * 2) * (1 - v / chartMax),
  })
  const seriesSegments = (data: (number | null)[]) => {
    const segs: { x: number; y: number }[][] = []
    let cur: { x: number; y: number }[] = []
    data.forEach((v, i) => {
      if (v === null) { if (cur.length) segs.push(cur); cur = [] }
      else cur.push(pointAt(i, v))
    })
    if (cur.length) segs.push(cur)
    return segs
  }
  const segLine = (seg: { x: number; y: number }[]) => seg.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
  const segArea = (seg: { x: number; y: number }[]) =>
    `${segLine(seg)} L ${seg[seg.length - 1].x} ${CHART_H} L ${seg[0].x} ${CHART_H} Z`

  const updateScrubFromClientX = (clientX: number) => {
    const svg = chartSvgRef.current
    if (!svg || !chartFrame) return
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0) return
    setScrubIndex(bucketAtX((clientX - rect.left) * (CHART_W / rect.width), CHART_W, CHART_PAD, chartFrame.labels.length))
  }

  // A reading belongs to the frame it was taken on.
  useEffect(() => { setScrubIndex(null) }, [chartFrame])

  const hasDevice = deviceId !== null

  const deviceDays = useMemo(() => {
    if (!deviceId) return 0
    const dev = devices.find(d => String(d.id) === String(deviceId))
    if (!dev?.installedAt) return 0
    const installed = new Date(dev.installedAt)
    if (isNaN(installed.getTime())) return 0
    return Math.max(1, Math.floor((Date.now() - installed.getTime()) / (24 * 3600 * 1000)))
  }, [deviceId, devices])

  const navigate = useNavigate()
  const displayDeviceDays = useCountUp(deviceDays)
  const displayCo2 = useCountUp(chartFrame?.co2Kg ?? 0, 400, 1)

  const installedYearLabel = useMemo(() => {
    const dev = devices.find(d => String(d.id) === String(deviceId))
    if (!dev?.installedAt) return null
    const d = new Date(dev.installedAt)
    if (isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }, [deviceId, devices])

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <PageHeaderShell filled={hasDevice} className="flex justify-between items-center">
        <h1 className="text-display font-display text-white">Insights</h1>
        {/* C_1.1 -v Empty State has no Share button. */}
        {hasDevice && (
        <button
          aria-label="Share"
          disabled={sharing}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-ink-9 text-white hover:bg-ink-8 transition-colors disabled:opacity-50"
          onClick={async () => {
            if (sharing) return
            setSharing(true)
            try {
              if (!shareRef.current) {
                toast.error('Nothing to share')
                return
              }
              const canvas = await html2canvas(shareRef.current, {
                backgroundColor: '#141414',
                scale: 2,
                useCORS: true,
                logging: false,
              })
              const ctx = canvas.getContext('2d')!
              ctx.fillStyle = 'rgba(255,255,255,0.35)'
              ctx.font = `bold ${14 * 2}px Inter, sans-serif`
              ctx.textAlign = 'right'
              ctx.fillText('Sierro Energy', canvas.width - 24, canvas.height - 24)

              const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
              if (!blob) {
                toast.error("Couldn't create image")
                return
              }
              const file = new File([blob], 'sierro-insights.png', { type: 'image/png' })

              let canShareFiles = false
              try {
                canShareFiles = !!navigator.canShare?.({ files: [file] })
              } catch {
                canShareFiles = false
              }

              const isAbort = (err: unknown) =>
                !!err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError'

              if (canShareFiles) {
                try {
                  await navigator.share({ files: [file], title: 'Sierro Energy Insights' })
                } catch (err) {
                  if (isAbort(err)) return
                  throw err
                }
              } else if (typeof navigator.share === 'function') {
                try {
                  await navigator.share({ title: 'Sierro Energy Insights', text: 'My Sierro energy insights' })
                } catch (err) {
                  if (isAbort(err)) return
                  throw err
                }
              } else {
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = 'sierro-insights.png'; a.click()
                URL.revokeObjectURL(url)
                toast.success('Image saved')
              }
            } catch (err) {
              console.error('[StatsPage] Share failed:', err)
              toast.error("Couldn't share. Try again.")
            } finally {
              setSharing(false)
            }
          }}
        >
          {sharing ? <Loader2 size={24} className="animate-spin" /> : <Icon name="share" size={24} />}
        </button>
        )}
        {/* APP-004: the Device header always carries 40px buttons, so its title
            row is 40px tall. Without Share this row fell to the title's own line
            box (38.4px) and the empty-state header sat 1.6px shorter, the title
            0.8px higher, than Device's. Hold the button's place instead. */}
        {!hasDevice && <span className="w-10 h-10 flex-shrink-0" aria-hidden />}
      </PageHeaderShell>

      <div ref={shareRef} className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-4">
        {!hasDevice && (
          <EmptyState
            art={`${import.meta.env.BASE_URL}ds-insights-empty.png`}
            title="Insights will appear here"
            subtitle="Connect a Sierro device to start tracking battery performance and power usage."
            action={{ label: 'Add Device', icon: 'add', onClick: () => navigate('/devices', { state: { addDevice: true } }) }}
          />
        )}

        {hasDevice && (
          <>
            {loading && records === null ? <DaysSkeleton /> : (
              /* C_1.1: the days block is not a card — it continues the header's ink-10
                 band edge to edge, so the fill runs 0..244 in the export. */
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="-mx-4 h-[110px] flex flex-col items-center justify-center text-center bg-ink-10">
                <div className="flex items-baseline justify-center gap-2">
                  {/* C_1.1 draws the handoff's solid bolt, not an outlined one. Its ink
                      is 11x20 in a 24 box, so 33 lands it on the frame’s 14.5x26.5. */}
                  <Icon name="thunder" size={33} color="#01D6BE" className="self-center" />
                  <span className="text-headline-xl font-semibold text-ink-1 leading-none tnum">{displayDeviceDays}</span>
                  <span className="text-caption text-ink-5">Days</span>
                </div>
                <p className="text-caption text-ink-7 mt-3">
                  {installedYearLabel ? `Reliable backup power since ${installedYearLabel}` : 'Reliable backup power'}
                </p>
              </motion.div>
            )}

            {/* 24px above & below the date selector bar, not 12
                (`ui-fix-doc-20260911/08-insights-padding`). */}
            <div className="flex bg-ink-9 rounded-pill p-1 mt-[13px] mb-6 max-w-[322px] mx-auto w-full">
              {periods.map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`flex-1 text-body-md py-2 rounded-pill active:scale-[0.96] transition-[color,background-color,transform] duration-200
                    ${period === p ? 'bg-ink-5 text-ink-11 font-semibold' : 'text-ink-1 font-normal'}`}>
                  {p}
                </button>
              ))}
            </div>

            <div className="mb-6">
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
                  /* C_1.1 hides the forward arrow entirely on the newest period rather
                     than showing a disabled one, so mirror the left arrow's behaviour. */
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-10 text-ink-4 hover:text-ink-1 transition-colors disabled:opacity-0 disabled:pointer-events-none"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

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

            {loading && <><ChartSkeleton /><ChartAreaSkeleton /></>}

            {!loading && (
              <>
                {/* C_1.1 (new): the chart leads and the CO₂ card sits under it. */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
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

                  {/* APP-20260923-006: Week is a line with selectable points like the
                      other periods (it was bars with no values). Tap or drag to read a
                      bucket; the reading stays until another point is chosen. */}
                  <div ref={chartBoxRef}>
                    <svg ref={chartSvgRef} viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-[160px] touch-none select-none"
                      role="img" aria-label="Input and output energy"
                      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); updateScrubFromClientX(e.clientX) }}
                      onPointerMove={e => { if (e.buttons || e.pointerType !== 'mouse') updateScrubFromClientX(e.clientX) }}
                    >
                      {[0, 1, 2, 3, 4].map((g) => (
                        <line key={g} x1="0" x2={CHART_W} y1={CHART_PAD + (g / 4) * (CHART_H - CHART_PAD * 2)} y2={CHART_PAD + (g / 4) * (CHART_H - CHART_PAD * 2)}
                          stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      ))}
                      {seriesSegments(chartFrame.outputWh).map((seg, k) => seg.length > 1 ? (
                        <g key={`o${k}`}>
                          <path d={segArea(seg)} fill="rgba(255,149,0,0.18)" />
                          <path d={segLine(seg)} fill="none" stroke="#FF9500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </g>
                      ) : <circle key={`o${k}`} cx={seg[0].x} cy={seg[0].y} r={2.5} fill="#FF9500" />)}
                      {seriesSegments(chartFrame.inputWh).map((seg, k) => seg.length > 1 ? (
                        <path key={`i${k}`} d={segLine(seg)} fill="none" stroke="#01D6BE" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />
                      ) : <circle key={`i${k}`} cx={seg[0].x} cy={seg[0].y} r={2.5} fill="#01D6BE" />)}
                      {/* Week has seven buckets: mark each so the days read as points to pick. */}
                      {period === 'Week' && chartFrame.labels.map((_, i) => (
                        <g key={`m${i}`}>
                          {chartFrame.outputWh[i] !== null && (() => { const p = pointAt(i, chartFrame.outputWh[i]!); return <circle cx={p.x} cy={p.y} r={3} fill="#FF9500" /> })()}
                          {chartFrame.inputWh[i] !== null && (() => { const p = pointAt(i, chartFrame.inputWh[i]!); return <circle cx={p.x} cy={p.y} r={3} fill="#01D6BE" /> })()}
                        </g>
                      ))}
                      {scrubIndex !== null && scrubIndex < chartFrame.labels.length && (() => {
                        const i = scrubIndex
                        const inV = chartFrame.inputWh[i], outV = chartFrame.outputWh[i]
                        const sol = chartFrame.solarWh[i], acv = chartFrame.acWh[i]
                        // APP-20260923-007/008: energy in Wh, input split by source, and a
                        // source only listed on a bucket where it actually delivered.
                        const lines: { text: string; color: string }[] = [{ text: chartFrame.labels[i], color: '#FFFFFF' }]
                        if (inV === null && outV === null) {
                          lines.push({ text: 'No data', color: '#BFBFBF' })
                        } else {
                          lines.push({ text: `In ${formatWh(inV ?? 0)}`, color: '#01D6BE' })
                          if ((sol ?? 0) > 0) lines.push({ text: `Solar ${formatWh(sol!)}`, color: '#BFBFBF' })
                          if ((acv ?? 0) > 0) lines.push({ text: `AC ${formatWh(acv!)}`, color: '#BFBFBF' })
                          lines.push({ text: `Out ${formatWh(outV ?? 0)}`, color: '#FF9500' })
                        }
                        const x = pointAt(i, 0).x
                        const boxW = Math.max(...lines.map(l => l.text.length)) * 5.6 + 14
                        const boxH = lines.length * 12 + 8
                        const boxX = Math.min(Math.max(x - boxW / 2, 2), CHART_W - boxW - 2)
                        return (
                          <g>
                            <line x1={x} x2={x} y1={CHART_PAD} y2={CHART_H - CHART_PAD} stroke="#FFFFFF" strokeWidth="1" strokeDasharray="3,3" opacity={0.4} />
                            {inV !== null && (() => { const p = pointAt(i, inV); return <circle cx={p.x} cy={p.y} r={4} fill="#01D6BE" stroke="#141414" strokeWidth="1.5" /> })()}
                            {outV !== null && (() => { const p = pointAt(i, outV); return <circle cx={p.x} cy={p.y} r={4} fill="#FF9500" stroke="#141414" strokeWidth="1.5" /> })()}
                            <rect x={boxX} y={4} width={boxW} height={boxH} rx={5} fill="#000000" opacity={0.85} />
                            {lines.map((l, k) => (
                              <text key={k} x={boxX + boxW / 2} y={16 + k * 12} textAnchor="middle" fontSize="9" fontWeight="600" fill={l.color}>{l.text}</text>
                            ))}
                          </g>
                        )
                      })()}
                    </svg>
                    {/* Each label under its own point (same x as the line), the edge ones
                        kept inside the card; the selected bucket's label is lit. */}
                    <div className="relative h-4 mt-1" data-testid="insights-axis">
                      {axisLabelIndexes(chartFrame.labels.length).map(i => {
                        const x = pointAt(i, 0).x
                        const shift = x < 16 ? '0%' : x > CHART_W - 16 ? '-100%' : '-50%'
                        return (
                          <span key={i} data-index={i}
                            className={`absolute top-0 text-tiny whitespace-nowrap ${scrubIndex === i ? 'text-white font-semibold' : 'text-ink-6'}`}
                            style={{ left: x, transform: `translateX(${shift})` }}>
                            {chartFrame.labels[i]}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  {!chartFrame.hasData && (
                    <p className="text-label text-ink-7 text-center mt-3">
                      No power history for this period yet.
                    </p>
                  )}
                  {historyPartial && (
                    <p className="text-label text-warning text-center mt-2">
                      Some history for this period couldn't be loaded, so totals may be low.
                    </p>
                  )}
                </motion.div>

                {/* No solar in this period means no card at all — the deck drops it
                    rather than showing a zero to someone with nothing to offset. */}
                {chartFrame.hasSolar && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                    className="bg-ink-10 rounded-l p-5 mb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-headline-lg font-semibold text-ink-1 leading-none tnum">{displayCo2}</span>
                          <span className="text-body-md text-ink-6">Kg</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <p className="text-body-md text-ink-6">{chartFrame.ecoInsight}</p>
                          <button
                            type="button"
                            onClick={() => setShowCo2Info(true)}
                            aria-label="How we calculated CO₂"
                            className="w-4 h-4 flex items-center justify-center text-ink-6 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                          >
                            <Icon name="question-outined" size={16} alt="" color="currentColor" />
                          </button>
                        </div>
                      </div>
                      <span className="text-body-lg text-ink-4 mt-1">CO₂ Reduced</span>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </>
        )}

      <AnimatePresence>
        {showCo2Info && chartFrame && (
          <Co2InfoSheet
            onClose={() => setShowCo2Info(false)}
            solarKwh={chartFrame.totalSolarKwh}
            co2Kg={chartFrame.co2Kg}
          />
        )}
      </AnimatePresence>
      </div>
    </div>
  )
}
