import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, AlertTriangle, CheckCircle, Info, Loader2, Bell, Check } from 'lucide-react'
import { useDeviceStore } from '../stores/deviceStore'
import type { AlarmItem } from '../api/deviceApi'

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
    alarms,
    alarmTotal,
    alarmLoading,
    loadAlarms,
    dismissAlarm,
  } = useDeviceStore()

  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadAlarms(selectedDeviceId ? Number(selectedDeviceId) : undefined, 1, 30)
  }, [selectedDeviceId, loadAlarms])

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
          <h2 className="text-lg font-bold text-[#FFFFFF]">Alarm List</h2>
          {unprocessedCount > 0 && (
            <p className="text-caption text-[#FF3B30]">{unprocessedCount} active</p>
          )}
          {unprocessedCount === 0 && alarms.length > 0 && (
            <p className="text-caption text-[#8C8C8C]">{alarms.length} total</p>
          )}
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
        {!alarmLoading && alarms.length === 0 && (
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

        {/* Alarm rows */}
        <AnimatePresence initial={false}>
          {alarms.map(alarm => (
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

