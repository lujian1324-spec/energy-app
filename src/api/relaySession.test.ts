/**
 * The relay's own session minted again in the background (v4.23.3): only for the
 * account that signed in with an email code, only with the password this app gives
 * the accounts it registers, at most once a day, and never for another account.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({ logins: [] as { account: string; password: string }[], ok: true }))
const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
}

vi.mock('../utils/apiClient', () => ({
  isApiSuccess: (c: unknown) => c === 0 || c === '0',
  tokenStore: { set: vi.fn(), setRefresh: vi.fn(), get: () => 'APP', clear: vi.fn() },
  api: {
    post: vi.fn(async () => ({ code: 0 })),
    postSkipAuth: vi.fn(async (path: string, body: any) => {
      if (path === '/login/email') {
        return { code: 0, data: { accessToken: 'APP-A', refreshToken: 'APP-R', userId: '491513787113766912', account: 'sierro_ab12' } }
      }
      h.logins.push(body)
      return h.ok
        ? { code: 0, data: { accessToken: 'RELAY-A', refreshToken: 'RELAY-R', accessTokenWillExpiredInMillis: '7200000' } }
        : { code: 10002, message: 'Account or password error' }
    }),
  },
}))

import { RELAY_REMINT_INTERVAL_MS, defaultPasswordForAccount, loginByEmail, logout, md5Password, remintRelaySession } from './authApi'

const PENDING = 'iot_poller_refresh_pending'
const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(async () => {
  store.clear(); h.logins = []; h.ok = true
  await loginByEmail('me@example.com', 'CAPTCHA', '123456')
  await flush()
  store.delete(PENDING) // handed over at the first upload
  h.logins = []
})

describe('remintRelaySession', () => {
  it('signs in again with the app-registered password and leaves a session for the next upload', async () => {
    expect(await remintRelaySession(1_000)).toBe(true)
    expect(h.logins).toEqual([{ account: 'sierro_ab12', password: md5Password(defaultPasswordForAccount('sierro_ab12')) }])
    expect(JSON.parse(store.get(PENDING)!)).toMatchObject({ accessToken: 'RELAY-A', refreshToken: 'RELAY-R' })
  })

  it('tries at most once a day, so a wrong password never piles up failed sign-ins', async () => {
    h.ok = false
    expect(await remintRelaySession(1_000)).toBe(false)
    expect(await remintRelaySession(1_000 + RELAY_REMINT_INTERVAL_MS - 1)).toBe(false)
    expect(h.logins).toHaveLength(1)
    h.ok = true
    expect(await remintRelaySession(1_000 + RELAY_REMINT_INTERVAL_MS)).toBe(true)
    expect(h.logins).toHaveLength(2)
  })

  it('never for another account, nor after sign-out', async () => {
    store.set('iot_user_id', '555')
    expect(await remintRelaySession(1_000)).toBe(false)
    store.set('iot_user_id', '491513787113766912')
    await logout()
    store.set('iot_user_id', '491513787113766912')
    expect(await remintRelaySession(1_000)).toBe(false)
    expect(h.logins).toEqual([])
  })
})
