/**
 * APP-20260826-003: a Bluetooth drop in the middle of setup is retried before
 * it is shown as a failure.
 *
 * Short drops — the phone moving, a GATT hiccup, the OS pausing the radio —
 * used to land the user straight on "Setup Failed · Device disconnected". Now
 * the flow reconnects on its own, a few times with growing gaps, reporting each
 * attempt so the screen can say what it is doing, and then carries on from the
 * stage that was interrupted. The Wi-Fi details are still in hand, so nothing
 * has to be typed again. Only when every attempt fails does the user see the
 * failure screen, whose primary action is Reconnect.
 */

export const RECONNECT_ATTEMPTS = 3
/** Wait before each attempt (ms). */
export const RECONNECT_DELAYS_MS = [1000, 2000, 4000] as const

export function isDisconnectError(message: string): boolean {
  return /disconnect|GATT|not connected/i.test(message)
}

export function reconnectingStage(attempt: number, total = RECONNECT_ATTEMPTS): `Reconnecting to device (${number}/${number})` {
  return `Reconnecting to device (${attempt}/${total})`
}

/**
 * Try `connect` up to `attempts` times. Resolves true on the first success,
 * false once every attempt has failed. Never throws. `shouldStop` lets the caller
 * abandon the loop (the user closed the flow).
 */
export async function reconnectWithRetry(
  connect: () => Promise<void>,
  {
    attempts = RECONNECT_ATTEMPTS,
    delaysMs = RECONNECT_DELAYS_MS,
    onAttempt,
    shouldStop,
    sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms)),
  }: {
    attempts?: number
    delaysMs?: readonly number[]
    onAttempt?: (attempt: number, total: number) => void
    shouldStop?: () => boolean
    sleep?: (ms: number) => Promise<void>
  } = {},
): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    if (shouldStop?.()) return false
    onAttempt?.(i, attempts)
    await sleep(delaysMs[Math.min(i - 1, delaysMs.length - 1)] ?? 0)
    if (shouldStop?.()) return false
    try {
      await connect()
      return true
    } catch {
      /* next attempt */
    }
  }
  return false
}
