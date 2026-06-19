/**
 * Power Outage Push Notification
 *
 * Triggers a browser Notification when a power outage alarm is detected
 * on an online device. Deduplicates by alarmId so each event fires once.
 */

// Alarm keys from API (field: key) that indicate AC/grid power loss
const POWER_OUTAGE_KEYS = new Set([
  // Confirmed from live API data
  'lineLoss',               // 市电停电告警
  'mainsPowerFailures',     // 市电故障
  'gridVoltLows',           // 市电输入电压过低
  'bypassUndervoltageFault',// 旁路欠压故障
  // Additional common keys
  'gridFault',
  'acInputFail',
  'acFail',
  'mainsFailure',
  'gridLoss',
  'utilityFail',
  'powerFailure',
  'lineFault',
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
  if (POWER_OUTAGE_KEYS.has(alarmCode)) return true
  // Fallback: keyword match on legacy/unknown codes
  const lower = alarmCode.toLowerCase()
  return lower.includes('lineloss') || lower.includes('mains') || lower.includes('gridfault')
    || lower.includes('gridloss') || lower.includes('acfail') || lower.includes('powerfail')
    || lower.includes('outage') || lower.includes('utility')
}

export interface FiringAlarm {
  alarmId: string
  alarmCode: string  // legacy field in DeviceStateResponse (= key)
  alarmMessage: string
  severity: string
  timestamp: string
  key?: string       // actual API field name
  name?: string      // alarm display name
}

export async function checkAndNotifyPowerOutage(
  deviceName: string,
  isOnline: boolean,
  firingAlarms: FiringAlarm[]
): Promise<void> {
  if (!isOnline || !firingAlarms?.length) return

  // Check both key and alarmCode fields
  const outageAlarms = firingAlarms.filter(a =>
    isPowerOutageAlarm(a.key ?? '') || isPowerOutageAlarm(a.alarmCode ?? '')
  )
  if (!outageAlarms.length) return

  const granted = await requestPermission()
  if (!granted) return

  for (const alarm of outageAlarms) {
    if (notifiedAlarmIds.has(alarm.alarmId)) continue
    notifiedAlarmIds.add(alarm.alarmId)

    new Notification('⚡ Power Outage Detected', {
      body: `${deviceName}: ${alarm.name || alarm.alarmMessage || 'AC grid power lost. Running on battery.'}`,
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
