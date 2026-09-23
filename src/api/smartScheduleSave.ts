/**
 * SW-13 — Smart Schedule's Save, with the offline case as a first-class outcome.
 *
 * `applySmartSchedule` (SW-08) is unchanged and still the only thing that talks
 * to a device: A `config/write` sleepMode → B passthrough 0x0085 → C relay
 * `POST /schedule`. What it cannot answer is whether a failure means "the
 * device refused" or "there was nothing at the other end", and Save was
 * treating both as the first: the user lost the settings and read "Could not
 * set the charge power" for a device that was simply asleep.
 *
 * This wraps it in that one decision:
 *
 * - offline (decided from **connection state**, never from the response text —
 *   see `utils/deviceConnectivity`) → the save is kept for that device and
 *   reported as a success, because it is one: the user's settings are the
 *   user's settings and the device will be told as soon as it answers
 *   (AC-13-1 / AC-13-3);
 * - online → exactly the old behaviour, failures included, so a firmware
 *   reject is still a reject (AC-13-0b / AC-13-8);
 * - online and it worked → any save queued earlier for that device is dropped:
 *   the device now holds something newer than the pending entry.
 *
 * `flushPendingSmartSchedule` is the replay half, and it is the same
 * `applySmartSchedule` call in the same A→B→C order, keeping SW-11's soft-fail
 * on a model without a `sleepMode` attribute and SW-12's split relay reporting
 * (AC-13-5 / AC-13-9).
 */

import { applySmartSchedule, type SmartScheduleResult, type SmartScheduleWindow } from './smartScheduleControl'
import {
  offlineReason,
  type OfflineReason,
  type SaveConnectivity,
} from '../utils/deviceConnectivity'
import {
  clearPendingSmartScheduleSave,
  enqueueSmartScheduleSave,
  getPendingSmartScheduleSave,
  recordFlushAttempt,
  getScheduleAccount,
  MAX_FLUSH_ATTEMPTS,
  type PendingSmartSchedule,
} from '../utils/smartScheduleQueue'
import {
  clearActiveScheduleMode,
  getActiveScheduleMode,
  setActiveScheduleMode,
} from '../utils/activeScheduleMode'
import { phaseFor } from '../utils/chargeWindow'

function saveFailure(window: SmartScheduleWindow, detail: string): SmartScheduleSaveResult {
  return { ok: false, queued: false, applied: {
    ok: false, failedStep: 'config', detail, phase: phaseFor(window.startTime, window.endTime),
    instantPowerApplied: false, relayConfigured: false, relayAccepted: false,
  } }
}

/** Injection seams — real callers pass none of these. */
export interface SmartScheduleSaveOptions {
  /** Connection state at save time. The only input that may classify a save as offline. */
  connectivity: SaveConnectivity
  /**
   * Re-read connection state after a failed write. A link that dropped *during*
   * the save leaves the same failure a reject does, and the state — not the
   * message — is what tells them apart.
   */
  recheck?: () => SaveConnectivity
  /** Overridable for tests; production always uses `applySmartSchedule`. */
  apply?: typeof applySmartSchedule
  now?: () => number
}

export interface SmartScheduleSaveResult {
  /** Did the save succeed as far as the user is concerned? Queued counts. */
  ok: boolean
  /** Was it stored for the device's return instead of written now? */
  queued: boolean
  /** The device's answer, when we actually reached it. */
  applied?: SmartScheduleResult
  /** Why it was queued, for logs. Never used to build user copy (AC-13-11). */
  offlineReason?: OfflineReason
}

/**
 * Save a Smart Schedule window: write it now, or keep it for the device's return.
 *
 * The caller does not have to branch on `queued` for its success handling —
 * `ok` covers both — only for whatever it wants to log.
 */
