/**
 * Insights energy maths (APP-20260923-006/007/008/009).
 */
import { describe, it, expect } from 'vitest'
import { buildInsightsFrame, formatWh, powerField, sampleHoldCapMs, MIN_SAMPLE_HOLD_MS, MAX_SAMPLE_HOLD_MS, bucketAtX, axisLabelIndexes } from './insightsFrame'
import type { DeviceAttributeRecord } from '../api/deviceApi'

const rec = (iso: string, f: { solar?: number; ac?: number; out?: number }): DeviceAttributeRecord => ({
  time: iso,
  fields: {
    ...(f.solar !== undefined ? { generationPower: { value: String(f.solar) } } : {}),
    ...(f.ac !== undefined ? { exchangeChargingPower: { value: String(f.ac) } } : {}),
    ...(f.out !== undefined ? { outputPower: { value: String(f.out) } } : {}),
  },
})

/** Local-time ISO for 2026-09-{day} {h}:{m}. */
const at = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m).toISOString()

// Week of Mon 2026-09-21 .. Sun 2026-09-27.
const WEEK_OF = new Date(2026, 8, 23)

describe('energy, not power (0923-007)', () => {
  it('integrates power over time: 600 W for one hour is 600 Wh, not a mean times 24 h', () => {
    // Samples every 15 min from 10:00 to 11:00; the 11:00 sample closes the hour.
    const r = [0, 15, 30, 45].map(m => rec(at(22, 10, m), { out: 600 })).concat(rec(at(22, 11), { out: 0 }))
    const f = buildInsightsFrame(r, 'Week', WEEK_OF)
    expect(f.outputWh[1]).toBe(600) // Tue 9/22
    // The old code: mean(600,600,600,600,0)=480 W × 24 h = 11,520 "Wh".
  })

  it('does not credit a device for the hours it went quiet', () => {
    // Reports every 5 min 07:00-08:00 at 0 W, then 1000 W at 08:00 and silence until 14:00.
    const r = Array.from({ length: 12 }, (_, i) => rec(at(22, 7, i * 5), { out: 0 }))
      .concat(rec(at(22, 8), { out: 1000 }), rec(at(22, 14), { out: 0 }))
    const f = buildInsightsFrame(r, 'Week', WEEK_OF)
    // 5-min cadence → cap 15 min: 1000 W × 0.25 h, not × 6 h.
    expect(f.outputWh[1]).toBe(250)
  })

  it('adapts the hold to the device cadence, within bounds', () => {
    expect(sampleHoldCapMs(5 * 60_000)).toBe(MIN_SAMPLE_HOLD_MS)       // 15 min
    expect(sampleHoldCapMs(15 * 60_000)).toBe(45 * 60_000)             // 3 × 15 min
    expect(sampleHoldCapMs(30 * 60_000)).toBe(MAX_SAMPLE_HOLD_MS)      // 60 min cap
    // A device reporting every 30 min is credited in full, not halved.
    const r = [0, 30, 60, 90].map(m => rec(at(22, 10, m), { out: 400 })).concat(rec(at(22, 12), { out: 0 }))
    expect(buildInsightsFrame(r, 'Week', WEEK_OF).outputWh[1]).toBe(800)
  })

  it('formats totals in Wh', () => {
    expect(formatWh(1234.4)).toBe('1,234 Wh')
  })
})

