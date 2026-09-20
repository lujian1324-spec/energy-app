/**
 * What the AC-output switch on a device card should show.
 *
 * The switch used to be a local boolean that defaulted to on and was never
 * read back from the device, so pressing the button on the front of the unit
 * changed the hardware and left the app showing the opposite. The device's own
 * reading decides; a command we sent holds the switch only until the device
 * reports it, or until it has plainly been ignored.
 */

/** How long a sent command may hold the switch before the device decides. */
export const POWER_COMMAND_SETTLE_MS = 15000

export interface PowerSwitchInput {
  /** inversionState / acOut1Enable, or null when the device reports neither. */
  reported: boolean | null
  /** What we last asked for and when, while it is still outstanding. */
  pending?: { value: boolean; at: number } | null
  /** Wi-Fi reachability — NOT the output state, and only a last resort. */
  online?: boolean
  now?: number
  settleMs?: number
}

export function powerSwitchOn({
  reported,
  pending,
  online,
  now = Date.now(),
  settleMs = POWER_COMMAND_SETTLE_MS,
}: PowerSwitchInput): boolean {
  // Still waiting for the device to catch up with what we asked for.
  if (pending && reported !== pending.value && now - pending.at < settleMs) return pending.value
  if (reported !== null) return reported
  // Nothing reported: our own command is the best evidence there is, and after
  // that only whether the device is reachable, which is a different question —
  // but it is what this card has always shown, and claiming the output is off
  // would be a stronger statement than we can make.
  if (pending) return pending.value
  return online ?? true
}
