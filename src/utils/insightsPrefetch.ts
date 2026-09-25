/**
 * When the Insights history cache fills (v4.21.0) — see utils/insightsCache.ts.
 *
 * Every time the app opens — a launch, or coming back to the foreground at
 * least RERUN_MS after the last run — the last month of the device Insights
 * shows is cached in the background, so opening Insights paints at once.
 *
 * It must never be felt on the screen the user is on:
 *  - it starts FIRST_RUN_DELAY_MS after the device list is in (the first
 *    screen has drawn and made its own requests by then);
 *  - one day is read at a time, and before each one it waits for idle time
 *    (requestIdleCallback) plus a short gap, so page requests and taps go
 *    first — one day is a single small request (keys/history/v1);
 *  - it touches no React state; everything goes into IndexedDB;
 *  - it stops as soon as the app is hidden, offline, signed out, in guest
 *    mode, or a firmware update holds the lock, and picks up next time.
 */
import { useAuthStore } from '../stores/authStore'
import { useDeviceStore } from '../stores/deviceStore'
import { tokenStore } from './apiClient'
import { isFirmwareUpdateLocked } from './firmwareLock'
import { insightsDeviceId, prefetchInsightsHistory } from './insightsCache'

export const FIRST_RUN_DELAY_MS = 3000
/** A return to the foreground re-runs only this long after the last finished run. */
export const RERUN_MS = 30 * 60_000
/** Gap between two days on top of waiting for idle time. */
const DAY_GAP_MS = 300

let running = false
let lastRunAt = 0

function canRun(): boolean {
  const auth = useAuthStore.getState()
  if (!auth.isAuthenticated || auth.isGuest) return false
  if (useDeviceStore.getState().isDemoMode) return false
  if (!tokenStore.get()) return false
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  return !isFirmwareUpdateLocked()
}

/** Wait for idle time, then a short gap. */
function pause(): Promise<void> {
  return new Promise(resolve => {
    const after = () => setTimeout(resolve, DAY_GAP_MS)
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    if (ric) ric(after, { timeout: 2000 })
    else after()
  })
}

async function run(): Promise<void> {
  if (running || !canRun()) return
  const deviceId = insightsDeviceId(useDeviceStore.getState().devices)
  if (!deviceId) return
  running = true
  const userId = localStorage.getItem('iot_user_id')
  try {
    const res = await prefetchInsightsHistory({
      deviceId,
      pause,
      isActive: () => canRun() && localStorage.getItem('iot_user_id') === userId,
    })
    // A run cut short (hidden, offline…) resumes on the next return to the foreground.
    if (!res.stopped) lastRunAt = Date.now()
    if (res.fetched || res.failed) console.info('[insights] cached', res.fetched, 'day(s) in the background', res.failed ? `(${res.failed} failed)` : '')
  } catch (e) {
    console.warn('[insights] background cache stopped:', e)
  } finally {
    running = false
  }
}

/** Start filling the cache on this app open and on each return to the foreground. Returns a stop function. */
export function startInsightsPrefetch(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let launchDone = false

  const schedule = (delay: number) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void run() }, delay)
  }

  // This open: as soon as signed in with a device list.
  const tryLaunch = () => {
    if (launchDone) return
    const { devices, isDemoMode } = useDeviceStore.getState()
    const { isAuthenticated, isGuest } = useAuthStore.getState()
    if (!isAuthenticated || isGuest || isDemoMode || devices.length === 0) return
    launchDone = true
    schedule(FIRST_RUN_DELAY_MS)
  }
  const offDevices = useDeviceStore.subscribe(tryLaunch)
  const offAuth = useAuthStore.subscribe(s => {
    // A new sign-in is a new open for that account.
    if (!s.isAuthenticated) { launchDone = false; lastRunAt = 0 }
    tryLaunch()
  })
  tryLaunch()

  // Back to the foreground: another open (a stopped run resumes here too).
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - lastRunAt < RERUN_MS) return
    if (launchDone) schedule(FIRST_RUN_DELAY_MS)
  }
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    if (timer) clearTimeout(timer)
    offDevices()
    offAuth()
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/** For tests. */
export function __resetInsightsPrefetch(): void {
  running = false
  lastRunAt = 0
}
