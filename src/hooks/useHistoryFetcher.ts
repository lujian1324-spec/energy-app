/**
 * A device's history over [fromTime, toTime] for the Real-Time Power chart,
 * from `POST /deviceState/attribute/record/list` (Siseli `doGetDeviceHistory`:
 * deviceId, fromTime, toTime, orderByTimeAsc, count 80, page).
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
import { fetchDeviceRecordHistory } from '../api/deviceApi'
import { isApiSuccess } from '../utils/apiClient'
import { toUserFacingError } from '../utils/uiCopy'
import { readDeviceHistory, replaceDeviceHistory } from '../db/powerflowDB'
import { mergePoints, recordsToPoints, toIsoTz, type HistoryPoint } from '../utils/historyPoints'

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

/** Page size of the Siseli reference client (doGetDeviceHistory, count 80). */
const PAGE_SIZE = 80
/** Safety stop: 80 × 60 = 4,800 samples, a day at 18 s cadence. */
const MAX_PAGES = 60
/** How often the tail of a live window is re-read. */
export const LIVE_REFRESH_MS = 60_000
/** Re-read this much before the newest sample, for late uploads. */
const LIVE_OVERLAP_MS = 10 * 60_000

type PageResult = { points: HistoryPoint[]; complete: boolean; error: string | null; pages: number }

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
    const refreshTail = async () => {
      if (cancelled || tailInFlight || !fullDone) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      tailInFlight = true
      try {
        const newest = pointsRef.current[pointsRef.current.length - 1]?.timestamp
        const from = Math.max(fromTime, (newest ?? fromTime) - LIVE_OVERLAP_MS)
        const to = Math.min(toTime, Date.now())
        if (to <= from) return
        const res = await fetchWindow(deviceId, from, to, isCancelled)
        if (cancelled || !res.complete) return
        // The server's answer for [from, to] replaces ours for that span.
        const kept = pointsRef.current.filter(p => p.timestamp < from || p.timestamp > to)
        show(mergePoints(kept, res.points))
        setError(null)
        void store(from, to, res.points)
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
          show(res.points)
          setFromCache(false)
          void store(fromTime, toTime, res.points)
        } else {
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
