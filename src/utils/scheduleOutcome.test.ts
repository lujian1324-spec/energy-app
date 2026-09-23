/**
 * SW-12 项 3 — a relay refusal must not hide behind a clean device write.
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

  it('warns when the charge power landed but the relay refused the window', () => {
    const n = backgroundScheduleNotice({ ...base, relayAccepted: false, relayDetail: 'relay HTTP 500' })
    expect(n?.severity).toBe('warning')
    expect(n?.message).toMatch(/only switch while the app is open/i)
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
  })

  it('a clean disable says nothing', () => {
    expect(backgroundScheduleNotice({ ...base, enabling: false })).toBeNull()
  })
})
