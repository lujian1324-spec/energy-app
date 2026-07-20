/**
 * 全接口契约测试 —— mock 传输层,逐个调用每个 API 函数,断言它生成的
 * 端点(method+path)、payload 与 CLAUDE.md 记录的字段约定。
 * 不连真实后端(沙箱不可达),但把"接口契约"固化,防止静默回归。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// 共享的调用记录(vi.hoisted 保证在 vi.mock 工厂里可用)
const h = vi.hoisted(() => {
  const calls: { method: string; path: string; body?: any }[] = []
  const mk = (method: string) => (path: string, body?: any) => {
    calls.push({ method, path, body })
    return Promise.resolve({ code: 0, data: {} })
  }
  return {
    calls,
    api: { get: mk('get'), post: mk('post'), postSkipAuth: mk('postSkipAuth') },
    tokenStore: {
      get: () => 'ACCESS', set: () => {}, setRefresh: () => {},
      getRefresh: () => 'REFRESH', clear: () => {},
    },
  }
})

vi.mock('../utils/apiClient', () => ({
  api: h.api,
  tokenStore: h.tokenStore,
  isApiSuccess: (c: unknown) => c === 0 || c === '0',
}))

// node 环境无 localStorage —— 提供最小 stub(logout / webpush getUserId 需要)
const store: Record<string, string> = { iot_user_id: '9999' }
;(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
}

import * as auth from './authApi'
import * as dev from './deviceApi'
import * as push from './webPushApi'
import { md5Password, normalizeCountryCode } from './authApi'

const last = () => h.calls[h.calls.length - 1]
const only = () => { expect(h.calls.length).toBe(1); return h.calls[0] }
beforeEach(() => {
  h.calls.length = 0
  // 复位 localStorage(logout() 会清 iot_user_id,避免污染后续用例)
  for (const k of Object.keys(store)) delete store[k]
  store.iot_user_id = '9999'
})

// ─────────────────────────────────────────────────────────────
// 工具函数约定
// ─────────────────────────────────────────────────────────────
describe('helpers', () => {
  it('md5Password → 32-hex, not plaintext', () => {
    const m = md5Password('secret123')
    expect(m).toMatch(/^[a-f0-9]{32}$/)
    expect(m).not.toBe('secret123')
  })
  it('normalizeCountryCode strips leading +', () => {
    expect(normalizeCountryCode('+1')).toBe('1')
    expect(normalizeCountryCode('86')).toBe('86')
  })
})

// ─────────────────────────────────────────────────────────────
// Auth 接口
// ─────────────────────────────────────────────────────────────
describe('authApi contracts', () => {
  it('loginByAccount → POST(skipAuth) /login/account, password md5 (+ mints poller session)', async () => {
    await auth.loginByAccount('benson', 'pw123')
    const c = h.calls[0]
    expect([c.method, c.path]).toEqual(['postSkipAuth', '/login/account'])
    expect(c.body.account).toBe('benson')
    expect(c.body.password).toBe(md5Password('pw123'))
    // Also mints a second, independent session for the server-side poller
    // (provisionPollerSession) — two /login/account calls total, same md5 password.
    const logins = h.calls.filter(x => x.path === '/login/account')
    expect(logins.length).toBe(2)
    expect(logins[1].body.password).toBe(md5Password('pw123'))
  })

  it('loginByEmail → /login/email, iotCaptchaId mapped to captchaId', async () => {
    await auth.loginByEmail('a@b.com', 'CAP1', '123456')
    const c = only()
    expect(c.path).toBe('/login/email')
    expect(c.body).toMatchObject({ email: 'a@b.com', captchaId: 'CAP1', verifyCode: '123456' })
  })

  it('loginBySms → /login/sms, country code normalized (no +)', async () => {
    await auth.loginBySms('5551234', '+1', 'CAP', '000000')
    const c = only()
    expect(c.path).toBe('/login/sms')
    expect(c.body.countryTelephoneCode).toBe('1')
    expect(c.body.captchaId).toBe('CAP')
  })

  it('registerByEmail → /user/register/email, password md5', async () => {
    await auth.registerByEmail('acct', 'pw', 'a@b.com', '111111', 'CAP')
    const c = only()
    expect(c.path).toBe('/user/register/email')
    expect(c.body.password).toBe(md5Password('pw'))
    expect(c.body).toMatchObject({ account: 'acct', email: 'a@b.com', verifyCode: '111111', captchaId: 'CAP' })
  })

  it('registerByCellphone → /user/register/cellphone, password md5 + code normalized', async () => {
    await auth.registerByCellphone('acct', 'pw', '5551234', '+86', '111111', 'CAP')
    const c = only()
    expect(c.path).toBe('/user/register/cellphone')
    expect(c.body.password).toBe(md5Password('pw'))
    expect(c.body.countryTelephoneCode).toBe('86')
  })

  it('checkAccountExists / checkEmailExists → GET with query', async () => {
    await auth.checkAccountExists('a b')
    expect(last().path).toBe('/user/account/check?account=a%20b')
    await auth.checkEmailExists('a@b.com')
    expect(last().path).toContain('/user/email/check?email=a%40b.com')
  })

  it('sendEmailCaptcha → /user/send/email/captcha, uses `address` field (not email)', async () => {
    await auth.sendEmailCaptcha('a@b.com', '3')
    const c = only()
    expect(c.path).toBe('/user/send/email/captcha')
    expect(c.body.address).toBe('a@b.com')
    expect(c.body.email).toBeUndefined()
    expect(c.body.intent).toBe('3')
  })

  it('sendSmsCaptcha → country code normalized', async () => {
    await auth.sendSmsCaptcha('5551234', '+1', '2')
    const c = only()
    expect(c.path).toBe('/user/send/sms/captcha')
    expect(c.body.countryTelephoneCode).toBe('1')
    expect(c.body.intent).toBe('2')
  })

  it('logout → /login/logout with numeric userId', async () => {
    await auth.logout()
    const c = only()
    expect(c.path).toBe('/login/logout')
    expect(c.body).toMatchObject({ accessToken: 'ACCESS', userId: 9999 })
    expect(typeof c.body.userId).toBe('number')
  })

  it('refreshAccessToken → /login/refresh/access/token', async () => {
    await auth.refreshAccessToken()
    const c = only()
    expect(c.path).toBe('/login/refresh/access/token')
    expect(c.body).toMatchObject({ accessToken: 'ACCESS', refreshToken: 'REFRESH' })
  })

  it('fetchUserInfo → POST /user/select/iotUserInfo', async () => {
    await auth.fetchUserInfo()
    expect([only().method, last().path]).toEqual(['post', '/user/select/iotUserInfo'])
  })

  it('updateUserInfo → /user/update/iotUserInfo, NO userId in body', async () => {
    await auth.updateUserInfo({ userId: 9999, name: 'X' } as any)
    const c = only()
    expect(c.path).toBe('/user/update/iotUserInfo')
    expect(c.body.userId).toBeUndefined()
    expect(c.body.name).toBe('X')
  })

  it('updateUserEmail / updateUserCellphone → captchaId field', async () => {
    await auth.updateUserEmail('a@b.com', 'CAP', '123456')
    expect(last().body).toMatchObject({ email: 'a@b.com', captchaId: 'CAP', verifyCode: '123456' })
    await auth.updateUserCellphone('555', 'CAP', '123456')
    expect(last().body).toMatchObject({ cellphone: '555', captchaId: 'CAP' })
  })

  it('updatePassword → /user/update/authPassword, md5 old/new, NO userId', async () => {
    await auth.updatePassword('old', 'new', 9999)
    const c = only()
    expect(c.path).toBe('/user/update/authPassword')
    expect(c.body.oldPassword).toBe(md5Password('old'))
    expect(c.body.newPassword).toBe(md5Password('new'))
    expect(c.body.userId).toBeUndefined()
  })

  it('resetPassword → /user/reset/password, newPassword md5', async () => {
    await auth.resetPassword('acct', 'newpw', '111111', 'CAP')
    const c = only()
    expect(c.path).toBe('/user/reset/password')
    expect(c.body.newPassword).toBe(md5Password('newpw'))
    expect(c.body.account).toBe('acct')
  })

  it('deleteAccount → POST /user/logout/account', async () => {
    await auth.deleteAccount()
    expect([only().method, last().path]).toEqual(['post', '/user/logout/account'])
  })

  it('isLoggedIn true when token present', () => {
    expect(auth.isLoggedIn()).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// Device 接口
// ─────────────────────────────────────────────────────────────
describe('deviceApi contracts', () => {
  it('fetchDeviceList → /device/list with page/count + filters', async () => {
    await dev.fetchDeviceList(2, 30, { isOnline: true } as any)
    const c = only()
    expect(c.path).toBe('/device/list')
    expect(c.body).toMatchObject({ page: 2, count: 30, isOnline: true })
  })

  it('fetchDeviceDetails / fetchDeviceState → GET with deviceId', async () => {
    await dev.fetchDeviceDetails('123')
    expect(last().path).toBe('/device/details?deviceId=123')
    await dev.fetchDeviceState('123')
    expect(last().path).toBe('/remote/device/state/latest?deviceId=123')
  })

  it('deleteDevice → id coerced to String', async () => {
    await dev.deleteDevice(123456789012345)
    const c = only()
    expect(c.path).toBe('/device/delete')
    expect(c.body.id).toBe('123456789012345')
    expect(typeof c.body.id).toBe('string')
  })

  it('updateDevice → id coerced to String', async () => {
    await dev.updateDevice({ id: 42, name: 'X' } as any)
    expect(last().body.id).toBe('42')
    expect(typeof last().body.id).toBe('string')
  })

  it('addDevice / addDeviceWithStation → pass payload through', async () => {
    await dev.addDevice({ deviceName: 'D' } as any)
    expect(last().path).toBe('/device/add/single')
    await dev.addDeviceWithStation({ deviceName: 'D', stationId: 1 } as any)
    expect(last().path).toBe('/device/add/single/addStationTogether')
  })

  it('pin / unpin → ids array', async () => {
    await dev.pinDevice([1, 2]); expect(last().body).toEqual({ ids: [1, 2] })
    await dev.unpinDevice([3]); expect(last().body).toEqual({ ids: [3] })
  })

  it('writeDeviceConfig → deviceId query + {key,value}', async () => {
    await dev.writeDeviceConfig('77', 'workMode', 2)
    const c = only()
    expect(c.path).toBe('/remote/device/config/write?deviceId=77')
    expect(c.body).toEqual({ key: 'workMode', value: 2 })
  })

  it('convenience toggles map to writeDeviceConfig keys', async () => {
    await dev.toggleAcOut1('1', true); expect(last().body).toEqual({ key: 'acOut1Enable', value: true })
    await dev.toggleSleepMode('1', false); expect(last().body).toEqual({ key: 'sleepMode', value: false })
    await dev.setWorkMode('1', 2); expect(last().body).toEqual({ key: 'workMode', value: 2 })
  })

  it('readDeviceConfig(s) / cache → key(s) body', async () => {
    await dev.readDeviceConfig('1', 'k'); expect(last().body).toEqual({ key: 'k' })
    await dev.readDeviceConfigs('1', ['a', 'b']); expect(last().body).toEqual({ keys: ['a', 'b'] })
    await dev.getDeviceConfigCache('1', ['a']); expect(last().path).toContain('/remote/device/configs/cache/get')
  })

  it('passthroughDevice → hex→base64 base64Input + noOutput default false', async () => {
    await dev.passthroughDevice('55', { data: '01 AA' })
    const c = only()
    expect(c.path).toBe('/remote/device/passthrough?deviceId=55')
    // bytes [0x01,0xAA] → base64
    expect(c.body.base64Input).toBe(Buffer.from([0x01, 0xAA]).toString('base64'))
    expect(c.body.noOutput).toBe(false)
  })

  it('passthroughDevice honors noOutput:true', async () => {
    await dev.passthroughDevice('55', { data: 'AA01', noOutput: true })
    expect(last().body.noOutput).toBe(true)
  })

  it('fast report start/stop/supported → correct endpoints & body', async () => {
    await dev.startFastReport('9', 'client-1')
    expect(last().path).toBe('/remote/device/state/report/fast/start?deviceId=9')
    expect(last().body).toEqual({ clientID: 'client-1', scene: 'app' })
    await dev.stopFastReport('9', 'client-1')
    expect(last().body).toEqual({ clientID: 'client-1' })
    await dev.checkFastReportSupported('9')
    expect(last().path).toBe('/remote/device/state/report/fast/supported?deviceId=9')
  })

  it('fetchHistoryData / fetchRecentHistory → /deviceState/attribute/keys/history', async () => {
    await dev.fetchHistoryData({ deviceId: '1', keys: ['k'], fromTime: 1, toTime: 2 } as any)
    expect(last().path).toBe('/deviceState/attribute/keys/history')
    await dev.fetchRecentHistory('1', ['k'], 12)
    expect(last().body).toMatchObject({ deviceId: '1', orderByTimeAsc: true, count: 288 })
  })

  it('alarms: query defaults page/count; ignore requires numeric iotAlarmId', async () => {
    await dev.fetchAlarms()
    expect(last().body).toMatchObject({ page: 1, count: 20 })
    await dev.ignoreAlarm('12345', true)
    expect(last().path).toBe('/alarm/update/isProcessed')
    expect(last().body.iotAlarmId).toBe(12345)
    expect(typeof last().body.iotAlarmId).toBe('number')
    await dev.deleteAlarm(7)
    expect(last().path).toBe('/alarm/delete/alarm?id=7')
  })

  it('peakValley endpoints', async () => {
    await dev.fetchPeakValleyConfig('1'); expect(last().path).toBe('/peakValley/device/get?deviceId=1')
    await dev.setPeakValleyEnabled({ deviceId: '1', isEnabled: true } as any)
    expect(last().path).toBe('/peakValley/device/enable')
    await dev.setPeakValleyGeneral({ deviceId: '1' } as any)
    expect(last().path).toBe('/peakValley/device/general/set')
  })

  it('station endpoints', async () => {
    await dev.fetchStationList(1, 10); expect(last().path).toBe('/station/list')
    await dev.fetchStationDetails('5'); expect(last().path).toBe('/station/details?stationId=5')
    await dev.addStation({ name: 'S' } as any); expect(last().path).toBe('/station/add')
  })

  it('simple energy flow / state', async () => {
    await dev.fetchSimpleEnergyFlow('1'); expect(last().path).toContain('deviceId=1')
    await dev.fetchSimpleState('1'); expect(last().path).toContain('deviceId=1')
  })
})

// ─────────────────────────────────────────────────────────────
// Web/Native Push 接口
// ─────────────────────────────────────────────────────────────
describe('webPushApi contracts', () => {
  it('registerNativePushToken → posts token + platform + userId', async () => {
    await push.registerNativePushToken('tok', 'android')
    const c = only()
    expect(c.body).toMatchObject({ token: 'tok', platform: 'android', userId: '9999' })
  })
  it('unregisterNativePushToken → posts token', async () => {
    await push.unregisterNativePushToken('tok')
    expect(only().body).toMatchObject({ token: 'tok' })
  })
})
