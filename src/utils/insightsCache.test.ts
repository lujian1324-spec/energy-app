import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { HistoryPoint } from './historyPoints'

// In-memory stand-ins for the IndexedDB stores and the server window read.
const h = vi.hoisted(() => ({
  rows: new Map<string, { deviceId: string } & Record<string, unknown>>(),
  days: new Map<string, { deviceId: string; dayStart: number; fetchedAt: number; final: boolean }>(),
  fetches: [] as { deviceId: string; from: number; to: number }[],
  failDays: new Set<number>(),
  gate: null as Promise<void> | null,
  samplesPerDay: 3,
}))

vi.mock('../db/powerflowDB', () => ({
  readHistoryDays: vi.fn(async (deviceId: string, fromDay: number, toDay: number) =>
    [...h.days.values()].filter(d => d.deviceId === deviceId && d.dayStart >= fromDay && d.dayStart <= toDay)),
  readDeviceHistory: vi.fn(async (deviceId: string, from: number, to: number) =>
    [...h.rows.values()].filter(r => r.deviceId === deviceId && (r.timestamp as number) >= from && (r.timestamp as number) <= to)
      .sort((a, b) => (a.timestamp as number) - (b.timestamp as number))
      .map(({ deviceId: _d, ...p }) => p)),
  saveHistoryDay: vi.fn(async (deviceId: string, dayStart: number, dayEnd: number, points: HistoryPoint[], final: boolean, fetchedAt: number) => {
    for (const [k, r] of h.rows) if (r.deviceId === deviceId && (r.timestamp as number) >= dayStart && (r.timestamp as number) <= dayEnd) h.rows.delete(k)
    for (const p of points) h.rows.set(`${deviceId}|${p.timestamp}`, { ...p, deviceId })
    h.days.set(`${deviceId}|${dayStart}`, { deviceId, dayStart, fetchedAt, final })
  }),
  pruneDeviceHistoryBefore: vi.fn(async (cutoff: number) => {
    for (const [k, r] of h.rows) if ((r.timestamp as number) < cutoff) h.rows.delete(k)
    for (const [k, d] of h.days) if (d.dayStart < cutoff) h.days.delete(k)
  }),
}))

vi.mock('../hooks/useHistoryFetcher', () => ({
  fetchWindow: vi.fn(async (deviceId: string, from: number, to: number) => {
    h.fetches.push({ deviceId, from, to })
    if (h.gate) await h.gate
    const points: HistoryPoint[] = []
    for (let i = 0; i < h.samplesPerDay; i++) {
      const t = from + (i + 8) * 3_600_000
      points.push({ time: new Date(t).toISOString(), timestamp: t, solar: 100, output: 120, ac: 50, soc: 80, battery: 30 })
    }
    if (h.failDays.has(from)) return { points: points.slice(0, 1), complete: false, error: 'boom', pages: 1 }
    return { points, complete: true, error: null, pages: 1 }
  }),
}))

import {
  SETTLE_MS, dayStartsBetween, fetchDay, insightsDeviceId, isFinalFetch, loadInsightsRange, localDayStart,
  nextDayStart, pointsToRecords, prefetchFrom, prefetchInsightsHistory, readCachedRange, resetInsightsCache,
} from './insightsCache'
import { buildInsightsFrame } from './insightsFrame'
import { isWholeLocalDay } from './localDays'

const D = (s: string) => new Date(s).getTime()
const DAY = (s: string) => localDayStart(D(s))

beforeEach(() => {
  h.rows.clear(); h.days.clear(); h.fetches = []; h.failDays.clear(); h.gate = null; h.samplesPerDay = 3
  resetInsightsCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-24T15:00:00'))
})

