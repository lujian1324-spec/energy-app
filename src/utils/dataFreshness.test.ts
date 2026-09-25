import { describe, it, expect } from 'vitest'
import { STALE_DATA_MS, connectedLabel } from './dataFreshness'

describe('monitor header status (v4.21.1)', () => {
  const now = new Date('2026-09-24T15:00:00').getTime()
  it('says Connected while readings are current, or when nothing says otherwise', () => {
    expect(connectedLabel(now - 60_000, now)).toBe('Connected')
    expect(connectedLabel(now - STALE_DATA_MS, now)).toBe('Connected')
    expect(connectedLabel(null, now)).toBe('Connected')
  })
  it('says when the last reading was taken once they stop arriving', () => {
    expect(connectedLabel(new Date('2026-09-24T14:12:00').getTime(), now)).toBe('Last update 2:12pm')
    expect(connectedLabel(new Date('2026-09-23T22:05:00').getTime(), now)).toBe('Last update Sep 23, 10:05pm')
  })
})
