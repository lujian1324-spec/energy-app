/**
 * Local calendar days, shared by the history cache (utils/insightsCache.ts) and
 * the Real-Time Power fetcher (hooks/useHistoryFetcher.ts), which both record
 * whole days in powerflowDB's `history_days`.
 */

/** A day read this long after it ended is final — late uploads have landed by then. */
export const SETTLE_MS = 2 * 60 * 60_000

export function localDayStart(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** The next local midnight (DST-safe: calendar days, not 24 h). */
export function nextDayStart(dayStart: number): number {
  const d = new Date(dayStart)
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Is [from, to] exactly one whole local day (to = the last millisecond or second of it)? */
export function isWholeLocalDay(from: number, to: number): boolean {
  if (from !== localDayStart(from)) return false
  const end = nextDayStart(from)
  return to >= end - 1000 && to < end
}

/** Was the day over and settled when it was read? */
export function isFinalFetch(dayStart: number, fetchedAt: number): boolean {
  return fetchedAt >= nextDayStart(dayStart) + SETTLE_MS
}