export async function saveSmartSchedule(
  deviceId: string | number,
  window: SmartScheduleWindow,
  opts: SmartScheduleSaveOptions
): Promise<SmartScheduleSaveResult> {
  const apply = opts.apply ?? applySmartSchedule
  const now = opts.now ?? Date.now
  const account = getScheduleAccount()
  if (!account) return saveFailure(window, 'Sign in before saving a schedule.')
  if (!window.enabled && getActiveScheduleMode(String(deviceId)) === 'sleep') {
    return saveFailure(window, 'Sleep Mode is active. Turn it off in its own settings.')
  }
  const previous = getPendingSmartScheduleSave(deviceId)?.queuedAt
  const current = () => getScheduleAccount() === account && getPendingSmartScheduleSave(deviceId)?.queuedAt === previous
  const queue = (reason: OfflineReason, applied?: SmartScheduleResult): SmartScheduleSaveResult => {
    if (!current()) return saveFailure(window, 'Schedule superseded or account changed. Reopen its settings.')
    if (!enqueueSmartScheduleSave(deviceId, window, now())) {
      return saveFailure(window, 'Could not store the offline schedule. Free storage or reconnect and try again.')
    }
    if (window.enabled) setActiveScheduleMode(String(deviceId), 'smart')
    else clearActiveScheduleMode(String(deviceId), 'smart')
    return { ok: true, queued: true, offlineReason: reason, applied }
  }

  const before = offlineReason(opts.connectivity)
  if (before) {
    // Nothing is attempted: there is no channel, and a request made into one
    // that does not exist only produces the failure this ticket is about.
    return queue(before)
  }

  const applied = await apply(deviceId, window, current)
  if (!current()) return saveFailure(window, 'Schedule superseded or account changed. Reopen its settings.')
  if (applied.ok) {
    // The device holds something newer than any pending entry for it.
    if (previous !== undefined) clearPendingSmartScheduleSave(deviceId, previous)
    return { ok: true, queued: false, applied }
  }

  // It failed while the device was marked online. That is a refusal unless the
  // connection itself has since gone — asked of the client's state, not of the
  // response (AC-13-0a).
  const after = opts.recheck?.()
  const dropped = after ? offlineReason(after) : null
  if (dropped) {
    return queue(dropped, applied)
  }

  return { ok: false, queued: false, applied }
}

export type FlushStatus =
  /** Nothing was owed to this device. */
  | 'none'
  /** Still unreachable — kept, and nothing is reported to the user (AC-13-6). */
  | 'offline'
  /** Sent and cleared. */
  | 'flushed'
  /** The device is there and said no. */
  | 'rejected'

export interface FlushPendingResult {
  status: FlushStatus
  /** What was replayed, for the caller's logging / toast. */
  pending?: PendingSmartSchedule
  applied?: SmartScheduleResult
  /** Attempts spent so far, on a rejection. */
  attempts?: number
  /** Has automatic retry stopped until an explicit new Save? */
  gaveUp?: boolean
}

export interface FlushPendingOptions {
  connectivity: SaveConnectivity
  recheck?: () => SaveConnectivity
  apply?: typeof applySmartSchedule
}

/**
 * Replay the save owed to a device that has just come back.
 *
 * Only the latest pending entry is ever sent — older ones were overwritten when
 * they were made, so there is no backlog to drain in order (AC-13-4 / AC-13-7).
 * On success the entry is cleared against its own `queuedAt`, so a save the user
 * made while this flush was in flight survives and goes out next.
 */
export async function flushPendingSmartSchedule(
  deviceId: string | number,
  opts: FlushPendingOptions
): Promise<FlushPendingResult> {
  const pending = getPendingSmartScheduleSave(deviceId)
  if (!pending) return { status: 'none' }
  if (pending.attempts >= MAX_FLUSH_ATTEMPTS) return { status: 'none' }
  const account = getScheduleAccount()
  const current = () => getScheduleAccount() === account && getPendingSmartScheduleSave(deviceId)?.queuedAt === pending.queuedAt

  if (offlineReason(opts.connectivity)) return { status: 'offline', pending }

  const apply = opts.apply ?? applySmartSchedule
  const applied = await apply(deviceId, pending.window, current)
  if (!current()) return { status: 'none' }

  if (applied.ok) {
    clearPendingSmartScheduleSave(deviceId, pending.queuedAt)
    // Keep the claim in step with what the device now holds: the offline save
    // claimed locally, and a flush of a disable has to release it (SW-12).
    if (pending.window.enabled) setActiveScheduleMode(String(deviceId), 'smart')
    else clearActiveScheduleMode(String(deviceId), 'smart')
    return { status: 'flushed', pending, applied }
  }

  // The link may have gone away mid-flush; that is not the device refusing, so
  // it does not spend an attempt and the user is told nothing.
  const after = opts.recheck?.()
  if (after && offlineReason(after)) return { status: 'offline', pending, applied }

  const { attempts, gaveUp } = recordFlushAttempt(deviceId, pending.queuedAt)
  return { status: 'rejected', pending, applied, attempts, gaveUp }
}
