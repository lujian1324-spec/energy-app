/**
 * Load and save a device's program (v4.22.0): Smart Schedule, Charging Settings
 * (AC charge power, Silent Mode) and the Charge & Discharge Limits.
 *
 * Where it lives
 *  - The relay (`POST /program`, `GET /program`, server/programRoutes.js) is the
 *    copy that matters: its tick runs the program with the app closed, and any
 *    phone signed in to the account reads it back from there.
 *  - `localStorage['sierro-program-{deviceId}']` is this phone's copy: it paints
 *    the screens before the relay answers and is what a build without a relay uses.
 *
 * Saving
 *  1. Stamp what changed (`stampChanges`), validate with the relay's own rules.
 *  2. Upload to the relay. A refusal is a failed save: nothing else happens, so
 *     the screen never claims a schedule the relay will not run.
 *  3. Keep the local copy, and disarm the pre-v4.22.0 Sleep Mode window on this
 *     phone (Silent Mode replaces it; the relay removed its slot on this upload).
 *  4. Apply the charge power the program implies right now (0x0085) when the
 *     device is online — the relay would write it within a minute anyway; this
 *     makes the change visible at once. A device that is offline gets it from the
 *     relay when it is back. Changing the power while a Stop Charging schedule is
 *     in effect writes 0 again: adjusting the power never starts a charge.
 */
import { POLLER_REFRESH_PENDING_KEY, remintRelaySession } from './authApi'
import { passthroughDevice } from './deviceApi'
import { chargePowerFrame } from './smartScheduleControl'
import { RELAY_BASE_URL, PROGRAM_PATH, isRelayConfigured } from '../config/scheduling'
import { isApiSuccess, tokenStore } from '../utils/apiClient'
import { isFirmwareUpdateLocked } from '../utils/firmwareLock'
import { loadSchedule, saveSchedule } from '../hooks/useSleepModeScheduler'
import {
  adaptProgram, effectiveChargeW, initialProgram, phoneTimeZone, rebaseProgram, stampChanges, validateProgram,
  type DeviceProgram,
} from '../utils/deviceProgram'

const localKey = (deviceId: string) => `sierro-program-${deviceId}`

/** The last program each device was seen with in this session; the screens share it (useDeviceProgram). */
export const sessionPrograms = new Map<string, DeviceProgram>()

/** Sign-in / sign-out (deviceStore.exitDemoMode): the next account starts from its own copies. */
export function resetSessionPrograms(): void {
  sessionPrograms.clear()
}

function userId(): string | null {
  const id = localStorage.getItem('iot_user_id')?.trim()
  return id && !['anon', 'null', 'undefined'].includes(id) ? id : null
}

/**
 * This phone's copy, for the signed-in account only (v4.23.1): a copy saved by
 * another account — a device that changed hands, a shared phone — is not shown.
 * A copy from before v4.23.1 carries no owner and is still read.
 */
