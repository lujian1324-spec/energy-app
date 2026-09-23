/**
 * SW-13 — the pending Smart Schedule save, one per device, latest only.
 *
 * A save made while the device is unreachable is still the user's decision: it
 * is kept here and replayed the moment that device comes back (AC-13-2 /
 * AC-13-4). What is kept is exactly the argument `applySmartSchedule` takes, so
 * a flush is the same call the live save makes — the window, the charge power,
 * the enable/disable intent and the model (which decides the restore power and
 * the relay's per-model rates). Nothing derived is stored: deriving it again at
 * flush time is what keeps a flush and a live save from drifting apart.
 *
 * Deliberately *not* `ChargePhaseWriter`'s pending write. That one owes the
 * device a single register value for the phase the clock is in right now, and
 * is dropped when the screen goes away. This one owes the device a whole save —
 * A, B and C — and has to outlive the screen, the navigation and the process.
 * Same trigger (the device coming online), different data and different
 * lifetime, so they stay separate.
 *
 * One key per device (`sierro-smart-pending-<id>`), so two devices queued while
 * offline flush independently and neither can be cleared by the other
 * (AC-13-10). Within a device the newest save overwrites the older one
 * outright — the user's last word is the only one worth sending (AC-13-7).
 */

import type { SmartScheduleWindow } from '../api/smartScheduleControl'

export interface PendingSmartSchedule {
  /** Everything a flush needs, unchanged from what the save was called with. */
  window: SmartScheduleWindow
  /** When the user saved it — also the token that makes a clear safe. */
  queuedAt: number
  /** Flush attempts already spent against the bounded ladder (AC-13-6). */
  attempts: number
}

/**
 * How many times a flush may be refused by a device that is online before the
 * pending save is dropped. Bounded on purpose (SW-12's spirit): a save the
 * firmware keeps rejecting must not be retried forever on every reconnect.
 */
export const MAX_FLUSH_ATTEMPTS = 5

function key(deviceId: string): string {
  return `sierro-smart-pending-${deviceId}`
}

function read(deviceId: string): PendingSmartSchedule | null {
  try {
    const raw = localStorage.getItem(key(deviceId))
    if (!raw) return null
    const p = JSON.parse(raw) as PendingSmartSchedule
    // A half-written or hand-edited entry must not be replayed: a window
    // without times would write a phase the user never asked for.
    if (!p || typeof p !== 'object' || !p.window) return null
    const w = p.window
    if (typeof w.enabled !== 'boolean' || typeof w.startTime !== 'string' ||
        typeof w.endTime !== 'string' || !Number.isFinite(w.chargePowerW)) return null
    return {
      window: w,
      queuedAt: Number.isFinite(p.queuedAt) ? p.queuedAt : 0,
      attempts: Number.isFinite(p.attempts) ? p.attempts : 0,
    }
  } catch {
    return null
  }
}

function write(deviceId: string, p: PendingSmartSchedule): void {
  try {
    localStorage.setItem(key(deviceId), JSON.stringify(p))
  } catch {
    // Storage full or blocked. The save still applied locally; it just cannot
    // be replayed later, which is the pre-SW-13 behaviour rather than a crash.
  }
}

/**
 * Remember this save for the next time the device is reachable, replacing any
 * older pending save for it. Attempts reset — this is a new intent, not a
 * retry of the last one.
 */
export function enqueueSmartScheduleSave(
  deviceId: string | number,
  window: SmartScheduleWindow,
  now: number = Date.now()
): PendingSmartSchedule {
  const pending: PendingSmartSchedule = { window, queuedAt: now, attempts: 0 }
  write(String(deviceId), pending)
  return pending
}

/** The save still owed to this device, or null. */
export function getPendingSmartScheduleSave(deviceId: string | number): PendingSmartSchedule | null {
  const id = String(deviceId ?? '')
  return id ? read(id) : null
}

/** Is a save still owed to this device? */
export function hasPendingSmartScheduleSave(deviceId: string | number): boolean {
  return getPendingSmartScheduleSave(deviceId) !== null
}

/**
 * Drop the pending save.
 *
 * `queuedAt` guards the flush: the user may have saved again while the flush
 * was in flight, and clearing then would throw away the newer intent and leave
 * the device on the older one. Pass the `queuedAt` that was flushed and a newer
 * entry survives to be sent in turn.
 */
export function clearPendingSmartScheduleSave(
  deviceId: string | number,
  queuedAt?: number
): void {
  const id = String(deviceId ?? '')
  if (!id) return
  if (queuedAt !== undefined) {
    const cur = read(id)
    if (cur && cur.queuedAt !== queuedAt) return
  }
  try {
    localStorage.removeItem(key(id))
  } catch {
    // ignore storage errors
  }
}

/**
 * Count one refused flush against the ladder.
 *
 * Returns the attempts now spent and whether the entry was dropped for
 * exceeding `MAX_FLUSH_ATTEMPTS`. Only a device that is online and said no gets
 * counted — a flush skipped because the link went away is not an attempt.
 */
export function recordFlushAttempt(
  deviceId: string | number
): { attempts: number; gaveUp: boolean } {
  const id = String(deviceId ?? '')
  const cur = id ? read(id) : null
  if (!cur) return { attempts: 0, gaveUp: false }
  const attempts = cur.attempts + 1
  if (attempts >= MAX_FLUSH_ATTEMPTS) {
    clearPendingSmartScheduleSave(id, cur.queuedAt)
    return { attempts, gaveUp: true }
  }
  write(id, { ...cur, attempts })
  return { attempts, gaveUp: false }
}
