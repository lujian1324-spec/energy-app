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
 * One key per account and device (`sierro-smart-pending-<account>-<id>`), so devices queued while
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
 * pending save is parked until the next explicit Save. A save the
 * firmware keeps rejecting must not be retried forever on every reconnect.
 */
export const MAX_FLUSH_ATTEMPTS = 5

export function getScheduleAccount(): string {
  try { return localStorage.getItem('iot_user_id')?.trim() ?? '' } catch { return '' }
}

function key(deviceId: string): string {
  return `sierro-smart-pending-${encodeURIComponent(getScheduleAccount())}-${deviceId}`
}

function read(deviceId: string): PendingSmartSchedule | null {
  try {
    if (!getScheduleAccount()) return null
    const raw = localStorage.getItem(key(deviceId))
    if (!raw) return null
    const p = JSON.parse(raw) as PendingSmartSchedule
    // A half-written or hand-edited entry must not be replayed: a window
    // without times would write a phase the user never asked for.
    if (!p || typeof p !== 'object' || !p.window) return null
    const w = p.window
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/
    if (typeof w.enabled !== 'boolean' || !time.test(w.startTime) ||
        !time.test(w.endTime) || typeof w.model !== 'string' || !Number.isFinite(w.chargePowerW) ||
        w.chargePowerW < 0 || !Number.isFinite(p.queuedAt) || !Number.isInteger(p.attempts) || p.attempts < 0) return null
    return {
      window: w,
      queuedAt: Number.isFinite(p.queuedAt) ? p.queuedAt : 0,
      attempts: Number.isFinite(p.attempts) ? p.attempts : 0,
    }
  } catch {
    return null
  }
}

function write(deviceId: string, p: PendingSmartSchedule): boolean {
  try {
    if (!getScheduleAccount()) return false
    localStorage.setItem(key(deviceId), JSON.stringify(p))
    return true
  } catch {
    return false
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
): PendingSmartSchedule | null {
  // A same-millisecond edit (or clock rollback) must get a distinct revision.
  const queuedAt = Math.max(now, (read(String(deviceId))?.queuedAt ?? 0) + 1)
  const pending: PendingSmartSchedule = { window, queuedAt, attempts: 0 }
  return write(String(deviceId), pending) ? pending : null
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
 * Returns the attempts now spent and whether automatic retries must stop.
 * Keep the rejected intent so the phase-only writer cannot bypass the refusal.
 * Only a device that is online and said no gets
 * counted — a flush skipped because the link went away is not an attempt.
 */
export function recordFlushAttempt(
  deviceId: string | number,
  queuedAt?: number,
): { attempts: number; gaveUp: boolean } {
  const id = String(deviceId ?? '')
  const cur = id ? read(id) : null
  if (!cur) return { attempts: 0, gaveUp: false }
  if (queuedAt !== undefined && cur.queuedAt !== queuedAt) return { attempts: 0, gaveUp: false }
  const attempts = Math.min(cur.attempts + 1, MAX_FLUSH_ATTEMPTS)
  write(id, { ...cur, attempts })
  return { attempts, gaveUp: attempts >= MAX_FLUSH_ATTEMPTS }
}
