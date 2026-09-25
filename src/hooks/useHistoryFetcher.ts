/**
 * A device's history over [fromTime, toTime] for the Real-Time Power chart.
 *
 * Read the way the Solar of Things console reads a device's day
 * (siseli-history-api-handoff): `POST /deviceState/simple/attribute/keys/history/v1`
 * with the four keys the tabs plot, 1,500 frames a page, columnar reply. If the
 * platform refuses that call, the session falls back to the Siseli app's
 * `POST /deviceState/attribute/record/list` (`doGetDeviceHistory`, 80 a page),
 * which is what this read before — so the chart never goes blank over it.
 *
 * The server is the source of truth; the on-phone cache only paints first.
 *  1. The cache for THIS device and window paints at once (keyed by
 *     [deviceId, timestamp] — no other device's rows can come back).
 *  2. The whole window is then read from the server, every visit, and replaces
 *     the cache for it. The cache used to end the run: once any of today was
 *     stored the request was never made again, so the curve froze at the first
 *     visit, a half-finished fetch stayed half-finished all day, and rows the
 *     guest-mode simulator had written without a deviceId were read as every
 *     device's.
 *  3. With `live`, the tail is re-read every minute while the screen is visible,
 *     so today's curve keeps growing.
 *
 * fromTime/toTime go out as local time with the zone offset. The old formatter
 * dropped the minus sign west of UTC ("…T00:00:0007:00"), so every US user got
 * 20101 "illegal argument" and an empty chart; `toIsoTz` is shared now.
 */
import { useState, useEffect, useRef } from 'react'
import { fetchDeviceRecordHistory, fetchKeysHistoryV1 } from '../api/deviceApi'
import { isApiSuccess } from '../utils/apiClient'
import { FIRMWARE_LOCK_CODE } from '../utils/firmwareLock'
import { toUserFacingError } from '../utils/uiCopy'
import { markHistoryDay, readDeviceHistory, replaceDeviceHistory } from '../db/powerflowDB'
import { isFinalFetch, isWholeLocalDay } from '../utils/localDays'
import { HISTORY_KEYS, columnarToPoints, mergePoints, recordsToPoints, toIsoTz, type HistoryPoint } from '../utils/historyPoints'

export type { HistoryPoint } from '../utils/historyPoints'

export interface UseHistoryFetcherResult {
  points: HistoryPoint[]
  loading: boolean
  done: boolean
  currentPage: number
  savedCount: number
  fromCache: boolean
  error: string | null
}

/** Page size the console uses for keys/history/v1. */
export const KEYS_V1_PAGE_SIZE = 1500
/** Page size of the Siseli reference client (doGetDeviceHistory, count 80). */
const PAGE_SIZE = 80
/** Safety stop: 80 × 60 = 4,800 samples, a day at 18 s cadence. */
const MAX_PAGES = 60
const KEYS_V1_MAX_PAGES = 10
/** How often the tail of a live window is re-read. */
export const LIVE_REFRESH_MS = 60_000
/** Re-read this much before the newest sample, for late uploads. */
const LIVE_OVERLAP_MS = 10 * 60_000

type PageResult = { points: HistoryPoint[]; complete: boolean; error: string | null; pages: number }

/**
 * keys/history/v1 refusals in a row (v4.23.1). One refusal — a busy server — used to
 * switch the whole session to the slower record/list until the app restarted; now
 * that read alone falls back, and only `KEYS_V1_STRIKES` in a row pause the call for
 * `KEYS_V1_RETRY_MS`, after which it is tried again.
 */
let keysV1Strikes = 0
let keysV1PausedUntil = 0
export const KEYS_V1_STRIKES = 2
export const KEYS_V1_RETRY_MS = 10 * 60_000
/** For tests. */
export function resetHistorySource(): void { keysV1Strikes = 0; keysV1PausedUntil = 0 }

/**
 * Every page of [from, to]. A failed page stops the run: what came before it
 * is returned with `complete: false` and the reason.
 */
