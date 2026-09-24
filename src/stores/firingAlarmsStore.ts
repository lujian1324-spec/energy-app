/**
 * Firing alarms for EVERY device, in one place, so the bell and the list it
 * opens read the same data (APP-20260923-004).
 *
 * The Device page's bell counted unread alarms across all devices, from its own
 * component-local cache. Notifications listed — and marked read — only the
 * currently selected device's alarms. With more than one device, or with the
 * selected device not being the one alarming, the bell stayed lit over "You're
 * all caught up", and opening the list could never clear it.
 *
 * Now every /remote/device/state/latest read records its `firingAlarms` here,
 * keyed by device; the bell counts with `unreadAlarmCount` and the list renders
 * `visibleAlarmEntries`, both over the same devices and the same entries. A
 * device whose read failed keeps its last good entry, and is also flagged, so
 * the list can say it could not load instead of claiming there is nothing.
 */
import { create } from 'zustand'
import { fetchDeviceState } from '../api/deviceApi'
import { getDemoDeviceState } from '../data/demoData'
import { alarmKey } from './alarmDismissStore'
import { dedupeAndFilterAlarms } from '../utils/alarmText'
import type { FiringAlarm } from '../utils/powerOutageNotification'
import { isApiSuccess } from '../utils/apiClient'

export interface DeviceFiringAlarms {
  alarms: FiringAlarm[]
  /** When this entry was recorded (ms). */
  at: number
}

type FiringAlarmsState = {
  byDevice: Record<string, DeviceFiringAlarms>
  /** Devices whose most recent read failed (ms of the failure). */
  failed: Record<string, number>
}

export const useFiringAlarmsStore = create<FiringAlarmsState>(() => ({ byDevice: {}, failed: {} }))

const norm = (id: string | number | null | undefined) => (id == null ? '' : String(id).trim())

/** A successful state read for one device. */
export function recordFiringAlarms(deviceId: string | number | null | undefined, alarms: unknown[] | null | undefined): void {
  const key = norm(deviceId)
  if (!key) return
  useFiringAlarmsStore.setState(s => {
    const failed = { ...s.failed }
    delete failed[key]
    return {
      byDevice: { ...s.byDevice, [key]: { alarms: (alarms ?? []) as FiringAlarm[], at: Date.now() } },
      failed,
    }
  })
}

/** A read that failed: the last good entry stays, the device is flagged. */
export function recordFiringAlarmsFailed(deviceId: string | number | null | undefined): void {
  const key = norm(deviceId)
  if (!key) return
  useFiringAlarmsStore.setState(s => ({ failed: { ...s.failed, [key]: Date.now() } }))
}

/** Sign-out / account switch: the next account must not inherit these. */
export function clearFiringAlarms(): void {
  useFiringAlarmsStore.setState({ byDevice: {}, failed: {} })
}

/** Re-read every listed device's state (Notifications does this on entry). */
export async function refreshFiringAlarms(
  deviceIds: Array<string | number>,
  { demo = false }: { demo?: boolean } = {},
): Promise<void> {
  await Promise.all(deviceIds.map(async (id) => {
    if (demo) {
      const state = getDemoDeviceState(id)
      if (state) recordFiringAlarms(id, state.firingAlarms)
      return
    }
    try {
      const r = await fetchDeviceState(String(id))
      if (isApiSuccess(r.code) && r.data) recordFiringAlarms(id, r.data.firingAlarms)
      else recordFiringAlarmsFailed(id)
    } catch {
      recordFiringAlarmsFailed(id)
    }
  }))
}

export interface AlarmEntry {
  deviceId: string
  key: string
  alarm: FiringAlarm & { title: string }
}

/** Every device's firing alarms, deduped per device, minus the dismissed. */
export function visibleAlarmEntries(
  byDevice: Record<string, DeviceFiringAlarms>,
  deviceIds: Array<string | number>,
  dismissed: string[],
): AlarmEntry[] {
  const out: AlarmEntry[] = []
  for (const raw of deviceIds) {
    const deviceId = norm(raw)
    const entry = byDevice[deviceId]
    if (!entry) continue
    for (const alarm of dedupeAndFilterAlarms(entry.alarms)) {
      const key = alarmKey(deviceId, alarm.title)
      if (!dismissed.includes(key)) out.push({ deviceId, key, alarm })
    }
  }
  return out
}

/** What the bell badges: exactly the list's rows that have not been seen. */
export function unreadAlarmCount(
  byDevice: Record<string, DeviceFiringAlarms>,
  deviceIds: Array<string | number>,
  dismissed: string[],
  seen: string[],
): number {
  return visibleAlarmEntries(byDevice, deviceIds, dismissed).filter(e => !seen.includes(e.key)).length
}