describe('input split into Solar and AC (0923-008)', () => {
  it('counts AC charging — a grid-charged day no longer reads In 0', () => {
    const r = [rec(at(24, 1), { ac: 400, solar: 0 }), rec(at(24, 2), { ac: 0, solar: 0 })]
    const f = buildInsightsFrame(r, 'Week', WEEK_OF)
    expect(f.acWh[3]).toBe(400)
    expect(f.solarWh[3]).toBe(0)
    expect(f.inputWh[3]).toBe(400)
  })

  it('input is exactly solar + AC', () => {
    const r = [rec(at(25, 12), { ac: 200, solar: 300 }), rec(at(25, 13), { ac: 0, solar: 0 })]
    const f = buildInsightsFrame(r, 'Week', WEEK_OF)
    expect(f.inputWh[4]).toBe((f.solarWh[4] ?? 0) + (f.acWh[4] ?? 0))
    expect([f.solarWh[4], f.acWh[4]]).toEqual([300, 200])
  })

  it('CO2 counts solar only, not grid charging', () => {
    const r = [rec(at(25, 12), { ac: 2000, solar: 1000 }), rec(at(25, 13), {})]
    const f = buildInsightsFrame(r, 'Week', WEEK_OF)
    expect(f.totalSolarKwh).toBe(1)
    expect(f.co2Kg).toBe(0.5)
  })
})

describe('gaps stay gaps (0923-006 / 0923-009)', () => {
  it('a day with no samples is null, not 0 — nor is a future day', () => {
    const f = buildInsightsFrame([rec(at(22, 10), { out: 100 }), rec(at(22, 11), { out: 0 })], 'Week', WEEK_OF)
    expect(f.outputWh[0]).toBeNull() // Mon, nothing recorded
    expect(f.outputWh[6]).toBeNull() // Sun, in the future
    expect(f.outputWh[1]).not.toBeNull()
  })

  it('the same day totals the same in Week and Month views', () => {
    const r = [8, 9, 10, 11, 12].map(h => rec(at(22, h), { solar: 250, out: 180 }))
    const week = buildInsightsFrame(r, 'Week', WEEK_OF)
    const month = buildInsightsFrame(r, 'Month', WEEK_OF)
    expect(week.outputWh[1]).toBe(month.outputWh[21]) // 9/22
    expect(week.inputWh[1]).toBe(month.inputWh[21])
    expect(month.labels[21]).toBe('9/22')
  })

  it('names the scope of the peak (this week / this month)', () => {
    const r = [rec(at(22, 10), { out: 100 }), rec(at(22, 11), { out: 0 })]
    expect(buildInsightsFrame(r, 'Week', WEEK_OF).insight).toBe('Highest daily output this week: 9/22')
    expect(buildInsightsFrame(r, 'Month', WEEK_OF).insight).toBe('Highest daily output this month: 9/22')
  })
})

describe('powerField', () => {
  it('drops impossible sentinel readings instead of counting 65534 W', () => {
    expect(powerField(rec(at(22, 1), { out: 65534 }), 'outputPower')).toBeNull()
    expect(powerField(rec(at(22, 1), {}), 'outputPower')).toBeNull()
    expect(powerField(rec(at(22, 1), { out: 120 }), 'outputPower')).toBe(120)
  })
})

describe('chart x mapping (v4.21.1)', () => {
  it('a tap picks the point drawn nearest to it, across the whole width', () => {
    // 24 hourly points spread over 4..396 on a 400-wide chart (16.96 apart).
    expect(bucketAtX(4, 400, 4, 24)).toBe(0)
    expect(bucketAtX(396, 400, 4, 24)).toBe(23)
    const x9 = 4 + (9 / 23) * 392
    expect(bucketAtX(x9, 400, 4, 24)).toBe(9)
    expect(bucketAtX(x9 + 8, 400, 4, 24)).toBe(9)
    expect(bucketAtX(x9 + 9, 400, 4, 24)).toBe(10)
    // Off the ends clamps to the first / last point.
    expect(bucketAtX(-20, 400, 4, 24)).toBe(0)
    expect(bucketAtX(999, 400, 4, 24)).toBe(23)
    expect(bucketAtX(200, 400, 4, 1)).toBe(0)
  })

  it('labels about six buckets, the first one included', () => {
    expect(axisLabelIndexes(24)).toEqual([0, 4, 8, 12, 16, 20])
    expect(axisLabelIndexes(7)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(axisLabelIndexes(30)).toEqual([0, 5, 10, 15, 20, 25])
  })
})