export async function fetchWindow(
  deviceId: string,
  from: number,
  to: number,
  isCancelled: () => boolean,
  onPage?: (sofar: HistoryPoint[], page: number) => void,
): Promise<PageResult> {
  if (Date.now() >= keysV1PausedUntil) {
    const res = await fetchWindowKeysV1(deviceId, from, to, isCancelled, onPage)
    if (res !== 'refused') {
      keysV1Strikes = 0
      return res
    }
    if (++keysV1Strikes >= KEYS_V1_STRIKES) {
      keysV1PausedUntil = Date.now() + KEYS_V1_RETRY_MS
      console.warn(`[history] keys/history/v1 refused ${keysV1Strikes}× in a row; record/list for ${KEYS_V1_RETRY_MS / 60_000} min`)
    }
  }
  return fetchWindowRecordList(deviceId, from, to, isCancelled, onPage)
}

/**
 * The console's call. 'refused' when the first page is not a success with a
 * columnar payload — the caller then falls back rather than show nothing.
 */
async function fetchWindowKeysV1(
  deviceId: string,
  from: number,
  to: number,
  isCancelled: () => boolean,
  onPage?: (sofar: HistoryPoint[], page: number) => void,
): Promise<PageResult | 'refused'> {
  const all: HistoryPoint[] = []
  for (let page = 1; page <= KEYS_V1_MAX_PAGES; page++) {
    const res = await fetchKeysHistoryV1({
      deviceId,
      keys: [...HISTORY_KEYS],
      fromTime: toIsoTz(from),
      toTime: toIsoTz(to),
      page,
      count: KEYS_V1_PAGE_SIZE,
      orderByTimeAsc: true,
    })
    if (isCancelled()) return { points: all, complete: false, error: null, pages: page }
    // Held back by a firmware update (utils/firmwareLock): not the platform
    // refusing this call, so it must not switch the session to record/list.
    if (res.code === FIRMWARE_LOCK_CODE) return { points: all, complete: false, error: res.message ?? null, pages: page }
    const times = res.data?.payload?.timeSeries
    if (!isApiSuccess(res.code) || !Array.isArray(times)) {
      const raw = res.message ?? res.msg ?? ''
      console.warn('[history] keys/history/v1 page failed:', page, res.code, raw)
      if (page === 1) return 'refused'
      return { points: all, complete: false, error: raw || "Couldn't load history", pages: page }
    }
    all.push(...columnarToPoints(res.data!.payload))
    onPage?.(all, page)
    // A short page is the end; so is the last page when `total` counts pages.
    const total = Number(res.data?.total)
    if (times.length < KEYS_V1_PAGE_SIZE || (Number.isFinite(total) && total > 0 && page >= total)) {
      return { points: all, complete: true, error: null, pages: page }
    }
  }
  return { points: all, complete: false, error: null, pages: KEYS_V1_MAX_PAGES }
}

/** The Siseli app's call (doGetDeviceHistory): one record per frame, 80 a page. */
async function fetchWindowRecordList(
  deviceId: string,
  from: number,
  to: number,
  isCancelled: () => boolean,
  onPage?: (sofar: HistoryPoint[], page: number) => void,
): Promise<PageResult> {
  const all: HistoryPoint[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchDeviceRecordHistory({
      deviceId,
      fromTime: toIsoTz(from),
      toTime: toIsoTz(to),
      page,
      count: PAGE_SIZE,
      orderByTimeAsc: true,
    })
    if (isCancelled()) return { points: all, complete: false, error: null, pages: page }
    if (!isApiSuccess(res.code) || !res.data) {
      const raw = res.message ?? res.msg ?? ''
      console.warn('[history] page failed:', page, res.code, raw)
      return { points: all, complete: false, error: raw || "Couldn't load history", pages: page }
    }
    const list = res.data.list ?? []
    all.push(...recordsToPoints(list))
    onPage?.(all, page)
    if (list.length < PAGE_SIZE) return { points: all, complete: true, error: null, pages: page }
  }
  return { points: all, complete: false, error: null, pages: MAX_PAGES }
}

