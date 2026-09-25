import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import Glyph from './Icon'
import { useHistoryFetcher } from '../hooks/useHistoryFetcher'
import { clockLabelSeconds, maxGapMs, readingAt, scrubValueLabel, seriesSegments, type HistorySeries } from '../utils/historyPoints'

type PowerTab = 'battery' | 'ac' | 'solar' | 'output'

/**
 * Y-axis number. The axis now tops out at the model's rated power — 500 W on a
 * Sierro 1000, 1000 W on a Sierro 2000 — so every label is at most four digits
 * and the k-suffix this used to add only ever turned a readable "1000" into
 * "1.0k".
 */
function fmtAxis(v: number): string {
  return String(Math.round(v))
}

export interface RealTimePowerChartProps {
  deviceId: string | null
  isOnline: boolean
  /** Current live readings for the top-right badge: battery is charge/discharge power (W). */
  values: { battery: number | null; ac: number | null; solar: number | null; output: number | null }
  /**
   * When true, the Battery tab plots battery state-of-charge (SOC %,
   * `remainingBatteryCapacity`) on a fixed 0–100% axis instead of charge/discharge
   * power (W) — used by DeviceMonitorPage. `batterySoc` supplies the live SOC for
   * the badge. Defaults to the power view.
   */
  batteryAsSoc?: boolean
  batterySoc?: number | null
  /**
   * Full-scale of the AC / Solar / Output axis, in watts: the device's rated
   * power, which is 500 W on a Sierro 1000 and 1000 W on a Sierro 2000. Fixed
   * rather than fitted to the data so the same height means the same watts on
   * every tab and at every zoom. Defaults to the larger model.
   */
  powerAxisMax?: number
  /** Kept for API compatibility; the handoff card has no "Last sync" footer. */
  lastSyncAt?: number
  className?: string
}

/**
 * Same-day Real-Time Power chart: real API timestamps (not evenly re-spaced),
 * a fixed 12am–4am–8am–12pm–4pm–8pm–12am x-axis regardless of how much of the
 * day has data yet, and pinch/wheel zoom down to a 1-hour window. Rendered by
 * DeviceMonitorPage; the Battery tab can plot SOC (%) instead of power via the
 * batteryAsSoc prop.
 *
 * Tabs → history fields: Battery = `remainingBatteryCapacity` (%), AC = AC input
 * `exchangeChargingPower`, Solar = `generationPower`, Output = AC output
 * `outputPower`. A sample without the tab's field, or a silence longer than
 * three reporting intervals, breaks the line: no reading is drawn as a gap,
 * never as 0 W and never as a straight line bridging the hours the device was
 * off. The day's history keeps refreshing while the screen is open and rolls
 * over at midnight.
 */
/** The label canon's name for each tab, shown with a scrub reading. */
const TAB_NAMES = { battery: 'Battery', ac: 'AC', solar: 'Solar', output: 'Output' } as const

