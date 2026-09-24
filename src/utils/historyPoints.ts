/**
 * Today's Real-Time Power history: one sample of the four tabs the chart plots.
 *
 * Read from `POST /deviceState/simple/attribute/keys/history/v1` — the call the
 * Solar of Things console makes for a device's day (columnar reply, see
 * `columnarToPoints`) — or, where that is refused, from
 * `POST /deviceState/attribute/record/list` (Siseli app `doGetDeviceHistory`,
 * one record per frame, see `recordToPoint`).
 *
 *   Battery → `remainingBatteryCapacity` (%)
 *   AC      → `exchangeChargingPower`    (W, AC input)
 *   Solar   → `generationPower`          (W)
 *   Output  → `outputPower`              (W, AC output)
 *
 * A field the record does not carry is `null`, never 0: a missing reading is a
 * gap in the curve, not a dip to the baseline (APP-20260923-003). Power passes
 * the same unfilled-register guard as the live path, so a 65534 W placeholder
 * cannot spike the chart.
 */
import type { DeviceAttributeRecord } from '../api/deviceApi'
import { decodePowerU16 } from '../protocols/powerU16'

export interface HistoryPoint {
  time: string            // ISO time as the record carried it
  timestamp: number       // Unix ms
  solar: number | null    // generationPower W
  output: number | null   // outputPower W
  soc: number | null      // remainingBatteryCapacity %
  battery: number | null  // batteryPower W (charge +, discharge −)
  ac: number | null       // exchangeChargingPower W
}

export type HistorySeries = 'solar' | 'output' | 'soc' | 'battery' | 'ac'

/** The attribute keys the four tabs plot, as the history endpoints name them. */
export const HISTORY_KEYS = ['remainingBatteryCapacity', 'exchangeChargingPower', 'generationPower', 'outputPower'] as const

function toNum(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** One frame → one point, from a reader of its raw values; null without a usable time. */
function framePoint(time: string, read: (key: string) => unknown): HistoryPoint | null {
  const timestamp = time ? new Date(time).getTime() : NaN
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null
  const num = (key: string) => toNum(read(key))
  const power = (key: string) => { const v = num(key); return v === null ? null : (decodePowerU16(v) ?? null) }
  const solar = power('generationPower')
  const output = power('outputPower')
  const ac = power('exchangeChargingPower')
  const soc = num('remainingBatteryCapacity')
  // The feed carries no batteryPower (confirmed on the real backend); derive it
  // the way the live path does, and only when all three legs were read.
  const direct = num('batteryPower')
  const battery = direct ?? (ac !== null && solar !== null && output !== null ? ac + solar - output : null)
  return {
    time,
    timestamp,
    solar,
    output,
    soc: soc !== null && soc >= 0 && soc <= 100 ? soc : null,
    battery,
    ac,
  }
}

/** One `record/list` record → one point; the value sits at `fields[key].value`. */
export function recordToPoint(rec: DeviceAttributeRecord): HistoryPoint | null {
  return framePoint(typeof rec.time === 'string' ? rec.time : '', (key) => {
    const f = rec.fields?.[key]
    return f !== null && typeof f === 'object' && 'value' in f ? (f as { value?: unknown }).value : f
  })
}

/**
 * The `keys/history/v1` reply's payload: one shared `timeSeries` (UTC ISO, one
 * entry per report frame) and, per key, an array aligned with it where `null`
 * means the frame did not carry that key.
 */
export interface ColumnarHistory {
  timeSeries?: unknown[]
  fields?: Record<string, unknown[] | null | undefined>
}

/**
 * Zip a columnar reply into points. A frame that carries none of the four keys
 * is dropped (the time axis is the device's frames whatever keys are asked for).
 */
export function columnarToPoints(payload: ColumnarHistory | null | undefined): HistoryPoint[] {
  const times = Array.isArray(payload?.timeSeries) ? payload!.timeSeries : []
  const fields = payload?.fields ?? {}
  const out: HistoryPoint[] = []
  times.forEach((t, i) => {
    const read = (key: string) => (Array.isArray(fields[key]) ? fields[key]![i] : null)
    if (HISTORY_KEYS.every(k => toNum(read(k)) === null)) return
    const p = framePoint(typeof t === 'string' ? t : '', read)
    if (p) out.push(p)
  })
  return out
}

export function recordsToPoints(list: DeviceAttributeRecord[]): HistoryPoint[] {
  const out: HistoryPoint[] = []
  for (const rec of list) {
    const p = recordToPoint(rec)
    if (p) out.push(p)
  }
  return out
}

/** Union by timestamp, sorted ascending; a point in `newer` replaces an older copy. */
export function mergePoints(older: HistoryPoint[], newer: HistoryPoint[]): HistoryPoint[] {
  const byTs = new Map<number, HistoryPoint>()
  for (const p of older) byTs.set(p.timestamp, p)
  for (const p of newer) byTs.set(p.timestamp, p)
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * The longest silence still drawn as one line: three times the device's typical
 * reporting gap, kept between 15 and 60 minutes. Longer than that the device
 * was off or offline, and a straight line across it would invent readings.
 */
export function maxGapMs(points: HistoryPoint[]): number {
  const gaps: number[] = []
  for (let i = 1; i < points.length; i++) {
    const g = points[i].timestamp - points[i - 1].timestamp
    if (g > 0) gaps.push(g)
  }
  if (gaps.length === 0) return 15 * 60_000
  gaps.sort((a, b) => a - b)
  const median = gaps[Math.floor(gaps.length / 2)]
  return Math.min(60 * 60_000, Math.max(15 * 60_000, median * 3))
}

/**
 * The runs of one series that should be drawn as separate lines: a sample
 * without that reading, or a silence longer than `gapMs`, ends the run.
 */
export function seriesSegments(
  points: HistoryPoint[],
  series: HistorySeries,
  gapMs: number,
): Array<Array<{ timestamp: number; value: number }>> {
  const segments: Array<Array<{ timestamp: number; value: number }>> = []
  let run: Array<{ timestamp: number; value: number }> = []
  let lastTs: number | null = null
  for (const p of points) {
    const v = p[series]
    if (v === null) {
      if (run.length) segments.push(run)
      run = []
      lastTs = null
      continue
    }
    if (lastTs !== null && p.timestamp - lastTs > gapMs && run.length) {
      segments.push(run)
      run = []
    }
    run.push({ timestamp: p.timestamp, value: v })
    lastTs = p.timestamp
  }
  if (run.length) segments.push(run)
  return segments
}

/** Local-time ISO 8601 with offset — the format the history endpoint expects. */
export function toIsoTz(ms: number): string {
  const d = new Date(ms)
  const tzOffset = -d.getTimezoneOffset()
  const pad = (n: number) => String(n).padStart(2, '0')
  const tzStr = (tzOffset >= 0 ? '+' : '-') +
    pad(Math.floor(Math.abs(tzOffset) / 60)) + ':' + pad(Math.abs(tzOffset) % 60)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + tzStr
}
