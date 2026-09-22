/**
 * SW-08 — the window/power maths shared by Sleep Mode and Smart Schedule.
 *
 * The two features drive one register through one engine, so the thing worth
 * pinning down is that each one asks it for the right numbers: Sleep Mode keeps
 * charging (quietly) outside its window, Smart Schedule must stop charging
 * entirely outside its window or the grid — not the battery — carries the peak.
 */
import { describe, it, expect } from 'vitest'
import {
  getPowers,
  sleepPowers,
  smartSchedulePowers,
  timeToMin,
  isInWindow,
  phaseFor,
  powerForPhase,
  MAX_MANUAL_CHARGE_W,
} from './chargeWindow'

describe('getPowers — per-model AC charge power', () => {
  it('Sierro 1000 (default): sleep 150W / wake 400W', () => {
    expect(getPowers('Sierro 1000')).toEqual({ sleepW: 150, wakeW: 400 })
    expect(getPowers('')).toEqual({ sleepW: 150, wakeW: 400 })
  })
  it('Sierro 2000: sleep 300W / wake 800W', () => {
    expect(getPowers('Sierro 2000')).toEqual({ sleepW: 300, wakeW: 800 })
  })
})

describe('sleepPowers — Sleep Mode keeps charging outside the window', () => {
  it('quiet inside, normal outside, normal on exit', () => {
    expect(sleepPowers('Sierro 1000')).toEqual({ inWindowW: 150, outWindowW: 400, restoreW: 400 })
    expect(sleepPowers('Sierro 2000')).toEqual({ inWindowW: 300, outWindowW: 800, restoreW: 800 })
  })
})

describe('smartSchedulePowers — Smart Schedule stops charging outside the window', () => {
  it('uses the typed rate inside and 0W outside', () => {
    expect(smartSchedulePowers('Sierro 1000', 500)).toEqual({
      inWindowW: 500, outWindowW: 0, restoreW: 400,
    })
  })

  it('restores the model default when switched off, never 0W', () => {
    expect(smartSchedulePowers('Sierro 2000', 500).restoreW).toBe(800)
  })

  it('clamps a hand-typed rate into the writable range', () => {
    expect(smartSchedulePowers('Sierro 1000', -50).inWindowW).toBe(0)
    expect(smartSchedulePowers('Sierro 1000', 99999).inWindowW).toBe(MAX_MANUAL_CHARGE_W)
    expect(smartSchedulePowers('Sierro 1000', 412.6).inWindowW).toBe(413)
  })

  it('falls back to the model rate when the field is empty/NaN', () => {
    expect(smartSchedulePowers('Sierro 1000', NaN).inWindowW).toBe(400)
  })
})

describe('timeToMin', () => {
  it('parses HH:MM and survives junk', () => {
    expect(timeToMin('00:00')).toBe(0)
    expect(timeToMin('23:59')).toBe(1439)
    expect(timeToMin('07:30')).toBe(450)
    expect(timeToMin('')).toBe(0)
    expect(timeToMin('nope')).toBe(0)
  })
})

describe('isInWindow', () => {
  it('half-open [from, to)', () => {
    expect(isInWindow(540, 540, 1020)).toBe(true)   // 09:00 in 09:00–17:00
    expect(isInWindow(1020, 540, 1020)).toBe(false) // 17:00 is the exit edge
  })
  it('handles the midnight wrap (23:00 → 07:00)', () => {
    expect(isInWindow(1400, 1380, 420)).toBe(true)  // 23:20
    expect(isInWindow(60, 1380, 420)).toBe(true)    // 01:00
    expect(isInWindow(600, 1380, 420)).toBe(false)  // 10:00
  })
  it('an empty window is never inside', () => {
    expect(isInWindow(600, 600, 600)).toBe(false)
  })
})

describe('phaseFor / powerForPhase', () => {
  const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m, 0, 0)

  it('inside the off-peak window charges at the typed rate', () => {
    const powers = smartSchedulePowers('Sierro 1000', 500)
    expect(phaseFor('23:00', '07:00', at(2))).toBe('sleep')
    expect(powerForPhase(powers, phaseFor('23:00', '07:00', at(2)))).toBe(500)
  })

  it('during peak hours it draws nothing from the grid', () => {
    const powers = smartSchedulePowers('Sierro 1000', 500)
    expect(phaseFor('23:00', '07:00', at(18))).toBe('wake')
    expect(powerForPhase(powers, phaseFor('23:00', '07:00', at(18)))).toBe(0)
  })
})
