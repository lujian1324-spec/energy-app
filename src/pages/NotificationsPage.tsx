import { useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Zap, X } from 'lucide-react'
import Icon from '../components/Icon'
import { useDeviceStore } from '../stores/deviceStore'
import { useAlarmDismissStore, alarmKey } from '../stores/alarmDismissStore'
import { dedupeAndFilterAlarms } from '../utils/alarmText'
import type { FiringAlarm } from '../utils/powerOutageNotification'

function severityConfig(severity: string): { color: string; bg: string } {
  const s = (severity ?? '').toLowerCase()
  if (s === 'high' || s === 'critical' || s === 'major') {
    return { color: '#FF3B30', bg: 'rgba(255,59,48,0.10)' }
  }
  if (s === 'medium' || s === 'minor' || s === 'warning') {
    return { color: '#FF9500', bg: 'rgba(255,149,0,0.10)' }
  }
  return { color: '#01D6BE', bg: 'rgba(1,214,190,0.08)' }
}

function FiringAlarmRow({ alarm, onDismiss }: { alarm: FiringAlarm & { title: string }; onDismiss: () => void }) {
  const cfg = severityConfig(alarm.severity)
  // Title is pre-resolved by dedupeAndFilterAlarms (which also deduped/suppressed).
  const title = alarm.title
  const time = alarm.timestamp ? new Date(alarm.timestamp).toLocaleString() : 'Active now'
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      onClick={onDismiss}
      aria-label={`Clear alarm: ${title}`}
      className="w-full text-left flex items-start gap-3 px-4 py-5 min-h-[68px] border-b border-xs border-ink-9 active:opacity-70 transition-opacity"
      style={{ backgroundColor: cfg.bg }}
    >
      <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0 mt-0.5" style={{ color: cfg.color }}>
        <AlertTriangle size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-body-md font-semibold text-ink-1 leading-tight">{title}</div>
        {alarm.severity && <div className="text-caption text-ink-7 mt-0.5 capitalize">{alarm.severity}</div>}
        <div className="text-tiny text-ink-7 mt-1.5">{time} · Tap to clear</div>
      </div>
      <span
        className="flex-shrink-0 mt-0.5 flex items-center gap-1 text-tiny font-semibold px-2 py-1 rounded-full"
        style={{ color: cfg.color, backgroundColor: cfg.bg }}
      >
        <X size={11} />Clear
      </span>
    </motion.button>
  )
}

function SectionHeader({ icon: SIcon, label, count, color }: {
  icon: typeof Zap; label: string; count: number; color: string
}) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      <SIcon size={14} style={{ color }} />
      <span className="text-caption font-bold uppercase tracking-wide" style={{ color }}>{label}</span>
      <span className="text-caption text-ink-7">({count})</span>
    </div>
  )
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { selectedDeviceId, selectedDeviceState, loadDeviceState } = useDeviceStore()
  const dismissed = useAlarmDismissStore(s => s.dismissed)
  const dismiss = useAlarmDismissStore(s => s.dismiss)
  const syncActive = useAlarmDismissStore(s => s.syncActive)

  // Refresh live device state so firing alarms are current on entering the page.
  // This is a side effect (a store fetch), so it belongs in useEffect — a useMemo
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

  // What the user actually sees: active alarms minus the ones they tapped to clear.
  const visibleAlarms = useMemo(
    () => activeAlarms.filter(a => !dismissed.includes(alarmKey(selectedDeviceId, a.title))),
    [activeAlarms, dismissed, selectedDeviceId]
  )

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      {/* Header */}
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
          {visibleAlarms.length > 0 && (
            <p className="text-caption text-danger">{visibleAlarms.length} active now</p>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Empty state — design-system illustration */}
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
            <h2 className="text-title-lg font-semibold text-ink-3 mt-6 mb-2">You're all caught up</h2>
            <p className="text-label text-ink-5 max-w-[280px]">
              Battery alerts, outage notifications, and device updates will appear here.
            </p>
          </motion.div>
        )}

        {/* Active alarms */}
        {visibleAlarms.length > 0 && (
          <>
            <SectionHeader icon={Zap} label="Active Now" count={visibleAlarms.length} color="#FF3B30" />
            <AnimatePresence initial={false}>
              {visibleAlarms.map(a => (
                <FiringAlarmRow
                  key={`firing-${a.title}`}
                  alarm={a}
                  onDismiss={() => dismiss(alarmKey(selectedDeviceId, a.title))}
                />
              ))}
            </AnimatePresence>
          </>
        )}

        {/* Bottom spacer */}
        <div className="h-6" />
      </div>
    </div>
  )
}
