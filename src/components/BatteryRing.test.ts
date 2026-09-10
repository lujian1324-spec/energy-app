/**
 * The bands on the Battery Ring sheet, and the one rule that is easy to undo by
 * accident: the colour follows the level, never the charging state. Charging is
 * shown by the bolt at the top of the ring, so painting a nearly flat battery
 * teal because it happens to be charging hides exactly what the colour is for.
 */
import { describe, it, expect } from 'vitest'
import { getBatteryState } from './BatteryRing'

const RED = ['low', 'critical']

describe('getBatteryState', () => {
  it('1-19% is the red band', () => {
    for (const p of [1, 5, 13, 19]) expect(RED).toContain(getBatteryState(p))
  })

  it('20-59% is the orange band', () => {
    for (const p of [20, 42, 59]) expect(getBatteryState(p)).toBe('warning')
  })

  it('60-99% is the teal band', () => {
    for (const p of [60, 75, 99]) expect(getBatteryState(p)).toBe('normal')
  })

  it('100% is full', () => {
    expect(getBatteryState(100)).toBe('full')
  })

  it('gives the same answer charging or not, at every level', () => {
    for (const p of [1, 13, 19, 20, 42, 59, 60, 75, 99, 100]) {
      expect(getBatteryState(p, true), `charging changed the colour at ${p}%`)
        .toBe(getBatteryState(p, false))
      expect(getBatteryState(p, false, true), `plugged changed the colour at ${p}%`)
        .toBe(getBatteryState(p, false, false))
    }
  })

  it('the boundaries land on the right side', () => {
    expect(RED).toContain(getBatteryState(19))
    expect(getBatteryState(20)).toBe('warning')
    expect(getBatteryState(59)).toBe('warning')
    expect(getBatteryState(60)).toBe('normal')
    expect(getBatteryState(99)).toBe('normal')
    expect(getBatteryState(100)).toBe('full')
  })
})
