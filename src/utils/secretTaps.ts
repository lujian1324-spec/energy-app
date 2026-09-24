/**
 * Counting taps for a hidden entry (v4.17.4): the sign-in screen's SIERRO
 * wordmark opens the account-and-password sign-in after 10 quick taps.
 *
 * Taps count while each follows the last within `gapMs`; a longer pause starts
 * the count again, so ordinary taps on the wordmark never add up to it. Nothing
 * on screen reacts before the count is reached.
 */
export const SECRET_TAPS = 10
export const SECRET_TAP_GAP_MS = 1500

export interface TapState {
  count: number
  lastAt: number
}

export const NO_TAPS: TapState = { count: 0, lastAt: 0 }

/** The count after a tap at `now`, and whether it reached `target`. */
export function registerTap(
  prev: TapState,
  now: number,
  target = SECRET_TAPS,
  gapMs = SECRET_TAP_GAP_MS,
): { state: TapState; unlocked: boolean } {
  const count = prev.count > 0 && now - prev.lastAt <= gapMs ? prev.count + 1 : 1
  if (count >= target) return { state: NO_TAPS, unlocked: true }
  return { state: { count, lastAt: now }, unlocked: false }
}
