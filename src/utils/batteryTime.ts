/**
 * Unified battery time estimate — single source of truth for the
 * "time to full" / "time remaining" label shown on the battery ring across
 * the Overview and Device Monitor pages.
 *
 * Convention (matches the original DeviceMonitorPage logic):
 *   netChargeW    = acPower + solarPower - outputPower   (charge +, discharge -)
 *   ratedCapacity = (ratedPower kW ?? 5) * 1000          (kW → W/Wh)
 *
 *   netChargeW > 0           → "Xh Ym to full"
 *   netChargeW < 0 & SOC > 0 → "Xh Ym remaining"
 *   isCharging (battery +)   → "Charging"
 *   otherwise                → "--"
 *
 * Labels are self-contained (e.g. "1h16m to full"); pass them to BatteryRing
 * with the `rawTimeLabel` prop so the ring renders them verbatim.
 */

/** Format minutes as "1h16m" — no inner space, negative values clamped to 0. */
export function formatDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins))
  return `${Math.floor(m / 60)}h${m % 60}m`
}

export interface BatteryTimeInput {
  acPower: number
  solarPower: number
  outputPower: number
  /** remainingBatteryCapacity (state of charge, %) */
  soc: number
  /** device.ratedPower in kW (defaults to 5 kW when unknown) */
  ratedPowerKW?: number
  /** batteryPower > 0 (used only for the idle "Charging" fallback) */
  isCharging?: boolean
}

export function batteryTimeLabel({
  acPower,
  solarPower,
  outputPower,
  soc,
  ratedPowerKW,
  isCharging = false,
}: BatteryTimeInput): string {
  const netChargeW = acPower + solarPower - outputPower
  const ratedCapacity = (ratedPowerKW ?? 5) * 1000

  if (netChargeW > 0) {
    return `${formatDuration(((ratedCapacity - soc) / netChargeW) * 60)} to full`
  }
  if (netChargeW < 0 && soc > 0) {
    return `${formatDuration((soc / -netChargeW) * 60)} remaining`
  }
  if (isCharging) return 'Charging'
  return '--'
}
