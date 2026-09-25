/**
 * The Real-Time Power history request: the Solar of Things console's
 * keys/history/v1 call, every page of the day, and the fallback to the Siseli
 * app's record/list when the platform refuses it.
 */
process.env.TZ = 'America/Los_Angeles'

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ records: vi.fn(), keysV1: vi.fn() }))
vi.mock('../api/deviceApi', () => ({ fetchDeviceRecordHistory: h.records, fetchKeysHistoryV1: h.keysV1 }))
vi.mock('../utils/apiClient', () => ({ isApiSuccess: (c: unknown) => c === 0 || c === '0' }))
vi.mock('../db/powerflowDB', () => ({ readDeviceHistory: vi.fn(), replaceDeviceHistory: vi.fn() }))

import { fetchWindow, resetHistorySource, KEYS_V1_PAGE_SIZE, KEYS_V1_RETRY_MS } from './useHistoryFetcher'

const DAY = new Date(2026, 8, 24).getTime()
const END = DAY + 86_399_999
const iso = (min: number) => new Date(DAY + min * 60_000).toISOString()

/** A columnar page of `n` frames from minute `start`, like the console receives. */
const columnar = (n: number, start: number, total = 1) => ({
  code: 0,
  data: {
    page: 1, count: n, total,
    payload: {
      timeSeries: Array.from({ length: n }, (_, i) => iso(start + i)),
      fields: {
        remainingBatteryCapacity: Array.from({ length: n }, () => 50),
        outputPower: Array.from({ length: n }, () => 100),
        exchangeChargingPower: Array.from({ length: n }, () => null),
        generationPower: Array.from({ length: n }, () => null),
      },
    },
  },
})
const records = (n: number, start: number) => ({
  code: 0,
  data: { list: Array.from({ length: n }, (_, i) => ({ time: iso(start + i), fields: { outputPower: { value: '100' } } })) },
})

beforeEach(() => {
  h.records.mockReset()
  h.keysV1.mockReset()
  resetHistorySource()
})

describe('fetchWindow — keys/history/v1', () => {
  it('asks for the four tabs\' keys over the local day, 1,500 a page, zone offset intact', async () => {
    h.keysV1.mockResolvedValueOnce(columnar(3, 0))
    await fetchWindow('9001', DAY, END, () => false)
    expect(h.keysV1).toHaveBeenCalledWith({
      deviceId: '9001',
      keys: ['remainingBatteryCapacity', 'exchangeChargingPower', 'generationPower', 'outputPower'],
      fromTime: '2026-09-24T00:00:00-07:00',
      toTime: '2026-09-24T23:59:59-07:00',
      page: 1,
      count: 1500,
      orderByTimeAsc: true,
    })
    expect(h.records).not.toHaveBeenCalled()
  })

  it('zips the columns into points, keeping a missing key as null', async () => {
    h.keysV1.mockResolvedValueOnce(columnar(3, 0))
    const res = await fetchWindow('9001', DAY, END, () => false)
    expect(res.complete).toBe(true)
    expect(res.points).toHaveLength(3)
    expect(res.points[0]).toMatchObject({ soc: 50, output: 100, ac: null, solar: null })
  })

  it('pages until a short page', async () => {
    h.keysV1
      .mockResolvedValueOnce(columnar(KEYS_V1_PAGE_SIZE, 0, 0))
      .mockResolvedValueOnce(columnar(10, KEYS_V1_PAGE_SIZE, 0))
    const res = await fetchWindow('9001', DAY, END, () => false)
    expect(h.keysV1.mock.calls.map(c => c[0].page)).toEqual([1, 2])
    expect(res.points).toHaveLength(KEYS_V1_PAGE_SIZE + 10)
  })

  it('stops at the last page when `total` counts pages', async () => {
    h.keysV1.mockResolvedValueOnce(columnar(KEYS_V1_PAGE_SIZE, 0, 1))
    const res = await fetchWindow('9001', DAY, END, () => false)
    expect(h.keysV1).toHaveBeenCalledTimes(1)
    expect(res.complete).toBe(true)
  })

  it('a later page that fails is partial, with the reason — not a fallback', async () => {
    h.keysV1
      .mockResolvedValueOnce(columnar(KEYS_V1_PAGE_SIZE, 0, 0))
      .mockResolvedValueOnce({ code: 500, message: 'server busy' })
    const res = await fetchWindow('9001', DAY, END, () => false)
    expect(res).toMatchObject({ complete: false, error: 'server busy' })
    expect(res.points).toHaveLength(KEYS_V1_PAGE_SIZE)
    expect(h.records).not.toHaveBeenCalled()
  })
})

