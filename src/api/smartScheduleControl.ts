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
import { uploadSleepScheduleResult } from './scheduleApi'
import { buildWriteSingleFrame, toHexString, REG_CTRL } from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'
import { runScheduleCommand } from '../utils/scheduleCommandQueue'
import { getScheduleAccount } from '../utils/smartScheduleQueue'
import { getActiveScheduleMode, setActiveScheduleMode, clearActiveScheduleMode, type ScheduleMode } from '../utils/activeScheduleMode'
import {
  phaseFor,
  powerForPhase,
  smartSchedulePowers,
  sleepPowers,
  type ChargePowers,
  type SleepPowerChoice,
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
  /**
   * Did the device take the settings? This is the **instant power** result —
   * A/B. It says nothing about the background schedule: read `relayAccepted`
   * (against `relayConfigured`) for that, and never present `ok: true` on its
   * own as "saved everywhere" (SW-12, AC-12-7).
   */
  ok: boolean
  failedStep?: SmartScheduleStep
  detail?: string
  /** Watts written to 0x0085 (undefined when we never got that far). */
  wattsWritten?: number
  phase: ChargePhase
  /** Did the 0x0085 write land? The charge power at the plug right now. */
  instantPowerApplied: boolean
  /** Does this build have a relay? False means client-side timing only, by design. */
  relayConfigured: boolean
  /** Did the relay accept the window? False just means closed-app timing is client-only. */
  relayAccepted: boolean
  /** Why the relay did not take it, for the existing error channel. */
  relayDetail?: string
  /**
   * A (`sleepMode`) was skipped because the model has no such config attribute.
   * `ok` then reports B/C only — the device took the charge power, but its own
   * window handling was never armed. Callers must not read `ok` as "everything
   * was written".
   */
  configSkipped?: boolean
  /** The cloud's wording for the skipped A, kept for logs/diagnostics. */
  configSkippedDetail?: string
  /**
   * The device was offline, so nothing was written to it: the relay took the
   * window and writes it once the device is back online (v4.18.0).
   */
  queued?: boolean
}

/** A Sleep Mode save: the window, the two slider powers, and whether the device is offline. */
export interface SleepScheduleWindow extends Omit<SmartScheduleWindow, 'chargePowerW'>, SleepPowerChoice {
  /**
   * The cloud reports the device offline (decided from connection state only —
   * `deviceConnectivity.ts`, never from a reply's wording). Nothing is written
   * to the device; the window goes to the relay, which applies it when the
   * device comes back.
   */
  deviceOffline?: boolean
}

/**
 * Does a `config/write` failure mean "this model has no such key" rather than
 * "the device refused"? The cloud phrases it a few ways across deployments, so
 * match on the substrings they all share instead of a code — the code is the
 * generic illegal-argument one and cannot tell the two apart.
 *
 * Require an explicit missing/unsupported statement in this response. A prior
 * model capability guess must never reclassify a permission or transport error.
 */
