/** Modbus U16 sentinel the inverter uses for "no reading" on power registers. */
export const INVALID_POWER_U16 = 0xffff

/** Treat raw === 0xFFFF as invalid (omit); otherwise return the U16 watts. */
export function decodePowerU16(raw: number): number | undefined {
  return raw === INVALID_POWER_U16 ? undefined : raw
}
