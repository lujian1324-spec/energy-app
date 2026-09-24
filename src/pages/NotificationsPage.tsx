import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import { SecondaryHeader } from '../components/PageHeader'
import { useDeviceStore } from '../stores/deviceStore'
import { useAlarmDismissStore, alarmKey } from '../stores/alarmDismissStore'
import { useFiringAlarmsStore, refreshFiringAlarms, visibleAlarmEntries } from '../stores/firingAlarmsStore'
import { dedupeAndFilterAlarms, knownAlarmText, describeAlarmCode } from '../utils/alarmText'

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

/**
 * The wire field for when an alarm started is not settled: the state response is
 * typed with `timestamp`, but a live device sends nothing under that name, which
 * is why the rows shipped with an empty time column. Take the first of the names
 * the platform uses, so a real one starts working the moment it appears.
 */
export function alarmStartedAt(a: Record<string, unknown>): string | undefined {
  for (const k of ['timestamp', 'alarmTime', 'startTime', 'triggerTime', 'createTime', 'occurTime']) {
    const v = a[k]
    if (typeof v === 'string' && v.trim()) return v
    if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString()
  }
  return undefined
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
 * Grid-power-not-connected gets a Jason-approved explanation as its subtitle,
 * overriding whatever body the server sent. Exact copy — do not paraphrase.
 */
const GRID_NOT_CONNECTED_TITLE = 'grid power not connected'
const GRID_NOT_CONNECTED_BODY =
  'AC grid input isn’t detected. Confirm the AC cable and that the wall outlet.'

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
  // Grid power not connected: keep the title, replace the body with the approved copy.
  if (title.trim().toLowerCase() === GRID_NOT_CONNECTED_TITLE) {
    return { title, description: GRID_NOT_CONNECTED_BODY }
  }
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
      className="relative overflow-hidden border-b border-ink-9"
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
        className="relative bg-ink-12 flex items-center gap-2 px-4 py-[21px]"
      >
        <div className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
          <Icon name={notificationIcon(`${title} ${description}`)} size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body-md font-semibold text-ink-2">{title}</p>
          <p className="mt-0.5 text-tiny text-ink-4">{description}</p>
        </div>
        {/* Timestamp + unread dot column, vertically centred in the row rather than
            pinned to the first line (`ui-fix-doc-20260911/06-notif-align`). */}
        {(time || unread) && (
          <div className="flex items-center gap-2 flex-shrink-0 self-center">
            {time && <p className="text-tiny text-ink-6 whitespace-nowrap">{time}</p>}
            {unread && <span className="w-2 h-2 rounded-full bg-danger" />}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { devices, isDemoMode } = useDeviceStore()
  const dismissed = useAlarmDismissStore(s => s.dismissed)
  const dismiss = useAlarmDismissStore(s => s.dismiss)
  const syncActive = useAlarmDismissStore(s => s.syncActive)
  const seen = useAlarmDismissStore(s => s.seen)
  const markSeen = useAlarmDismissStore(s => s.markSeen)
  const firstSeen = useAlarmDismissStore(s => s.firstSeen)
  const markFirstSeen = useAlarmDismissStore(s => s.markFirstSeen)
  const byDevice = useFiringAlarmsStore(s => s.byDevice)
  const failed = useFiringAlarmsStore(s => s.failed)

  /*
   * EVERY device's alarms, not just the selected one's. The bell on the Device
   * page counts across all devices; this list used to show — and mark read —
   * only the selected device, so a second device's alarm lit a dot over "You're
   * all caught up" that opening this page could never clear (APP-20260923-004).
   * Both now read the same store through the same visibleAlarmEntries.
   */
  const deviceIds = useMemo(() => devices.map(d => String(d.id)), [devices])
  const [refreshing, setRefreshing] = useState(true)
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshFiringAlarms(deviceIds, { demo: isDemoMode })
    } finally {
      setRefreshing(false)
    }
  }, [deviceIds, isDemoMode])
  useEffect(() => { void refresh() }, [refresh])

  // Forget dismissals for alarms that are no longer firing (so a genuinely
  // recurring alarm reappears instead of being permanently silenced). Only for
  // devices this refresh actually heard from: a failed read is not "cleared".
  useEffect(() => {
    if (refreshing) return
    for (const id of deviceIds) {
      const entry = byDevice[id]
      if (!entry || failed[id]) continue
      syncActive(id, dedupeAndFilterAlarms(entry.alarms).map(a => alarmKey(id, a.title)))
    }
  }, [refreshing, deviceIds, byDevice, failed, syncActive])

  // What the user actually sees: every device's active alarms minus the dismissed.
  const entries = useMemo(
    () => visibleAlarmEntries(byDevice, deviceIds, dismissed),
    [byDevice, deviceIds, dismissed],
  )

  // Unread = not seen before this visit. Snapshot on arrival so the dots stay put
  // while the page is open, then mark everything read for next time.
  const unreadSnapshot = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (entries.length === 0) return
    const keys = entries.map(e => e.key)
    if (unreadSnapshot.current === null) {
      unreadSnapshot.current = new Set(keys.filter(k => !seen.includes(k)))
    }
    markSeen(keys)
    markFirstSeen(keys)
  }, [entries, seen, markSeen, markFirstSeen])

  const nameOf = (id: string) => devices.find(d => String(d.id) === id)?.name ?? ''
  // A read that failed is not an empty inbox: say so and offer a retry rather
  // than "You're all caught up".
  const loadFailed = !refreshing && entries.length === 0 && deviceIds.some(id => failed[id] !== undefined)

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <SecondaryHeader title="Notifications" onBack={() => navigate(-1)} />

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {refreshing && entries.length === 0 && (
          <div className="flex justify-center pt-16">
            <Loader2 size={20} className="text-primary animate-spin" aria-label="Loading" />
          </div>
        )}

        {loadFailed && (
          <EmptyState
            art={`${import.meta.env.BASE_URL}ds-noti-empty.png`}
            title="Something went wrong"
            subtitle="Check your network connection and try again."
            action={{ label: 'Retry', onClick: () => { void refresh() } }}
            topOffset={157}
          />
        )}

        {/* Empty state, handoff `A_1.2_Notifications -v Empty State` */}
        {!refreshing && !loadFailed && entries.length === 0 && (
          <EmptyState
            art={`${import.meta.env.BASE_URL}ds-noti-empty.png`}
            title={'You’re all caught up'}
            subtitle="Battery alerts, outage notifications, and device updates will appear here."
            topOffset={157}
          />
        )}

        <AnimatePresence initial={false}>
          {entries.map(({ key, deviceId, alarm }) => {
            const row = splitAlarmForRow(alarm, nameOf(deviceId))
            return (
              <NotificationRow
                key={`firing-${key}`}
                title={row.title}
                description={row.description}
                time={formatNotificationTime(
                  alarmStartedAt(alarm as unknown as Record<string, unknown>)
                  ?? (firstSeen[key] ? new Date(firstSeen[key]).toISOString() : undefined)
                )}
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
