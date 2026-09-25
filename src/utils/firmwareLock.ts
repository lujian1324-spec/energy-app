/**
 * Firmware update lock (v4.20.0).
 *
 * While a device's firmware is being updated, the app sends nothing else: no
 * state polls, history reads, AC switch or charge-power writes, BLE reads, relay
 * schedule uploads. Only the update itself and the calls that follow it (and the
 * session calls that keep the user signed in) go out. An interrupted flash is the
 * one way the app could leave a unit unusable, so this errs on the side of silence.
 *
 * The session is persisted, so a restart in the middle of an update keeps the
 * lock and the progress screen. It can never lock the app for good: after
 * MAX_LOCK_MS it lapses and the update is reported as "status unknown".
 *
 * React- and store-free: apiClient, bleDirect and the relay upload ask
 * `isFirmwareUpdateLocked()` before every request.
 */

/** What is being installed, kept for the progress screen and after a restart. */
export interface FirmwareSession {
  deviceId: string
  deviceName: string
  firmwareId: string
  /** The version being installed (firmware name/version as the platform lists it). */
  version: string
  /** Release notes: what is new and what is fixed. */
  notes: string
  /** Platform upgrade task id, once `upgrade/create` returned one. */
  deviceUpgradeId?: string
  /** The version the device reported before the update (to see it change). */
  fromVersion?: string
  startedAt: number
}

export const FIRMWARE_SESSION_KEY = 'sierro-firmware-update'
/** A firmware update never holds the app longer than this. */
export const MAX_LOCK_MS = 45 * 60 * 1000

/**
 * Requests allowed while locked: the firmware/upgrade calls, the device record
 * (it carries `isUpgrading` and the version), and session upkeep, without which
 * a token expiring mid-update would sign the user out.
 */
const ALLOWED = [
  /^\/device\/firmware\//,
  /^\/device\/upgrade\//,
  /^\/device\/details\b/,
  /^\/gather\/protocol\/manufacturerDeviceUpgradeProtocol\//,
  /^\/login\/refresh\/access\/token\b/,
  /^\/user\/select\/iotUserInfo\b/,
]

export function isFirmwareTraffic(path: string): boolean {
  return ALLOWED.some(re => re.test(path))
}

let memory: FirmwareSession | null = null
const listeners = new Set<() => void>()

function read(): FirmwareSession | null {
  try {
    const raw = localStorage.getItem(FIRMWARE_SESSION_KEY)
    if (!raw) return memory
    const s = JSON.parse(raw) as FirmwareSession
    return s && typeof s.deviceId === 'string' && Number.isFinite(s.startedAt) ? s : null
  } catch {
    return memory
  }
}

/** The running update, or null — a lapsed one (past MAX_LOCK_MS) counts as none. */
export function getFirmwareSession(now = Date.now()): FirmwareSession | null {
  const s = read()
  if (!s) return null
  if (now - s.startedAt > MAX_LOCK_MS || now < s.startedAt - 60_000) return null
  return s
}

/** The raw stored session, lapsed or not (to report "status unknown" after a lapse). */
export function getStoredFirmwareSession(): FirmwareSession | null {
  return read()
}

export function isFirmwareUpdateLocked(now = Date.now()): boolean {
  return getFirmwareSession(now) !== null
}

export function setFirmwareSession(s: FirmwareSession): void {
  memory = s
  try { localStorage.setItem(FIRMWARE_SESSION_KEY, JSON.stringify(s)) } catch { /* memory copy still locks */ }
  listeners.forEach(fn => fn())
}

export function clearFirmwareSession(): void {
  memory = null
  try { localStorage.removeItem(FIRMWARE_SESSION_KEY) } catch { /* ignore */ }
  listeners.forEach(fn => fn())
}

/** Re-render hook for UI that shows the lock (banners). Returns an unsubscribe. */
export function subscribeFirmwareLock(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The business code a blocked request answers with — callers treat it as a failed call. */
export const FIRMWARE_LOCK_CODE = 'FIRMWARE_UPDATING'
export const FIRMWARE_LOCK_MESSAGE = 'Paused while a firmware update is in progress.'
