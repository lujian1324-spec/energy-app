/**
 * Shared background-schedule toast policy. Enabling or updating a window stays
 * quiet after the device accepts the power command. An unconfirmed stop still
 * warns because the earlier background schedule may continue to run.
 */

import { sanitizeUiCopy } from './uiCopy'

export interface ScheduleOutcome {
  /** Was the user turning the schedule on (or re-saving it) rather than off? */
  enabling: boolean
  /** Did the 0x0085 write land? */
  instantPowerApplied: boolean
  /** Does this build have a relay at all? Unconfigured is by design, not a failure. */
  relayConfigured: boolean
  /** Did the relay take the window? */
  relayAccepted: boolean
  /** The relay's refusal, for the message body. */
  relayDetail?: string
}

export interface ScheduleNotice {
  severity: 'warning'
  title: string
  message?: string
}

/**
 * Toast visibility does not change the relay acknowledgement in the save result.
 */
export function backgroundScheduleNotice(o: ScheduleOutcome): ScheduleNotice | null {
  if (o.enabling) return null
  if (!o.instantPowerApplied) return null // the save already failed; that is the message
  if (!o.relayConfigured || o.relayAccepted) return null

  // SW-15: append relay wording only when it is safe. Empty sanitize fallback
  // means "no secondary detail". Length gate allows body+reviewed detail (~230).
  const body = 'The restore-power command was accepted, but the background stop was not confirmed. An earlier schedule may still switch this device.'
  const safeDetail = sanitizeUiCopy(o.relayDetail, '')
  return {
    severity: 'warning',
    title: 'Background schedule may still run',
    message: safeDetail ? `${body} ${safeDetail}` : body,
  }
}
