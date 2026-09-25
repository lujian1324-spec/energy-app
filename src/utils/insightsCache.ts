/**
 * Insights history cache (v4.21.0).
 *
 * Insights sums a period's power samples into energy, and a Month view used to
 * read the whole month from the server on every visit — dozens of pages before
 * the chart could draw. The history now lives on the phone one local day at a
 * time (`device_history` rows + a `history_days` row per day, powerflowDB v6):
 *
 *  - A day is read from the server in one go (`fetchWindow`: keys/history/v1,
 *    falling back to record/list — the Real-Time Power call) and stored whole,
 *    replacing what the cache held for it. A day that did not come back whole
 *    is never recorded as cached.
 *  - A day read after it had ended and settled (`SETTLE_MS`, for late uploads)
 *    is **final** and never read again. Today, and a day read before it
 *    settled, is re-read on every visit.
 *  - Insights paints from the cache at once when every day of the period is
 *    cached, then re-reads only the days that are not final.
 *  - `prefetchInsightsHistory` fills the last month in the background whenever
 *    the app opens (utils/insightsPrefetch.ts), one day at a time, in idle time.
 *
 * Page and prefetch share one request per device-day (`fetchDay`), so they
 * never read the same day twice at once. `resetInsightsCache` (sign-in /
 * sign-out) drops every request in flight so none of them writes into the next
 * account's cache.
 */
import { fetchWindow } from '../hooks/useHistoryFetcher'
import {
  pruneDeviceHistoryBefore, readDeviceHistory, readHistoryDays, saveHistoryDay,
} from '../db/powerflowDB'
import type { DeviceAttributeRecord } from '../api/deviceApi'
import type { HistoryPoint } from './historyPoints'
import { SETTLE_MS, isFinalFetch, localDayStart, nextDayStart } from './localDays'

export { SETTLE_MS, isFinalFetch, localDayStart, nextDayStart }

/** How far back the background run caches: 30 days before today (and never less than this month). */
export const PREFETCH_BACK_DAYS = 30
/**
 * A day that is not final but was read this recently (the Real-Time Power chart
 * just read today) is not read again by the background run. Short, so every
 * real reopen still re-reads today.
 */
export const FRESH_MS = 2 * 60_000
/** Cached days older than this are dropped at the end of each background run. */
export const KEEP_DAYS = 62
/** Days the Insights page reads at once when the cache is missing some. */
const PAGE_CONCURRENCY = 3

// ── Local days ──

/** Every local day start from the day of `from` to the day of `to`, ascending. */
export function dayStartsBetween(from: number, to: number): number[] {
  const out: number[] = []
  if (!(to >= from)) return out
  for (let d = localDayStart(from); d <= to; d = nextDayStart(d)) out.push(d)
  return out
}

/** The background run's window: this month and the 30 days before today, whichever starts earlier. */
export function prefetchFrom(now: number): number {
  const today = new Date(localDayStart(now))
  const back = new Date(today)
  back.setDate(back.getDate() - PREFETCH_BACK_DAYS)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
  return Math.min(back.getTime(), monthStart)
}

/** The device Insights shows: the account's oldest (StatsPage). */
export function insightsDeviceId(devices: { id: string | number; createdAt?: string | null }[]): string | null {
  if (devices.length === 0) return null
  const sorted = [...devices].sort((a, b) => {
    if (a.createdAt && b.createdAt) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return 0
  })
  return String(sorted[0].id)
}

/** Cached points → the records `buildInsightsFrame` reads (only the three power fields it sums). */
export function pointsToRecords(points: HistoryPoint[]): DeviceAttributeRecord[] {
  return points.map(p => {
    const fields: Record<string, { value: number }> = {}
    if (p.solar !== null) fields.generationPower = { value: p.solar }
    if (p.ac !== null) fields.exchangeChargingPower = { value: p.ac }
    if (p.output !== null) fields.outputPower = { value: p.output }
    return { time: new Date(p.timestamp).toISOString(), fields } as DeviceAttributeRecord
  })
}

// ── One day from the server ──

export interface DayResult {
  /** The whole day came back (and was cached). */
  ok: boolean
  points: HistoryPoint[]
}

let epoch = 0
const inflight = new Map<string, Promise<DayResult>>()

/** Sign-in / sign-out: forget every request in flight; none of them may write any more. */
export function resetInsightsCache(): void {
  epoch++
  inflight.clear()
}

/** One local day of one device from the server, cached when it came back whole. */
export function fetchDay(deviceId: string, dayStart: number): Promise<DayResult> {
  const key = `${deviceId}|${dayStart}`
  const running = inflight.get(key)
  if (running) return running
  const myEpoch = epoch
  const run = (async (): Promise<DayResult> => {
    const dayEnd = nextDayStart(dayStart) - 1
    const startedAt = Date.now()
    let res: Awaited<ReturnType<typeof fetchWindow>>
    try {
      res = await fetchWindow(deviceId, dayStart, dayEnd, () => epoch !== myEpoch)
    } catch (e) {
      // Network down, session gone…: this day failed; the caller decides what that means.
      console.warn('[insightsCache] day read failed', dayStart, e)
      return { ok: false, points: [] }
    }
    if (epoch !== myEpoch) return { ok: false, points: [] }
    if (res.complete) {
      try {
        await saveHistoryDay(deviceId, dayStart, dayEnd, res.points, isFinalFetch(dayStart, startedAt), startedAt)
      } catch (e) {
        // No IndexedDB (private mode, storage full): the page still gets the day.
        console.warn('[insightsCache] could not cache day', dayStart, e)
      }
    }
    return { ok: res.complete, points: res.points }
  })().finally(() => {
    if (inflight.get(key) === run) inflight.delete(key)
  })
  inflight.set(key, run)
  return run
}

