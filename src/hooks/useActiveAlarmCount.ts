import { useMemo } from 'react'
import { useDeviceStore } from '../stores/deviceStore'
import { useAlarmDismissStore, alarmKey } from '../stores/alarmDismissStore'
import { dedupeAndFilterAlarms } from '../utils/alarmText'
import type { FiringAlarm } from '../utils/powerOutageNotification'

/**
 * How many UNREAD alerts the bell should badge for the selected device: what is
 * firing right now, deduped, minus anything already dismissed AND minus anything
 * already seen. Deliberately the same inputs Notifications uses, so a bell that
 * reads this cannot disagree with the list it opens — and because opening
 * Notifications marks every visible alert `seen`, the dot clears once the user has
 * looked, instead of staying lit for as long as the alarm keeps firing.
 *
 * Device Monitor used to light its dot from the device list's own `isAlarmed`
 * flag, which stays raised for a device that has an alarm on record — leaving a
 * red dot over an empty Notifications page.
 */
export function useActiveAlarmCount(): number {
  const selectedDeviceId = useDeviceStore((s) => s.selectedDeviceId)
  const firingAlarms = useDeviceStore((s) => s.selectedDeviceState?.firingAlarms)
  const dismissed = useAlarmDismissStore((s) => s.dismissed)
  const seen = useAlarmDismissStore((s) => s.seen)

  return useMemo(() => {
    const active = dedupeAndFilterAlarms((firingAlarms ?? []) as FiringAlarm[])
    return active.filter((a) => {
      const key = alarmKey(selectedDeviceId, a.title)
      return !dismissed.includes(key) && !seen.includes(key)
    }).length
  }, [firingAlarms, dismissed, seen, selectedDeviceId])
}
