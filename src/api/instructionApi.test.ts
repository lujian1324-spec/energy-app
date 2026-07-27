import { describe, it, expect } from 'vitest'
import {
  buildSleepWindowInstruction,
  sleepInstructionName,
  CHARGE_POWER_KEY,
  INSTRUCTION_TRIGGER_TIMED,
  INSTRUCTION_REPEAT_DAILY,
} from './instructionApi'

/**
 * Pure-logic coverage for the cloud Sleep-instruction builders. The live schema
 * (triggerMode/repeatMode/action key) was verified against the real backend; these
 * tests lock the KNOWN-correct parts so they can't silently drift:
 *  - per-model sleep watts (reused from getPowers: S1000 150, S2000 300),
 *  - the timed + daily encoding,
 *  - HH:mm window passthrough, deviceId always stringified, action = charge-power key.
 * (The end-to-end window semantics remain manufacturer-gated/unverified — see
 * instructionApi.ts header — so they are intentionally NOT asserted here.)
 */
describe('buildSleepWindowInstruction', () => {
  it('encodes a daily TIMED window with the Sierro 1000 sleep power (150W)', () => {
    const vijo = buildSleepWindowInstruction('500154243766779904', 'Sierro 1000', '22:00', '09:00')
    expect(vijo.deviceId).toBe('500154243766779904')
    expect(vijo.name).toBe('sierro-sleep-500154243766779904')
    expect(vijo.triggerMode).toBe(INSTRUCTION_TRIGGER_TIMED)
    expect(vijo.repeatMode).toEqual({ mode: INSTRUCTION_REPEAT_DAILY, modeData: [] })
    expect(vijo.startTime).toBe('22:00')
    expect(vijo.endTime).toBe('09:00')
    expect(vijo.actions).toEqual([{ key: CHARGE_POWER_KEY, value: '150' }])
  })

  it('uses the Sierro 2000 sleep power (300W)', () => {
    const vijo = buildSleepWindowInstruction('42', 'Sierro 2000', '23:30', '07:15')
    expect(vijo.actions).toEqual([{ key: 'ratedACChargingPower', value: '300' }])
    expect(vijo.startTime).toBe('23:30')
    expect(vijo.endTime).toBe('07:15')
  })

  it('defaults unknown models to Sierro 1000 (150W) and stringifies a numeric deviceId', () => {
    const vijo = buildSleepWindowInstruction(12345 as unknown as string, 'Mystery', '00:00', '06:00')
    expect(vijo.deviceId).toBe('12345')
    expect(typeof vijo.deviceId).toBe('string')
    expect(vijo.actions?.[0].value).toBe('150')
  })

  it('action value is always a string (backend expects string values)', () => {
    const vijo = buildSleepWindowInstruction('1', 'Sierro 2000', '22:00', '09:00')
    expect(typeof vijo.actions?.[0].value).toBe('string')
  })
})

describe('sleepInstructionName', () => {
  it('is deterministic per device (so upsert can find/replace it)', () => {
    expect(sleepInstructionName('abc')).toBe('sierro-sleep-abc')
    expect(sleepInstructionName('abc')).toBe(sleepInstructionName('abc'))
  })
})
