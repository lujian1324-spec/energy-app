/**
 * SW-09 — Battery Priority is a Modbus write, not a cloud setting.
 *
 * Saving Battery Priority used to call `/remote/device/config/write`
 * (`workMode`) and then mirror the choice onto Modbus 0x0086 as a best-effort
 * afterthought, swallowing its result. The register pair below is what the
 * hardware actually acts on, so a save that only landed in the cloud looked
 * successful and reserved nothing.
 *
 * A save now makes exactly two writes, both over
 * `POST /remote/device/passthrough`, and both count:
 *
 *   A  0x0086  PV/battery priority   Savings → 0x01AA (enable)
 *                                    Backup  → 0xAA01 (disable)
 *   B  0x0054  minimum SOC (%)       Savings → 60
 *                                    Backup  → 100
 *
 * 0x0054 is a percentage, so Backup is **100**, not 1000.
 *
 * No `workMode` write is issued from this path. `setWorkMode()` in
 * `deviceApi.ts` is left exactly as it was and is simply no longer called by the
 * Battery Priority sheet — the cloud field keeps whatever value the backend
 * already holds for the device.
 */
import { passthroughDevice } from './deviceApi'
import { FRAMES } from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'
import { PRIORITY_SAVINGS, type BatteryPriority } from '../utils/batteryPriority'

/** Minimum SOC (%) written to 0x0054 per mode — Backup reserves the whole pack. */
export const PRIORITY_MIN_SOC: Record<BatteryPriority, number> = {
  1: 100, // Backup
  2: 60, // Savings
}

/** Value written to 0x0086 per mode, for logs and tests. */
export const PRIORITY_REGISTER_VALUE: Record<BatteryPriority, number> = {
  1: 0xaa01, // Backup  — PV/battery priority disabled
  2: 0x01aa, // Savings — PV/battery priority enabled
}

/** Which of the two writes failed, so the message can say what did not take. */
export type BatteryPriorityStep = 'priority' | 'minSoc'

export interface BatteryPriorityResult {
  ok: boolean
  failedStep?: BatteryPriorityStep
  detail?: string
  /** Value sent to 0x0086. */
  priorityValue: number
  /** Percentage sent to 0x0054. */
  minSoc: number
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Write Battery Priority to the device.
 *
 * Both registers are required: 0x0086 alone leaves the old reserve percentage in
 * place, so a half-applied save is reported as a failure and the caller rolls the
 * row back rather than showing a mode the device is not holding to.
 */
export async function applyBatteryPriority(
  deviceId: string | number,
  priority: BatteryPriority
): Promise<BatteryPriorityResult> {
  const savings = priority === PRIORITY_SAVINGS
  const priorityValue = PRIORITY_REGISTER_VALUE[priority]
  const minSoc = PRIORITY_MIN_SOC[priority]

  // A — 0x0086 PV/battery priority enable (Savings) / disable (Backup)
  try {
    const frame = savings ? FRAMES.PV_BATT_PRIORITY_ON : FRAMES.PV_BATT_PRIORITY_OFF
    const r = await passthroughDevice(deviceId, { data: frame })
    if (!isApiSuccess(r.code)) {
      return {
        ok: false,
        failedStep: 'priority',
        detail: String(r.message ?? r.msg ?? ''),
        priorityValue,
        minSoc,
      }
    }
  } catch (e) {
    return { ok: false, failedStep: 'priority', detail: errText(e), priorityValue, minSoc }
  }

  // B — 0x0054 minimum SOC for the priority operation, in percent
  try {
    const r = await passthroughDevice(deviceId, {
      data: FRAMES.setPvBattPriorityMinSoc(minSoc),
    })
    if (!isApiSuccess(r.code)) {
      return {
        ok: false,
        failedStep: 'minSoc',
        detail: String(r.message ?? r.msg ?? ''),
        priorityValue,
        minSoc,
      }
    }
  } catch (e) {
    return { ok: false, failedStep: 'minSoc', detail: errText(e), priorityValue, minSoc }
  }

  return { ok: true, priorityValue, minSoc }
}

/** A failure the user can act on, rather than one generic line for both writes. */
export function batteryPriorityErrorMessage(res: BatteryPriorityResult): string {
  const base =
    res.failedStep === 'minSoc'
      ? `Battery Priority: the device did not accept the ${res.minSoc}% reserve`
      : 'Could not change Battery Priority'
  // The platform's own wording ("illegal argument", or Chinese) is for the log
  // only (SW-15); customers were shown it verbatim (after-sales R11).
  if (res.detail?.trim()) console.warn('[batteryPriority] failed:', res.failedStep, res.detail)
  return `${base}. Check the device is online and try again.`
}
