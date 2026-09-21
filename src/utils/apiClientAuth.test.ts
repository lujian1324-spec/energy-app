/**
 * SW-05 — `requireAuth`: a session-only request must never leave anonymously.
 *
 * Before this, a missing access token just meant the IOT-Token header was
 * omitted and the request went out anyway. The peakValley group answers that
 * with 20101 "illegal argument" rather than an auth code, so the refresh /
 * auth:expired path never ran and Smart Schedule was stuck on a payload error
 * that had nothing to do with the payload.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./iotSign', () => ({
  calcSign: () => ({ 'IOT-Open-Sign': 'SIG' }),
  parseUrlParams: () => ({}),
}))
vi.mock('../stores/bleLiveStatusStore', () => ({
  overlayBleOnLatestApiResponse: (_p: string, j: unknown) => j,
}))

const store: Record<string, string> = {}
;(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
}

const sent: { url: string; token?: string; body?: any }[] = []
let nextBody: unknown = { code: 0, data: {} }
;(globalThis as any).fetch = (url: string, init: any) => {
  sent.push({
    url: String(url),
    token: init?.headers?.['IOT-Token'],
    body: init?.body ? JSON.parse(init.body) : undefined,
  })
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(JSON.stringify(nextBody)),
  } as any)
}

const { api, tokenStore, ApiError } = await import('./apiClient')

beforeEach(() => {
  sent.length = 0
  for (const k of Object.keys(store)) delete store[k]
  nextBody = { code: 0, data: {} }
})

describe('api.getAuthed / api.postAuthed', () => {
  it('carry the IOT-Token when there is one', async () => {
    tokenStore.set('ACCESS')
    await api.getAuthed('/peakValley/device/get?deviceId=1')
    expect(sent).toHaveLength(1)
    expect(sent[0].token).toBe('ACCESS')
  })

  it('send nothing and raise 401 when there is no token to recover', async () => {
    await expect(api.getAuthed('/peakValley/device/get?deviceId=1')).rejects.toBeInstanceOf(ApiError)
    expect(sent).toHaveLength(0)
  })

  it('recover a lost access token from the refresh token, then send', async () => {
    // The half-restored session: refresh token survived, access token did not.
    tokenStore.setRefresh('REFRESH')
    nextBody = { code: 0, data: { accessToken: 'NEW', refreshToken: 'REFRESH2' } }

    const call = api.postAuthed('/peakValley/device/enable', { deviceId: '1', isEnabled: true })
    // First hop is the refresh itself…
    await call

    expect(sent[0].url).toContain('/login/refresh/access/token')
    expect(sent[0].body).toEqual({ accessToken: '', refreshToken: 'REFRESH' })
    // …then the real request, now carrying the recovered token.
    expect(sent[1].url).toContain('/peakValley/device/enable')
    expect(sent[1].token).toBe('NEW')
    expect(tokenStore.get()).toBe('NEW')
  })
})

describe('plain api.get / api.post', () => {
  it('are unchanged — still sent without a token (pre-login checks rely on this)', async () => {
    await api.get('/user/email/check?email=a%40b.c')
    expect(sent).toHaveLength(1)
    expect(sent[0].token).toBeUndefined()
  })
})
