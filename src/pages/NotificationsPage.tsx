import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, AlertTriangle, CheckCircle, Info, Loader2, Bell, Check, Zap } from 'lucide-react'
import { useDeviceStore } from '../stores/deviceStore'
import type { AlarmItem } from '../api/deviceApi'

// Real-time firing alarm shape (from selectedDeviceState.firingAlarms)
interface FiringAlarm {
  alarmId: string
  alarmCode: string
  alarmMessage: string
  severity: string
  timestamp: string
}

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

function FiringAlarmRow({ alarm }: { alarm: FiringAlarm }) {
  const cfg = severityConfig(alarm.severity)
  const title = alarm.alarmMessage || alarm.alarmCode || `Alarm ${alarm.alarmId}`
  const time = alarm.timestamp ? new Date(alarm.timestamp).toLocaleString() : 'Active now'
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 px-4 py-3.5 border-b border-[rgba(255,255,255,0.06)]"
      style={{ backgroundColor: cfg.bg }}
    >
      <div className="mt-0.5 flex-shrink-0" style={{ color: cfg.color }}>
        <AlertTriangle size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-body-md font-semibold text-[#FFFFFF] leading-tight">{title}</div>
        {alarm.severity && <div className="text-[11px] text-[#8C8C8C] mt-0.5 capitalize">{alarm.severity}</div>}
        <div className="text-[10px] text-[#636366] mt-1.5">{time}</div>
      </div>
      <span
        className="flex-shrink-0 mt-0.5 text-[10px] font-semibold px-2 py-1 rounded-full"
        style={{ color: cfg.color, backgroundColor: cfg.bg }}
      >
        ACTIVE
      </span>
    </motion.div>
  )
}

function SectionHeader({ icon: SIcon, label, count, color }: {
  icon: typeof Zap; label: string; count: number; color: string
}) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      <SIcon size={14} style={{ color }} />
      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>{label}</span>
      <span className="text-[11px] text-[#636366]">({count})</span>
    </div>
  )
}

function levelConfig(alarm: AlarmItem): { color: string; bg: string; icon: typeof AlertTriangle } {
  const level = (alarm.levelDict ?? alarm.alarmLevel ?? '').toLowerCase()
  if (level === 'high' || level === 'critical' || level === 'major') {
    return { color: '#FF3B30', bg: 'rgba(255,59,48,0.08)', icon: AlertTriangle }
  }
  if (level === 'medium' || level === 'minor' || level === 'warning') {
    return { color: '#FF9500', bg: 'rgba(255,149,0,0.08)', icon: AlertTriangle }
  }
  return { color: '#01D6BE', bg: 'rgba(1,214,190,0.06)', icon: Info }
}