describe('fetchWindow — fallback to record/list', () => {
  it('uses record/list when the platform refuses keys/history/v1; two refusals in a row pause it', async () => {
    h.keysV1.mockResolvedValue({ code: 20101, message: 'illegal argument' })
    h.records.mockResolvedValue(records(3, 0))
    const first = await fetchWindow('9001', DAY, END, () => false)
    expect(first).toMatchObject({ complete: true })
    expect(first.points).toHaveLength(3)
    expect(h.records).toHaveBeenCalledWith({
      deviceId: '9001', fromTime: '2026-09-24T00:00:00-07:00', toTime: '2026-09-24T23:59:59-07:00',
      page: 1, count: 80, orderByTimeAsc: true,
    })
    // One refusal does not decide the session: the next read asks again.
    await fetchWindow('9001', DAY, END, () => false)
    expect(h.keysV1).toHaveBeenCalledTimes(2)
    // Two in a row: record/list only, for KEYS_V1_RETRY_MS.
    await fetchWindow('9001', DAY, END, () => false)
    expect(h.keysV1).toHaveBeenCalledTimes(2)
  })

  it('a busy server once does not switch the session; the call is tried again after the pause (v4.23.1)', async () => {
    vi.useFakeTimers({ now: DAY + 12 * 3_600_000 })
    try {
      h.records.mockResolvedValue(records(1, 0))
      h.keysV1.mockResolvedValueOnce({ code: 500, message: 'system busy' }).mockResolvedValueOnce(columnar(5, 0))
      await fetchWindow('9001', DAY, END, () => false)
      const res = await fetchWindow('9001', DAY, END, () => false)
      expect(res.points).toHaveLength(5)
      expect(h.records).toHaveBeenCalledTimes(1)

      h.keysV1.mockReset().mockResolvedValue({ code: 500, message: 'system busy' })
      await fetchWindow('9001', DAY, END, () => false)
      await fetchWindow('9001', DAY, END, () => false)
      await fetchWindow('9001', DAY, END, () => false)
      expect(h.keysV1).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(KEYS_V1_RETRY_MS)
      h.keysV1.mockResolvedValue(columnar(4, 0))
      expect((await fetchWindow('9001', DAY, END, () => false)).points).toHaveLength(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a success without a columnar payload counts as refused too', async () => {
    h.keysV1.mockResolvedValueOnce({ code: 0, data: { list: [] } })
    h.records.mockResolvedValueOnce(records(2, 0))
    const res = await fetchWindow('9001', DAY, END, () => false)
    expect(res.points).toHaveLength(2)
  })

  it('record/list reads every page until a short one', async () => {
    h.keysV1.mockResolvedValue({ code: 20101 })
    h.records
      .mockResolvedValueOnce(records(80, 0))
      .mockResolvedValueOnce(records(5, 80))
    const res = await fetchWindow('9001', DAY, END, () => false)
    expect(h.records.mock.calls.map(c => c[0].page)).toEqual([1, 2])
    expect(res.points).toHaveLength(85)
  })

  it('stops as soon as the screen has moved on', async () => {
    let cancelled = false
    h.keysV1.mockImplementation(async () => { cancelled = true; return columnar(KEYS_V1_PAGE_SIZE, 0, 0) })
    const res = await fetchWindow('9001', DAY, END, () => cancelled)
    expect(h.keysV1).toHaveBeenCalledTimes(1)
    expect(res.complete).toBe(false)
  })
})
