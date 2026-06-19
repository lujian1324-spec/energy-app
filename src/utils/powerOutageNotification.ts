/**
 * Power Outage Push Notification
 *
 * Triggers a browser Notification when a power outage alarm is detected
 * on an online device. Deduplicates by alarmId so each event fires once.
 */

// Alarm codes that indicate AC/grid power loss
const POWER_OUTAGE_CODES = new Set([
  'AC_FAIL',
  'AC_INPUT_FAIL',
  'AC_POWER_FAIL',
  'GRID_FAIL',
  'GRID_LOST',
  'GRID_POWER_FAIL',
  'MAINS_FAIL',
  'UTILITY_FAIL',
  'INPUT_FAIL',
  'POWER_OUTAGE',
  'POWER_FAIL',
  'UPS_ON_BATTERY',
])

// Track alarmIds already notified to avoid repeat firing
const notifiedAlarmIds = new Set<string>()

async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

function isPowerOutageAlarm(alarmCode: string): boolean {
  const upper = alarmCode.toUpperCase()
  if (POWER_OUTAGE_CODES.has(upper)) return true
  // Fallback: contains keywords
  return upper.includes('OUTAGE') || upper.includes('AC_FAIL') || upper.includes('GRID_FAIL') || upper.includes('MAINS') || upper.includes('POWER_FAIL')
}

export interface FiringAlarm {
  alarmId: string
  alarmCode: string
  alarmMessage: string
  severity: string
  timestamp: string
}

export async function checkAndNotifyPowerOutage(
  deviceName: string,
  isOnline: boolean,
  firingAlarms: FiringAlarm[]
): Promise<void> {
  if (!isOnline || !firingAlarms?.length) return

  const outageAlarms = firingAlarms.filter(a => isPowerOutageAlarm(a.alarmCode))
  if (!outageAlarms.length) return

  const granted = await requestPermission()
  if (!granted) return

  for (const alarm of outageAlarms) {
    if (notifiedAlarmIds.has(alarm.alarmId)) continue
    notifiedAlarmIds.add(alarm.alarmId)

    new Notification('⚡ Power Outage Detected', {
      body: `${deviceName}: ${alarm.alarmMessage || 'AC grid power lost. Running on battery.'}`,
      icon: '/icons/icon-192.png',
      tag: `power-outage-${alarm.alarmId}`,
      renotify: false,
      requireInteraction: true,
    })
  }
}

/** Clear cache on device deselect / logout so alarms re-fire after reconnection */
export function clearOutageNotificationCache(): void {
  notifiedAlarmIds.clear()
}
