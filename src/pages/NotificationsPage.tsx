import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import { SecondaryHeader } from '../components/PageHeader'
import { useDeviceStore } from '../stores/deviceStore'
import { useAlarmDismissStore, alarmKey } from '../stores/alarmDismissStore'
import { dedupeAndFilterAlarms, knownAlarmText, describeAlarmCode } from '../utils/alarmText'
import type { FiringAlarm } from '../utils/powerOutageNotification'

/** Swipe panel width (4x export `A_1.2_Notifications -v Swiped`). */
const SWIPE_W = 72

/**
 * Which handoff glyph a notification carries. `A_1.2_Notifications -v Default`
 * shows battery / solar / outage circles, so route each alarm to the closest one
 * and fall back to the generic alert.
 */
function notificationIcon(text: string): string {
  const t = text.toLowerCase()
  if (/\b(pv|solar)\b/.test(t)) return 'solar'
  if (/mains|grid|utility|outage|power fail|ac input/.test(t)) return 'outage'
  if (/batter|cell|soc/.test(t)) return 'battery'
  return 'alert'
}

/** "2 mins ago" then "Today 3:42 PM" then "May 3", matching the export's timestamps. */
export function formatNotificationTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const mins = Math.floor((now - t) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const d = new Date(t)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  if (t >= startOfToday.getTime()) {
    return `Today ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

/**
 * The design's row is a category headline over a "{device} - {detail}" line, but a
 * firing alarm only carries one text blob. Prefer the curated short label for the
 * alarm code, fall back to a humanised code, and only then to the first clause of
 * the message; whatever is left of the message becomes the detail.
 */
export function splitAlarmForRow(
  alarm: { title: string; alarmMessage?: string; key?: string; alarmCode?: string; severity?: string },
  deviceName: string,
): { title: string; description: string } {
  const code = alarm.key ?? alarm.alarmCode ?? ''
  const short = knownAlarmText(code) || describeAlarmCode(code)
  const message = (alarm.alarmMessage ?? '').trim()
  const title = short || alarm.title.split(/,\s*/)[0] || alarm.title
  const detail = message && message !== title
    ? message
    : (alarm.severity ? alarm.severity.charAt(0).toUpperCase() + alarm.severity.slice(1) : '')
  return { title, description: [deviceName, detail].filter(Boolean).join(' • ') }
}

/**
 * One notification row, handoff `A_1.2_Notifications -v Default` / `-v Swiped`.
 * Measured on the 4x export: no card background, a full-bleed ink-9 hairline under
 * each row, 18px vertical padding, a 40px ink-9 icon circle 8px from the text,
 * body_medium/semibold/ink-2 title, tiny/ink-4 description with the tiny/ink-6
 * timestamp aligned to its first line, and a danger dot for unread. Swiping left reveals a 72px
 * danger panel with the trash glyph.
 */
function NotificationRow({
  title,
  description,
  time,
  unread,
  onDismiss,
}: {
  title: string
  description: string
  time: string
  unread: boolean
  onDismiss: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      className="relative overflow-hidden border-b border-xs border-ink-9"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Delete notification: ${title}`}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-danger"
        style={{ width: SWIPE_W }}
      >
        <Icon name="trash" size={24} />
      </button>
      <motion.div
        drag="x"
        dragConstraints={{ left: -SWIPE_W, right: 0 }}
        dragElastic={0.04}
        animate={{ x: open ? -SWIPE_W : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        onDragEnd={(_, info) => setOpen(info.offset.x < -SWIPE_W / 2)}
        className="relative bg-ink-12 flex items-start gap-2 px-4 py-[21px]"
      >
        <div className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
          <Icon name={notificationIcon(`${title} ${description}`)} size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="flex-1 min-w-0 text-body-md font-semibold text-ink-2">{title}</p>
            {unread && <span className="mt-1.5 w-2 h-2 rounded-full bg-danger flex-shrink-0" />}
          </div>
          <div className="mt-0.5 flex items-start gap-2">
            <p className="flex-1 min-w-0 text-tiny text-ink-4">{description}</p>
            {time && <p className="text-tiny text-ink-6 whitespace-nowrap flex-shrink-0">{time}</p>}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { selectedDeviceId, selectedDeviceState, loadDeviceState, devices } = useDeviceStore()
  const dismissed = useAlarmDismissStore(s => s.dismissed)
  const dismiss = useAlarmDismissStore(s => s.dismiss)
  const syncActive = useAlarmDismissStore(s => s.syncActive)
  const seen = useAlarmDismissStore(s => s.seen)
  const markSeen = useAlarmDismissStore(s => s.markSeen)

  // Refresh live device state so firing alarms are current on entering the page.
  // This is a side effect (a store fetch), so it belongs in useEffect, a useMemo
  // must stay pure and React may skip/re-run it (e.g. StrictMode) without warning.
  useEffect(() => {
    if (selectedDeviceId) loadDeviceState(selectedDeviceId)
  }, [selectedDeviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time firing alarms from the live device state, deduped by description and
  // with a Mains power failure's correlated undervoltage symptoms suppressed.
  const activeAlarms = useMemo(
    () => dedupeAndFilterAlarms((selectedDeviceState?.firingAlarms ?? []) as FiringAlarm[]),
    [selectedDeviceState?.firingAlarms]
  )

  // Forget dismissals for alarms that are no longer firing (so a genuinely
  // recurring alarm reappears instead of being permanently silenced).
  useEffect(() => {
    syncActive(selectedDeviceId, activeAlarms.map(a => alarmKey(selectedDeviceId, a.title)))
  }, [activeAlarms, selectedDeviceId, syncActive])

  // What the user actually sees: active alarms minus the ones they swiped away.
  const visibleAlarms = useMemo(
    () => activeAlarms.filter(a => !dismissed.includes(alarmKey(selectedDeviceId, a.title))),
    [activeAlarms, dismissed, selectedDeviceId]
  )

  // Unread = not seen before this visit. Snapshot on arrival so the dots stay put
  // while the page is open, then mark everything read for next time.
  const unreadSnapshot = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (visibleAlarms.length === 0) return
    const keys = visibleAlarms.map(a => alarmKey(selectedDeviceId, a.title))
    if (unreadSnapshot.current === null) {
      unreadSnapshot.current = new Set(keys.filter(k => !seen.includes(k)))
    }
    markSeen(keys)
  }, [visibleAlarms, selectedDeviceId, seen, markSeen])

  const deviceName = devices.find(d => String(d.id) === String(selectedDeviceId))?.name ?? ''

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <SecondaryHeader title="Notifications" onBack={() => navigate(-1)} />

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Empty state, handoff `A_1.2_Notifications -v Empty State` */}
        {visibleAlarms.length === 0 && (
          <EmptyState
            art={`${import.meta.env.BASE_URL}ds-noti-empty.svg`}
            title={'You’re all caught up'}
            subtitle="Battery alerts, outage notifications, and device updates will appear here."
            topOffset={157}
          />
        )}

        <AnimatePresence initial={false}>
          {visibleAlarms.map(a => {
            const key = alarmKey(selectedDeviceId, a.title)
            const row = splitAlarmForRow(a, deviceName)
            return (
              <NotificationRow
                key={`firing-${a.title}`}
                title={row.title}
                description={row.description}
                time={formatNotificationTime(a.timestamp)}
                unread={unreadSnapshot.current?.has(key) ?? false}
                onDismiss={() => dismiss(key)}
              />
            )
          })}
        </AnimatePresence>

        {/* Bottom spacer */}
        <div className="h-6" />
      </div>
    </div>
  )
}
