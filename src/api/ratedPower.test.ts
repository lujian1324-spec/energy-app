/** A record's `ratedPower` in watts (v4.24.1): kW on the platform, watts on records bound before that. */
import { describe, it, expect } from 'vitest'
import { ratedPowerKw, ratedPowerWatts } from './deviceApi'

describe('ratedPowerWatts', () => {
  it('reads the platform\'s kW as watts', () => {
    expect(ratedPowerWatts(0.5)).toBe(500)
    expect(ratedPowerWatts(1)).toBe(1000)
    expect(ratedPowerWatts(ratedPowerKw(500))).toBe(500)
  })
  it('keeps a value already in watts (records bound before the kW fix)', () => {
    expect(ratedPowerWatts(500)).toBe(500)
    expect(ratedPowerWatts(1000)).toBe(1000)
  })
  it('has no answer for nothing', () => {
    for (const v of [undefined, null, 0, -1, Number.NaN]) expect(ratedPowerWatts(v)).toBeNull()
  })
})
