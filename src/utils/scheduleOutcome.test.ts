/**
 * Shared toast policy for saving and stopping background schedules.
 */
import { describe, it, expect } from 'vitest'
import { backgroundScheduleNotice } from './scheduleOutcome'

const base = {
  enabling: true,
  instantPowerApplied: true,
  relayConfigured: true,
  relayAccepted: true,
}

describe('AC-12-7 — instant power and background schedule are reported apart', () => {
  it('says nothing when the device and the relay both took it', () => {
    expect(backgroundScheduleNotice(base)).toBeNull()
  })

  it('keeps the background-save warning silent after the charge power was accepted', () => {
    const n = backgroundScheduleNotice({ ...base, relayAccepted: false, relayDetail: 'relay HTTP 500' })
    expect(n).toBeNull()
  })

  it('stays quiet in a build with no relay — client-side timing is the design there', () => {
    expect(backgroundScheduleNotice({ ...base, relayConfigured: false, relayAccepted: false })).toBeNull()
  })

  it('adds nothing when the save itself failed — that error is the message', () => {
    expect(backgroundScheduleNotice({
      ...base, instantPowerApplied: false, relayAccepted: false,
    })).toBeNull()
  })
})

describe('AC-12-8 — turning a schedule off with the relay down', () => {
  it('tells the user the old background schedule may still fire', () => {
    const n = backgroundScheduleNotice({
      ...base, enabling: false, relayAccepted: false, relayDetail: 'network down',
    })
    expect(n?.title).toMatch(/may still run/i)
    expect(n?.message).toMatch(/may still switch this device/i)
    expect(n?.message).toContain('network down')
  })

  it('a clean disable says nothing', () => {
    expect(backgroundScheduleNotice({ ...base, enabling: false })).toBeNull()
  })
})

describe('backgroundScheduleNotice — SW-15 relay detail (AC-15-2)', () => {
  const stop = {
    enabling: false,
    instantPowerApplied: true,
    relayConfigured: true,
    relayAccepted: false,
  }

  it('drops a relay refusal that is raw exception text', () => {
    const n = backgroundScheduleNotice({
      ...stop,
      relayDetail: 'java.lang.IllegalArgumentException: deviceId',
    })
    expect(n?.message).not.toContain('IllegalArgument')
    expect(n?.message).not.toContain('java.lang')
    // The warning itself still fires; only the reason is withheld.
    expect(n?.title).toBe('Background schedule may still run')
  })

  it('drops the SW-11 config wording too', () => {
    const n = backgroundScheduleNotice({ ...stop, relayDetail: 'config attribute not exist' })
    expect(n?.message).not.toContain('config attribute')
  })
})