describe('local days', () => {
  it('walks calendar days, DST included', () => {
    const days = dayStartsBetween(D('2026-11-01T10:00:00'), D('2026-11-03T01:00:00'))
    expect(days.map(d => new Date(d).getDate())).toEqual([1, 2, 3])
    for (const d of days) expect(new Date(d).getHours()).toBe(0)
    expect(nextDayStart(DAY('2026-09-24T12:00:00'))).toBe(D('2026-09-25T00:00:00'))
  })

  it('the background window is 30 days back, or the whole month when that starts earlier', () => {
    expect(prefetchFrom(D('2026-09-24T15:00:00'))).toBe(D('2026-08-25T00:00:00'))
    expect(prefetchFrom(D('2026-03-31T09:00:00'))).toBe(D('2026-03-01T00:00:00'))
  })

  it('a day is final only when read after it ended and settled', () => {
    const d = DAY('2026-09-23T00:00:00')
    expect(isFinalFetch(d, D('2026-09-23T23:00:00'))).toBe(false)
    expect(isFinalFetch(d, D('2026-09-24T00:30:00'))).toBe(false)
    expect(isFinalFetch(d, D('2026-09-24T00:00:00') + SETTLE_MS)).toBe(true)
  })

  it('recognises the chart\'s today window as one whole day', () => {
    const d = DAY('2026-09-24T00:00:00')
    expect(isWholeLocalDay(d, nextDayStart(d) - 1)).toBe(true)
    expect(isWholeLocalDay(d, nextDayStart(d) - 1000)).toBe(true)
    expect(isWholeLocalDay(d, D('2026-09-24T15:00:00'))).toBe(false)
    expect(isWholeLocalDay(d + 60_000, nextDayStart(d) - 1)).toBe(false)
  })

  it('picks the oldest device, as Insights does', () => {
    expect(insightsDeviceId([{ id: 2, createdAt: '2026-02-01' }, { id: '1', createdAt: '2026-01-01' }])).toBe('1')
    expect(insightsDeviceId([])).toBeNull()
  })
})

describe('background prefetch', () => {
  it('caches the last month newest first, and a second open re-reads only what is not final', async () => {
    const res = await prefetchInsightsHistory({ deviceId: '1001', isActive: () => true })
    expect(res).toMatchObject({ fetched: 31, failed: 0, stopped: false })
    expect(h.fetches[0].from).toBe(DAY('2026-09-24T00:00:00'))
    expect(h.fetches[30].from).toBe(DAY('2026-08-25T00:00:00'))
    // Each request is exactly one local day, for that device.
    expect(h.fetches.every(f => f.deviceId === '1001' && f.to === nextDayStart(f.from) - 1)).toBe(true)
    // Today is not final; yesterday, read at 15:00 today, has settled.
    expect(h.days.get(`1001|${DAY('2026-09-24T00:00:00')}`)?.final).toBe(false)
    expect(h.days.get(`1001|${DAY('2026-09-23T00:00:00')}`)?.final).toBe(true)

    // Opened again a minute later: today was just read, nothing to do.
    vi.setSystemTime(new Date('2026-09-24T15:01:00'))
    h.fetches = []
    await prefetchInsightsHistory({ deviceId: '1001', isActive: () => true })
    expect(h.fetches).toEqual([])

    // Opened again later: only today, the one day that is not final.
    vi.setSystemTime(new Date('2026-09-24T15:10:00'))
    h.fetches = []
    await prefetchInsightsHistory({ deviceId: '1001', isActive: () => true })
    expect(h.fetches.map(f => f.from)).toEqual([DAY('2026-09-24T00:00:00')])

    // Just after midnight yesterday is read again once it settles.
    vi.setSystemTime(new Date('2026-09-25T00:30:00'))
    h.fetches = []
    await prefetchInsightsHistory({ deviceId: '1001', isActive: () => true })
    expect(h.fetches.map(f => f.from)).toEqual([DAY('2026-09-25T00:00:00'), DAY('2026-09-24T00:00:00')])
    expect(h.days.get(`1001|${DAY('2026-09-24T00:00:00')}`)?.final).toBe(false)
  })

  it('stops as soon as the app is no longer active, and after two failed days', async () => {
    let n = 0
    const res = await prefetchInsightsHistory({ deviceId: '1001', isActive: () => n++ < 3 })
    expect(res).toMatchObject({ fetched: 3, stopped: true })

    h.fetches = []; h.days.clear()
    h.failDays = new Set([DAY('2026-09-24T00:00:00'), DAY('2026-09-23T00:00:00')])
    const r2 = await prefetchInsightsHistory({ deviceId: '1001', isActive: () => true })
    expect(r2).toMatchObject({ fetched: 0, failed: 2, stopped: true })
    expect(h.fetches).toHaveLength(2)
    // A day that did not come back whole is never recorded as cached.
    expect(h.days.size).toBe(0)
  })

  it('waits for its pause before every day', async () => {
    const pause = vi.fn(async () => {})
    await prefetchInsightsHistory({ deviceId: '1001', isActive: () => true, pause })
    expect(pause).toHaveBeenCalledTimes(31)
  })

  it('drops cached days older than two months', async () => {
    h.days.set('1001|1', { deviceId: '1001', dayStart: D('2026-06-01T00:00:00'), fetchedAt: 0, final: true })
    await prefetchInsightsHistory({ deviceId: '1001', isActive: () => true })
    expect([...h.days.values()].some(d => d.dayStart === D('2026-06-01T00:00:00'))).toBe(false)
  })

  it('a sign-out mid-run writes nothing into the next account', async () => {
    let release!: () => void
    h.gate = new Promise(r => { release = r })
    const run = prefetchInsightsHistory({ deviceId: '1001', isActive: () => true })
    await Promise.resolve(); await Promise.resolve()
    resetInsightsCache()
    release()
    const res = await run
    expect(res.stopped).toBe(true)
    expect(h.days.size).toBe(0)
    expect(h.rows.size).toBe(0)
  })
})

