/**
 * Insights: turn /deviceState/attribute/record/list samples into per-bucket
 * ENERGY (Wh), split by source, with gaps kept as gaps.
 *
 * What this replaces (APP-20260923-006/007/008/009):
 *  - Each bucket was the MEAN power of its samples times the bucket length, and
 *    the tooltip showed that mean as "In 0 W / Out 4 W". A day's total is
 *    energy, not power, and a mean times 24 h counts hours nobody measured —
 *    half a day of samples was billed as a full day.
 *  - "In" was `generationPower` (solar) only. AC charging (`exchangeChargingPower`)
 *    was never counted, so a grid-charged day read "In 0".
 *  - A bucket with no samples drew as 0, the same as a real zero, and so did
 *    every future day of the week or month.
 *
 * Now each sample's power is held until the next sample, capped by
 * sampleHoldCapMs so a device that went quiet is not credited for the silence, and summed into the bucket the sample falls in. Solar and AC are
 * kept apart; input is their sum. A bucket with no samples is `null`.
 */
import type { DeviceAttributeRecord } from '../api/deviceApi'
import { decodePowerU16 } from '../protocols/powerU16'

/**
 * How long one sample may stand for: three of the device's own typical gaps,
 * kept within these bounds. Adaptive because the reporting cadence is the
 * device's, not ours — a fixed 15 min would halve a device that reports every
 * 30 min — while a real outage of hours is still credited at most an hour.
 */
export const MIN_SAMPLE_HOLD_MS = 15 * 60_000
export const MAX_SAMPLE_HOLD_MS = 60 * 60_000

export function sampleHoldCapMs(typicalGapMs: number): number {
  return Math.min(Math.max(3 * typicalGapMs, MIN_SAMPLE_HOLD_MS), MAX_SAMPLE_HOLD_MS)
}
/** A mature tree takes up about 21.8 kg of CO2 a year (US EPA). */
export const KG_CO2_PER_TREE_YEAR = 21.8
/** kg CO2 avoided per kWh of solar. */
export const KG_CO2_PER_KWH = 0.5

export type InsightsPeriod = 'Day' | 'Week' | 'Month' | 'Range'

export interface InsightsFrame {
  labels: string[]
  /** Per-bucket energy, Wh; null where the bucket has no samples at all. */
  solarWh: (number | null)[]
  acWh: (number | null)[]
  inputWh: (number | null)[]
  outputWh: (number | null)[]
  totalSolarKwh: number
  totalInputKwh: number
  totalOutputKwh: number
  co2Kg: number
  trees: number
  /** Any solar generated in the period — the CO2 card only exists when true. */
  hasSolar: boolean
  hasData: boolean
  insight: string
  ecoInsight: string
}

/** A power field in W, or null when absent / not a believable reading. */
export function powerField(rec: DeviceAttributeRecord, key: string): number | null {
  const f = rec.fields?.[key]
  if (f === undefined || f === null) return null
  const raw = typeof f === 'object' && 'value' in f ? (f as { value?: unknown }).value : f
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return decodePowerU16(n) ?? null
}

export function weekStart(d: Date): Date {
  const s = new Date(d)
  const day = s.getDay()
  s.setDate(s.getDate() - (day === 0 ? 6 : day - 1))
  s.setHours(0, 0, 0, 0)
  return s
}

interface Buckets {
  labels: string[]
  count: number
  bucketOf: (t: Date) => number
  /** Word used in the insight ("this week"). */
  scope: string
}

