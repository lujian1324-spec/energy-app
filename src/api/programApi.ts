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
import { POLLER_REFRESH_PENDING_KEY } from './authApi'
import { passthroughDevice } from './deviceApi'
import { chargePowerFrame } from './smartScheduleControl'
import { RELAY_BASE_URL, PROGRAM_PATH, isRelayConfigured } from '../config/scheduling'
import { isApiSuccess, tokenStore } from '../utils/apiClient'
import { isFirmwareUpdateLocked } from '../utils/firmwareLock'
import { loadSchedule, saveSchedule } from '../hooks/useSleepModeScheduler'
import {
  adaptProgram, effectiveChargeW, initialProgram, phoneTimeZone, stampChanges, validateProgram,
  type DeviceProgram,
} from '../utils/deviceProgram'

const localKey = (deviceId: string) => `sierro-program-${deviceId}`

function userId(): string | null {
  const id = localStorage.getItem('iot_user_id')?.trim()
  return id && !['anon', 'null', 'undefined'].includes(id) ? id : null
}

export function loadLocalProgram(deviceId: string): DeviceProgram | null {
  try {
    const raw = localStorage.getItem(localKey(deviceId))
    return raw ? validateProgram(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function saveLocalProgram(deviceId: string, program: DeviceProgram): void {
  try { localStorage.setItem(localKey(deviceId), JSON.stringify(program)) } catch { /* storage full: the relay copy still counts */ }
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
  const local = relay === undefined ? loadLocalProgram(deviceId) : null
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
  /** The relay took it (false in a build without a relay). */
  background: boolean
  /** The charge power was written to the device just now; null = not attempted (offline). */
  applied: boolean | null
  /** The message for a failed save, or a caveat for a successful one. */
  detail?: string
}

export async function saveProgram(
  deviceId: string,
  draft: DeviceProgram,
  { deviceOnline = true }: { deviceOnline?: boolean } = {},
): Promise<ProgramSaveResult> {
  if (isFirmwareUpdateLocked()) {
    return { ok: false, background: false, applied: null, detail: 'Paused while a firmware update is in progress. Try again when it finishes.' }
  }
  const now = Date.now()
  let program: DeviceProgram
  try {
    program = validateProgram(stampChanges(loadLocalProgram(deviceId), { ...draft, tz: phoneTimeZone() }, now))
  } catch (e) {
    return { ok: false, background: false, applied: null, detail: e instanceof Error ? e.message : 'Check the settings and try again.' }
  }

  let background = false
  if (isRelayConfigured()) {
    const up = await uploadProgram(deviceId, program)
    if (!up.ok) return { ok: false, background: false, applied: null, detail: up.detail }
    background = true
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
    detail: !background
      ? 'Saved on this phone. Schedules run only while the app is open in this build.'
      : applied === false
        ? 'Saved. The device did not take the change yet; it will be sent again shortly.'
        : applied === null
          ? 'Saved. The device is offline; it will switch when it is back online.'
          : undefined,
  }
}

async function uploadProgram(deviceId: string, program: DeviceProgram): Promise<{ ok: boolean; detail?: string }> {
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
    if (ok) return { ok: true }
    if (res.status === 409) return { ok: false, detail: 'Background session is missing. Sign in again and retry Save.' }
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