// ── The Insights page ──

export interface CachedRange {
  /** Every day of the period (up to today) is cached. */
  covered: boolean
  /** Cached samples in [from, to] — only when covered. */
  points: HistoryPoint[]
  /** Days (up to today) that are not cached, or cached but not final. */
  staleDays: number[]
}

export async function readCachedRange(deviceId: string, from: number, to: number, now = Date.now()): Promise<CachedRange> {
  const days = dayStartsBetween(from, Math.min(to, now))
  if (days.length === 0) return { covered: true, points: [], staleDays: [] }
  let rows: Awaited<ReturnType<typeof readHistoryDays>> = []
  try { rows = await readHistoryDays(deviceId, days[0], days[days.length - 1]) } catch { rows = [] }
  const byDay = new Map(rows.map(r => [r.dayStart, r]))
  const covered = days.every(d => byDay.has(d))
  const staleDays = days.filter(d => !byDay.get(d)?.final)
  let points: HistoryPoint[] = []
  if (covered) {
    try { points = await readDeviceHistory(deviceId, from, to) } catch { points = [] }
  }
  return { covered, points, staleDays }
}

export interface RangeLoad {
  points: HistoryPoint[]
  /** Some day of the period could not be read whole: totals may be short. */
  partial: boolean
  /** Nothing could be read and nothing was cached. */
  failed: boolean
}

/**
 * The period's samples. When the cache holds every day, `onCached` gets them
 * straight away; the days that are not final are then re-read from the server
 * (a few at a time) and the result replaces what `onCached` showed.
 */
export async function loadInsightsRange(
  deviceId: string,
  from: number,
  to: number,
  onCached?: (points: HistoryPoint[]) => void,
): Promise<RangeLoad> {
  const cache = await readCachedRange(deviceId, from, to)
  if (cache.covered) onCached?.(cache.points)

  const results = new Map<number, DayResult>()
  const queue = [...cache.staleDays]
  const worker = async () => {
    for (let d = queue.shift(); d !== undefined; d = queue.shift()) {
      results.set(d, await fetchDay(deviceId, d))
    }
  }
  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, queue.length) }, worker))

  // What the cache holds now (fresh days were just written), with each re-read
  // day taken from its reply — so a phone without IndexedDB still gets them.
  let base: HistoryPoint[] = cache.points
  if (!cache.covered) {
    try { base = await readDeviceHistory(deviceId, from, to) } catch { base = [] }
  }
  const replaced = [...results.entries()].filter(([, r]) => r.points.length > 0).map(([d]) => d)
  const inReplaced = (t: number) => replaced.some(d => t >= d && t < nextDayStart(d))
  const points = base.filter(p => !inReplaced(p.timestamp))
  for (const d of replaced) points.push(...results.get(d)!.points.filter(p => p.timestamp >= from && p.timestamp <= to))
  points.sort((a, b) => a.timestamp - b.timestamp)

  const anyFailed = [...results.values()].some(r => !r.ok)
  const failed = results.size > 0 && [...results.values()].every(r => !r.ok && r.points.length === 0) && points.length === 0
  return { points, partial: anyFailed && !failed, failed }
}

// ── The background run ──

export interface PrefetchOptions {
  deviceId: string
  /** Checked before every day: false stops the run (app hidden, signed out, offline, firmware update…). */
  isActive: () => boolean
  /** Waits between days so the run only uses idle time. */
  pause?: () => Promise<void>
  now?: number
}

export interface PrefetchResult {
  fetched: number
  failed: number
  stopped: boolean
}

/**
 * Cache the last month of one device: newest day first, one day at a time,
 * skipping days already final or just read. Stops when `isActive` says so or after two
 * failed days (offline, refused) — the next app open picks it up.
 */
export async function prefetchInsightsHistory({ deviceId, isActive, pause, now = Date.now() }: PrefetchOptions): Promise<PrefetchResult> {
  const days = dayStartsBetween(prefetchFrom(now), now).reverse()
  let rows: Awaited<ReturnType<typeof readHistoryDays>> = []
  try { rows = await readHistoryDays(deviceId, days[days.length - 1], days[0]) } catch { rows = [] }
  // Final days never change; a day read in the last few minutes (the chart just
  // read today, or the app was reopened) is fresh enough to leave alone.
  const skip = new Set(rows.filter(r => r.final || now - r.fetchedAt < FRESH_MS).map(r => r.dayStart))

  const myEpoch = epoch
  let fetched = 0, failed = 0, stopped = false
  for (const day of days) {
    if (skip.has(day)) continue
    if (pause) await pause()
    if (epoch !== myEpoch || !isActive()) { stopped = true; break }
    const res = await fetchDay(deviceId, day)
    if (res.ok) fetched++
    else if (++failed >= 2) { stopped = true; break }
  }
  if (!stopped && epoch === myEpoch) {
    const keepFrom = new Date(localDayStart(now))
    keepFrom.setDate(keepFrom.getDate() - KEEP_DAYS)
    try { await pruneDeviceHistoryBefore(keepFrom.getTime()) } catch { /* nothing to prune without IndexedDB */ }
  }
  return { fetched, failed, stopped }
}
