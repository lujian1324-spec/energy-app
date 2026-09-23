/**
 * SW-13 — the Smart Schedule failure copy, in one place.
 *
 * A queued save is replayed by `useSmartScheduleFlush`, which both
 * `SmartSchedulePage` and `DevicePage` mount — and the realistic reconnect
 * happens with only the device list open. Both have to report a refusal, and
 * both have to report it in the **existing** words: there is no approved copy
 * for "a background replay was refused" (AC-13-11), so the strings here are
 * exactly the ones the Save button already shows.
 *
 * Kept out of the hook deliberately: the hook must not invent a message of its
 * own on a default path. It hands the result to the caller and the caller
 * formats it through this module, so the two pages cannot drift apart.
 */

import type { SmartScheduleStep } from '../api/smartScheduleControl'
import { sanitizeUiCopy } from './uiCopy'

/** Only the failure fields matter here; the result shape is bigger than this. */
export interface SmartScheduleFailure {
  failedStep?: SmartScheduleStep
  detail?: string
}

/**
 * The toast title for a refused save: the step names the failure, and the
 * direction (on/off) names it when the step is the whole run.
 */
export function stepFailureTitle(r: SmartScheduleFailure, enabling: boolean): string {
  if (r.failedStep === 'passthrough') return 'Could not set the charge power'
  return enabling ? 'Could not turn Smart Schedule on' : 'Could not turn Smart Schedule off'
}

/** Title + body for a replayed save the device answered and refused. */
export function flushRejectionNotice(
  r: SmartScheduleFailure,
  enabling: boolean,
  gaveUp: boolean
): { title: string; message?: string } {
  return {
    title: stepFailureTitle(r, enabling),
    message: gaveUp
      ? 'Automatic retries stopped. Review the settings and save again.'
      : sanitizeUiCopy(r.detail ?? '', '') || undefined,
  }
}
