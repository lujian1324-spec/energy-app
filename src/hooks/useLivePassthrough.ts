/**
 * Polls Modbus passthrough for live device figures and files them in the live
 * layer (see stores/livePassthroughStore), so every screen reads one sample of
 * one device rather than each keeping its own copy.
 *
 * Cadence is the caller's: the Device monitor keeps the 5s it already ran for
 * Input / Solar / Output, and the Device list runs once a minute — a list of
 * devices swept every 10s spends a channel shared with commands on numbers
 * nobody reads that fast.
 *
 * Rules that keep the numbers steady rather than merely frequent:
 *  - one device at a time within a tick, and never two ticks at once, so a slow
 *    reply delays the next read instead of stacking a second one behind it
 *  - nothing while the page is hidden; on return, read straight away if the
 *    sample has gone stale rather than waiting out the rest of the interval
 *  - a failed read leaves the previous sample in place (see the store's note)
 */
import { useCallback, useEffect, useRef } from 'react'
import { passthroughDevice } from '../api/deviceApi'
import {
  FRAMES,
  extractPassthroughRegisters,
  decodeLiveStatus,
  type LiveStatus,
} from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'
import {
  saveLivePassthrough,
  markLivePassthroughPending,
  markLivePassthroughFailed,
} from '../stores/livePassthroughStore'

/** The Device list cadence, as asked: once a minute. */
export const LIVE_PASSTHROUGH_INTERVAL_MS = 60_000
/** The Device monitor keeps the cadence its power boxes already ran at. */
export const LIVE_PASSTHROUGH_FAST_INTERVAL_MS = 5_000

/**
 * Registers a reply must carry before it can feed a LiveStatus: offsets
 * 0x00..0x1A inclusive, so Cell SOC at 0x011A is a real reading.
 *
 * Deliberately local to this hook rather than pushed into the shared decode.
 * A frame covering only AC / Solar / Output (offsets 4/6/7) leaves 0x1A
 * undefined, and decodeLiveStatus reads that as a synthetic 0 — the powers look
 * live while the ring drops to empty. Requiring it HERE makes such a reply a
 * rejected read for the live layer, which keeps the last good sample, and
 * changes nothing for any other caller of extractPassthroughRegisters.
 */
const LIVE_STATUS_MIN_REGISTERS = 0x1B

/**
 * One READ_ALL_STATUS round trip; null when the reply is missing, fails CRC, or
 * is too short to carry SOC. Short is the case worth naming: a frame covering
 * only AC / Solar / Output (offsets 4/6/7) leaves SOC at 0x1A undefined, which
 * decodes to a synthetic 0 — the powers would look live while the ring dropped
 * to 0%. The minimum above makes that a rejected read instead, and a
 * rejected read keeps the last good sample.
 */
export async function readLivePassthroughOnce(deviceId: string): Promise<LiveStatus | null> {
  const res = await passthroughDevice(deviceId, { data: FRAMES.READ_ALL_STATUS })
  if (!isApiSuccess(res.code)) return null
  const registers = extractPassthroughRegisters(res.data, LIVE_STATUS_MIN_REGISTERS)
  return registers ? decodeLiveStatus(registers) : null
}

export function useLivePassthrough(
  deviceIds: Array<string | number | null | undefined>,
  enabled = true,
  intervalMs: number = LIVE_PASSTHROUGH_INTERVAL_MS,
): { refresh: () => Promise<void> } {
  // The caller's array is rebuilt every render; the ids themselves are what the
  // effect actually depends on.
  const key = deviceIds.map(v => (v == null ? '' : String(v).trim())).filter(Boolean).join(',')
  // Pull-to-refresh calls in whenever the user asks, outside the effect's life.
  const tickRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const ids = key.split(',').filter(Boolean)
    if (!enabled || ids.length === 0) {
      tickRef.current = async () => {}
      return
    }

    let cancelled = false
    let inFlight = false
    let lastRunAt = 0

    const tick = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      lastRunAt = Date.now()
      try {
        // Every device is claimed BEFORE the first read, not each in its turn.
        // Reads run one at a time, so a device claimed only when its turn came
        // would show the cloud value, then the placeholder, then the real
        // figure — two transitions instead of one. This is a no-op for a device
        // that already has a sample, which is the ordinary case.
        for (const id of ids) markLivePassthroughPending(id)
        for (const id of ids) {
          if (cancelled) break
          try {
            const live = await readLivePassthroughOnce(id)
            if (cancelled) break
            if (live) saveLivePassthrough(id, live)
            else markLivePassthroughFailed(id)
          } catch {
            // Keep the previous sample and try again next tick; only a device
            // that has never answered is handed back to the cloud value.
            if (!cancelled) markLivePassthroughFailed(id)
          }
        }
      } finally {
        inFlight = false
      }
    }
    // Pull-to-refresh is the user asking, so it reads even on a hidden page.
    tickRef.current = tick

    const scheduled = () => {
      if (document.visibilityState === 'hidden') return
      void tick()
    }

    scheduled()
    const iv = setInterval(scheduled, intervalMs)

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRunAt >= intervalMs) void tick()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      tickRef.current = async () => {}
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [key, enabled, intervalMs])

  const refresh = useCallback(() => tickRef.current(), [])
  return { refresh }
}
