import { describe, it, expect } from 'vitest'
import { powerSwitchOn, POWER_COMMAND_SETTLE_MS } from './powerSwitchState'

const NOW = 1_700_000_000_000

describe('powerSwitchOn', () => {
  it('shows what the device reports, not what we last asked for', () => {
    // The button on the front of the unit turned the output off. The app must
    // follow the hardware.
    expect(powerSwitchOn({ reported: false, now: NOW })).toBe(false)
    expect(powerSwitchOn({ reported: true, now: NOW })).toBe(true)
  })

  it('never reads the online flag as the output state when a reading exists', () => {
    expect(powerSwitchOn({ reported: false, online: true, now: NOW })).toBe(false)
  })

  it('holds what we asked for until the device catches up', () => {
    const pending = { value: false, at: NOW }
    expect(powerSwitchOn({ reported: true, pending, now: NOW + 1000 })).toBe(false)
  })

  it('hands back to the device the moment it agrees', () => {
    const pending = { value: false, at: NOW }
    expect(powerSwitchOn({ reported: false, pending, now: NOW + 1000 })).toBe(false)
    // and keeps following it afterwards
    expect(powerSwitchOn({ reported: true, pending, now: NOW + POWER_COMMAND_SETTLE_MS + 1 })).toBe(true)
  })

  it('stops holding a command the hardware plainly ignored', () => {
    const pending = { value: false, at: NOW }
    expect(powerSwitchOn({ reported: true, pending, now: NOW + POWER_COMMAND_SETTLE_MS + 1 })).toBe(true)
  })

  it('falls back to our own command when the device reports nothing', () => {
    expect(powerSwitchOn({ reported: null, pending: { value: false, at: NOW }, online: true, now: NOW + 1e6 }))
      .toBe(false)
  })

  it('falls back to the online flag only when there is nothing else at all', () => {
    expect(powerSwitchOn({ reported: null, online: false, now: NOW })).toBe(false)
    expect(powerSwitchOn({ reported: null, online: true, now: NOW })).toBe(true)
    expect(powerSwitchOn({ reported: null, now: NOW })).toBe(true)
  })
})
