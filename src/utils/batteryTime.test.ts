import { describe, it, expect } from 'vitest'
import { batteryTimeLabel, formatDuration } from './batteryTime'

describe('formatDuration', () => {
  it('formats minutes as XhYm and clamps negatives', () => {
    expect(formatDuration(0)).toBe('0h0m')
    expect(formatDuration(84)).toBe('1h24m')
    expect(formatDuration(-10)).toBe('0h0m')
  })
})

describe('batteryTimeLabel', () => {
  it('charging: net positive → "to full" using real capacity', () => {
    // 1000 Wh, 50% → need 500 Wh at 500 W net → 60 min
    expect(batteryTimeLabel({ acPower: 500, solarPower: 0, outputPower: 0, soc: 50, capacityWh: 1000 }))
      .toBe('1h0m to full')
  })
  it('discharging: net negative → "remaining"', () => {
    // 1000 Wh, 50% → 500 Wh left at 500 W draw → 60 min
    expect(batteryTimeLabel({ acPower: 0, solarPower: 0, outputPower: 500, soc: 50, capacityWh: 1000 }))
      .toBe('1h0m remaining')
  })
  it('uses the 1000Wh default when capacity is absent (bug guard: was 5000)', () => {
    // default 1000 Wh, 100%→0 need? charging from 0%: need 1000 Wh at 1000 W → 60m
    expect(batteryTimeLabel({ acPower: 1000, solarPower: 0, outputPower: 0, soc: 0 }))
      .toBe('1h0m to full')
  })
  it('idle + charging flag → "Charging"', () => {
    expect(batteryTimeLabel({ acPower: 0, solarPower: 0, outputPower: 0, soc: 50, isCharging: true }))
      .toBe('Charging')
  })
  it('idle, no flow → "--"', () => {
    expect(batteryTimeLabel({ acPower: 0, solarPower: 0, outputPower: 0, soc: 50 })).toBe('--')
  })
  it('net = AC + Solar − Output', () => {
    // AC100 + Solar30 − Output420 = −290 W draw, discharging
    expect(batteryTimeLabel({ acPower: 100, solarPower: 30, outputPower: 420, soc: 75, capacityWh: 1000 }))
      .toMatch(/remaining$/)
  })
})
