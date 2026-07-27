/**
 * Sierro Inc. — Auto Instruction (server-side scheduling) API
 *
 * Wraps the official backend's "自动化指令服务 / Auto Instruction Service"
 * (`/instruction/*`, API_REFERENCE.md §40). The point of this service for Sierro:
 * register a schedule ONCE, and the siseli backend executes the device action at
 * the scheduled time SERVER-SIDE — even when the app is fully closed. That is what
 * makes Sleep Mode's power switch fire at the right moment without the app awake.
 *
 * Endpoints (same base `…/apis`, same IOT-Open HMAC + IOT-Token auth as every
 * other call — plain `api.get/api.post` already sign and attach the token):
 *   GET  /instruction?id=                         detail        → InstructionVojo
 *   GET  /instruction/list?deviceId=&pageNo=&pageSize=   paged list
 *   POST /instruction/add            body InstructionVijo → InstructionVojo
 *   POST /instruction/update         body InstructionVijo → InstructionVojo
 *   POST /instruction/updateStatus?id=&status=    enable/disable
 *   POST /instruction/delete?id=                  → boolean
 *
 * ── Schema, verified live against the real backend (2026-07) ──────────────────
 * `triggerMode` (byte string):
 *   '0' = TIMED (schedule by clock/time window)  ← what Sleep Mode needs
 *   '1' = CONDITION (triggered by a device-state `condition`, e.g. SOC > x)
 *   (other values → "trigger mode error")
 * `repeatMode` = { mode: byte string, modeData: string[] }; mode '1' = daily.
 * A TIMED instruction requires a time RANGE: BOTH `startTime` and `endTime`
 * ("HH:mm") must be present — the backend rejects a single time with
 * "timerange size must be 2 or empty".
 * `actions` = [{ key, value }] where `key` is a WRITABLE device attribute. Charge
 * power is `ratedACChargingPower` (a Read+Write, Device-Control attribute, unit W).
 * Note: this is the RATED/persistent AC charge power (≈ Modbus 0x0024), NOT the
 * volatile realtime 0x0085 the client scheduler pokes via passthrough — the
 * realtime register is not exposed to the attribute/instruction layer at all.
 *
 * ⚠️ MANUFACTURER GATE (as of 2026-07): creating a TIMED instruction currently
 * returns code 70247 "This instruction's manufacturer have been close
 * instructionOpen!" — i.e. the manufacturer has DISABLED timed auto-instructions
 * for Sierro. Until siseli re-enables `instructionOpen`, this whole path is inert
 * (see CLOUD_SLEEP_SCHEDULE_ENABLED). Because it could not be created, the exact
 * window semantics (does the action fire at startTime and auto-revert at endTime,
 * or fire once?) are UNVERIFIED — `buildSleepWindowInstruction` encodes the
 * best-interpretation and MUST be re-checked once the flag is on.
 */

import { api, isApiSuccess } from '../utils/apiClient'
import type { ApiResponse } from '../utils/apiClient'
import { getPowers } from '../hooks/useSleepModeScheduler'

// ─── Constants (verified live) ────────────────────────────────────────────────

export const INSTRUCTION_TRIGGER_TIMED = '0' as const
export const INSTRUCTION_TRIGGER_CONDITION = '1' as const
export const INSTRUCTION_REPEAT_DAILY = '1' as const

/** Writable device-control attribute key for AC charge power (unit: W). */
export const CHARGE_POWER_KEY = 'ratedACChargingPower' as const

/** Backend business code: manufacturer has disabled timed auto-instructions. */
export const CODE_INSTRUCTION_MANUFACTURER_DISABLED = 70247

// ─── Types (from the openApis swagger definitions) ────────────────────────────

export interface InstructionActionVijo {
  key: string
  value?: string
}

export interface RepeatModeVijo {
  /** byte string; '1' = daily */
  mode: string
  /** e.g. weekday list for weekly repeat; empty for daily */
  modeData?: string[]
}

export interface ConditionVijo {
  key?: string
  operator?: string
  value?: string
  subConditions?: ConditionVijo[]
}

export interface InstructionVijo {
  id?: number | string
  deviceId: string
  name: string
  /** byte string; see INSTRUCTION_TRIGGER_* */
  triggerMode: string
  repeatMode: RepeatModeVijo
  actions?: InstructionActionVijo[]
  condition?: ConditionVijo
  /** "HH:mm" — required (with endTime) for a TIMED instruction */
  startTime?: string
  endTime?: string
  delay?: number
}

/** Response shape (InstructionVojo) — superset of the request plus status. */
export interface InstructionVojo extends Omit<InstructionVijo, 'id'> {
  id: number | string
  status?: string
}

