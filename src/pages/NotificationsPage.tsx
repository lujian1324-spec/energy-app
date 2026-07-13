import { useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, AlertTriangle, Zap } from 'lucide-react'
import { useDeviceStore } from '../stores/deviceStore'
import { describeAlarmCode } from '../utils/alarmText'

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
  const title = alarm.alarmMessage || describeAlarmCode(alarm.alarmCode) || (alarm.alarmId ? `Alarm ${alarm.alarmId}` : 'Device Alarm')
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
        <div className="text-body-md font-semibold text-ink-1 leading-tight">{title}</div>
        {alarm.severity && <div className="text-[11px] text-ink-7 mt-0.5 capitalize">{alarm.severity}</div>}
        <div className="text-[10px] text-ink-7 mt-1.5">{time}</div>
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

export default function NotificationsPage() {
  const navigate = useNavigate()
  const {
    selectedDeviceId,
    selectedDeviceState,
    loadDeviceState,
  } = useDeviceStore()

  useEffect(() => {
    if (selectedDeviceId) loadDeviceState(selectedDeviceId)
  }, [selectedDeviceId, loadDeviceState])

  // Real-time firing alarms from the live device state
  const firingAlarms = useMemo<FiringAlarm[]>(
    () => (selectedDeviceState?.firingAlarms ?? []) as FiringAlarm[],
    [selectedDeviceState?.firingAlarms]
  )

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-ink-10 flex items-center justify-center text-ink-1 active:scale-95 transition-transform"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-ink-1">Notifications</h2>
          {firingAlarms.length > 0 ? (
            <p className="text-caption text-danger">{firingAlarms.length} active now</p>
          ) : (
            <p className="text-caption text-ink-7">No active alarms</p>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Empty state */}
        {firingAlarms.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center px-6"
          >
            <div className="w-20 h-20 rounded-full bg-ink-10 flex items-center justify-center mb-4">
              <Zap size={32} className="text-ink-9" />
            </div>
            <p className="text-body-lg font-semibold text-ink-1">No Active Alarms</p>
            <p className="text-body-md text-ink-7 mt-1">All systems are running normally</p>
          </motion.div>
        )}

        {/* Active alarms */}
        {firingAlarms.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <Zap size={14} style={{ color: '#FF3B30' }} />
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#FF3B30' }}>Active Now</span>
              <span className="text-[11px] text-ink-7">({firingAlarms.length})</span>
            </div>
            <AnimatePresence initial={false}>
              {firingAlarms.map(a => (
                <FiringAlarmRow key={`firing-${a.alarmId}`} alarm={a} />
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
