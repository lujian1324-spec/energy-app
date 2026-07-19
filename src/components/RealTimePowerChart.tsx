import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Loader2, AlertTriangle, Battery, LayoutGrid, Sun, TrendingUp } from 'lucide-react'
import { useHistoryFetcher } from '../hooks/useHistoryFetcher'
import { LastSync, SampleRate } from './DataTrust'

type PowerTab = 'battery' | 'ac' | 'solar' | 'output'

/** Compact Y-axis number: integers, with a k suffix at ≥1000 so the narrow axis gutter never wraps. */
function fmtAxis(v: number): string {
  const n = Math.round(v)
  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export interface RealTimePowerChartProps {
  deviceId: string | null
  isOnline: boolean
  /** Current live readings for the top-right badge: battery is charge/discharge power (W). */
  values: { battery: number; ac: number; solar: number; output: number }
  /**
   * When true, the Battery tab plots battery state-of-charge (SOC %,
   * `remainingBatteryCapacity`) on a fixed 0–100% axis instead of charge/discharge
   * power (W) — used by DeviceMonitorPage. `batterySoc` supplies the live SOC for
   * the badge. Defaults to the power view.
   */
  batteryAsSoc?: boolean
  batterySoc?: number
  lastSyncAt?: number
  className?: string
}

/**
 * Same-day Real-Time Power chart: real API timestamps (not evenly re-spaced),
 * a fixed 12am–4am–8am–12pm–4pm–8pm–12am x-axis regardless of how much of the
 * day has data yet, and pinch/wheel zoom down to a 1-hour window. Rendered by
 * DeviceMonitorPage; the Battery tab can plot SOC (%) instead of power via the
 * batteryAsSoc prop.
 */
export default function RealTimePowerChart({ deviceId, isOnline, values, batteryAsSoc = false, batterySoc = 0, lastSyncAt, className }: RealTimePowerChartProps) {
  const [powerDataSource, setPowerDataSource] = useState<PowerTab>('battery')

  const powerChartData = useMemo(() => ({
    battery: batteryAsSoc
      ? { value: Math.round(batterySoc), unit: '%', color: '#34C759' }
      : { value: values.battery, unit: 'W', color: '#34C759' },
    ac: { value: values.ac, unit: 'W', color: '#01D6BE' },
    solar: { value: values.solar, unit: 'W', color: '#FF9500' },
    output: { value: values.output, unit: 'W', color: '#BFBFBF' },
  }), [values.battery, values.ac, values.solar, values.output, batteryAsSoc, batterySoc])

  const currentChartData = powerChartData[powerDataSource]

  // ─── Today's time window for chart history ───
  const [todayFrom, todayTo] = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    return [start.getTime(), end.getTime()]
  }, [])

  const {
    points: rawHistoryPoints,
    loading: historyLoading,
    error: historyError,
  } = useHistoryFetcher(deviceId, todayFrom, todayTo)

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

  // Reset zoom when device changes or day changes
  useEffect(() => {
    setViewStart(todayFrom)
    setViewEnd(todayTo)
  }, [deviceId, todayFrom, todayTo])

  // ─── Gesture state for pinch-to-zoom and pan on chart ───
  const chartTouchRef = useRef<{
    mode: 'pan' | 'pinch' | null
    lastX: number
    lastDist: number
    viewAtStart: [number, number]
  }>({ mode: null, lastX: 0, lastDist: 0, viewAtStart: [todayFrom, todayTo] })

  const onChartTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      chartTouchRef.current = {
        mode: 'pan',
        lastX: e.touches[0].clientX,
        lastDist: 0,
        viewAtStart: [viewStart, viewEnd],
      }
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
  }, [viewStart, viewEnd])

  const onChartTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const ref = chartTouchRef.current
    if (!ref.mode) return
    const svgEl = e.currentTarget
    const svgWidth = svgEl.getBoundingClientRect().width || 300

    if (ref.mode === 'pan' && e.touches.length === 1) {
      const dx = e.touches[0].clientX - ref.lastX
      ref.lastX = e.touches[0].clientX
      const [s, e2] = ref.viewAtStart
      const winMs = e2 - s
      const msPerPx = winMs / svgWidth
      const delta = -dx * msPerPx
      const [ns, ne] = clampView(viewStart + delta, viewEnd + delta)
      setViewStart(ns)
      setViewEnd(ne)
      ref.viewAtStart = [ns, ne]
    } else if (ref.mode === 'pinch' && e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const scale = ref.lastDist > 0 ? ref.lastDist / dist : 1
      ref.lastDist = dist
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const [s, e2] = [viewStart, viewEnd]
      const winMs = e2 - s
      const msPerPx = winMs / svgWidth
      const pivotMs = s + (cx - svgEl.getBoundingClientRect().left) * msPerPx
      const newWin = Math.max(MIN_WINDOW, winMs * scale)
      const ratio = (pivotMs - s) / winMs
      const ns = pivotMs - ratio * newWin
      const ne = ns + newWin
      const [cs, ce] = clampView(ns, ne)
      setViewStart(cs)
      setViewEnd(ce)
    }
    e.stopPropagation()
  }, [viewStart, viewEnd, clampView])

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

  // ─── Build SVG path from history points, mapped onto viewStart..viewEnd ───
  const chartPoints = useMemo(() => {
    const win = viewEnd - viewStart
    if (win <= 0) return []
    return rawHistoryPoints
      .filter(p => p.timestamp >= viewStart - win * 0.05 && p.timestamp <= viewEnd + win * 0.05)
      .map(p => {
        const x = ((p.timestamp - viewStart) / win) * 300
        const val = powerDataSource === 'battery' ? (batteryAsSoc ? p.soc : p.battery)
                  : powerDataSource === 'ac'      ? p.ac
                  : powerDataSource === 'solar'   ? p.solar
                  :                                 p.output
        return { x, val }
      })
  }, [rawHistoryPoints, viewStart, viewEnd, powerDataSource, batteryAsSoc])

  // The Battery-as-SOC view uses a FIXED 0–100% y-axis (SOC is a percentage, so
  // auto-scaling to the window's max would misleadingly stretch e.g. a 40–50%
  // range to full height). Power tabs keep auto-scaling to their own max.
  const isSocView = batteryAsSoc && powerDataSource === 'battery'
  const chartMax = useMemo(
    () => (isSocView ? 100 : Math.max(...chartPoints.map(p => Math.abs(p.val)), 1)),
    [chartPoints, isSocView]
  )

  const chartSvgPts = useMemo(() => {
    return chartPoints
      .filter(p => p.x >= -10 && p.x <= 310)
      .map(p => {
        const y = 60 - (Math.abs(p.val) / chartMax) * 55
        return [p.x, y] as const
      })
  }, [chartPoints, chartMax])

  // ─── Y-axis scale labels (2 levels: max at top, 0 at bottom) ───
  // Rendered as an HTML overlay (like the X-axis labels) because the SVG uses
  // preserveAspectRatio="none", which would distort any <text> inside it. The
  // SVG is 78px tall over a 0..70 viewBox, so a viewBox y maps to y*(78/70) px.
  const SVG_PX_H = 78
  const Y_TICKS = useMemo(() => {
    const unit = currentChartData.unit
    return [
      { label: `${fmtAxis(chartMax)}${unit}`, vy: 5 },   // top = chartMax
      { label: '0', vy: 60 },                            // bottom = zero baseline
    ].map(t => ({ label: t.label, py: t.vy * (SVG_PX_H / 70) }))
  }, [chartMax, currentChartData.unit])

  const chartLinePoints = chartSvgPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const chartAreaPoints = chartSvgPts.length >= 2
    ? `${chartLinePoints} ${chartSvgPts[chartSvgPts.length-1][0].toFixed(1)},70 ${chartSvgPts[0][0].toFixed(1)},70`
    : ''

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
          key={isOnline ? currentChartData.value : 'offline'}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-[11px] px-2 py-0.5 rounded-full font-semibold tnum"
          style={{
            backgroundColor: isOnline ? `${currentChartData.color}26` : 'rgba(160,160,165,0.15)',
            color: isOnline ? currentChartData.color : '#BFBFBF'
          }}
        >
          {isOnline ? `${currentChartData.value}${currentChartData.unit}` : '-'}
        </motion.span>
      </div>

      {/* Chart area: left Y-axis scale gutter + plot region */}
      <div className="relative mb-1 flex items-start" style={{ height: 96 }}>
        {/* Y-axis scale labels (max at top, 0 at bottom) — HTML overlay, aligned to
            the SVG's 78px height (the SVG's preserveAspectRatio="none" would distort
            <text>, so labels live outside it like the X-axis labels). */}
        <div className="relative flex-shrink-0" style={{ width: 30, height: 78 }}>
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
          className="relative flex-1 self-stretch"
          style={{ touchAction: 'none' }}
          onTouchStart={onChartTouchStart}
          onTouchMove={onChartTouchMove}
          onTouchEnd={onChartTouchEnd}
          onWheel={onChartWheel}
        >
        {/* Loading spinner overlay */}
        {historyLoading && rawHistoryPoints.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 size={20} className="text-primary animate-spin" />
          </div>
        )}

        {/* History fetch failed and there's nothing (cached or partial) to show —
            without this the chart falls back to the flat placeholder dash below,
            which is visually identical to "no data yet today" and hides a real error. */}
        {!historyLoading && historyError && rawHistoryPoints.length === 0 && (
          <div className="absolute top-1 left-1 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#1a1a1a] border border-[rgba(255,59,48,0.3)]">
            <AlertTriangle size={9} className="text-danger" />
            <span className="text-[9px] text-danger font-medium">History unavailable</span>
          </div>
        )}

        {/* SVG chart — touch handlers for pinch/pan */}
        <svg
          width="100%"
          height="78"
          viewBox="0 0 300 70"
          preserveAspectRatio="none"
          style={{ display: 'block', touchAction: 'none' }}
        >
          {/* Y grid lines — aligned to the Y-axis labels: max (y=5) and 0 baseline
              (y=60), plus a fainter unlabeled mid line (y=32.5) for readability. */}
          <line x1="0" y1="5" x2="300" y2="5" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
          <line x1="0" y1="32.5" x2="300" y2="32.5" stroke="rgba(255,255,255,0.04)" strokeWidth="0.8" />
          <line x1="0" y1="60" x2="300" y2="60" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />

          {/* X-axis tick lines at 4-hour boundaries */}
          {X_TICKS.map(tick => tick.x >= -2 && tick.x <= 302 ? (
            <line key={tick.ts} x1={tick.x} y1="0" x2={tick.x} y2="70"
              stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
          ) : null)}

          {/* Chart fill */}
          {chartAreaPoints && (
            <motion.polygon
              key={`fill-${powerDataSource}-${rawHistoryPoints.length}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              points={chartAreaPoints}
              fill={currentChartData.color}
              fillOpacity="0.12"
            />
          )}

          {/* Chart line */}
          {chartSvgPts.length >= 2 ? (
            <motion.polyline
              key={`line-${powerDataSource}-${rawHistoryPoints.length}-${viewStart}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              points={chartLinePoints}
              fill="none"
              stroke={currentChartData.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : !historyLoading && (
            <line x1="0" y1="60" x2="300" y2="60"
              stroke={currentChartData.color} strokeWidth="1.5"
              strokeOpacity="0.3" strokeLinecap="round" strokeDasharray="4 4" />
          )}
        </svg>

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

      {/* PRD v1.1 §8.2: 采样率标注 */}
      <div className="flex items-center justify-between mb-2">
        <LastSync lastSyncAt={lastSyncAt} />
        <SampleRate intervalSec={30} />
      </div>

      {/* Bottom 4 tabs */}
      <div className="flex justify-around pt-3 border-t border-[rgba(255,255,255,0.06)]">
        {[
          { key: 'battery' as const, label: 'Battery', icon: Battery },
          { key: 'ac' as const, label: 'AC', icon: LayoutGrid },
          { key: 'solar' as const, label: 'Solar', icon: Sun },
          { key: 'output' as const, label: 'Output', icon: TrendingUp },
        ].map((item) => {
          const Icon = item.icon
          const isActive = powerDataSource === item.key
          return (
            <button
              key={item.key}
              onClick={() => setPowerDataSource(item.key)}
              className={`flex flex-col items-center gap-1 px-4 py-1 rounded-l active:scale-[0.96] transition-[background-color,transform] duration-150
                ${isActive ? 'bg-[rgba(1,214,190,0.15)]' : 'hover:bg-[rgba(255,255,255,0.03)]'}`}
            >
              <Icon size={18} className={isActive ? 'text-primary' : 'text-ink-6'} />
              <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : 'text-ink-6'}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