function startOfDay(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export default function RealTimePowerChart({ deviceId, isOnline, values, batteryAsSoc = false, batterySoc, powerAxisMax = 1000, className }: RealTimePowerChartProps) {
  const [powerDataSource, setPowerDataSource] = useState<PowerTab>('battery')

  const powerChartData = useMemo(() => ({
    battery: batteryAsSoc
      ? (batterySoc == null
          ? { value: null as number | null, unit: '%', color: '#8C8C8C' }
          : { value: Math.round(batterySoc), unit: '%', color: '#FFFFFF' })
      : { value: values.battery, unit: 'W', color: '#FFFFFF' },
    ac: { value: values.ac, unit: 'W', color: '#01D6BE' },
    solar: { value: values.solar, unit: 'W', color: '#01D6BE' },
    output: { value: values.output, unit: 'W', color: '#FF9500' },
  }), [values.battery, values.ac, values.solar, values.output, batteryAsSoc, batterySoc])

  const currentChartData = powerChartData[powerDataSource]

  // ─── Today's time window for chart history (rolls over at midnight) ───
  const [dayStart, setDayStart] = useState(() => startOfDay(Date.now()))
  useEffect(() => {
    const timer = setInterval(() => {
      const today = startOfDay(Date.now())
      setDayStart(prev => (prev === today ? prev : today))
    }, 60_000)
    return () => clearInterval(timer)
  }, [])
  const [todayFrom, todayTo] = useMemo(() => {
    const d = new Date(dayStart)
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
    return [dayStart, end.getTime()]
  }, [dayStart])

  const {
    points: rawHistoryPoints,
    loading: historyLoading,
    error: historyError,
  } = useHistoryFetcher(deviceId, todayFrom, todayTo, { live: true })

  // ─── Chart zoom / pan state (unix ms within today) ───
  const [viewStart, setViewStart] = useState(todayFrom)
  const [viewEnd, setViewEnd] = useState(todayTo)
  const MIN_WINDOW = 3_600_000  // 1 hour minimum zoom

  const clampView = useCallback((s: number, e: number): [number, number] => {
    const win = Math.max(e - s, MIN_WINDOW)
    const cs = Math.max(todayFrom, Math.min(s, todayTo - win))
    const ce = Math.min(todayTo, cs + win)
    return [cs, ce]
  }, [todayFrom, todayTo])

  // ─── Scrub: the time a finger (or held mouse) points at; the reading stays ───
  // after release, like Insights, until another point is picked (v4.18.0).
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)

  // Reset zoom when device changes or day changes
  useEffect(() => {
    setViewStart(todayFrom)
    setViewEnd(todayTo)
    setScrubTime(null)
  }, [deviceId, todayFrom, todayTo])

  const scrubAt = useCallback((clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setScrubTime(viewStart + ratio * (viewEnd - viewStart))
  }, [viewStart, viewEnd])

  // ─── Gesture state for pinch-to-zoom and pan on chart ───
  // One finger reads the chart (scrub); two fingers zoom, and moving them pans.
  const chartTouchRef = useRef<{
    mode: 'scrub' | 'pinch' | null
    lastX: number
    lastDist: number
    viewAtStart: [number, number]
  }>({ mode: null, lastX: 0, lastDist: 0, viewAtStart: [todayFrom, todayTo] })

  const onChartTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      chartTouchRef.current = {
        mode: 'scrub',
        lastX: e.touches[0].clientX,
        lastDist: 0,
        viewAtStart: [viewStart, viewEnd],
      }
      scrubAt(e.touches[0].clientX)
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      chartTouchRef.current = {
        mode: 'pinch',
        lastX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        lastDist: Math.sqrt(dx * dx + dy * dy),
        viewAtStart: [viewStart, viewEnd],
      }
    }
    e.stopPropagation()
  }, [viewStart, viewEnd, scrubAt])

  const onChartTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const ref = chartTouchRef.current
    if (!ref.mode) return
    const svgEl = e.currentTarget
    const svgWidth = svgEl.getBoundingClientRect().width || 300

    if (ref.mode === 'scrub' && e.touches.length === 1) {
      scrubAt(e.touches[0].clientX)
    } else if (ref.mode === 'pinch' && e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const scale = ref.lastDist > 0 ? ref.lastDist / dist : 1
      ref.lastDist = dist
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
      // Moving both fingers pans (one finger now reads the chart instead).
      const panPx = cx - ref.lastX
      ref.lastX = cx
      const [s, e2] = [viewStart, viewEnd]
      const winMs = e2 - s
      const msPerPx = winMs / svgWidth
      const pivotMs = s + (cx - svgEl.getBoundingClientRect().left) * msPerPx
      const newWin = Math.max(MIN_WINDOW, winMs * scale)
      const ratio = (pivotMs - s) / winMs
      const ns = pivotMs - ratio * newWin - panPx * msPerPx
      const ne = ns + newWin
      const [cs, ce] = clampView(ns, ne)
      setViewStart(cs)
      setViewEnd(ce)
    }
    e.stopPropagation()
  }, [viewStart, viewEnd, clampView, scrubAt])

  const onChartTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) {
      chartTouchRef.current.mode = null
    }
    e.stopPropagation()
  }, [])

  // 桌面端：滚轮缩放（以指针位置为锚点，最小 1 小时）
  const onChartWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const width = rect.width || 300
    const winMs = viewEnd - viewStart
    const pivotMs = viewStart + ((e.clientX - rect.left) / width) * winMs
    const scale = e.deltaY > 0 ? 1.15 : 1 / 1.15 // 下滚放大窗口（缩小），上滚放大
    const newWin = Math.max(MIN_WINDOW, Math.min(todayTo - todayFrom, winMs * scale))
    const ratio = (pivotMs - viewStart) / winMs
    const [cs, ce] = clampView(pivotMs - ratio * newWin, pivotMs - ratio * newWin + newWin)
    setViewStart(cs)
    setViewEnd(ce)
  }, [viewStart, viewEnd, clampView, todayFrom, todayTo])

  /*
   * Both axes are FIXED, and neither is fitted to the data.
   *
   * Battery plots state of charge, so its axis is the percentage itself: 0–100.
   * The power tabs read watts against the device's rated power — 500 W on a
   * Sierro 1000, 1000 W on a Sierro 2000 — which real output never exceeds.
   *
   * Fitting the axis to the window's own maximum, which is what this used to do,
   * meant the top label changed as you switched tabs or zoomed, and the same
   * height on screen stood for a different number of watts each time. A curve
   * that never moved could look like it filled the chart.
   */
  const isSocView = batteryAsSoc && powerDataSource === 'battery'
  const chartMax = isSocView ? 100 : powerAxisMax

  const series: HistorySeries = powerDataSource === 'battery' ? (batteryAsSoc ? 'soc' : 'battery')
    : powerDataSource === 'ac' ? 'ac'
    : powerDataSource === 'solar' ? 'solar'
    : 'output'

  // One line per unbroken run of readings, mapped onto viewStart..viewEnd.
  const gapMs = useMemo(() => maxGapMs(rawHistoryPoints), [rawHistoryPoints])
  const chartSegments = useMemo(() => {
    const win = viewEnd - viewStart
    if (win <= 0) return []
    const lo = viewStart - win * 0.05
    const hi = viewEnd + win * 0.05
    return seriesSegments(rawHistoryPoints, series, gapMs)
      .map(seg => seg
        .filter(p => p.timestamp >= lo && p.timestamp <= hi)
        .map(p => {
          const x = ((p.timestamp - viewStart) / win) * 300
          // Clamped, not |val|: the axis starts at zero, so a negative reading
          // belongs on the baseline. Mirroring it drew a discharge as if it were
          // the same size of charge.
          const v = Math.min(Math.max(p.value, 0), chartMax)
          return [x, 60 - (v / chartMax) * 55] as const
        }))
      .filter(seg => seg.length > 0)
  }, [rawHistoryPoints, series, gapMs, viewStart, viewEnd, chartMax])
  const hasSeriesData = chartSegments.length > 0

  // What the scrub reads on the current tab: the nearest sample, or none over a gap.
  const scrub = useMemo(() => {
    if (scrubTime === null || !hasSeriesData) return null
    const win = viewEnd - viewStart
    if (win <= 0 || scrubTime < viewStart || scrubTime > viewEnd) return null
    const hit = readingAt(rawHistoryPoints, series, scrubTime, gapMs)
    const t = hit ? hit.timestamp : scrubTime
    const pct = Math.max(0, Math.min(100, ((t - viewStart) / win) * 100))
    const v = hit ? Math.min(Math.max(hit.value, 0), chartMax) : null
    return {
      pct,
      // Same 0..70 viewBox mapping as the line, in the SVG's 136px height.
      dotPy: v === null ? null : (60 - (v / chartMax) * 55) * (136 / 70),
      // v4.21.1: the sample's own time to the second, and its value as reported
      // (it read only minutes and a bare number).
      time: clockLabelSeconds(t),
      name: TAB_NAMES[powerDataSource],
      value: hit ? scrubValueLabel(hit.value, currentChartData.unit) : 'No data',
    }
  }, [scrubTime, hasSeriesData, rawHistoryPoints, series, gapMs, viewStart, viewEnd, chartMax, currentChartData.unit, powerDataSource])

  // ─── Y-axis scale labels (2 levels: max at top, 0 at bottom) ───
  // Rendered as an HTML overlay (like the X-axis labels) because the SVG uses
  // preserveAspectRatio="none", which would distort any <text> inside it. The
  // SVG is 78px tall over a 0..70 viewBox, so a viewBox y maps to y*(78/70) px.
  const SVG_PX_H = 136
  // One label per gridline. The middle line used to be drawn but left unnamed,
  // which is what made the chart look like it had no scale between 0 and the top.
  const Y_TICKS = useMemo(() => {
    const unit = currentChartData.unit
    return [
      { label: `${fmtAxis(chartMax)}${unit}`, vy: 5 },       // top   = full scale
      { label: `${fmtAxis(chartMax / 2)}${unit}`, vy: 32.5 },// mid   = half
      { label: '0', vy: 60 },                                // bottom = zero
    ].map(t => ({ label: t.label, py: t.vy * (SVG_PX_H / 70) }))
  }, [chartMax, currentChartData.unit])

  const chartPaths = chartSegments.map(seg => {
    const line = seg.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    // Closes on the zero baseline (y=60), not on the bottom of the viewBox (y=70)
    // — the fill used to hang ten units below the line the axis calls zero.
    const area = seg.length >= 2
      ? `${line} ${seg[seg.length - 1][0].toFixed(1)},60 ${seg[0][0].toFixed(1)},60`
      : ''
    return { line, area, single: seg.length === 1 ? seg[0] : null }
  })

  // ─── X-axis tick labels at 0/4/8/12/16/20/24 hours ───
  const X_TICKS = useMemo(() => {
    const todayDate = new Date(todayFrom)
    const year = todayDate.getFullYear()
    const month = todayDate.getMonth()
    const day = todayDate.getDate()
    return [0, 4, 8, 12, 16, 20, 24].map(h => {
      const ts = new Date(year, month, day, h, 0, 0, 0).getTime()
      const x = ((ts - viewStart) / (viewEnd - viewStart)) * 300
      const label = h === 0 || h === 24 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`
      return { ts, x, label }
    })
  }, [todayFrom, viewStart, viewEnd])

  return (
    <div className={className ?? 'bg-ink-10 rounded-l p-4'}>
      {/* Header: title + realtime badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-body-md font-semibold text-ink-1">Real-Time Power</span>
        <motion.span
          key={isOnline ? (currentChartData.value == null ? 'nodata' : currentChartData.value) : 'offline'}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-caption px-2 py-0.5 rounded-full font-semibold tnum"
          style={{
            backgroundColor: !isOnline
              ? 'rgba(160,160,165,0.15)'
              : (powerDataSource === 'battery' ? '#454545' : `${currentChartData.color}26`),
            color: !isOnline ? '#BFBFBF' : (powerDataSource === 'battery' ? '#FFFFFF' : currentChartData.color)
          }}
        >
          {isOnline ? (currentChartData.value == null ? '--' : `${currentChartData.value}${currentChartData.unit}`) : '-'}
        </motion.span>
      </div>

      {/* Chart area: left Y-axis scale gutter + plot region */}
      <div className="relative mb-1 flex items-start" style={{ height: 154 }}>
        {/* Y-axis scale labels (max at top, 0 at bottom) — HTML overlay, aligned to
            the SVG's 136px height (the SVG's preserveAspectRatio="none" would distort
            <text>, so labels live outside it like the X-axis labels). B_1.1 draws the
            plot 136 tall inside a 291 card. */}
        <div className="relative flex-shrink-0" style={{ width: 30, height: 136 }}>
          {Y_TICKS.map((tick, i) => (
            <span
              key={i}
              className="absolute right-1 text-[9px] text-ink-8 font-medium tnum"
              style={{ top: tick.py, transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        {/* Plot region — gestures captured here */}
        <div
          ref={plotRef}
          className="relative flex-1 self-stretch select-none"
          style={{ touchAction: 'none' }}
          onTouchStart={onChartTouchStart}
          onTouchMove={onChartTouchMove}
          onTouchEnd={onChartTouchEnd}
          onWheel={onChartWheel}
          // Mouse: press or drag to read. Touch is handled by the touch handlers.
          onPointerDown={e => { if (e.pointerType === 'mouse') scrubAt(e.clientX) }}
          onPointerMove={e => { if (e.pointerType === 'mouse' && e.buttons) scrubAt(e.clientX) }}
        >
        {/* Loading spinner overlay */}
        {!isOnline && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-center px-3">
            <p className="text-body-md font-semibold text-white">Device disconnected</p>
            <p className="text-label text-ink-7 mt-1">Reconnect the device to view chart data.</p>
          </div>
        )}
        {isOnline && historyLoading && !hasSeriesData && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 size={20} className="text-primary animate-spin" />
          </div>
        )}
        {/* A dashed line said both "nothing recorded yet" and "the request
            failed", which are not the same thing to anyone looking at it. */}
        {isOnline && !historyLoading && !hasSeriesData && (
          <div className="absolute inset-0 flex items-center justify-center z-10 px-4 text-center">
            <p className="text-label text-ink-7">
              {/* SW-15: the reason never reaches the user; it is logged instead. */}
              {historyError && rawHistoryPoints.length === 0
                ? "Couldn't load today's history"
                : 'No readings recorded yet today'}
            </p>
          </div>
        )}

        {/* SVG chart — touch handlers for pinch/pan */}
        <svg
          width="100%"
          height="136"
          viewBox="0 0 300 70"
          preserveAspectRatio="none"
          style={{ display: 'block', touchAction: 'none' }}
        >
          {/* Y grid lines, one per axis label: full scale (y=5), half (y=32.5) and
              the zero baseline (y=60). */}
          <line x1="0" y1="5" x2="300" y2="5" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
          <line x1="0" y1="32.5" x2="300" y2="32.5" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
          <line x1="0" y1="60" x2="300" y2="60" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />

          {/* X-axis tick lines at 4-hour boundaries */}
          {X_TICKS.map(tick => tick.x >= -2 && tick.x <= 302 ? (
            <line key={tick.ts} x1={tick.x} y1="0" x2={tick.x} y2="70"
              stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
          ) : null)}

          {/* One fill + line per unbroken run; a lone sample is a dot. */}
          {chartPaths.map((path, i) => (
            <g key={`${powerDataSource}-${i}`}>
              {path.area && (
                <polygon points={path.area} fill={currentChartData.color} fillOpacity="0.12" />
              )}
              {path.single ? (
                <circle cx={path.single[0]} cy={path.single[1]} r="1.5" fill={currentChartData.color} />
              ) : (
                <polyline
                  points={path.line}
                  fill="none"
                  stroke={currentChartData.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </g>
          ))}
          {!hasSeriesData && !historyLoading && (
            <line x1="0" y1="60" x2="300" y2="60"
              stroke={currentChartData.color} strokeWidth="1.5"
              strokeOpacity="0.3" strokeLinecap="round" strokeDasharray="4 4" />
          )}
        </svg>

        {/* Scrub reading: a guide line, the point on the curve and a label with
            the time and value. HTML, not SVG <text>: the SVG is stretched. */}
        {scrub && (
          <div className="absolute inset-x-0 top-0 pointer-events-none z-20" style={{ height: 136 }} data-testid="rtp-scrub">
            <div
              className="absolute top-0 bottom-0 border-l border-dashed border-white/40"
              style={{ left: `${scrub.pct}%` }}
            />
            {scrub.dotPy !== null && (
              <div
                className="absolute w-2.5 h-2.5 rounded-full border-s border-ink-12"
                style={{ left: `${scrub.pct}%`, top: scrub.dotPy, transform: 'translate(-50%, -50%)', backgroundColor: currentChartData.color }}
              />
            )}
            <div
              className="absolute top-0.5 rounded-s bg-black/85 px-2 py-1 text-center whitespace-nowrap"
              style={{
                left: `${scrub.pct}%`,
                transform: `translateX(${scrub.pct < 18 ? '0%' : scrub.pct > 82 ? '-100%' : '-50%'})`,
              }}
            >
              <p className="text-tiny text-white font-semibold tnum" data-testid="rtp-scrub-time">{scrub.time}</p>
              <p
                className="text-tiny font-semibold tnum"
                style={{ color: scrub.dotPy === null ? '#BFBFBF' : (powerDataSource === 'battery' ? '#FFFFFF' : currentChartData.color) }}
              >
                <span className="text-ink-5 font-medium" data-testid="rtp-scrub-name">{scrub.name}</span>{' '}
                <span data-testid="rtp-scrub-value">{scrub.value}</span>
              </p>
            </div>
          </div>
        )}

        {/* X-axis tick labels — rendered outside SVG so they don't scale with preserveAspectRatio:none */}
        <div className="relative" style={{ height: 18 }}>
          {X_TICKS.map(tick => {
            const pct = ((tick.ts - viewStart) / (viewEnd - viewStart)) * 100
            if (pct < -5 || pct > 105) return null
            return (
              <span
                key={tick.ts}
                className="absolute text-[9px] text-ink-8 font-medium"
                style={{
                  left: `${pct}%`,
                  transform: 'translateX(-50%)',
                  top: 2,
                  whiteSpace: 'nowrap',
                }}
              >
                {tick.label}
              </span>
            )
          })}
        </div>
        </div>
      </div>

      {/* Bottom 4 tabs */}
      <div className="flex justify-around pt-3 border-t border-white/[0.06]">
        {[
          // B_1.1 draws these with the handoff glyphs, not stand-ins.
          { key: 'battery' as const, label: 'Battery', glyph: 'battery' },
          { key: 'ac' as const, label: 'AC', glyph: 'plug' },
          { key: 'solar' as const, label: 'Solar', glyph: 'solar' },
          { key: 'output' as const, label: 'Output', glyph: 'output' },
        ].map((item) => {
          const isActive = powerDataSource === item.key
          return (
            <button
              key={item.key}
              onClick={() => setPowerDataSource(item.key)}
              className={`flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-l active:scale-[0.96] transition-[background-color,color,transform] duration-150
                ${isActive ? 'bg-ink-9 text-ink-1' : 'text-ink-1/30 bg-transparent'}`}
            >
              <Glyph name={item.glyph} size={20} color={isActive ? '#FCFCFC' : '#4D4D4D'} />
              <span className={`text-tiny font-medium ${isActive ? 'text-ink-1' : 'text-ink-1/30'}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
