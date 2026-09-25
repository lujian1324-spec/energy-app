/**
 * Charge & Discharge Limits (v4.22.0) — NOT RELEASED to consumer builds yet.
 *
 * The screen, the saved values and the upload to the relay are all built; what
 * is missing is the device side. The register map has no charge-limit or
 * discharge-limit register (0x0054 is the PV/battery priority reserve, not a
 * discharge cut-off), and "stop discharging at the limit during a power outage"
 * can only be done by the firmware — the relay cannot reach a device whose home
 * network is down. Release = wire the firmware's registers (range, step and the
 * restart conditions to confirm with the firmware team), then flip this.
 *
 * On in Vite dev, QA builds (`VITE_ENABLE_DEV_TOOLS=true`) and builds made with
 * `VITE_ENABLE_CHARGE_LIMITS=true` (the E2E workflow).
 */
import { DEV_TOOLS_ENABLED } from './devTools'

export const CHARGE_LIMITS_ENABLED: boolean =
  DEV_TOOLS_ENABLED || import.meta.env.VITE_ENABLE_CHARGE_LIMITS === 'true'
