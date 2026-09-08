/**
 * A session that has expired must be recognised however the backend says so —
 * /remote/device/passthrough answers with a code outside AUTH_EXPIRED_CODES and
 * only the message tells you, which is why toggling a device's power surfaced a
 * raw "Token expired" instead of refreshing and retrying.
 */
import { describe, it, expect } from 'vitest'

const AUTH_EXPIRED_CODES = new Set([401, '401', 1001, '1001', 1002, '1002'])
const AUTH_EXPIRED_TEXT = /token\s*(is\s*)?(expired|invalid|missing)|expired\s*token|invalid\s*token|not\s*logged\s*in|登录\s*(已)?(过期|失效)|令牌\s*(过期|失效|无效)|未登录/i
const isAuthExpired = (code: number | string, message?: string | null) =>
  AUTH_EXPIRED_CODES.has(code) || (!!message && AUTH_EXPIRED_TEXT.test(message))

describe('isAuthExpired', () => {
  it('still matches the documented codes', () => {
    for (const c of [401, '401', 1001, '1001', 1002, '1002']) {
      expect(isAuthExpired(c)).toBe(true)
    }
  })

  it('matches an expiry that only shows up in the message', () => {
    for (const m of ['Token expired', 'token is expired', 'Invalid token',
                     'TOKEN EXPIRED', 'Not logged in', '登录已过期', '令牌失效', '未登录']) {
      expect(isAuthExpired(5, m)).toBe(true)
    }
  })

  it('leaves ordinary failures alone', () => {
    for (const m of ['Device offline', 'Illegal argument', 'Power command rejected',
                     'This device is already added to another account.', '设备离线']) {
      expect(isAuthExpired(5, m)).toBe(false)
    }
    expect(isAuthExpired(0)).toBe(false)
    expect(isAuthExpired(5, null)).toBe(false)
    expect(isAuthExpired(5, undefined)).toBe(false)
  })
})