interface PagedInstructions {
  page: number
  count: number
  total: number
  list: InstructionVojo[]
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

export function listInstructions(
  deviceId: string | number,
  opts: { pageNo?: number; pageSize?: number } = {}
): Promise<ApiResponse<PagedInstructions>> {
  const { pageNo = 1, pageSize = 50 } = opts
  return api.get<PagedInstructions>(
    `/instruction/list?deviceId=${deviceId}&pageNo=${pageNo}&pageSize=${pageSize}`
  )
}

export function getInstruction(id: string | number): Promise<ApiResponse<InstructionVojo>> {
  return api.get<InstructionVojo>(`/instruction?id=${id}`)
}

export function addInstruction(vijo: InstructionVijo): Promise<ApiResponse<InstructionVojo>> {
  return api.post<InstructionVojo>('/instruction/add', { ...vijo, deviceId: String(vijo.deviceId) })
}

export function updateInstruction(vijo: InstructionVijo): Promise<ApiResponse<InstructionVojo>> {
  return api.post<InstructionVojo>('/instruction/update', { ...vijo, deviceId: String(vijo.deviceId) })
}

export function updateInstructionStatus(
  id: string | number,
  status: string
): Promise<ApiResponse<boolean>> {
  return api.post<boolean>(`/instruction/updateStatus?id=${id}&status=${status}`)
}

export function deleteInstruction(id: string | number): Promise<ApiResponse<boolean>> {
  return api.post<boolean>(`/instruction/delete?id=${id}`)
}

// ─── Sleep-mode composition ───────────────────────────────────────────────────

/** Deterministic instruction name so we can find/replace ours idempotently. */
export function sleepInstructionName(deviceId: string): string {
  return `sierro-sleep-${deviceId}`
}

/**
 * Build the daily TIMED instruction that lowers AC charge power during the sleep
 * window. Per-model watts come from the shared getPowers() (Sierro 1000 150/400,
 * Sierro 2000 300/800) so the value never diverges from the client scheduler.
 *
 * ⚠️ UNVERIFIED window semantics (timed instructions are manufacturer-disabled;
 * see file header). This encodes the "single daily window" interpretation: apply
 * the sleep-power action across [sleepFrom, sleepTo]. If, once enabled, the backend
 * does NOT auto-restore wake power at endTime, switch to two point instructions
 * (sleep@sleepFrom, wake@sleepTo). Do not enable CLOUD_SLEEP_SCHEDULE_ENABLED
 * before confirming this on a live device.
 */
export function buildSleepWindowInstruction(
  deviceId: string,
  model: string,
  sleepFrom: string,
  sleepTo: string
): InstructionVijo {
  const { sleepW } = getPowers(model)
  return {
    deviceId: String(deviceId),
    name: sleepInstructionName(deviceId),
    triggerMode: INSTRUCTION_TRIGGER_TIMED,
    repeatMode: { mode: INSTRUCTION_REPEAT_DAILY, modeData: [] },
    startTime: sleepFrom,
    endTime: sleepTo,
    actions: [{ key: CHARGE_POWER_KEY, value: String(sleepW) }],
  }
}

export interface SyncSleepResult {
  ok: boolean
  /** true when the backend rejected with code 70247 (manufacturer disabled). */
  disabledByManufacturer?: boolean
}

/**
 * Idempotently reconcile the device's cloud Sleep instruction with the given
 * schedule. Finds our instruction by its deterministic name (no localStorage id
 * to go stale): enable → add or update; disable → delete if present.
 *
 * Best-effort: never throws. Callers keep the client-side scheduler running
 * regardless, so a cloud failure (network, or the manufacturer gate 70247) just
 * means the fallback stays in charge. Gate the call with CLOUD_SLEEP_SCHEDULE_ENABLED.
 */
export async function syncSleepInstruction(
  deviceId: string,
  model: string,
  schedule: { enabled: boolean; sleepFrom: string; sleepTo: string }
): Promise<SyncSleepResult> {
  const name = sleepInstructionName(deviceId)
  let existing: InstructionVojo | undefined
  try {
    const listed = await listInstructions(deviceId, { pageSize: 100 })
    if (isApiSuccess(listed.code)) existing = listed.data?.list?.find((i) => i.name === name)
  } catch {
    /* ignore — treated as "no existing" */
  }

  try {
    if (!schedule.enabled) {
      if (existing) await deleteInstruction(existing.id)
      return { ok: true }
    }
    const vijo = buildSleepWindowInstruction(deviceId, model, schedule.sleepFrom, schedule.sleepTo)
    const res = existing
      ? await updateInstruction({ ...vijo, id: existing.id })
      : await addInstruction(vijo)
    if (isApiSuccess(res.code)) return { ok: true }
    if (Number(res.code) === CODE_INSTRUCTION_MANUFACTURER_DISABLED) {
      return { ok: false, disabledByManufacturer: true }
    }
    return { ok: false }
  } catch {
    return { ok: false }
  }
}
