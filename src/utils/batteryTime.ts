import { MAX_PLAUSIBLE_POWER_W } from '../protocols/powerU16'

/**
 * Unified battery time estimate — single source of truth for the
 * "time to full" / "time remaining" label shown on the battery ring across
 * the Overview and Device Monitor pages.
 *
 * Physics (energy ÷ power, dimensionally consistent):
 *   netChargeW       = acPower + solarPower - outputPower   (charge +, discharge -)
 *   capacityWh       = the model's rated capacity, Wh (`ratedCapacityWh` in
 *                      data/deviceModels.ts — the Device Info "Rated Capacity" row);
 *                      defaults to 1000 Wh.
 *   remainingEnergyWh = (soc% / 100) × capacityWh
 *   neededEnergyWh    = (1 - soc% / 100) × capacityWh
 *
 *   netChargeW > 0           → "Xh Ym to full"   = neededEnergyWh   / netChargeW
 *   netChargeW < 0 & SOC > 0 → "Xh Ym remaining" = remainingEnergyWh / |netChargeW|
 *   isCharging (battery +)   → "Charging"
 *   otherwise                → "--"
 *
 * Labels are self-contained (e.g. "1h16m to full"); pass them to BatteryRing
 * with the `rawTimeLabel` prop so the ring renders them verbatim.
 */

/** Default rated capacity (Wh) when the device's nameplate value is unknown. */
const DEFAULT_CAPACITY_WH = 1000

/**
 * Largest net charge/discharge we will turn into a time, W. Past this the
 * number is not a measurement, and an estimate built on it is worse than no
 * estimate — it reads as authoritative and is off by orders of magnitude.
 * Matches MAX_PLAUSIBLE_POWER_W, which guards each channel on its own.
 */
const MAX_PLAUSIBLE_NET_W = MAX_PLAUSIBLE_POWER_W

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
  /** Rated battery capacity in Wh (the model's, `ratedCapacityWh`). Defaults to 1000 Wh. */
  capacityWh?: number
  /** batteryPower > 0 (used only for the idle "Charging" fallback) */
  isCharging?: boolean
}

export function batteryTimeLabel({
  acPower,
  solarPower,
  outputPower,
  soc,
  capacityWh,
  isCharging = false,
}: BatteryTimeInput): string {
  const netChargeW = acPower + solarPower - outputPower
  /*
   * A reading the hardware cannot produce must not become an estimate. An
   * unfilled output register read as 65534 W put "0h1m remaining" on a
   * customer's ring at 98% — the arithmetic was right, its input was not.
   * The channels are guarded where they are decoded now; this is the last
   * line, and it covers whatever else the sum is ever handed.
   */
  if (!Number.isFinite(netChargeW) || Math.abs(netChargeW) > MAX_PLAUSIBLE_NET_W) return '--'
  const capacity = capacityWh && capacityWh > 0 ? capacityWh : DEFAULT_CAPACITY_WH
  const socFrac = Math.max(0, Math.min(100, soc)) / 100

  if (netChargeW > 0) {
    const neededWh = (1 - socFrac) * capacity
    return `${formatDuration((neededWh / netChargeW) * 60)} to full`
  }
  if (netChargeW < 0 && soc > 0) {
    const remainingWh = socFrac * capacity
    return `${formatDuration((remainingWh / -netChargeW) * 60)} remaining`
  }
  if (isCharging) return 'Charging'
  return '--'
}
