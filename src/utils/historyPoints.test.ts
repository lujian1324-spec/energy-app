/**
 * Real-Time Power history: what one record becomes, how runs break, and the
 * time format the endpoint is sent.
 */
// A zone west of UTC: the one the old formatter got wrong.
process.env.TZ = 'America/Los_Angeles'

import { describe, it, expect } from 'vitest'
import type { DeviceAttributeRecord } from '../api/deviceApi'
import { clockLabel, columnarToPoints, maxGapMs, mergePoints, readingAt, recordToPoint, seriesSegments, toIsoTz, type HistoryPoint } from './historyPoints'

const rec = (time: string, fields: Record<string, unknown>): DeviceAttributeRecord => ({
  time,
  fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v }])) as DeviceAttributeRecord['fields'],
})

const pt = (ts: number, v: Partial<HistoryPoint> = {}): HistoryPoint => ({
  time: new Date(ts).toISOString(), timestamp: ts,
  solar: 10, output: 20, soc: 50, battery: 0, ac: 10, ...v,
})

describe('recordToPoint', () => {
  it('reads the four tabs from fields[key].value', () => {
    const p = recordToPoint(rec('2026-09-24T10:00:00-07:00', {
      remainingBatteryCapacity: '82', exchangeChargingPower: '300', generationPower: '120', outputPower: '250',
    }))!
    expect(p.timestamp).toBe(Date.parse('2026-09-24T17:00:00Z'))
    expect(p).toMatchObject({ soc: 82, ac: 300, solar: 120, output: 250, battery: 170 })
  })

  it('keeps a missing reading as null — a gap, never 0 W', () => {
    const p = recordToPoint(rec('2026-09-24T10:00:00-07:00', { remainingBatteryCapacity: '40', outputPower: '90' }))!
    expect(p).toMatchObject({ soc: 40, output: 90, ac: null, solar: null })
    // Battery power needs all three legs; one missing leg is not a 0 W leg.
    expect(p.battery).toBeNull()
  })

  it('drops an unfilled register (65534 W) and an impossible SOC', () => {
    const p = recordToPoint(rec('2026-09-24T10:00:00-07:00', { outputPower: '65534', remainingBatteryCapacity: '255' }))!
    expect(p.output).toBeNull()
    expect(p.soc).toBeNull()
  })

  it('skips a record without a usable time', () => {
    expect(recordToPoint(rec('', { outputPower: '1' }))).toBeNull()
    expect(recordToPoint(rec('not a time', { outputPower: '1' }))).toBeNull()
  })
})

describe('columnarToPoints (keys/history/v1)', () => {
  // The handoff's own example shape: shared timeSeries, one array per key, null = absent.
  const payload = {
    timeSeries: ['2026-09-24T08:07:54.860Z', '2026-09-24T08:09:07.502Z', '2026-09-24T08:10:00.000Z', 'bad'],
    fields: {
      remainingBatteryCapacity: [null, 93.8, null, 50],
      outputPower: [null, 120, 65534, 10],
      exchangeChargingPower: [null, 0, null, 0],
      generationPower: [null, 40, null, 0],
    },
  }

  it('zips each frame\'s values by index', () => {
    const pts = columnarToPoints(payload)
    expect(pts[0]).toMatchObject({ timestamp: Date.parse('2026-09-24T08:09:07.502Z'), soc: 93.8, output: 120, ac: 0, solar: 40, battery: -80 })
  })

  it('drops a frame that carries none of the four keys, and one without a usable time', () => {
    const pts = columnarToPoints(payload)
    // Frame 0 is all null, frame 3 has no time; frame 2 has only an unfilled register.
    expect(pts.map(p => p.time)).toEqual(['2026-09-24T08:09:07.502Z', '2026-09-24T08:10:00.000Z'])
    expect(pts[1]).toMatchObject({ output: null, soc: null })
  })

  it('treats a key the reply left out as absent', () => {
    expect(columnarToPoints({ timeSeries: ['2026-09-24T08:00:00Z'], fields: { outputPower: [5] } })[0])
      .toMatchObject({ output: 5, soc: null, ac: null, solar: null })
    expect(columnarToPoints(null)).toEqual([])
  })
})

describe('mergePoints', () => {
  it('unions by timestamp, sorted, the newer copy winning', () => {
    const merged = mergePoints([pt(3000), pt(1000, { output: 1 })], [pt(1000, { output: 2 }), pt(2000)])
    expect(merged.map(p => p.timestamp)).toEqual([1000, 2000, 3000])
    expect(merged[0].output).toBe(2)
  })
})

describe('seriesSegments', () => {
  const MIN = 60_000
  it('breaks the line where the series has no reading', () => {
    const pts = [pt(0), pt(5 * MIN, { ac: null }), pt(10 * MIN), pt(15 * MIN)]
    expect(seriesSegments(pts, 'ac', 15 * MIN).map(s => s.length)).toEqual([1, 2])
    expect(seriesSegments(pts, 'output', 15 * MIN).map(s => s.length)).toEqual([4])
  })

  it('breaks the line across a silence longer than the gap, instead of bridging it', () => {
    const pts = [pt(0), pt(5 * MIN), pt(5 * MIN + 3 * 60 * MIN), pt(5 * MIN + 3 * 60 * MIN + 5 * MIN)]
    expect(seriesSegments(pts, 'soc', maxGapMs(pts)).map(s => s.length)).toEqual([2, 2])
  })

  it('reads the gap off the reporting cadence, within 15–60 min', () => {
    const every = (step: number) => Array.from({ length: 10 }, (_, i) => pt(i * step))
    expect(maxGapMs(every(MIN))).toBe(15 * MIN)
    expect(maxGapMs(every(10 * MIN))).toBe(30 * MIN)
    expect(maxGapMs(every(60 * MIN))).toBe(60 * MIN)
    expect(maxGapMs([])).toBe(15 * MIN)
  })
})

describe('toIsoTz', () => {
  it('keeps the minus sign west of UTC (it used to send "…T00:00:0007:00" → 20101)', () => {
    const ms = new Date(2026, 8, 24, 0, 0, 0).getTime()
    expect(toIsoTz(ms)).toBe('2026-09-24T00:00:00-07:00')
    expect(new Date(toIsoTz(ms)).getTime()).toBe(ms)
  })
})

describe('readingAt / clockLabel — the Real-Time Power scrub (v4.18.0)', () => {
  const at = (h: number, m: number) => new Date(2026, 8, 24, h, m).getTime()
  const pt = (t: number, output: number | null) =>
    ({ time: new Date(t).toISOString(), timestamp: t, solar: null, output, soc: null, battery: null, ac: null })
  const pts = [pt(at(9, 0), 100), pt(at(9, 5), 140), pt(at(9, 10), null), pt(at(12, 0), 300)]
  const gap = 15 * 60_000

  it('reads the nearest sample on the line', () => {
    expect(readingAt(pts, 'output', at(9, 4), gap)).toEqual({ timestamp: at(9, 5), value: 140 })
  })

  it('finds nothing over a gap instead of borrowing a value hours away', () => {
    expect(readingAt(pts, 'output', at(10, 30), gap)).toBeNull()
    expect(readingAt(pts, 'solar', at(9, 0), gap)).toBeNull()
  })

  it('labels the time like the axis, with minutes', () => {
    expect(clockLabel(at(15, 45))).toBe('3:45pm')
    expect(clockLabel(at(0, 5))).toBe('12:05am')
    expect(clockLabel(at(12, 0))).toBe('12:00pm')
  })
})
