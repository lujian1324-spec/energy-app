/**
 * The Device card's AC switch: decided from what the device reported, never from
 * whether it is online (APP-20260922-001/002/003, APP-20260923-003).
 */
import { describe, it, expect } from 'vitest'
import { resolveAcOutput, commandSuperseded, newestAcSample, CLOUD_CLOCK_SKEW_MS } from './acOutputState'

const T = 1_000_000

describe('resolveAcOutput', () => {
  it('an online device with nothing reported shows OFF, not ON (the old isOnline fallback)', () => {
    expect(resolveAcOutput({ connected: true })).toEqual({ on: false, known: false, pending: false })
  })

  it('an offline device shows OFF even if the last report said ON', () => {
    const v = resolveAcOutput({ connected: false, cloud: { on: true, at: T }, live: { on: true, at: T } })
    expect(v.on).toBe(false)
  })

  it('shows what the device reported', () => {
    expect(resolveAcOutput({ connected: true, cloud: { on: true, at: T } }).on).toBe(true)
    expect(resolveAcOutput({ connected: true, cloud: { on: false, at: T } }).on).toBe(false)
  })

  it('the newest report wins; live beats cloud on a tie or an unknown cloud time', () => {
    expect(resolveAcOutput({ connected: true, cloud: { on: true, at: T }, live: { on: false, at: T + 1 } }).on).toBe(false)
    expect(resolveAcOutput({ connected: true, cloud: { on: true, at: T + CLOUD_CLOCK_SKEW_MS + 5 }, live: { on: false, at: T } }).on).toBe(true)
    expect(resolveAcOutput({ connected: true, cloud: { on: true, at: T }, live: { on: false, at: T } }).on).toBe(false)
    expect(resolveAcOutput({ connected: true, cloud: { on: true }, live: { on: false, at: T } }).on).toBe(false)
  })

  it('a cloud sample only beats a live read when newer by more than the clock-skew allowance', () => {
    // Phone clock 10 s behind the backend: a cloud report taken BEFORE the switch
    // carries a later-looking time than the read-back that followed it.
    const v = resolveAcOutput({ connected: true, cloud: { on: true, at: T + 10_000 }, live: { on: false, at: T } })
    expect(v.on).toBe(false)
  })

  it('a cloud sample supersedes a sent command only when clearly newer', () => {
    const cmd = { on: false, at: T, status: 'sent' as const }
    expect(resolveAcOutput({ connected: true, cloud: { on: true, at: T + 10_000 }, command: cmd }).on).toBe(false)
    expect(resolveAcOutput({ connected: true, cloud: { on: true, at: T + CLOUD_CLOCK_SKEW_MS + 1 }, command: cmd }).on).toBe(true)
  })

  it('a command in flight shows its target and is pending', () => {
    const v = resolveAcOutput({ connected: true, live: { on: true, at: T }, command: { on: false, at: T + 1, status: 'sending' } })
    expect(v).toEqual({ on: false, known: true, pending: true })
  })

  it('a sent command holds against a stale cloud sample — no bounce back to ON', () => {
    // User turned it off at T+10; the cloud still carries a report from T.
    const v = resolveAcOutput({ connected: true, cloud: { on: true, at: T }, command: { on: false, at: T + 10, status: 'sent' } })
    expect(v.on).toBe(false)
  })

  it('once the device reports after the command, the device is right, whichever way', () => {
    const cmd = { on: false, at: T + 10, status: 'sent' as const }
    expect(resolveAcOutput({ connected: true, live: { on: true, at: T + 20 }, command: cmd }).on).toBe(true)
    expect(resolveAcOutput({ connected: true, live: { on: false, at: T + 20 }, command: cmd }).on).toBe(false)
  })

  it('another phone switching the outlets shows up from the device reports alone', () => {
    // No command on this phone; the device's newer sample says OFF.
    const v = resolveAcOutput({ connected: true, cloud: { on: true, at: T }, live: { on: false, at: T + 60_000 } })
    expect(v.on).toBe(false)
  })
})

describe('commandSuperseded', () => {
  const cmd = { on: false, at: T + 10, status: 'sent' as const }
  it('only once a device sample is newer than the command', () => {
    expect(commandSuperseded(cmd, { connected: true, cloud: { on: true, at: T } })).toBe(false)
    expect(commandSuperseded(cmd, { connected: true, live: { on: false, at: T + 11 } })).toBe(true)
  })
  it('never for a command still sending, or no command', () => {
    expect(commandSuperseded({ ...cmd, status: 'sending' }, { connected: true, live: { on: false, at: T + 99 } })).toBe(false)
    expect(commandSuperseded(null, { connected: true, live: { on: false, at: T + 99 } })).toBe(false)
  })
})

describe('newestAcSample', () => {
  it('returns whichever exists, or null', () => {
    expect(newestAcSample(null, null)).toBeNull()
    expect(newestAcSample({ on: true, at: 1 }, null)).toEqual({ on: true, at: 1 })
    expect(newestAcSample(null, { on: false })).toEqual({ on: false })
  })
})
