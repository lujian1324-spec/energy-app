import { useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import Icon from '../components/Icon'
import { useDeviceStore } from '../stores/deviceStore'
import { useAlarmDismissStore, alarmKey } from '../stores/alarmDismissStore'
import { dedupeAndFilterAlarms } from '../utils/alarmText'
import type { FiringAlarm } from '../utils/powerOutageNotification'

function severityIconColor(severity: string): string {
  const s = (severity ?? '').toLowerCase()
  if (s === 'high' || s === 'critical' || s === 'major') return '#FF3B30'
  if (s === 'medium' || s === 'minor' || s === 'warning') return '#FF9500'
  return '#01D6BE'
}

/** Figma inbox row: icon 36, title 14, body tiny, unread red 10dot, time grey. Tap clears. */
function FiringAlarmRow({ alarm, onDismiss }: { alarm: FiringAlarm & { title: string }; onDismiss: () => void }) {
  const iconColor = severityIconColor(alarm.severity)
  const title = alarm.title
  const time = alarm.timestamp ? new Date(alarm.timestamp).toLocaleString() : 'Just now'
  const body = alarm.severity
    ? `${String(alarm.severity).charAt(0).toUpperCase()}${String(alarm.severity).slice(1)} alert`
    : 'Device alert'
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      onClick={onDismiss}
      aria-label={`Clear notification: ${title}`}
      className="w-full text-left flex items-start gap-3 px-4 py-5 min-h-[68px] border-b border-xs border-ink-9 active:opacity-70 transition-opacity bg-transparent"
    >
      <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0 mt-0.5" style={{ color: iconColor }}>
        <AlertTriangle size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className="text-body-md font-semibold text-ink-2 leading-tight truncate flex-1">{title}</div>
          <span className="w-2.5 h-2.5 rounded-full bg-danger flex-shrink-0 mt-1" aria-hidden="true" />
        </div>
        <div className="text-tiny text-ink-4 mt-0.5 truncate">{body}</div>
        <div className="text-tiny text-ink-6 mt-1.5">{time}</div>
      </div>
    </motion.button>
  )
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { selectedDeviceId, selectedDeviceState, loadDeviceState } = useDeviceStore()
  const dismissed = useAlarmDismissStore(s => s.dismissed)
  const dismiss = useAlarmDismissStore(s => s.dismiss)
  const syncActive = useAlarmDismissStore(s => s.syncActive)

  useEffect(() => {
    if (selectedDeviceId) loadDeviceState(selectedDeviceId)
  }, [selectedDeviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeAlarms = useMemo(
    () => dedupeAndFilterAlarms((selectedDeviceState?.firingAlarms ?? []) as FiringAlarm[]),
    [selectedDeviceState?.firingAlarms]
  )

  useEffect(() => {
    syncActive(selectedDeviceId, activeAlarms.map(a => alarmKey(selectedDeviceId, a.title)))
  }, [activeAlarms, selectedDeviceId, syncActive])

  const visibleAlarms = useMemo(
    () => activeAlarms.filter(a => !dismissed.includes(alarmKey(selectedDeviceId, a.title))),
    [activeAlarms, dismissed, selectedDeviceId]
  )

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <div className="px-5 pt-4 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="relative w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center text-white active:scale-95 transition-transform before:absolute before:content-[''] before:-inset-1.5"
          aria-label="Back"
        >
          <Icon name="chevron-left" size={24} />
        </button>
        <div className="flex-1">
          <h2 className="text-title-md font-semibold text-white">Notifications</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {visibleAlarms.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center px-6"
          >
            <img
              src={`${import.meta.env.BASE_URL}ds-noti-empty.svg`}
              alt=""
              className="w-[200px] h-[200px] object-contain select-none"
              draggable={false}
            />
            <h2 className="text-title-lg font-semibold text-ink-3 mt-6 mb-2">You&apos;re all caught up</h2>
            <p className="text-label text-ink-5 max-w-[280px]">
              Battery alerts, outage notifications, and device updates will appear here.
            </p>
          </motion.div>
        )}

        {visibleAlarms.length > 0 && (
          <AnimatePresence initial={false}>
            {visibleAlarms.map(a => (
              <FiringAlarmRow
                key={`firing-${a.title}`}
                alarm={a}
                onDismiss={() => dismiss(alarmKey(selectedDeviceId, a.title))}
              />
            ))}
          </AnimatePresence>
        )}

        <div className="h-6" />
      </div>
    </div>
  )
}