describe('Insights page reads', () => {
  const monthFrom = D('2026-09-01T00:00:00')
  const monthTo = D('2026-09-30T23:59:59.999')

  it('paints a cached month at once, then re-reads only today', async () => {
    await prefetchInsightsHistory({ deviceId: '1001', isActive: () => true })
    // Pretend yesterday settled since.
    for (const d of h.days.values()) if (d.dayStart !== DAY('2026-09-24T00:00:00')) d.final = true
    h.fetches = []
    const painted = vi.fn()
    const res = await loadInsightsRange('1001', monthFrom, monthTo, painted)
    expect(painted).toHaveBeenCalledTimes(1)
    expect(painted.mock.calls[0][0]).toHaveLength(24 * 3)
    expect(h.fetches.map(f => f.from)).toEqual([DAY('2026-09-24T00:00:00')])
    expect(res).toMatchObject({ partial: false, failed: false })
    expect(res.points).toHaveLength(24 * 3)
  })

  it('an uncached period is read from the server (and cached), with no early paint', async () => {
    const painted = vi.fn()
    const res = await loadInsightsRange('1001', D('2026-07-06T00:00:00'), D('2026-07-12T23:59:59.999'), painted)
    expect(painted).not.toHaveBeenCalled()
    expect(h.fetches).toHaveLength(7)
    expect(res.points).toHaveLength(21)
    expect((await readCachedRange('1001', D('2026-07-06T00:00:00'), D('2026-07-12T23:59:59.999'))).covered).toBe(true)
  })

  it('a day that failed marks the totals partial; nothing at all is a failure', async () => {
    h.failDays = new Set([DAY('2026-07-07T00:00:00')])
    const res = await loadInsightsRange('1001', D('2026-07-06T00:00:00'), D('2026-07-08T23:59:59.999'))
    expect(res).toMatchObject({ partial: true, failed: false })
    expect(res.points).toHaveLength(3 + 1 + 3)

    h.samplesPerDay = 0
    h.failDays = new Set([DAY('2026-07-01T00:00:00')])
    const none = await loadInsightsRange('1001', D('2026-07-01T00:00:00'), D('2026-07-01T23:59:59.999'))
    expect(none.failed).toBe(true)
  })

  it('a request that throws is a failed day, not a crash', async () => {
    const { fetchWindow } = await import('../hooks/useHistoryFetcher')
    vi.mocked(fetchWindow).mockRejectedValueOnce(new Error('Network down'))
    const res = await loadInsightsRange('1001', D('2026-07-01T00:00:00'), D('2026-07-02T23:59:59.999'))
    expect(res).toMatchObject({ partial: true, failed: false })
    expect(res.points).toHaveLength(3)
  })

  it('page and background share one request per device-day', async () => {
    let release!: () => void
    h.gate = new Promise(r => { release = r })
    const a = fetchDay('1001', DAY('2026-09-20T00:00:00'))
    const b = fetchDay('1001', DAY('2026-09-20T00:00:00'))
    release()
    await Promise.all([a, b])
    expect(h.fetches).toHaveLength(1)
  })

  it('cached points become the records Insights sums, to the same Wh', () => {
    const t = D('2026-09-23T09:00:00')
    const pts: HistoryPoint[] = [0, 1, 2, 3].map(i => ({
      time: '', timestamp: t + i * 15 * 60_000, solar: 100, output: 120, ac: 50, soc: 80, battery: null,
    }))
    const frame = buildInsightsFrame(pointsToRecords(pts), 'Day', new Date(t))
    expect(frame.solarWh[9]).toBe(100)
    expect(frame.acWh[9]).toBe(50)
    expect(frame.outputWh[9]).toBe(120)
  })
})
