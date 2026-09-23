import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./authApi', () => ({ POLLER_REFRESH_PENDING_KEY: 'iot_poller_refresh_pending' }))
vi.mock('../config/scheduling', () => ({
  RELAY_BASE_URL: 'https://relay.example.test', SCHEDULE_PATH: '/schedule', isRelayConfigured: () => true,
}))
import { uploadSleepScheduleResult } from './scheduleApi'

const data = new Map<string, string>()
const fetchMock = vi.fn()
const schedule = { enabled: false, sleepFrom: '22:00', sleepTo: '09:00', model: 'Sierro 1000' }
const key = 'iot_poller_refresh_pending'
beforeEach(() => {
  data.clear()
  data.set('iot_user_id', 'test-account')
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('relay acknowledgement', () => {
  it('sends the current app token as proof without handing over its refresh token', async () => {
    data.set('iot_access_token', 'app-token')
    data.set('iot_refresh_token', 'private-app-refresh')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 0 })))
    await uploadSleepScheduleResult('device', schedule)
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers['IOT-Token']).toBe('app-token')
    expect(init.body).not.toContain('private-app-refresh')
  })
  it('accepts a business acknowledgement and consumes exactly that bootstrap', async () => {
    data.set(key, JSON.stringify({ accessToken: 'test-only-token' }))
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 0 })))
    expect((await uploadSleepScheduleResult('device', schedule)).accepted).toBe(true)
    expect(data.has(key)).toBe(false)
  })
  it('does not mistake an HTTP 200 business failure for a saved schedule', async () => {
    data.set(key, '{}')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 1 })))
    expect((await uploadSleepScheduleResult('device', schedule)).accepted).toBe(false)
    expect(data.has(key)).toBe(true)
  })
  it('rejects malformed success pages', async () => {
    fetchMock.mockResolvedValue(new Response('<html>proxy error</html>'))
    expect((await uploadSleepScheduleResult('device', schedule)).accepted).toBe(false)
  })
  it('explains missing poller credentials without echoing arbitrary server text', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 1, reason: 'POLLER_SESSION_REQUIRED', message: 'secret upstream text' }), { status: 409 }))
    const r = await uploadSleepScheduleResult('device', schedule)
    expect(r.accepted).toBe(false)
    expect(r.detail).toMatch(/background session.*sign in again/i)
    expect(r.detail).not.toContain('secret')
  })
  it('keeps a newer bootstrap created while the request was in flight', async () => {
    data.set(key, JSON.stringify({ accessToken: 'old-test-only' }))
    fetchMock.mockImplementation(async () => {
      data.set(key, JSON.stringify({ accessToken: 'new-test-only' }))
      return new Response(JSON.stringify({ code: 0 }))
    })
    await uploadSleepScheduleResult('device', schedule)
    expect(data.get(key)).toContain('new-test-only')
  })
  it('does not send a schedule without a signed-in account', async () => {
    data.delete('iot_user_id')
    expect((await uploadSleepScheduleResult('device', schedule)).accepted).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
