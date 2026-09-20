import { describe, it, expect } from 'vitest'
import { isApiSuccess, isAuthExpired, SESSION_EXPIRED_MESSAGE } from './apiClient'

describe('isApiSuccess', () => {
  it('accepts numeric 0 and string "0"', () => {
    expect(isApiSuccess(0)).toBe(true)
    expect(isApiSuccess('0')).toBe(true)
  })
  it('rejects everything else', () => {
    expect(isApiSuccess(1)).toBe(false)
    expect(isApiSuccess('1')).toBe(false)
    expect(isApiSuccess(200)).toBe(false)   // 200 is NOT a business-success code here
    expect(isApiSuccess('success')).toBe(false)
    expect(isApiSuccess(undefined)).toBe(false)
    expect(isApiSuccess(null)).toBe(false)
  })
})

describe('isAuthExpired', () => {
  it('knows the codes', () => {
    for (const code of [401, '401', 1001, '1001', 1002, '1002']) {
      expect(isAuthExpired(code)).toBe(true)
    }
  })

  it('knows the wording endpoints use instead of a code', () => {
    // /peakValley/device/enable answered this one, and it reached the user as
    // the reason Smart Schedule would not turn on.
    expect(isAuthExpired(500, 'Token missing')).toBe(true)
    expect(isAuthExpired(500, 'token is expired')).toBe(true)
    expect(isAuthExpired(500, 'Invalid token')).toBe(true)
    expect(isAuthExpired(500, '登录已过期')).toBe(true)
    expect(isAuthExpired(500, '未登录')).toBe(true)
  })

  it('does not read an ordinary failure as an expired session', () => {
    expect(isAuthExpired(20101, 'illegal argument')).toBe(false)
    expect(isAuthExpired(1, 'device offline')).toBe(false)
    expect(isAuthExpired(0)).toBe(false)
  })

  it('tells the user about signing in, not about a token', () => {
    expect(SESSION_EXPIRED_MESSAGE).toMatch(/sign in/i)
    expect(SESSION_EXPIRED_MESSAGE).not.toMatch(/token/i)
  })
})