function buckets(period: InsightsPeriod, selectedDate: Date, rangeStart: Date | null, rangeEnd: Date | null): Buckets {
  const dayLabel = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  if (period === 'Day') {
    const sel = new Date(selectedDate); sel.setHours(0, 0, 0, 0)
    return {
      labels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`),
      count: 24,
      bucketOf: (t) => {
        const d = new Date(t); d.setHours(0, 0, 0, 0)
        return d.getTime() === sel.getTime() ? t.getHours() : -1
      },
      scope: 'today',
    }
  }
  let start: Date
  let days: number
  let scope: string
  if (period === 'Week') {
    start = weekStart(selectedDate); days = 7; scope = 'this week'
  } else if (period === 'Month') {
    start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
    days = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate()
    scope = 'this month'
  } else {
    start = rangeStart ? new Date(rangeStart) : new Date(Date.now() - 30 * 86400000)
    start.setHours(0, 0, 0, 0)
    const end = rangeEnd ? new Date(rangeEnd) : new Date()
    end.setHours(0, 0, 0, 0)
    days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    scope = 'in this range'
  }
  const s = start
  return {
    labels: Array.from({ length: days }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return dayLabel(d) }),
    count: days,
    bucketOf: (t) => {
      const d = new Date(t); d.setHours(0, 0, 0, 0)
      // Local midnights are 23, 24 or 25 h apart across DST; rounding the day
      // count keeps every sample in its calendar day.
      const i = Math.round((d.getTime() - s.getTime()) / 86400000)
      return i >= 0 && i < days ? i : -1
    },
    scope,
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function buildInsightsFrame(
  records: DeviceAttributeRecord[],
  period: InsightsPeriod,
  selectedDate: Date,
  rangeStart: Date | null = null,
  rangeEnd: Date | null = null,
): InsightsFrame {
  const b = buckets(period, selectedDate, rangeStart, rangeEnd)
  const solar: (number | null)[] = new Array(b.count).fill(null)
  const ac: (number | null)[] = new Array(b.count).fill(null)
  const out: (number | null)[] = new Array(b.count).fill(null)

  const samples = records
    .map(r => ({ r, t: r.time ? new Date(r.time) : null }))
    .filter((s): s is { r: DeviceAttributeRecord; t: Date } => !!s.t && !isNaN(s.t.getTime()))
    .sort((a, z) => a.t.getTime() - z.t.getTime())

  // The last sample has no successor; hold it for the typical spacing (median gap).
  const gaps = samples.slice(1).map((s, i) => s.t.getTime() - samples[i].t.getTime()).filter(g => g > 0).sort((a, z) => a - z)
  const typicalGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 5 * 60_000
  const holdCap = sampleHoldCapMs(typicalGap)

  samples.forEach(({ r, t }, i) => {
    const idx = b.bucketOf(t)
    if (idx < 0) return
    const next = samples[i + 1]?.t.getTime()
    const holdMs = Math.min(next !== undefined ? next - t.getTime() : typicalGap, holdCap)
    const hours = Math.max(0, holdMs) / 3_600_000
    const add = (arr: (number | null)[], w: number | null) => { arr[idx] = (arr[idx] ?? 0) + (w ?? 0) * hours }
    add(solar, powerField(r, 'generationPower'))
    add(ac, powerField(r, 'exchangeChargingPower'))
    add(out, powerField(r, 'outputPower'))
  })

  const roundWh = (a: (number | null)[]) => a.map(v => (v === null ? null : Math.round(v)))
  const solarWh = roundWh(solar)
  const acWh = roundWh(ac)
  const outputWh = roundWh(out)
  const inputWh = solarWh.map((s, i) => (s === null && acWh[i] === null ? null : (s ?? 0) + (acWh[i] ?? 0)))

  const sum = (a: (number | null)[]) => a.reduce<number>((acc, v) => acc + (v ?? 0), 0)
  const totalSolarKwh = round1(sum(solarWh) / 1000)
  const totalInputKwh = round1(sum(inputWh) / 1000)
  const totalOutputKwh = round1(sum(outputWh) / 1000)
  const co2Kg = round1(totalSolarKwh * KG_CO2_PER_KWH)
  const trees = Math.round((co2Kg / KG_CO2_PER_TREE_YEAR) * 10) / 10

  const hasData = [...inputWh, ...outputWh].some(v => v !== null && v > 0)
  const hasSolar = solarWh.some(v => v !== null && v > 0)

  let insight = 'No power data for this period'
  if (hasData) {
    let best = -1
    outputWh.forEach((v, i) => { if (v !== null && (best < 0 || v > (outputWh[best] ?? -1))) best = i })
    if (best >= 0 && (outputWh[best] ?? 0) > 0) {
      insight = period === 'Day'
        ? `Peak output around ${b.labels[best]}`
        : `Highest daily output ${b.scope}: ${b.labels[best]}`
    } else {
      insight = 'No output recorded for this period'
    }
  }

  return {
    labels: b.labels, solarWh, acWh, inputWh, outputWh,
    totalSolarKwh, totalInputKwh, totalOutputKwh, co2Kg, trees, hasSolar, hasData, insight,
    ecoInsight: `Equal to planting ${trees} ${trees === 1 ? 'tree' : 'trees'}`,
  }
}

/** "1,234 Wh" — the unit a daily or hourly total is read in. */
export function formatWh(wh: number): string {
  return `${Math.round(wh).toLocaleString('en-US')} Wh`
}

/**
 * The bucket a tap at `x` (chart units, 0..width) picks: the nearest point, with
 * points spread from `pad` to `width - pad` as the chart draws them (v4.21.1).
 */
export function bucketAtX(x: number, width: number, pad: number, count: number): number {
  if (count <= 1) return 0
  const inner = width - pad * 2
  if (inner <= 0) return 0
  const i = Math.round(((x - pad) / inner) * (count - 1))
  return Math.max(0, Math.min(count - 1, i))
}

/** Which buckets get an axis label: about six, evenly stepped, first one included. */
export function axisLabelIndexes(count: number): number[] {
  const step = Math.max(1, Math.floor(count / 6))
  const out: number[] = []
  for (let i = 0; i < count; i += step) out.push(i)
  return out
}
