/**
 * SW-12 — one active schedule mode per device (Sleep XOR Smart Schedule).
 *
 * Both features drive the same physical control: Modbus 0x0085 on the device
 * and the relay's single per-device schedule slot. They kept their own local
 * `enabled` + window, so a device could have Sleep Mode armed on one screen and
 * Smart Schedule armed on another, each re-writing the other's charge power on
 * its own 60s tick, and each overwriting the other's relay slot on save. The
 * last screen you happened to open won.
 *
 * Drafts may still live apart — Sleep keeps its quiet hours, Smart Schedule
 * keeps its off-peak window — but only one of them may *execute*. Enabling a
 * mode claims the device here; the claim is what the shared scheduler checks
 * before it writes, and it also disarms the other mode's stored window so the
 * client, the storage and the relay slot all agree on who owns the device.
 *
 * Deliberately storage-only and React-free: the hook, both pages and the tests
 * all read the same claim.
 */

import { clearPendingSmartScheduleSave } from './smartScheduleQueue'

export type ScheduleMode = 'sleep' | 'smart'

/** localStorage namespaces of the two modes' saved windows (see `useSleepModeScheduler`). */
export const MODE_STORAGE_PREFIX: Record<ScheduleMode, string> = {
  sleep: 'sierro-sleep',
  smart: 'sierro-smart',
}

function claimKey(deviceId: string): string {
  return `sierro-active-schedule-${deviceId}`
}

type Listener = (deviceId: string, mode: ScheduleMode | null) => void
const listeners = new Set<Listener>()

/** Which mode currently owns the device, or null when neither has claimed it. */
export function getActiveScheduleMode(deviceId: string): ScheduleMode | null {
  if (!deviceId) return null
  try {
    const v = localStorage.getItem(claimKey(deviceId))
    return v === 'sleep' || v === 'smart' ? v : null
  } catch {
    return null
  }
}

/**
 * May `mode` write charge power to this device right now?
 *
 * An unclaimed device is open to either mode — accounts upgrading from before
 * SW-12 have a Sleep window armed and no claim, and must keep working until the
 * next save claims the device for them.
 */
export function canExecuteScheduleMode(deviceId: string, mode: ScheduleMode): boolean {
  const active = getActiveScheduleMode(deviceId)
  return active === null || active === mode
}

/**
 * Claim the device for `mode` and disarm the other mode's stored window, so a
 * later visit to that screen does not silently re-arm a second executor.
 */
export function setActiveScheduleMode(deviceId: string, mode: ScheduleMode): void {
  if (!deviceId) return
  if (mode === 'sleep') clearPendingSmartScheduleSave(deviceId)
  const other: ScheduleMode = mode === 'sleep' ? 'smart' : 'sleep'
  try {
    localStorage.setItem(claimKey(deviceId), mode)
  } catch {
    // ignore storage errors — the in-memory gate below still applies
  }
  disarmStoredWindow(deviceId, other)
  notify(deviceId, mode)
}

/**
 * Release the device. Scoped to the owner: turning Sleep Mode off must not drop
 * a claim Smart Schedule has since taken.
 */
export function clearActiveScheduleMode(deviceId: string, mode?: ScheduleMode): void {
  if (!deviceId) return
  if (mode && getActiveScheduleMode(deviceId) !== mode) return
  try {
    localStorage.removeItem(claimKey(deviceId))
  } catch {
    // ignore storage errors
  }
  notify(deviceId, null)
}

/** Flip a mode's saved window to `enabled: false` without touching its times. */
export function disarmStoredWindow(deviceId: string, mode: ScheduleMode): void {
  const key = `${MODE_STORAGE_PREFIX[mode]}-${deviceId}`
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const saved = JSON.parse(raw) as { enabled?: boolean }
    if (saved?.enabled === false) return
    localStorage.setItem(key, JSON.stringify({ ...saved, enabled: false }))
  } catch {
    // malformed or unavailable storage — nothing to disarm
  }
}

/** React to claims made elsewhere in this tab (`storage` events only fire cross-tab). */
export function subscribeActiveScheduleMode(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function notify(deviceId: string, mode: ScheduleMode | null): void {
  for (const fn of listeners) {
    try { fn(deviceId, mode) } catch { /* a bad listener must not break a save */ }
  }
}