export function loadLocalProgram(deviceId: string): DeviceProgram | null {
  try {
    const raw = localStorage.getItem(localKey(deviceId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.owner && parsed.owner !== userId()) return null
    return validateProgram(parsed)
  } catch {
    return null
  }
}

function saveLocalProgram(deviceId: string, program: DeviceProgram): void {
  try {
    localStorage.setItem(localKey(deviceId), JSON.stringify({ ...program, owner: userId() ?? undefined }))
  } catch { /* storage full: the relay copy still counts */ }
}

/** The relay's copy: a program, null (none stored), or undefined (could not ask). */
export async function fetchRelayProgram(deviceId: string): Promise<DeviceProgram | null | undefined> {
  const uid = userId()
  const token = tokenStore.get()
  if (!isRelayConfigured() || !uid || !token) return undefined
  try {
    const q = new URLSearchParams({ userId: uid, deviceId: String(deviceId) })
    const res = await fetch(`${RELAY_BASE_URL}${PROGRAM_PATH}?${q}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'IOT-Token': token },
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !isApiSuccess(body?.code)) return undefined
    const p = body?.data?.program
    if (!p) return null
    try { return validateProgram(p) } catch { return null }
  } catch {
    return undefined
  }
}

export interface LoadedProgram {
  program: DeviceProgram
  /** The copy the screens start from: the relay's, this phone's, or a new one. */
  source: 'relay' | 'local' | 'new'
}

export async function loadProgram(deviceId: string, model: string): Promise<LoadedProgram> {
  const relay = await fetchRelayProgram(deviceId)
  if (relay) {
    saveLocalProgram(deviceId, relay)
    return { program: adaptProgram(relay, model), source: 'relay' }
  }
  // The relay has none (or could not be asked): this phone's copy, for this account.
  // A relay with no session for the account accepts an untimed save without
  // keeping it (v4.23.2), so "none" there does not mean this phone's copy is stale.
  const local = loadLocalProgram(deviceId)
  if (local) return { program: adaptProgram(local, model), source: 'local' }
  return { program: initialProgram(model, loadSchedule(deviceId)), source: 'new' }
}

/** Paint-first copy for the first frame (no network). */
export function peekProgram(deviceId: string, model: string): DeviceProgram {
  const local = loadLocalProgram(deviceId)
  return local ? adaptProgram(local, model) : initialProgram(model, loadSchedule(deviceId))
}

export interface ProgramSaveResult {
  ok: boolean
  /** What was saved (with stamps), when ok. */
  program?: DeviceProgram
  /**
   * A save that could not go through because another phone had changed the
   * program: what the relay holds now (the screens show it).
   */
  current?: DeviceProgram
  /** The relay took it (false in a build without a relay). */
  background: boolean
  /** The charge power was written to the device just now; null = not attempted (offline). */
  applied: boolean | null
  /** The message for a failed save, or a caveat for a successful one. */
  detail?: string
}

export interface SaveProgramOptions {
  deviceOnline?: boolean
  /**
   * The program `draft` was edited from (v4.23.1). Its `savedAt` goes to the relay,
   * which refuses the save when another phone has stored a different program since;
   * this phone's changes are then re-applied on top of that one and sent once more.
   */
  base?: DeviceProgram | null
}

export async function saveProgram(
  deviceId: string,
  draft: DeviceProgram,
  { deviceOnline = true, base }: SaveProgramOptions = {},
): Promise<ProgramSaveResult> {
  if (isFirmwareUpdateLocked()) {
    return { ok: false, background: false, applied: null, detail: 'Paused while a firmware update is in progress. Try again when it finishes.' }
  }
  const now = Date.now()
  const invalid = (e: unknown, current?: DeviceProgram): ProgramSaveResult =>
    ({ ok: false, background: false, applied: null, current, detail: e instanceof Error ? e.message : 'Check the settings and try again.' })
  let program: DeviceProgram
  try {
    program = validateProgram(stampChanges(base ?? loadLocalProgram(deviceId), { ...draft, tz: phoneTimeZone() }, now))
  } catch (e) {
    return invalid(e)
  }

  let background = false
  let merged = false
  const relay = isRelayConfigured()
  if (relay) {
    let up = await sendProgram(deviceId, program, base === undefined ? undefined : (base?.savedAt ?? null))
    if (up.conflict && base) {
      // Another phone saved in between: keep its changes, re-apply ours, send once more.
      const current = up.conflict
      saveLocalProgram(deviceId, current)
      try {
        program = validateProgram(stampChanges(current, { ...rebaseProgram(base, program, current), tz: phoneTimeZone() }, now))
      } catch (e) {
        return invalid(e, current)
      }
      up = await sendProgram(deviceId, program, current.savedAt ?? null)
      merged = true
      if (up.conflict) {
        saveLocalProgram(deviceId, up.conflict)
        return { ok: false, background: false, applied: null, current: up.conflict, detail: 'This device was changed on another phone at the same time. Check the settings and Save again.' }
      }
    }
    if (!up.ok) return { ok: false, background: false, applied: null, current: up.conflict, detail: up.detail }
    background = up.stored !== false
  }

  saveLocalProgram(deviceId, program)
  // Silent Mode replaces Sleep Mode: this phone's old window must not run again.
  const legacy = loadSchedule(deviceId)
  if (legacy?.enabled) saveSchedule(deviceId, { ...legacy, enabled: false })

  let applied: boolean | null = null
  if (deviceOnline) {
    try {
      const r = await passthroughDevice(deviceId, { data: chargePowerFrame(effectiveChargeW(program, Date.now())) })
      applied = isApiSuccess(r.code)
    } catch {
      applied = false
    }
  }
  return {
    ok: true,
    program,
    background,
    applied,
    detail: !relay
      ? 'Saved on this phone. Schedules run only while the app is open in this build.'
      : !background
        // The relay took the save without keeping it (no background session for
        // this account): only what was written to the device just now took effect.
        ? applied === true
          ? undefined
          : "Saved on this phone only. The device didn't take the change; save again when it is online."
      : applied === false
        ? 'Saved. The device did not take the change yet; it will be sent again shortly.'
        : applied === null
          ? 'Saved. The device is offline; it will switch when it is back online.'
          : merged
            ? 'Saved together with changes made on another phone.'
            : undefined,
  }
}

/**
 * Upload; when the relay has no background session for the account, mint one in the
 * background (remintRelaySession — at most once a day) and send once more (v4.23.3).
 */
async function sendProgram(deviceId: string, program: DeviceProgram, baseSavedAt?: number | null) {
  const up = await uploadProgram(deviceId, program, baseSavedAt)
  if (!up.needsSession || !(await remintRelaySession())) return up
  return uploadProgram(deviceId, program, baseSavedAt)
}

async function uploadProgram(
  deviceId: string,
  program: DeviceProgram,
  baseSavedAt?: number | null,
): Promise<{ ok: boolean; detail?: string; conflict?: DeviceProgram; stored?: boolean; needsSession?: boolean }> {
  const uid = userId()
  if (!uid) return { ok: false, detail: 'Sign in again before saving a schedule.' }
  let boot: { accessToken?: string; refreshToken?: string; accessExpiresAt?: number } = {}
  const rawBoot = localStorage.getItem(POLLER_REFRESH_PENDING_KEY)
  if (rawBoot) { try { boot = JSON.parse(rawBoot) ?? {} } catch { /* ignore malformed */ } }
  try {
    const token = tokenStore.get()
    const res = await fetch(`${RELAY_BASE_URL}${PROGRAM_PATH}`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', ...(token ? { 'IOT-Token': token } : {}) },
      body: JSON.stringify({
        userId: uid,
        deviceId: String(deviceId),
        program,
        ...(baseSavedAt !== undefined ? { baseSavedAt } : {}),
        refreshToken: boot.refreshToken ?? undefined,
        accessToken: boot.accessToken ?? undefined,
        accessExpiresAt: boot.accessExpiresAt ?? undefined,
      }),
    })
    const body = await res.json().catch(() => null)
    const ok = res.ok && isApiSuccess(body?.code)
    if (ok && rawBoot && userId() === uid && localStorage.getItem(POLLER_REFRESH_PENDING_KEY) === rawBoot) {
      localStorage.removeItem(POLLER_REFRESH_PENDING_KEY)
    }
    if (ok) return { ok: true, stored: body?.data?.stored !== false }
    if (res.status === 409 && body?.reason === 'PROGRAM_CHANGED') {
      let conflict: DeviceProgram | undefined
      try { conflict = validateProgram(body?.data?.program) } catch { conflict = undefined }
      return conflict
        ? { ok: false, conflict, detail: 'This device was changed on another phone.' }
        : { ok: false, detail: 'This device was changed on another phone. Reopen the page and Save again.' }
    }
    if (res.status === 409) {
      return {
        ok: false,
        needsSession: true,
        detail: "Schedules can't run in the background for this account yet, so this one wasn't saved. Please contact Sierro support.",
      }
    }
    if (res.status === 400 && typeof body?.message === 'string') return { ok: false, detail: body.message }
    return { ok: false, detail: `The schedule server did not confirm the save (HTTP ${res.status}). Retry Save.` }
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
        ? 'The schedule server timed out. Check your connection and retry Save.'
        : 'The schedule server could not be reached. Check your connection and retry Save.',
    }
  }
}

export interface ChargePowerResult {
  /** The change took: on the device now, or (device offline) kept for when it is back. */
  ok: boolean
  /** What was saved, when the schedule server (or this phone) kept it. */
  program?: DeviceProgram
  /** The relay's program after a refused save (another phone changed it). */
  current?: DeviceProgram
  /** The power was written to the device just now; null = not attempted (offline). */
  applied: boolean | null
  /** The watts written (0 while a Stop Charging schedule has charging paused). */
  wroteW: number | null
  kind: 'success' | 'warning' | 'error'
  title: string
  detail?: string
}

/**
 * Max AC Charging Power, set from the slider (v4.25.0). The device gets it first,
 * straight through the platform's passthrough (0x0085) — nothing waits on the relay.
 * Then the power is kept with the rest of the program (relay + this phone), because
 * that is what Silent Mode's schedule restores when its window ends. The value
 * written is what the program implies now: capped while Silent Mode limits, and 0
 * while a Stop Charging schedule has charging paused (a new power never starts a
 * charge).
 */
export async function applyChargePower(
  deviceId: string,
  base: DeviceProgram,
  watts: number,
  { deviceOnline = true }: { deviceOnline?: boolean } = {},
): Promise<ChargePowerResult> {
  const title = `Max AC Charging Power set to ${watts} W`
  if (isFirmwareUpdateLocked()) {
    return { ok: false, applied: null, wroteW: null, kind: 'error', title: "Couldn't change the charging power", detail: 'Paused while a firmware update is in progress. Try again when it finishes.' }
  }
  const draft: DeviceProgram = { ...base, chargePowerW: watts }
  const write = async (w: number): Promise<boolean> => {
    try { return isApiSuccess((await passthroughDevice(deviceId, { data: chargePowerFrame(w) })).code) } catch { return false }
  }

  // 1. The device, straight away.
  let wroteW: number | null = null
  let applied: boolean | null = null
  if (deviceOnline) {
    wroteW = effectiveChargeW(draft, Date.now())
    applied = await write(wroteW)
  }

  // 2. Kept for the schedules. No second device write here: that was step 1.
  const saved = await saveProgram(deviceId, draft, { deviceOnline: false, base })
  // Merged with another phone's change (e.g. it switched Silent Mode on): the device
  // gets what the merged program implies.
  if (saved.ok && saved.program && applied) {
    const now = effectiveChargeW(saved.program, Date.now())
    if (now !== wroteW) { wroteW = now; applied = await write(now) }
  }
  const kept = saved.ok && saved.background
  const paused = wroteW === 0 && watts > 0

  if (applied === true) {
    if (!saved.ok) {
      return { ok: true, applied, wroteW, current: saved.current, kind: 'warning', title: 'Set on the device',
        detail: `Not saved for your schedules: ${saved.detail ?? 'the schedule server did not confirm it.'} Silent Mode may restore the previous power.` }
    }
    return { ok: true, applied, wroteW, program: saved.program, kind: paused ? 'warning' : 'success', title,
      detail: paused ? 'Charging is paused by Smart Schedule. The new power applies when charging starts.'
        : saved.detail && saved.detail.includes('another phone') ? saved.detail : undefined }
  }
  if (applied === false) {
    return kept
      ? { ok: true, applied, wroteW, program: saved.program, kind: 'warning', title: 'Saved', detail: "The device didn't take the change yet; it will be sent again shortly." }
      : { ok: false, applied, wroteW, current: saved.current, kind: 'error', title: "Couldn't change the charging power", detail: "The device didn't take the change. Check it is online and try again." }
  }
  // The device is offline: the schedule server switches it when it is back.
  return kept
    ? { ok: true, applied, wroteW, program: saved.program, kind: 'warning', title: 'Saved', detail: 'The device is offline; it will switch when it is back online.' }
    : { ok: false, applied, wroteW, current: saved.current, kind: 'error', title: "Couldn't change the charging power", detail: saved.ok ? 'The device is offline. Try again when it is back online.' : saved.detail }
}