export function useHistoryFetcher(
  deviceId: string | null,
  fromTime: number,
  toTime: number,
  options: { live?: boolean } = {},
): UseHistoryFetcherResult {
  const live = !!options.live
  const [points, setPoints] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [fromCache, setFromCache] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The points of the run in flight, so the live tick merges into what is on screen.
  const pointsRef = useRef<HistoryPoint[]>([])

  useEffect(() => {
    pointsRef.current = []
    setPoints([])
    setDone(false)
    setCurrentPage(0)
    setSavedCount(0)
    setFromCache(false)
    setError(null)
    if (!deviceId) { setLoading(false); return }

    let cancelled = false
    const isCancelled = () => cancelled
    const show = (next: HistoryPoint[]) => {
      pointsRef.current = next
      setPoints(next)
    }
    const store = (from: number, to: number, pts: HistoryPoint[]) =>
      replaceDeviceHistory(deviceId, from, to, pts)
        .then(() => { if (!cancelled) setSavedCount(pointsRef.current.length) })
        .catch(e => console.warn('[history] cache write failed:', e))

    let tailInFlight = false
    let fullDone = false
    // The whole window has come back once. Until it has (a page failed, the read
    // threw), each tick re-reads all of it rather than the tail, so a gap left in
    // the middle is filled while the screen is open (v4.23.1) — the tail read
    // alone never reached it.
    let wholeRead = false
    const markWholeDay = (startedAt: number) => {
      if (!cancelled && isWholeLocalDay(fromTime, toTime)) {
        return markHistoryDay(deviceId, fromTime, startedAt, isFinalFetch(fromTime, startedAt))
      }
    }
    const refreshTail = async () => {
      if (cancelled || tailInFlight || !fullDone) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      tailInFlight = true
      try {
        const newest = pointsRef.current[pointsRef.current.length - 1]?.timestamp
        const from = wholeRead ? Math.max(fromTime, (newest ?? fromTime) - LIVE_OVERLAP_MS) : fromTime
        const to = wholeRead ? Math.min(toTime, Date.now()) : toTime
        if (to <= from) return
        const startedAt = Date.now()
        const res = await fetchWindow(deviceId, from, to, isCancelled)
        if (cancelled || !res.complete) return
        // The server's answer for [from, to] replaces ours for that span.
        const kept = pointsRef.current.filter(p => p.timestamp < from || p.timestamp > to)
        show(mergePoints(kept, res.points))
        setError(null)
        const first = !wholeRead
        wholeRead = true
        if (first) setFromCache(false)
        void store(from, to, res.points)
          .then(() => (first ? markWholeDay(startedAt) : undefined))
          .catch(e => console.warn('[history] day mark failed:', e))
      } catch (e) {
        console.warn('[history] live refresh failed:', e)
      } finally {
        tailInFlight = false
      }
    }

    const run = async () => {
      setLoading(true)
      // 1. Paint what this device has cached. The cache can only ever speed
      //    this up: a failing read goes straight on to the request.
      let cached: HistoryPoint[] = []
      try {
        cached = await readDeviceHistory(deviceId, fromTime, toTime)
      } catch (e) {
        console.warn('[history] cache read failed, fetching instead:', e)
      }
      if (cancelled) return
      if (cached.length > 0) {
        show(cached)
        setFromCache(true)
      }

      // 2. The whole window from the server, every visit.
      const startedAt = Date.now()
      try {
        const res = await fetchWindow(deviceId, fromTime, toTime, isCancelled, (sofar, page) => {
          if (cancelled) return
          setCurrentPage(page)
          // Until the server has answered past it, a cached sample still stands.
          const last = sofar[sofar.length - 1]?.timestamp ?? fromTime
          show(mergePoints(cached.filter(p => p.timestamp > last), sofar))
        })
        if (cancelled) return
        if (res.complete) {
          wholeRead = true
          show(res.points)
          setFromCache(false)
          // A whole local day just read counts as cached for Insights too, so the
          // background cache does not read it again (utils/insightsCache.ts).
          void store(fromTime, toTime, res.points)
            .then(() => markWholeDay(startedAt))
            .catch(e => console.warn('[history] day mark failed:', e))
        } else {
          // Stopped at the page cap rather than on a failure: reading it all again
          // every minute would not get further.
          if (!res.error) wholeRead = true
          show(mergePoints(cached, res.points))
          if (res.error) setError(res.error)
        }
      } catch (e) {
        console.warn('[history] fetch threw:', e)
        if (!cancelled) setError(toUserFacingError(e, "Couldn't load history"))
      } finally {
        if (!cancelled) {
          fullDone = true
          setDone(true)
          setLoading(false)
        }
      }
    }

    void run()
    const timer = live ? setInterval(() => { void refreshTail() }, LIVE_REFRESH_MS) : null
    const onVisible = () => {
      if (live && document.visibilityState === 'visible') void refreshTail()
    }
    if (live) document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      if (live) document.removeEventListener('visibilitychange', onVisible)
    }
  }, [deviceId, fromTime, toTime, live])

  return { points, loading, done, currentPage, savedCount, fromCache, error }
}
