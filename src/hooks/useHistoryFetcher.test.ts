/**
 * The Real-Time Power history request: Siseli doGetDeviceHistory's shape, every
 * page of the day, and a failed page reported rather than read as the end.
 */
process.env.TZ = 'America/Los_Angeles'

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('../api/deviceApi', () => ({ fetchDeviceRecordHistory: h.fetch }))
vi.mock('../utils/apiClient', () => ({ isApiSuccess: (c: unknown) => c === 0 || c === '0' }))
vi.mock('../db/powerflowDB', () => ({ readDeviceHistory: vi.fn(), replaceDeviceHistory: vi.fn() }))

import { fetchWindow } from './useHistoryFetcher'

const DAY = new Date(2026, 8, 24).getTime()
const records = (n: number, startMin: number) => Array.from({ length: n }, (_, i) => ({
  time: new Date(DAY + (startMin + i) * 60_000).toISOString(),
  fields: { outputPower: { value: '100' }, remainingBatteryCapacity: { value: '50' } },
}))
const ok = (list: unknown[]) => ({ code: 0, data: { list } })

beforeEach(() => h.fetch.mockReset())

describe('fetchWindow', () => {
  it('sends the reference client\'s request, with the zone offset intact', async () => {
    h.fetch.mockResolvedValueOnce(ok(records(3, 0)))
    await fetchWindow('9001', DAY, DAY + 86_399_999, () => false)
    expect(h.fetch).toHaveBeenCalledWith({
      deviceId: '9001',
      fromTime: '2026-09-24T00:00:00-07:00',
      toTime: '2026-09-24T23:59:59-07:00',
      page: 1,
      count: 80,
      orderByTimeAsc: true,
    })
  })

  it('reads every page until a short one', async () => {
    h.fetch
      .mockResolvedValueOnce(ok(records(80, 0)))
      .mockResolvedValueOnce(ok(records(80, 80)))
      .mockResolvedValueOnce(ok(records(5, 160)))
    const res = await fetchWindow('9001', DAY, DAY + 86_399_999, () => false)
    expect(h.fetch).toHaveBeenCalledTimes(3)
    expect(h.fetch.mock.calls.map(c => c[0].page)).toEqual([1, 2, 3])
    expect(res).toMatchObject({ complete: true, error: null })
    expect(res.points).toHaveLength(165)
    expect(res.points[0]).toMatchObject({ output: 100, soc: 50, ac: null, solar: null })
  })

  it('a refused page is not the end of the day: partial, with the reason', async () => {
    h.fetch
      .mockResolvedValueOnce(ok(records(80, 0)))
      .mockResolvedValueOnce({ code: 20101, message: 'illegal argument' })
    const res = await fetchWindow('9001', DAY, DAY + 86_399_999, () => false)
    expect(res.complete).toBe(false)
    expect(res.error).toBe('illegal argument')
    expect(res.points).toHaveLength(80)
  })

  it('stops as soon as the screen has moved on', async () => {
    let cancelled = false
    h.fetch.mockImplementation(async () => { cancelled = true; return ok(records(80, 0)) })
    const res = await fetchWindow('9001', DAY, DAY + 86_399_999, () => cancelled)
    expect(h.fetch).toHaveBeenCalledTimes(1)
    expect(res.complete).toBe(false)
  })
})
