/** Modbus U16 sentinel the inverter uses for "no reading" on power registers. */
export const INVALID_POWER_U16 = 0xffff

/**
 * Highest power reading we will believe, W.
 *
 * The largest unit in the range is rated 1000 W, so six times that is far past
 * anything the hardware can deliver — and far below where a wrapped negative
 * lands. The device does not use one sentinel: a customer's screen showed
 * **65534 W** (0xFFFE) with "0h1m remaining", so matching 0xFFFF exactly let
 * the reported value straight through. Anything up here is the device saying
 * it has no reading, whichever code it picked, and the whole top of the U16
 * range is unreachable by a real measurement either way.
 */
export const MAX_PLAUSIBLE_POWER_W = 6000

/**
 * A power register's watts, or undefined when the device has no reading.
 * Negative is not a thing these registers report: a value that looks negative
 * is a U16 the firmware never filled in.
 */
export function decodePowerU16(raw: number): number | undefined {
  if (!Number.isFinite(raw) || raw < 0) return undefined
  return raw > MAX_PLAUSIBLE_POWER_W ? undefined : raw
}
