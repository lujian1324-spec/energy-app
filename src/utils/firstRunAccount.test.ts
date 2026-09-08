import { describe, it, expect } from 'vitest'
import { isFirstRunAccount } from './firstRunAccount'

describe('isFirstRunAccount', () => {
  it('says yes when the account logs in moments after it was created', () => {
    expect(isFirstRunAccount({
      createdAt: '2026-09-08 10:00:00',
      lastLoginTime: '2026-09-08 10:00:04',
    })).toBe(true)
  })

  it('says no for an account anyone has used before', () => {
    expect(isFirstRunAccount({
      createdAt: '2026-06-01 09:12:00',
      lastLoginTime: '2026-09-08 10:00:00',
    })).toBe(false)
  })

  it('says yes when there is no login on record yet', () => {
    expect(isFirstRunAccount({ createdAt: '2026-09-08 10:00:00' })).toBe(true)
    expect(isFirstRunAccount({ createdAt: '2026-09-08 10:00:00', lastLoginTime: null })).toBe(true)
  })

  it('is unaffected by how the zone-less stamps are interpreted', () => {
    // Both fields go through the same parse, so any offset cancels. The same
    // pair with a Z, or with an offset, must give the same answer.
    expect(isFirstRunAccount({
      createdAt: '2026-09-08T10:00:00Z',
      lastLoginTime: '2026-09-08T10:00:04Z',
    })).toBe(true)
    expect(isFirstRunAccount({
      createdAt: '2026-09-08T10:00:00+08:00',
      lastLoginTime: '2026-09-08T10:00:04+08:00',
    })).toBe(true)
  })

  it('falls back to no when createdAt is missing or unusable', () => {
    expect(isFirstRunAccount(null)).toBe(false)
    expect(isFirstRunAccount(undefined)).toBe(false)
    expect(isFirstRunAccount({})).toBe(false)
    expect(isFirstRunAccount({ createdAt: '' })).toBe(false)
    expect(isFirstRunAccount({ createdAt: 'not a date' })).toBe(false)
  })

  it('accepts epoch milliseconds too', () => {
    const t = Date.parse('2026-09-08T10:00:00Z')
    expect(isFirstRunAccount({ createdAt: t, lastLoginTime: t + 3000 })).toBe(true)
    expect(isFirstRunAccount({ createdAt: t, lastLoginTime: t + 864e5 })).toBe(false)
  })
})
