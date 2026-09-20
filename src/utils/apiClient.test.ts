import { describe, it, expect } from 'vitest'
import { isApiSuccess, saysNothingAboutTheSession, SESSION_SAFE_PATHS } from './apiClient'

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

describe('saysNothingAboutTheSession', () => {
  it('covers every /peakValley/ endpoint Smart Schedule calls', () => {
    // These answer a perfectly good session with a token timeout. Acting on it
    // signed the user out of an account that was never signed out.
    for (const path of [
      '/peakValley/device/enable',
      '/peakValley/device/get?deviceId=491513787113766912',
      '/peakValley/device/general/get?deviceId=1',
      '/peakValley/device/general/set',
      '/peakValley/device/customized/set',
      '/peakValley/types/all',
    ]) {
      expect(saysNothingAboutTheSession(path)).toBe(true)
    }
  })

  it('leaves every other endpoint able to end a session', () => {
    for (const path of [
      '/remote/device/state/latest?deviceId=1',
      '/user/select/iotUserInfo',
      '/device/list',
      '/login/refresh/access/token',
      '/remote/device/passthrough',
    ]) {
      expect(saysNothingAboutTheSession(path)).toBe(false)
    }
  })

  it('does not match a path that merely contains the prefix later on', () => {
    expect(saysNothingAboutTheSession('/remote/peakValley/device/enable')).toBe(false)
  })

  it('exempts by prefix only, so the list stays auditable', () => {
    expect(SESSION_SAFE_PATHS).toEqual(['/peakValley/'])
  })
})
