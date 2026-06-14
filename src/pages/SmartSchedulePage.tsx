import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  Zap,
  Battery,
  Clock,
  Plus,
  Trash2,
  Power,
  AlertTriangle,
  Check,
  X,
  Info,
  Edit2,
  Save,
  Loader2,
  RefreshCw,
  CloudOff,
} from 'lucide-react'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useDeviceStore } from '../stores/deviceStore'
import { mapBundleToSettings, mapSettingsToGeneralConfig } from '../api/deviceApi'
import type { PeakShavingSchedule } from '../types'

// 日程类型配置
const scheduleTypeConfig = {
  charge: { label: 'Charge', color: '#01D6BE', icon: Battery, bgColor: 'rgba(1,214,190,0.15)' },
  discharge: { label: 'Discharge', color: '#FF9500', icon: Zap, bgColor: 'rgba(255,149,0,0.15)' },
  grid: { label: 'Grid', color: '#01D6BE', icon: Power, bgColor: 'rgba(1,214,190,0.15)' },
  battery: { label: 'Battery', color: '#FFD700', icon: Battery, bgColor: 'rgba(255,215,0,0.15)' },
}

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const minutesToLabel = (mins: number) => {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

/** 分钟数 → 整点 HH:00 字符串（时间刻度仅支持整点） */
const minsToHourTime = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:00`

const checkScheduleConflict = (
  newSchedule: { startTime: string; endTime: string; id?: string },
  existingSchedules: PeakShavingSchedule[]
): { conflict: boolean; with?: string; overlap?: string } => {
  const newStart = timeToMinutes(newSchedule.startTime)
  const newEnd = timeToMinutes(newSchedule.endTime)
  for (const existing of existingSchedules) {
    if (newSchedule.id && existing.id === newSchedule.id) continue
    const exStart = timeToMinutes(existing.startTime)
    const exEnd = timeToMinutes(existing.endTime)
    if (newStart < exEnd && newEnd > exStart) {
      const overlapStart = Math.max(newStart, exStart)
      const overlapEnd = Math.min(newEnd, exEnd)
      const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      return { conflict: true, with: existing.name, overlap: `${fmtMin(overlapStart)} - ${fmtMin(overlapEnd)}` }
    }
  }
  return { conflict: false }
}

// SVG clock donut arc path helper
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180
  const startRad = toRad(startDeg)
  const endRad = toRad(endDeg)
  const x1 = cx + r * Math.cos(startRad)
  const y1 = cy + r * Math.sin(startRad)
  const x2 = cx + r * Math.cos(endRad)
  const y2 = cy + r * Math.sin(endRad)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

export default function SmartSchedulePage() {
  const navigate = useNavigate()
  const {
    peakShavingSettings,
    peakShavingStatus,
    togglePeakShaving,
    updatePeakShavingSettings,
    addPeakShavingSchedule,
    updatePeakShavingSchedule,
    deletePeakShavingSchedule,
    lookupTOURate,
    powerStation,
  } = usePowerStationStore()

  const {
    selectedDeviceId,
    peakValleyConfig,
    peakValleyLoading,
    peakValleySaving,
    peakValleyError,
    loadPeakValley,
    enablePeakValley,
    savePeakValleyGeneral,
  } = useDeviceStore()

  const [apiConfigLoaded, setApiConfigLoaded] = useState(false)
  useEffect(() => {
    if (!selectedDeviceId || apiConfigLoaded) return
    const deviceIdNum = Number(selectedDeviceId)
    if (isNaN(deviceIdNum) || deviceIdNum <= 0) return
    ;(async () => {
      const bundle = await loadPeakValley(deviceIdNum)
      if (bundle) {
        const settings = mapBundleToSettings(bundle)
        if (settings.schedules && settings.schedules.length > 0) {
          updatePeakShavingSettings(settings)
        }
      }
      setApiConfigLoaded(true)
    })()
  }, [selectedDeviceId, apiConfigLoaded, loadPeakValley, updatePeakShavingSettings])

  const handleRefresh = useCallback(async () => {
    if (!selectedDeviceId) return
    const deviceIdNum = Number(selectedDeviceId)
    if (isNaN(deviceIdNum) || deviceIdNum <= 0) return
    const bundle = await loadPeakValley(deviceIdNum)
    if (bundle) {
      const settings = mapBundleToSettings(bundle)
      updatePeakShavingSettings(settings)
    }
  }, [selectedDeviceId, loadPeakValley, updatePeakShavingSettings])

  const handleTogglePeakShaving = useCallback(async (enabled: boolean) => {
    if (!selectedDeviceId) {
      togglePeakShaving(enabled)
      return
    }
    try {
      await enablePeakValley(Number(selectedDeviceId), enabled)
      togglePeakShaving(enabled)
    } catch { /* noop */ }
  }, [selectedDeviceId, enablePeakValley, togglePeakShaving])

  const handleSaveToDevice = useCallback(async () => {
    if (!selectedDeviceId) return
    try {
      const config = mapSettingsToGeneralConfig(Number(selectedDeviceId), peakShavingSettings)
      await savePeakValleyGeneral(config)
    } catch { /* noop */ }
  }, [selectedDeviceId, peakShavingSettings, savePeakValleyGeneral])

  const handleScheduleChanged = useCallback(() => {
    if (selectedDeviceId && apiConfigLoaded) {
      const config = mapSettingsToGeneralConfig(Number(selectedDeviceId), { ...peakShavingSettings })
      savePeakValleyGeneral(config).catch(() => {})
    }
  }, [selectedDeviceId, apiConfigLoaded, peakShavingSettings, savePeakValleyGeneral])

  const [showAddModal, setShowAddModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<PeakShavingSchedule | null>(null)
  const [editForm, setEditForm] = useState<Partial<PeakShavingSchedule>>({})
  const [editConflict, setEditConflict] = useState<{ conflict: boolean; with?: string; overlap?: string }>({ conflict: false })
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; scheduleId: string; scheduleName: string }>({ show: false, scheduleId: '', scheduleName: '' })
  const [showPartPeak, setShowPartPeak] = useState(false)

  const openEditModal = (schedule: PeakShavingSchedule) => {
    setEditingSchedule(schedule)
    setEditForm({ ...schedule })
    setEditConflict({ conflict: false })
  }

  const handleEditFormChange = (updates: Partial<PeakShavingSchedule>) => {
    const updated = { ...editForm, ...updates }
    setEditForm(updated)
    if ((updates.startTime || updates.endTime) && updated.startTime && updated.endTime) {
      const result = checkScheduleConflict({ startTime: updated.startTime, endTime: updated.endTime, id: editingSchedule?.id }, peakShavingSettings.schedules)
      setEditConflict(result)
    }
  }

  const handleSaveEdit = () => {
    if (editingSchedule && editForm.name && editForm.startTime && editForm.endTime && !editConflict.conflict) {
      updatePeakShavingSchedule(editingSchedule.id, editForm)
      setEditingSchedule(null)
      setTimeout(() => handleScheduleChanged(), 50)
    }
  }

  const handleDeleteClick = (schedule: PeakShavingSchedule) => {
    setDeleteConfirm({ show: true, scheduleId: schedule.id, scheduleName: schedule.name })
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirm.scheduleId) {
      deletePeakShavingSchedule(deleteConfirm.scheduleId)
      setTimeout(() => handleScheduleChanged(), 50)
    }
    setDeleteConfirm({ show: false, scheduleId: '', scheduleName: '' })
  }

  const [newSchedule, setNewSchedule] = useState<Partial<PeakShavingSchedule>>({
    name: '',
    startTime: '09:00',
    endTime: '17:00',
    type: 'discharge',
    enabled: true,
  })

  const conflictResult = useMemo(() => {
    if (!newSchedule.startTime || !newSchedule.endTime) return { conflict: false }
    return checkScheduleConflict({ startTime: newSchedule.startTime, endTime: newSchedule.endTime }, peakShavingSettings.schedules)
  }, [newSchedule.startTime, newSchedule.endTime, peakShavingSettings.schedules])

  const handleAddSchedule = () => {
    if (newSchedule.name && newSchedule.startTime && newSchedule.endTime) {
      addPeakShavingSchedule(newSchedule as Omit<PeakShavingSchedule, 'id'>)
      setShowAddModal(false)
      setNewSchedule({ name: '', startTime: '09:00', endTime: '17:00', type: 'discharge', enabled: true })
      setTimeout(() => handleScheduleChanged(), 50)
    }
  }

  const calculateSavings = () => {
    const { peakPrice, offPeakPrice, chargingEfficiency = 0.95, depthOfDischarge = 0.90, executionRate = 0.85 } = peakShavingSettings
    const batteryCapacity = powerStation.totalWh / 1000
    const daily = (peakPrice - offPeakPrice) * batteryCapacity * chargingEfficiency * depthOfDischarge * executionRate
    return { daily, monthly: daily * 30, yearly: daily * 365 }
  }
  const savings = calculateSavings()

  // ─── 时钟几何参数（24h 表盘，12am 在顶部）───
  // Map time (minutes 0-1440) → degrees (0=east), 12 o'clock(0min) = -90 (top)
  const timeToDeg = (mins: number) => (mins / 1440) * 360 - 90
  const cx = 120, cy = 120, r = 92, strokeW = 24
  const innerFaceR = r - strokeW / 2 - 6

  // 极坐标 → SVG 坐标
  const polar = (deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }

  // Collect schedule arc segments（支持跨午夜环绕）
  const arcs = peakShavingSettings.schedules
    .filter(s => s.enabled)
    .map(s => {
      const startMins = timeToMinutes(s.startTime)
      const endMinsRaw = timeToMinutes(s.endTime)
      let span = endMinsRaw - startMins
      if (span <= 0) span += 1440 // 跨午夜
      const startDeg = timeToDeg(startMins)
      const endDeg = startDeg + (span / 1440) * 360
      const color = s.type === 'discharge' ? '#FF9500' : s.type === 'charge' ? '#01D6BE' : '#636366'
      return { startDeg, endDeg, color, schedule: s, startMins, endMins: endMinsRaw }
    })

  // ─── 拖拽调整时间（参考 iPhone「睡眠」时钟交互）───
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ id: string; which: 'start' | 'end' } | null>(null)
  const [dragLabel, setDragLabel] = useState<string | null>(null)

  // 指针坐标 → 整点分钟数（吸附到整点）
  const pointerToMins = useCallback((clientX: number, clientY: number): number | null => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const px = (clientX - rect.left) * (240 / rect.width)
    const py = (clientY - rect.top) * (240 / rect.height)
    const deg = (Math.atan2(py - cy, px - cx) * 180) / Math.PI
    let mins = ((deg + 90) / 360) * 1440
    mins = (((mins % 1440) + 1440) % 1440)
    mins = Math.round(mins / 60) * 60
    if (mins >= 1440) mins -= 1440
    return mins
  }, [])

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const mins = pointerToMins(e.clientX, e.clientY)
      if (mins == null) return
      const t = minsToHourTime(mins)
      if (drag.which === 'start') updatePeakShavingSchedule(drag.id, { startTime: t })
      else updatePeakShavingSchedule(drag.id, { endTime: t })
      setDragLabel(minutesToLabel(mins))
    }
    const onUp = () => {
      setDrag(null)
      setDragLabel(null)
      setTimeout(() => handleScheduleChanged(), 50)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, pointerToMins, updatePeakShavingSchedule, handleScheduleChanged])

  // Hours labels on clock face
  const clockLabels = [
    { label: '12am', deg: -90 },
    { label: '6am', deg: 0 },
    { label: '12pm', deg: 90 },
    { label: '6pm', deg: 180 },
  ]

  // Find peak (discharge) and off-peak (charge) schedules
  const peakSchedule = peakShavingSettings.schedules.find(s => s.type === 'discharge' && s.enabled)
  const offPeakSchedule = peakShavingSettings.schedules.find(s => s.type === 'charge' && s.enabled)

  return (
    <div className="h-full flex flex-col bg-[#141414] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center text-white active:scale-95 transition-transform flex-shrink-0"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="flex-1 text-center text-body-lg font-semibold text-white">Smart Schedule</h2>
        <button
          className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center text-[#A0A0A5] flex-shrink-0"
        >
          <Info size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-24">

        {/* T18: API 连接状态 + 保存按钮 */}
        <div className="mb-3 flex items-center gap-2">
          {selectedDeviceId ? (
            <>
              {peakValleyLoading ? (
                <div className="flex items-center gap-1.5 text-caption text-[#A0A0A5] bg-[#262626] rounded-full px-3 py-1.5">
                  <Loader2 size={12} className="animate-spin text-[#01D6BE]" />
                  Loading config...
                </div>
              ) : peakValleyError ? (
                <div className="flex items-center gap-1.5 text-caption text-[#FF9500] bg-[rgba(255,149,0,0.1)] rounded-full px-3 py-1.5">
                  <CloudOff size={12} />
                  Using cached settings
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-caption text-[#34C759] bg-[rgba(52,199,89,0.1)] rounded-full px-3 py-1.5">
                  <Check size={12} />
                  Synced to device
                </div>
              )}
              <div className="flex-1" />
              <button
                onClick={handleRefresh}
                disabled={peakValleyLoading}
                className="w-8 h-8 rounded-full bg-[#262626] flex items-center justify-center text-[#A0A0A5] hover:text-[#01D6BE] transition-colors disabled:opacity-40"
                title="Refresh from device"
              >
                <RefreshCw size={14} className={peakValleyLoading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={handleSaveToDevice}
                disabled={peakValleySaving || peakValleyLoading}
                className="flex items-center gap-1.5 h-8 px-3 rounded-full text-caption font-medium transition-colors
                  bg-[rgba(1,214,190,0.12)] text-[#01D6BE] hover:bg-[rgba(1,214,190,0.2)] disabled:opacity-40"
                title="Save settings to device"
              >
                {peakValleySaving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                Save to Device
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-caption text-[#636366] bg-[#262626] rounded-full px-3 py-1.5">
              <CloudOff size={12} />
              Demo mode — no device selected
            </div>
          )}
        </div>

        {/* Main Switch */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#262626] rounded-[20px] p-4 mb-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors
                ${peakShavingSettings.enabled ? 'bg-[rgba(1,214,190,0.15)]' : 'bg-[#333333]'}`}>
                <Calendar size={24} className={peakShavingSettings.enabled ? 'text-[#01D6BE]' : 'text-[#636366]'} />
              </div>
              <div>
                <div className="text-[15px] font-bold text-[#FFFFFF]">Smart Schedule</div>
                <div className="text-label text-[#A0A0A5]">
                  {peakShavingSettings.enabled ? 'Active — Optimizing electricity cost' : 'Disabled'}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleTogglePeakShaving(!peakShavingSettings.enabled)}
              className={`w-14 h-8 rounded-full transition-colors relative
                ${peakShavingSettings.enabled ? 'bg-[#01D6BE]' : 'bg-[#636366]'}`}
            >
              <motion.div
                className="w-6 h-6 rounded-full bg-[#FFFFFF] absolute top-1"
                animate={{ left: peakShavingSettings.enabled ? '28px' : '4px' }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
        </motion.div>

        {/* Current Status Card */}
        {peakShavingSettings.enabled && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#262626] rounded-[20px] p-4 mb-4"
          >
            <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3">Current Status</div>
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-l flex items-center justify-center
                ${currentMode === 'charge' ? 'bg-[rgba(52,199,89,0.15)]' :
                  currentMode === 'discharge' ? 'bg-[rgba(255,149,0,0.15)]' :
                  currentMode === 'grid' ? 'bg-[rgba(1,214,190,0.15)]' :
                  currentMode === 'battery' ? 'bg-[rgba(255,215,0,0.15)]' :
                  'bg-[#333333]'}`}>
                {currentMode === 'charge' && <Battery size={28} className="text-[#34C759]" />}
                {currentMode === 'discharge' && <Zap size={28} className="text-[#FF9500]" />}
                {currentMode === 'grid' && <Power size={28} className="text-[#01D6BE]" />}
                {currentMode === 'battery' && <Battery size={28} className="text-[#FFD700]" />}
                {currentMode === 'idle' && <Clock size={28} className="text-[#A0A0A5]" />}
                {currentMode === 'disabled' && <Power size={28} className="text-[#636366]" />}
              </div>
              <div className="flex-1">
                <div className="text-title-md font-bold text-[#FFFFFF]">
                  {currentMode === 'charge' ? 'Charging' :
                   currentMode === 'discharge' ? 'Discharging' :
                   currentMode === 'grid' ? 'Grid Power' :
                   currentMode === 'battery' ? 'Battery Power' :
                   currentMode === 'disabled' ? 'Disabled' : 'Idle'}
                </div>
                <div className="text-label text-[#A0A0A5]">
                  Battery: {powerStation.batteryLevel}% · {powerStation.timeToFull}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* 24h Timeline Visualization */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-[#262626] rounded-[20px] p-4 mb-4"
        >
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3">24h Schedule</div>

          {/* Timeline bar */}
          <div className="relative mb-2">
            {/* Background bar */}
            <div className="h-8 bg-[#333333] rounded-m overflow-hidden relative">
              {/* Schedule blocks */}
              {peakShavingSettings.schedules.filter(s => s.enabled).map((schedule) => {
                const config = scheduleTypeConfig[schedule.type]
                const startMin = timeToMinutes(schedule.startTime)
                const endMin = timeToMinutes(schedule.endTime)
                const leftPct = (startMin / (24 * 60)) * 100
                const widthPct = ((endMin - startMin) / (24 * 60)) * 100

                return (
                  <motion.button
                    key={schedule.id}
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    onClick={() => openEditModal(schedule)}
                    className="absolute top-0 h-full flex items-center justify-center cursor-pointer
                      hover:opacity-100 hover:z-[5] active:scale-[1.02] transition-all duration-150"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 2)}%`,
                      backgroundColor: config.color,
                      opacity: 0.7,
                      transformOrigin: 'left',
                      borderRadius: '4px',
                    }}
                    title={`${schedule.name}: ${schedule.startTime} - ${schedule.endTime}`}
                  >
                    <span className="text-[8px] font-bold text-[#000000] truncate px-1 pointer-events-none">
                      {config.emoji} {config.label}
                    </span>
                  </motion.button>
                )
              })}

              {/* Current time indicator */}
              <div
                className="absolute top-0 w-0.5 h-full bg-[#FFFFFF] z-10"
                style={{ left: `${currentHourOffset * 100}%` }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#FFFFFF]" />
              </div>
            </div>
          </div>

          {/* Hour labels */}
          <div className="flex justify-between px-0.5 mb-3">
            {['12AM', '3AM', '6AM', '9AM', '12PM', '3PM', '6PM', '9PM', '12AM'].map((label, i) => (
              <span key={i} className="text-[8px] text-[#636366]">{label}</span>
            ))}

          {/* Rate labels under timeline */}
          <div className="flex items-center gap-3 mb-2">
            {peakShavingSettings.touRateInfo ? (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#FF9500]" />
                  <span className="text-xs text-[#A0A0A5]">Peak ${peakShavingSettings.peakPrice}/kWh</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#34C759]" />
                  <span className="text-xs text-[#A0A0A5]">Off-Peak ${peakShavingSettings.offPeakPrice}/kWh</span>
                </div>
                {peakShavingSettings.partPeakPrice && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#FFD700]" />
                    <span className="text-xs text-[#A0A0A5]">Part-Peak ${peakShavingSettings.partPeakPrice}/kWh</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#FF9500]" />
                  <span className="text-xs text-[#A0A0A5]">Peak ${peakShavingSettings.peakPrice}/kWh</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#34C759]" />
                  <span className="text-xs text-[#A0A0A5]">Off-Peak ${peakShavingSettings.offPeakPrice}/kWh</span>
                </div>
              </>
            )}
          </div>

          {/* Savings estimate */}
          <div className="flex items-center justify-between pt-3 border-t border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-2">
              <DollarSign size={14} className="text-[#01D6BE]" />
              <span className="text-label text-[#A0A0A5]">Est. daily savings</span>
            </div>
            <span className="text-body-md font-bold text-[#01D6BE]">${savings.daily.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-caption text-[#636366] pl-[22px]">Est. monthly</span>
            <span className="text-label font-semibold text-[#01D6BE]">${savings.monthly.toFixed(2)}</span>
          </div>
          {/* PRD v1.1 §8.3: 节省金额计算公式审计 */}
          <div className="mt-2">
            <CalcAudit
              formula={`Daily Savings = (Peak Price − Off-Peak Price) × Battery Capacity × Efficiency × DoD × Execution Rate
= ($${peakShavingSettings.peakPrice} − $${peakShavingSettings.offPeakPrice}) × ${(powerStation.totalWh / 1000).toFixed(1)} kWh × 95% × 90% × 85%
= $${savings.daily.toFixed(4)}/day

            {/* Clock labels */}
            {clockLabels.map(({ label, deg: degNum }) => {
              const rad = (degNum * Math.PI) / 180
              const labelR = innerFaceR - 16
              return (
                <text
                  key={label}
                  x={cx + labelR * Math.cos(rad)}
                  y={cy + labelR * Math.sin(rad)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#636366"
                  fontSize={9}
                  fontFamily="Inter, sans-serif"
                >
                  {label}
                </text>
              )
            })}

        {/* Estimated Savings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-[#262626] rounded-[20px] p-4 mb-4"
        >
          <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3">Estimated Savings</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-caption text-[#A0A0A5] mb-1">Daily</div>
              <div className="text-body-lg font-bold text-[#01D6BE]">${savings.daily.toFixed(2)}</div>
            </div>
            <div className="text-center border-x border-[rgba(255,255,255,0.05)]">
              <div className="text-caption text-[#A0A0A5] mb-1">Monthly</div>
              <div className="text-body-lg font-bold text-[#01D6BE]">${savings.monthly.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-caption text-[#A0A0A5] mb-1">Yearly</div>
              <div className="text-body-lg font-bold text-[#01D6BE]">${savings.yearly.toFixed(2)}</div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
            <p className="text-xs text-[#636366]">
              Formula: (Peak − Off-Peak) × Capacity × Cycles × Efficiency(95%) × DoD(90%) × Execution(85%)
            </p>
          </div>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-[#262626] rounded-[20px] p-4 mb-4 overflow-hidden"
            >
              <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3">Parameters</div>

        {/* Idle hint */}
        <div className="bg-[#262626] rounded-l p-3 mb-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#636366]" />
          <div className="flex-1">
            <span className="text-label font-semibold text-[#A0A0A5]">Idle</span>
            <p className="text-tiny text-[#636366]">Gaps on the clock — grid powers devices directly, Sierro stays idle.</p>
          </div>
        </div>

                {/* Off-Peak Price */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-[#FFFFFF]">Off-Peak Price</span>
                    <span className="text-[13px] text-[#34C759]">${peakShavingSettings.offPeakPrice}/kWh</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.01"
                    value={peakShavingSettings.offPeakPrice}
                    onChange={(e) => updatePeakShavingSettings({ offPeakPrice: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-[#333333] rounded-full appearance-none cursor-pointer accent-[#34C759]"
                  />
                </div>

                {/* Part-Peak Price */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-[#FFFFFF]">Part-Peak Price</span>
                    <span className="text-[13px] text-[#FFD700]">${peakShavingSettings.partPeakPrice || '—'}/kWh</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.5"
                    step="0.01"
                    value={peakShavingSettings.partPeakPrice || 0.28}
                    onChange={(e) => updatePeakShavingSettings({ partPeakPrice: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-[#333333] rounded-full appearance-none cursor-pointer accent-[#FFD700]"
                  />
                </div>

                {/* Power limits */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <div className="text-caption text-[#A0A0A5] mb-1">Max Charge</div>
                    <div className="flex items-center gap-2 bg-[#333333] rounded-l px-3 py-2">
                      <Battery size={14} className="text-[#34C759]" />
                      <input
                        type="number"
                        value={peakShavingSettings.maxChargePower}
                        onChange={(e) => updatePeakShavingSettings({ maxChargePower: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-caption text-[#A0A0A5]">W</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-caption text-[#A0A0A5] mb-1">Max Discharge</div>
                    <div className="flex items-center gap-2 bg-[#333333] rounded-l px-3 py-2">
                      <Zap size={14} className="text-[#FF9500]" />
                      <input
                        type="number"
                        value={peakShavingSettings.maxDischargePower}
                        onChange={(e) => updatePeakShavingSettings({ maxDischargePower: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-caption text-[#A0A0A5]">W</span>
                    </div>
                  </div>
                </div>

                {/* Battery limits */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-caption text-[#A0A0A5] mb-1">Min SOC</div>
                    <div className="flex items-center gap-2 bg-[#333333] rounded-l px-3 py-2">
                      <Battery size={14} className="text-[#FF3B30]" />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={peakShavingSettings.minBatteryLevel}
                        onChange={(e) => updatePeakShavingSettings({ minBatteryLevel: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-caption text-[#A0A0A5]">%</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-caption text-[#A0A0A5] mb-1">Max SOC</div>
                    <div className="flex items-center gap-2 bg-[#333333] rounded-l px-3 py-2">
                      <Battery size={14} className="text-[#34C759]" />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={peakShavingSettings.maxBatteryLevel}
                        onChange={(e) => updatePeakShavingSettings({ maxBatteryLevel: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-caption text-[#A0A0A5]">%</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Schedule List */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase">Schedule</div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 text-label text-[#01D6BE] font-medium"
            >
              <Plus size={12} />
              Add
            </button>
          </div>
          <div className="space-y-2">
            {peakShavingSettings.schedules.length === 0 && (
              <div className="bg-[#262626] rounded-l p-4 text-center text-tiny text-[#636366]">
                No time periods. Tap “Add” to create one.
              </div>
            )}
            {peakShavingSettings.schedules.map((s) => {
              const cfg = scheduleTypeConfig[s.type]
              return (
                <motion.div
                  key={schedule.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-[#262626] rounded-l overflow-hidden transition-all
                    ${schedule.enabled ? '' : 'opacity-50'}`}
                >
                  <div
                    className="p-4 flex items-center gap-3 cursor-pointer"
                    onClick={() => setExpandedSchedule(isExpanded ? null : schedule.id)}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: config.bgColor }}
                    >
                      <Icon size={20} style={{ color: config.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="text-body-md font-semibold text-[#FFFFFF]">{schedule.name}</div>
                      <div className="text-caption text-[#A0A0A5]">
                        {schedule.startTime} – {schedule.endTime}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-caption px-2 py-1 rounded-full font-medium"
                        style={{ backgroundColor: config.bgColor, color: config.color }}
                      >
                        {config.emoji} {config.label}
                      </span>
                      {isExpanded ? <ChevronUp size={18} className="text-[#A0A0A5]" /> : <ChevronDown size={18} className="text-[#A0A0A5]" />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-[rgba(255,255,255,0.05)] px-4 py-3"
                      >
                        <div className="flex items-center justify-between">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openEditModal(schedule)
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[rgba(1,214,190,0.12)] text-[#01D6BE] text-label font-medium"
                          >
                            <Edit2 size={12} />
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleScheduleEnabled(schedule.id, !schedule.enabled)
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-label font-medium transition-colors
                              ${schedule.enabled ? 'bg-[#34C759] text-[#000000]' : 'bg-[#636366] text-[#FFFFFF]'}`}
                          >
                            <Power size={12} />
                            {schedule.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteClick(schedule)
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[rgba(255,59,48,0.15)] text-[#FF3B30] text-label font-medium"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>

          {peakShavingSettings.schedules.length === 0 && (
            <div className="text-center py-8 text-[#636366]">
              <Clock size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium text-[#A0A0A5]">No schedules</p>
              <p className="text-caption text-[#636366] mt-1">Add a schedule to start smart scheduling</p>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="bg-[rgba(1,214,190,0.05)] rounded-l p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[rgba(1,214,190,0.15)] flex items-center justify-center flex-shrink-0">
              <TrendingDown size={16} className="text-[#01D6BE]" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#FFFFFF] mb-1">How it works</div>
              <p className="text-caption text-[#A0A0A5] leading-relaxed">
                During off-peak hours, the system charges the battery using grid power at lower rates.
                During peak hours, the battery discharges to power your devices, reducing your electricity costs.
                Smart Schedule automatically optimizes charge/discharge timing based on your local TOU rates.
              </p>
            </div>
          </div>
        </div>

        {/* Estimated Savings */}
        <div className="mb-6">
          <span className="text-body-md font-semibold text-white block mb-2">Estimated Savings</span>
          <div className="bg-[#262626] rounded-l p-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-caption text-[#A0A0A5] mb-1">Daily</div>
              <div className="text-body-lg font-bold text-primary">${savings.daily.toFixed(2)}</div>
            </div>
            <div className="border-x border-[rgba(255,255,255,0.06)]">
              <div className="text-caption text-[#A0A0A5] mb-1">Monthly</div>
              <div className="text-body-lg font-bold text-primary">${savings.monthly.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-caption text-[#A0A0A5] mb-1">Yearly</div>
              <div className="text-body-lg font-bold text-primary">${savings.yearly.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-3 bg-[#141414]">
        <button
          onClick={handleSaveToDevice}
          disabled={peakValleySaving}
          className="w-full h-14 rounded-full bg-primary text-black text-body-md font-semibold
            disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {peakValleySaving ? <Loader2 size={18} className="animate-spin" /> : null}
          Save
        </button>
      </div>

      {/* Add Schedule Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.8)] z-50 flex items-end"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#262626] rounded-t-[28px] p-6 pb-10"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />
              <h3 className="text-body-lg font-bold text-white mb-5">Add Schedule</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-caption text-[#A0A0A5] mb-2 block">Schedule Name</label>
                  <input
                    type="text"
                    value={newSchedule.name}
                    onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
                    placeholder="e.g., Morning Charge"
                    className="w-full h-11 bg-[#333333] rounded-l px-4 text-body-md text-[#FFFFFF] placeholder-[#636366] outline-none"
                  />
                </div>
                <div>
                  <label className="text-caption text-[#A0A0A5] mb-2 block">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(scheduleTypeConfig).map(([type, config]) => (
                      <button
                        key={type}
                        onClick={() => setNewSchedule({ ...newSchedule, type: type as PeakShavingSchedule['type'] })}
                        className={`flex items-center gap-2 p-3 rounded-l transition-colors
                          ${newSchedule.type === type ? 'bg-[#333333] border border-[#01D6BE]' : 'bg-[#333333]'}`}
                      >
                        <config.icon size={16} style={{ color: config.color }} />
                        <span className="text-body-md text-white">{config.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-caption text-[#A0A0A5] mb-2 block">Start Time</label>
                    <input
                      type="time"
                      value={newSchedule.startTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, startTime: e.target.value })}
                      className="w-full h-11 bg-[#333333] rounded-l px-4 text-body-md text-[#FFFFFF] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-caption text-[#A0A0A5] mb-2 block">End Time</label>
                    <input
                      type="time"
                      value={newSchedule.endTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, endTime: e.target.value })}
                      className="w-full h-11 bg-[#333333] rounded-l px-4 text-body-md text-[#FFFFFF] outline-none"
                    />
                  </div>
                </div>
                {conflictResult.conflict && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 p-3 bg-[rgba(255,149,0,0.1)] rounded-l border border-[rgba(255,149,0,0.2)]"
                  >
                    <AlertTriangle size={16} className="text-[#FF9500] flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-label font-semibold text-[#FF9500]">Schedule Conflict</div>
                      <div className="text-caption text-[#A0A0A5]">
                        Overlaps with "{conflictResult.with}" ({conflictResult.overlap})
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 h-11 rounded-l bg-[#333333] text-[#FFFFFF] text-body-md font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSchedule}
                  disabled={!newSchedule.name}
                  className="flex-1 h-11 rounded-l bg-[#01D6BE] text-[#000000] text-body-md font-semibold disabled:opacity-50"
                >
                  Add Schedule
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOU Lookup Modal (change ZIP) */}
      <AnimatePresence>
        {showTouLookup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.8)] z-50 flex items-center justify-center p-5"
            onClick={() => setShowTouLookup(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#262626] rounded-[24px] p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-[#FFFFFF]">Change ZIP Code</h3>
                <button
                  onClick={() => setShowTouLookup(false)}
                  className="w-8 h-8 rounded-full bg-[#333333] flex items-center justify-center text-[#A0A0A5]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={zipInput}
                  onChange={(e) => { setZipInput(e.target.value); setTouNotFound(false) }}
                  placeholder="Enter ZIP code"
                  maxLength={5}
                  className="flex-1 h-11 bg-[#333333] rounded-l px-4 text-body-md text-[#FFFFFF] placeholder-[#636366] outline-none"
                />
                <button
                  onClick={handleTouLookup}
                  disabled={zipInput.length !== 5}
                  className="px-4 h-11 rounded-l bg-[#01D6BE] text-[#000000] text-[13px] font-semibold
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Look up
                </button>
              </div>

              {touNotFound && (
                <p className="text-caption text-[#FF9500]">ZIP code not found. Try 94025, 90210, 10001, 77001, or 60601.</p>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowTouLookup(false)}
                  className="flex-1 h-11 rounded-l bg-[#333333] text-[#FFFFFF] text-body-md font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowTouLookup(false); setShowSettings(true) }}
                  className="flex-1 h-11 rounded-l bg-[#333333] text-[#A0A0A5] text-body-md font-medium"
                >
                  Enter Custom
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Edit Schedule Modal (T2) ===== */}
      <AnimatePresence>
        {editingSchedule && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.8)] z-50 flex items-end"
            onClick={() => setEditingSchedule(null)}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#262626] rounded-t-[28px] p-6 pb-10"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-body-lg font-bold text-white">Edit Schedule</h3>
                <button onClick={() => setEditingSchedule(null)} className="w-8 h-8 rounded-full bg-[#333333] flex items-center justify-center text-[#A0A0A5]">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-caption text-[#A0A0A5] mb-2 block">Schedule Name</label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => handleEditFormChange({ name: e.target.value })}
                    className="w-full h-11 bg-[#333333] rounded-l px-4 text-body-md text-[#FFFFFF] outline-none"
                  />
                </div>
                <div>
                  <label className="text-caption text-[#A0A0A5] mb-2 block">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(scheduleTypeConfig).map(([type, config]) => (
                      <button
                        key={type}
                        onClick={() => handleEditFormChange({ type: type as PeakShavingSchedule['type'] })}
                        className={`flex items-center gap-2 p-3 rounded-l transition-colors
                          ${editForm.type === type ? 'bg-[#333333] border border-[#01D6BE]' : 'bg-[#333333]'}`}
                      >
                        <config.icon size={16} style={{ color: config.color }} />
                        <span className="text-body-md text-white">{config.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-caption text-[#A0A0A5] mb-2 block">Start Time</label>
                    <input
                      type="time"
                      value={editForm.startTime || ''}
                      onChange={(e) => handleEditFormChange({ startTime: e.target.value })}
                      className="w-full h-11 bg-[#333333] rounded-l px-4 text-body-md text-[#FFFFFF] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-caption text-[#A0A0A5] mb-2 block">End Time</label>
                    <input
                      type="time"
                      value={editForm.endTime || ''}
                      onChange={(e) => handleEditFormChange({ endTime: e.target.value })}
                      className="w-full h-11 bg-[#333333] rounded-l px-4 text-body-md text-[#FFFFFF] outline-none"
                    />
                  </div>
                </div>
                {editConflict.conflict && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 p-3 bg-[rgba(255,149,0,0.1)] rounded-l border border-[rgba(255,149,0,0.2)]"
                  >
                    <AlertTriangle size={16} className="text-[#FF9500] flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-label font-semibold text-[#FF9500]">Schedule Conflict</div>
                      <div className="text-caption text-[#A0A0A5]">
                        Overlaps with "{editConflict.with}" ({editConflict.overlap})
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEditingSchedule(null)}
                  className="flex-1 h-11 rounded-l bg-[#333333] text-[#FFFFFF] text-body-md font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editForm.name || editConflict.conflict}
                  className="flex-1 h-11 rounded-l bg-[#01D6BE] text-[#000000] text-body-md font-semibold disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>
              <button
                onClick={() => {
                  setEditingSchedule(null)
                  handleDeleteClick({ id: editingSchedule.id, name: editingSchedule.name } as PeakShavingSchedule)
                }}
                className="w-full mt-3 h-11 rounded-l bg-transparent text-[#FF3B30] text-[13px] font-medium
                  border border-[rgba(255,59,48,0.3)] flex items-center justify-center gap-2
                  hover:bg-[rgba(255,59,48,0.08)] active:bg-[rgba(255,59,48,0.15)] transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteConfirm.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.8)] z-[60] flex items-center justify-center p-5"
            onClick={() => setDeleteConfirm({ show: false, scheduleId: '', scheduleName: '' })}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#262626] rounded-[24px] p-6"
            >
              <div className="flex flex-col items-center mb-5">
                <div className="w-14 h-14 rounded-full bg-[rgba(255,53,48,0.12)] flex items-center justify-center mb-4">
                  <AlertTriangle size={28} className="text-danger" />
                </div>
                <h3 className="text-body-lg font-bold text-white mb-1">Delete Schedule?</h3>
                <p className="text-body-md text-[#A0A0A5] text-center">
                  Delete "<span className="text-white font-semibold">{deleteConfirm.scheduleName}</span>"? This cannot be undone.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteCancel}
                  className="flex-1 h-11 rounded-l bg-[#333333] text-[#FFFFFF] text-body-md font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 h-11 rounded-l bg-[#FF3B30] text-[#FFFFFF] text-body-md font-semibold
                    hover:opacity-90 active:opacity-80 transition-opacity"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
