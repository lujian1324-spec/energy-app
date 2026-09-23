/**
 * SW-08 — Smart Schedule rides the Sleep Mode control path.
 *
 * Smart Schedule used to talk to `/peakValley/device/*`. That surface never
 * reached the hardware: the device has no peak-valley engine, so a schedule the
 * backend happily accepted did nothing at the plug. Sleep Mode already owns the
 * one path that does move a device, so Smart Schedule now makes exactly Sleep's
 * three writes and nothing else:
 *
 *   A  POST /remote/device/config/write   `sleepMode` — arms the device's own
 *      window handling (`toggleSleepMode`).
 *   B  POST /remote/device/passthrough    Modbus 0x0085 (AC_CHARGE_POWER_RT) —
 *      the write that actually changes the charge rate. The `config/write`
 *      ratedACChargingPower key answers Success and is a device no-op, which is
 *      why this goes through passthrough.
 *   C  POST {relay}/schedule              via `uploadSleepSchedule` — hands the
 *      window to the relay so boundaries are honoured with the app closed.
 *
 * There is intentionally NO peakValley call left in this file or in the page.
 *
 * SW-11 — some product models do not carry a `sleepMode` config attribute at
 * all, and the cloud answers A with "config attribute not exist". That is a
 * model-definition gap, not a refusal of the user's schedule: B is the write
 * that actually changes the charge rate, and C is what keeps the window with
 * the app closed. So a missing-attribute A is soft-failed — it is recorded on
 * the result as `configSkipped` and the run continues to B and C. Any other A
 * failure (a real refusal) still stops the run as before.
 *
 * One device has one charge-power window: A/B write the device itself and C
 * writes the relay's single per-device schedule slot, so saving Smart Schedule
 * supersedes that device's Sleep Mode window and vice versa. That is inherent
 * to sharing the control path, not a bug to route around.
 */
import { toggleSleepMode, passthroughDevice } from './deviceApi'
import { uploadSleepSchedule } from './scheduleApi'
import { buildWriteSingleFrame, toHexString, REG_CTRL } from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'
import {
  phaseFor,
  powerForPhase,
  smartSchedulePowers,
  type ChargePhase,
} from '../utils/chargeWindow'

export interface SmartScheduleWindow {
  /** Is Smart Schedule on? Off restores the model's normal charge power. */
  enabled: boolean
  /** Charge (off-peak) window start, "HH:MM". */
  startTime: string
  /** Charge (off-peak) window end, "HH:MM". */
  endTime: string
  /** Manual AC charge power (W) applied inside the window. */
  chargePowerW: number
  /** Device model, e.g. "Sierro 1000" — sets the restore power. */
  model: string
}

/** Which of the three writes failed, for a message the user can act on. */
export type SmartScheduleStep = 'config' | 'passthrough' | 'relay'

export interface SmartScheduleResult {
  ok: boolean
  failedStep?: SmartScheduleStep
  detail?: string
  /** Watts written to 0x0085 (undefined when we never got that far). */
  wattsWritten?: number
  phase: ChargePhase
  /** Did the relay accept the window? False just means closed-app timing is client-only. */
  relayAccepted: boolean
  /**
   * A (`sleepMode`) was skipped because the model has no such config attribute.
   * `ok` then reports B/C only — the device took the charge power, but its own
   * window handling was never armed. Callers must not read `ok` as "everything
   * was written".
   */
  configSkipped?: boolean
  /** The cloud's wording for the skipped A, kept for logs/diagnostics. */
  configSkippedDetail?: string
}

/**
 * Does a `config/write` failure mean "this model has no such key" rather than
 * "the device refused"? The cloud phrases it a few ways across deployments, so
 * match on the substrings they all share instead of a code — the code is the
 * generic illegal-argument one and cannot tell the two apart.
 */
export function isMissingConfigAttribute(detail: string): boolean {
  const t = detail.toLowerCase()
  return (
    t.includes('config attribute') ||
    t.includes('attribute not exist') ||
    t.includes('attribute does not exist')
  )
}

/** Frame for the realtime AC charge-power register (0x0085), space-separated hex. */
export function chargePowerFrame(watts: number): string {
  return toHexString(buildWriteSingleFrame(REG_CTRL.AC_CHARGE_POWER_RT, watts))
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Apply a Smart Schedule window to a device over Sleep Mode's path.
 *
 * B is reported as a failure because the user's Save did not take; C is
 * best-effort (an unconfigured or unreachable relay leaves client-side timing
 * working), so it only sets `relayAccepted`. A is reported as a failure too,
 * except when the model simply has no `sleepMode` attribute — then it is
 * skipped and only flagged via `configSkipped` (SW-11).
 */
export async function applySmartSchedule(
  deviceId: string | number,
  window: SmartScheduleWindow
): Promise<SmartScheduleResult> {
  const { enabled, startTime, endTime, chargePowerW, model } = window
  const powers = smartSchedulePowers(model, chargePowerW)
  const phase = phaseFor(startTime, endTime)
  // Off → restore normal charging, so we never leave a device parked at 0W.
  const watts = enabled ? powerForPhase(powers, phase) : powers.restoreW

  // A — /remote/device/config/write { key: 'sleepMode', value }
  // A missing attribute is soft-failed (SW-11); anything else stops the run.
  let configSkippedDetail: string | undefined
  try {
    const r = await toggleSleepMode(deviceId, enabled)
    if (!isApiSuccess(r.code)) {
      const detail = String(r.message ?? r.msg ?? '')
      if (!isMissingConfigAttribute(detail)) {
        return { ok: false, failedStep: 'config', detail, phase, relayAccepted: false }
      }
      configSkippedDetail = detail
      console.warn('[SmartSchedule] model has no sleepMode attribute, continuing:', detail)
    }
  } catch (e) {
    const detail = errText(e)
    if (!isMissingConfigAttribute(detail)) {
      return { ok: false, failedStep: 'config', detail, phase, relayAccepted: false }
    }
    configSkippedDetail = detail
    console.warn('[SmartSchedule] model has no sleepMode attribute, continuing:', detail)
  }
  const configSkipped = configSkippedDetail !== undefined

  // B — /remote/device/passthrough, Modbus write-single 0x0085
  try {
    const r = await passthroughDevice(deviceId, { data: chargePowerFrame(watts) })
    if (!isApiSuccess(r.code)) {
      return {
        ok: false,
        failedStep: 'passthrough',
        detail: String(r.message ?? r.msg ?? ''),
        wattsWritten: undefined,
        phase,
        relayAccepted: false,
        configSkipped,
        configSkippedDetail,
      }
    }
  } catch (e) {
    return {
      ok: false,
      failedStep: 'passthrough',
      detail: errText(e),
      phase,
      relayAccepted: false,
      configSkipped,
      configSkippedDetail,
    }
  }

  // C — relay POST /schedule (never throws; false = relay off or unreachable)
  const relayAccepted = await uploadSleepSchedule(String(deviceId), {
    enabled,
    sleepFrom: startTime,
    sleepTo: endTime,
    model,
    // Without these the relay would fall back to Sleep Mode's per-model watts and
    // quietly ignore the rate the user typed.
    sleepW: powers.inWindowW,
    wakeW: powers.outWindowW,
  })

  return { ok: true, wattsWritten: watts, phase, relayAccepted, configSkipped, configSkippedDetail }
}
