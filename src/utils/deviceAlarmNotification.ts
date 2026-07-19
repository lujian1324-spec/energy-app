/**
 * Generic Device Alarm Push Notification
 *
 * The cloud alarm center (NotificationsPage, `/alarm/query/list` + `firingAlarms`)
 * already shows every alarm the backend reports — no filtering there. But the
 * *push*-notification side only ever watched three specific, hand-built local
 * conditions (Power Outage, Low Battery, Solar Status; see
 * `powerOutageNotification.ts` / `useLowBatteryMonitor.ts` / the solar watcher in
 * `OverviewPage.tsx`), so any other firing alarm (over-temp, cell fault, bus
 * overvoltage, …) never produced a notification even though it's visible in-app.
 * This module closes that gap: notify for any *other* firing alarm not already
 * covered by the power-outage-specific matcher, deduplicated by alarmId.
 */
import { showDeviceAlarmNotification } from './pushNotification'
import { resolveAlarmText } from './alarmText'
import { POWER_OUTAGE_KEYS, type FiringAlarm } from './powerOutageNotification'

function isPowerOutageAlarm(alarmCode: string): boolean {
  if (!alarmCode) return false
  if (POWER_OUTAGE_KEYS.has(alarmCode)) return true
  const lower = alarmCode.toLowerCase()
  return lower.includes('lineloss') || lower.includes('mains') || lower.includes('gridfault')
    || lower.includes('gridloss') || lower.includes('acfail') || lower.includes('powerfail')
    || lower.includes('outage') || lower.includes('utility')
}

async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

// Track alarmIds already notified to avoid repeat firing
const notifiedAlarmIds = new Set<string>()

/**
 * Notify for any firing alarm that ISN'T a power-outage alarm (that one has its
 * own dedicated notification via checkAndNotifyPowerOutage). Call alongside it
 * from the same place firingAlarms is available.
 */
export async function checkAndNotifyDeviceAlarms(
  deviceName: string,
  isOnline: boolean,
  firingAlarms: FiringAlarm[],
): Promise<void> {
  if (!isOnline || !firingAlarms?.length) return

  const otherAlarms = firingAlarms.filter(a =>
    !isPowerOutageAlarm(a.key ?? '') && !isPowerOutageAlarm(a.alarmCode ?? '')
  )
  if (!otherAlarms.length) return

  const granted = await requestPermission()
  if (!granted) return

  for (const alarm of otherAlarms) {
    if (notifiedAlarmIds.has(alarm.alarmId)) continue
    notifiedAlarmIds.add(alarm.alarmId)

    const text = resolveAlarmText(alarm)
    await showDeviceAlarmNotification(deviceName, alarm.alarmId, text, alarm.severity)
  }
}

/** Clear cache on device deselect / logout so alarms re-fire after reconnection */
export function clearDeviceAlarmNotificationCache(): void {
  notifiedAlarmIds.clear()
}
