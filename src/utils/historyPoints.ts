/**
 * Today's Real-Time Power history: one sample of the four tabs the chart plots,
 * read from `POST /deviceState/attribute/record/list` (Siseli `doGetDeviceHistory`).
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

/** Value nested at `record.fields[key].value` (checked against the real backend). */
function fieldNum(rec: DeviceAttributeRecord, key: string): number | null {
  const f = rec.fields?.[key]
  if (f === undefined || f === null) return null
  const raw = typeof f === 'object' && 'value' in f ? (f as { value?: unknown }).value : f
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function power(rec: DeviceAttributeRecord, key: string): number | null {
  const v = fieldNum(rec, key)
  return v === null ? null : (decodePowerU16(v) ?? null)
}

/** One API record → one point, or null when it has no usable time. */
export function recordToPoint(rec: DeviceAttributeRecord): HistoryPoint | null {
  const time = typeof rec.time === 'string' ? rec.time : ''
  const timestamp = time ? new Date(time).getTime() : NaN
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null
  const solar = power(rec, 'generationPower')
  const output = power(rec, 'outputPower')
  const ac = power(rec, 'exchangeChargingPower')
  const soc = fieldNum(rec, 'remainingBatteryCapacity')
  // The feed carries no batteryPower (confirmed on the real backend); derive it
  // the way the live path does, and only when all three legs were read.
  const direct = fieldNum(rec, 'batteryPower')
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
