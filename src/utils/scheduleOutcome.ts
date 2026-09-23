/**
 * SW-12 — telling the instant power write apart from the background schedule.
 *
 * A save touches two different things: the charge power the device takes right
 * now (Modbus 0x0085) and the window the relay keeps so the boundaries are
 * honoured with the app closed. They fail independently, and the screens used
 * to show only the first — a relay that refused the window still left the user
 * looking at a clean save, believing the device would switch overnight.
 *
 * This returns the one notice that is owed when they disagree, or null when
 * there is nothing to say. No new UI: the pages pass it to the existing toast.
 */

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
 * The background-schedule half of the result, as a notice — null when the relay
 * agreed with the device, or when this build has no relay (client-side timing is
 * then the documented behaviour, not a failure to report).
 *
 * Turning a schedule **off** is the worse case of the two: the device is back on
 * its normal charge power, but a relay that never got the change can still act
 * on the old window later, so the user has to be told it may still fire.
 */
export function backgroundScheduleNotice(o: ScheduleOutcome): ScheduleNotice | null {
  if (!o.instantPowerApplied) return null // the save already failed; that is the message
  if (!o.relayConfigured || o.relayAccepted) return null

  return o.enabling
    ? {
        severity: 'warning',
        title: 'Saved on the device, not in the background',
        message: 'The charge power was applied now, but the schedule server did not take the window — it will only switch while the app is open.',
      }
    : {
        severity: 'warning',
        title: 'Background schedule may still run',
        message: 'The charge power was restored now, but the schedule server did not take the change — an earlier background schedule may still switch this device.',
      }
}