function AlarmRow({ alarm, onDismiss, dismissing }: {
  alarm: AlarmItem
  onDismiss: (id: string) => void
  dismissing: boolean
}) {
  const cfg = levelConfig(alarm)
  const Icon = alarm.isProcessed ? CheckCircle : cfg.icon
  const iconColor = alarm.isProcessed ? '#34C759' : cfg.color

  const title = alarm.name ?? alarm.alarmMessage ?? alarm.key ?? `Alarm ${alarm.alarmCode ?? alarm.id}`
  const subtitle = [
    alarm.levelDict ?? alarm.alarmLevel,
    alarm.deviceName,
    alarm.stationName,
  ].filter(Boolean).join(' · ')

  const time = alarm.disappearedAt
    ? `Resolved ${new Date(alarm.disappearedAt).toLocaleDateString()}`
    : alarm.createdAt
      ? new Date(alarm.createdAt).toLocaleString()
      : ''

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className="flex items-start gap-3 px-4 py-3.5 border-b border-[rgba(255,255,255,0.06)]"
      style={{ backgroundColor: alarm.isProcessed ? 'transparent' : cfg.bg }}
    >
      <div className="mt-0.5 flex-shrink-0" style={{ color: iconColor }}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-body-md font-semibold text-[#FFFFFF] leading-tight">{title}</div>
        {subtitle && <div className="text-[11px] text-[#8C8C8C] mt-0.5">{subtitle}</div>}
        {alarm.description && (
          <div className="text-[11px] text-[#BFBFBF] mt-1 leading-snug">{alarm.description}</div>
        )}
        <div className="text-[10px] text-[#636366] mt-1.5">{time}</div>
      </div>
      {!alarm.isProcessed && (
        <button
          onClick={() => onDismiss(alarm.id)}
          disabled={dismissing}
          className="flex-shrink-0 mt-0.5 text-[11px] text-[#01D6BE] px-2.5 py-1 rounded-full bg-[rgba(1,214,190,0.1)] disabled:opacity-40 flex items-center gap-1"
        >
          {dismissing ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          Dismiss
        </button>
      )}
    </motion.div>
  )
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const {
    selectedDeviceId,
    selectedDeviceState,
    loadDeviceState,
    alarms,
    alarmTotal,
    alarmLoading,
    loadAlarms,
    dismissAlarm,
  } = useDeviceStore()

  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadAlarms(selectedDeviceId ? Number(selectedDeviceId) : undefined, 1, 30)
    // Refresh live device state so the real-time firing alarms are current
    if (selectedDeviceId) loadDeviceState(selectedDeviceId)
  }, [selectedDeviceId, loadAlarms, loadDeviceState])

  // Real-time firing alarms from the live device state
  const firingAlarms = useMemo<FiringAlarm[]>(
    () => (selectedDeviceState?.firingAlarms ?? []) as FiringAlarm[],
    [selectedDeviceState?.firingAlarms]
  )

  // History alarms that aren't already shown as currently-firing (dedupe by key)
  const firingKeys = useMemo(
    () => new Set(firingAlarms.map(a => a.alarmCode)),
    [firingAlarms]
  )
  const historyAlarms = useMemo(
    () => alarms.filter(a => !(firingKeys.has(a.key ?? '') && !a.isProcessed && !a.disappearedAt)),
    [alarms, firingKeys]
  )

  const handleDismiss = async (alarmId: string) => {
    setDismissingIds(prev => new Set(prev).add(alarmId))
    try {
      await dismissAlarm(alarmId)
    } finally {
      setDismissingIds(prev => { const s = new Set(prev); s.delete(alarmId); return s })
    }
  }

  const handleLoadMore = () => {
    const nextPage = Math.floor(alarms.length / 30) + 1
    loadAlarms(selectedDeviceId ? Number(selectedDeviceId) : undefined, nextPage, 30, true)
  }

  const unprocessedCount = alarms.filter(a => !a.isProcessed).length

  return (
    <div className="h-full flex flex-col bg-[#141414] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center text-[#FFFFFF] active:scale-95 transition-transform"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-[#FFFFFF]">Notifications</h2>
          {firingAlarms.length > 0 ? (
            <p className="text-caption text-[#FF3B30]">{firingAlarms.length} active now</p>
          ) : unprocessedCount > 0 ? (
            <p className="text-caption text-[#FF9500]">{unprocessedCount} unprocessed</p>
          ) : alarms.length > 0 ? (
            <p className="text-caption text-[#8C8C8C]">{alarms.length} in history</p>
          ) : null}
        </div>
        {alarmLoading && <Loader2 size={18} className="text-[#01D6BE] animate-spin" />}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Loading state (initial) */}
        {alarmLoading && alarms.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#8C8C8C]">
            <Loader2 size={28} className="text-[#01D6BE] animate-spin" />
            <p className="text-body-md">Loading alarms…</p>
          </div>
        )}

        {/* Empty state */}
        {!alarmLoading && alarms.length === 0 && firingAlarms.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center px-6"
          >
            <div className="w-20 h-20 rounded-full bg-[#262626] flex items-center justify-center mb-4">
              <Bell size={32} className="text-[#454545]" />
            </div>
            <p className="text-body-lg font-semibold text-[#FFFFFF]">No Alarms</p>
            <p className="text-body-md text-[#636366] mt-1">All systems are running normally</p>
          </motion.div>
        )}

        {/* ── Real-time / active alarms (实时报警) ── */}
        {firingAlarms.length > 0 && (
          <>
            <SectionHeader icon={Zap} label="Active Now" count={firingAlarms.length} color="#FF3B30" />
            <AnimatePresence initial={false}>
              {firingAlarms.map(a => (
                <FiringAlarmRow key={`firing-${a.alarmId}`} alarm={a} />
              ))}
            </AnimatePresence>
          </>
        )}

        {/* ── Alarm history (报警历史) ── */}
        {historyAlarms.length > 0 && (
          <SectionHeader icon={Bell} label="History" count={alarmTotal || historyAlarms.length} color="#8C8C8C" />
        )}
        <AnimatePresence initial={false}>
          {historyAlarms.map(alarm => (
            <AlarmRow
              key={alarm.id}
              alarm={alarm}
              onDismiss={handleDismiss}
              dismissing={dismissingIds.has(alarm.id)}
            />
          ))}
        </AnimatePresence>

        {/* Load more */}
        {alarms.length > 0 && alarms.length < alarmTotal && (
          <button
            onClick={handleLoadMore}
            disabled={alarmLoading}
            className="w-full py-4 text-body-md text-[#01D6BE] font-medium disabled:opacity-50"
          >
            {alarmLoading ? 'Loading…' : `Load More (${alarmTotal - alarms.length} remaining)`}
          </button>
        )}

        {/* Bottom spacer */}
        <div className="h-6" />
      </div>
    </div>
  )
}

