import { useMemo } from 'react'
import { useDeviceStore } from '../stores/deviceStore'
import { useAlarmDismissStore, alarmKey } from '../stores/alarmDismissStore'
import { dedupeAndFilterAlarms } from '../utils/alarmText'
import type { FiringAlarm } from '../utils/powerOutageNotification'

/**
 * How many rows Notifications would show under Active Now for the selected
 * device: what is firing right now, deduped, minus anything already dismissed.
 * Deliberately the same three inputs that page uses, so a bell that reads this
 * cannot disagree with the list it opens.
 *
 * Device Monitor used to light its dot from the device list's own `isAlarmed`
 * flag, which stays raised for a device that has an alarm on record — leaving a
 * red dot over an empty Notifications page.
 */
export function useActiveAlarmCount(): number {
  const selectedDeviceId = useDeviceStore((s) => s.selectedDeviceId)
  const firingAlarms = useDeviceStore((s) => s.selectedDeviceState?.firingAlarms)
  const dismissed = useAlarmDismissStore((s) => s.dismissed)

  return useMemo(() => {
    const active = dedupeAndFilterAlarms((firingAlarms ?? []) as FiringAlarm[])
    return active.filter((a) => !dismissed.includes(alarmKey(selectedDeviceId, a.title))).length
  }, [firingAlarms, dismissed, selectedDeviceId])
}