export function isMissingConfigAttribute(detail: string): boolean {
  const t = detail.toLowerCase().replace(/\s+/g, ' ').trim()
  if (/\b(denied|forbidden|unauthori[sz]ed|expired|timeout|timed out|offline|network|unreachable|refused)\b/.test(t)) return false
  // Accept the reported "contribute" spelling only as a complete config error.
  // Never broaden this to arbitrary "not exists" failures or cached capability.
  if (/^(?:device )?config contribute (?:does )?not exists?[.!]?$/.test(t)) return true
  return /\battribute(?:\s*\[\s*sleepmode\s*\]|\s+['"]?sleepmode['"]?)?\s+(?:(?:does\s+)?not\s+exists?|(?:is\s+)?(?:missing|not\s+found|unsupported|not\s+supported))\b/.test(t)
    || /\bsleepmode\b\s+(?:is\s+)?(?:unsupported|not\s+supported|missing|not\s+found|does\s+not\s+exists?)\b/.test(t)
}

/**
 * Is a failed `config/write` of `sleepMode` a missing attribute on this model?
 *
 * Model labels are not capability identities: different firmware/device product
 * definitions may use the same label. Classify only the current response.
 */
export function isMissingSleepModeAttribute(_model: string, detail: string): boolean {
  return isMissingConfigAttribute(detail)
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
export function applySmartSchedule(
  deviceId: string | number,
  window: SmartScheduleWindow,
  canApply: () => boolean = () => true,
): Promise<SmartScheduleResult> {
  const account = getScheduleAccount()
  return runScheduleCommand(String(deviceId), () => applyChargeSchedule(
    deviceId, window, smartSchedulePowers(window.model, window.chargePowerW), 'smart',
    () => getScheduleAccount() === account && canApply(),
  ))
}

export function applySleepSchedule(
  deviceId: string | number,
  window: SleepScheduleWindow,
): Promise<SmartScheduleResult> {
  const account = getScheduleAccount()
  const powers = sleepPowers(window.model, { sleepW: window.sleepW, wakeW: window.wakeW })
  const canApply = () => getScheduleAccount() === account
  return runScheduleCommand(String(deviceId), () => window.deviceOffline
    ? queueChargeScheduleOnRelay(deviceId, window, powers, 'sleep', canApply)
    : applyChargeSchedule(deviceId, window, powers, 'sleep', canApply))
}

/**
 * An offline device cannot take A or B, but it does not need to: the relay
 * holds the window and its tick writes 0x0085 as soon as the cloud reports the
 * device online again (`server/sleepExecutor.js` skips an offline device and
 * retries next tick). So the save is the relay upload alone, and it is a save
 * only if the relay took it — with no relay there is nothing that will ever
 * reach the device, and that is reported as a failure.
 *
 * The device is claimed for `mode` only after the relay accepted, so a refused
 * upload leaves the other feature's claim as it was.
 */
async function queueChargeScheduleOnRelay(
  deviceId: string | number,
  window: Omit<SmartScheduleWindow, 'chargePowerW'>,
  powers: ChargePowers,
  mode: ScheduleMode,
  canApply: () => boolean,
): Promise<SmartScheduleResult> {
  const { enabled, startTime, endTime, model } = window
  const phase = phaseFor(startTime, endTime)
  const noWrites = { instantPowerApplied: false, relayConfigured: false, relayAccepted: false }
  if (!canApply()) return { ok: false, failedStep: 'config', detail: 'Schedule superseded or account changed. Reopen its settings.', phase, ...noWrites }
  const active = getActiveScheduleMode(String(deviceId))
  if (!enabled && active && active !== mode) {
    return { ok: false, failedStep: 'config', detail: 'Another schedule mode is active. Reopen its settings to turn it off.', phase, ...noWrites }
  }
  const relay = await uploadSleepScheduleResult(String(deviceId), {
    enabled,
    sleepFrom: startTime,
    sleepTo: endTime,
    model,
    sleepW: powers.inWindowW,
    wakeW: powers.outWindowW,
    mode,
  })
  const relayFields = { relayConfigured: relay.configured, relayAccepted: relay.accepted, relayDetail: relay.detail }
  if (!relay.configured || !relay.accepted) {
    return {
      ok: false,
      failedStep: 'relay',
      detail: relay.configured
        ? relay.detail ?? 'The schedule server did not take the window.'
        : 'The device is offline. Try again when it is back online.',
      phase,
      instantPowerApplied: false,
      ...relayFields,
    }
  }
  if (!canApply()) return { ok: false, failedStep: 'config', detail: 'Schedule superseded or account changed. Reopen its settings.', phase, instantPowerApplied: false, ...relayFields }
  if (enabled) setActiveScheduleMode(String(deviceId), mode)
  else clearActiveScheduleMode(String(deviceId), mode)
  return { ok: true, queued: true, phase, instantPowerApplied: false, ...relayFields }
}

async function applyChargeSchedule(
  deviceId: string | number,
  window: Omit<SmartScheduleWindow, 'chargePowerW'>,
  powers: ChargePowers,
  mode: ScheduleMode,
  canApply: () => boolean,
): Promise<SmartScheduleResult> {
  const { enabled, startTime, endTime, model } = window
  const phase = phaseFor(startTime, endTime)
  // Off → restore normal charging, so we never leave a device parked at 0W.
  const watts = enabled ? powerForPhase(powers, phase) : powers.restoreW

  /** Shared shape of a failure that never reached the device or the relay. */
  const noWrites = { instantPowerApplied: false, relayConfigured: false, relayAccepted: false }
  const cancelled = (): SmartScheduleResult => ({ ok: false, failedStep: 'config', detail: 'Schedule superseded or account changed. Reopen its settings.', phase, ...noWrites })
  if (!canApply()) return cancelled()
  const active = getActiveScheduleMode(String(deviceId))
  if (!enabled && active && active !== mode) {
    return { ok: false, failedStep: 'config', detail: 'Another schedule mode is active. Reopen its settings to turn it off.', phase, ...noWrites }
  }

  // A — /remote/device/config/write { key: 'sleepMode', value }
  // A missing attribute is soft-failed (SW-11); anything else stops the run.
  let configSkippedDetail: string | undefined
  try {
    const r = await toggleSleepMode(deviceId, enabled)
    if (!isApiSuccess(r.code)) {
      const detail = String(r.message ?? r.msg ?? '')
      if (!isMissingSleepModeAttribute(model, detail)) {
        return { ok: false, failedStep: 'config', detail, phase, ...noWrites }
      }
      configSkippedDetail = detail
      console.warn('[SmartSchedule] model has no sleepMode attribute, continuing:', detail)
    }
  } catch (e) {
    const detail = errText(e)
    if (!isMissingSleepModeAttribute(model, detail)) {
      return { ok: false, failedStep: 'config', detail, phase, ...noWrites }
    }
    configSkippedDetail = detail
    console.warn('[SmartSchedule] model has no sleepMode attribute, continuing:', detail)
  }
  const configSkipped = configSkippedDetail !== undefined
  if (!canApply()) return cancelled()

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
        ...noWrites,
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
      ...noWrites,
      configSkipped,
      configSkippedDetail,
    }
  }

  // Stop the other client executor before replacing the shared relay slot.
  if (!canApply()) return { ...cancelled(), instantPowerApplied: true, wattsWritten: watts }
  if (enabled) setActiveScheduleMode(String(deviceId), mode)
  else clearActiveScheduleMode(String(deviceId), mode)

  // C — relay POST /schedule (never throws). `configured` separates "this build
  // has no relay" from "the relay refused the window", which the caller must
  // report apart from the instant power write (AC-12-7 / AC-12-8).
  const relay = await uploadSleepScheduleResult(String(deviceId), {
    enabled,
    sleepFrom: startTime,
    sleepTo: endTime,
    model,
    // Without these the relay would fall back to Sleep Mode's per-model watts and
    // quietly ignore the rate the user typed.
    sleepW: powers.inWindowW,
    wakeW: powers.outWindowW,
    // SW-14: tells the relay whose window this is, so its tick can pause Smart
    // Schedule's without touching Sleep Mode's.
    mode,
  })

  return {
    ok: true,
    wattsWritten: watts,
    phase,
    instantPowerApplied: true,
    relayConfigured: relay.configured,
    relayAccepted: relay.accepted,
    relayDetail: relay.detail,
    configSkipped,
    configSkippedDetail,
  }
}
