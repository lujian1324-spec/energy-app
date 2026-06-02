import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  Zap,
  Battery,
  Clock,
  Settings,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Power,
  TrendingDown,
  Search,
  AlertTriangle,
  Check,
  X,
  MapPin,
  DollarSign,
  Calendar,
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

// 日程类型配置 — 色盲友好（颜色 + 图标标签）
const scheduleTypeConfig = {
  charge: { label: 'Charge', color: '#34C759', icon: Battery, bgColor: 'rgba(52,199,89,0.15)', emoji: '⚡' },
  discharge: { label: 'Discharge', color: '#FF9500', icon: Zap, bgColor: 'rgba(255,149,0,0.15)', emoji: '🔋' },
  grid: { label: 'Grid', color: '#0D9488', icon: Power, bgColor: 'rgba(13,148,136,0.15)', emoji: '🔌' },
  battery: { label: 'Battery', color: '#FFD700', icon: Battery, bgColor: 'rgba(255,215,0,0.15)', emoji: '🔋' },
}

// 时间转分钟数
const timeToMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// 冲突检测
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

    const overlaps = newStart < exEnd && newEnd > exStart
    if (overlaps) {
      const overlapStart = Math.max(newStart, exStart)
      const overlapEnd = Math.min(newEnd, exEnd)
      const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      return {
        conflict: true,
        with: existing.name,
        overlap: `${fmtMin(overlapStart)} - ${fmtMin(overlapEnd)}`,
      }
    }
  }
  return { conflict: false }
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

  // T18: 接入设备 Store 的削峰填谷 API
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

  // 首次加载：从 API 拉取削峰填谷配置
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

  // 手动刷新
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

  // 开/关削峰填谷 — 通过 API
  const handleTogglePeakShaving = useCallback(async (enabled: boolean) => {
    if (!selectedDeviceId) {
      // 无真实设备，回退到本地 mock 操作
      togglePeakShaving(enabled)
      return
    }
    try {
      await enablePeakValley(Number(selectedDeviceId), enabled)
      // API 成功后更新本地状态
      togglePeakShaving(enabled)
    } catch {
      // 失败时不做本地更新
    }
  }, [selectedDeviceId, enablePeakValley, togglePeakShaving])

  // 保存到设备 — 将当前设置推送到 API
  const handleSaveToDevice = useCallback(async () => {
    if (!selectedDeviceId) return
    try {
      const config = mapSettingsToGeneralConfig(Number(selectedDeviceId), peakShavingSettings)
      await savePeakValleyGeneral(config)
    } catch {
      // error is tracked via peakValleyError in deviceStore
    }
  }, [selectedDeviceId, peakShavingSettings, savePeakValleyGeneral])

  // 日程变更后自动保存到 API（debounce 效果：在关闭添加/编辑 modal 时触发）
  const handleScheduleChanged = useCallback(() => {
    if (selectedDeviceId && apiConfigLoaded) {
      const config = mapSettingsToGeneralConfig(Number(selectedDeviceId), { ...peakShavingSettings })
      savePeakValleyGeneral(config).catch(err => console.error('[SmartSchedulePage] save failed:', err))
    }
  }, [selectedDeviceId, apiConfigLoaded, peakShavingSettings, savePeakValleyGeneral])

  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showTouLookup, setShowTouLookup] = useState(false)
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null)

  // T2: 编辑日程 modal 状态
  const [editingSchedule, setEditingSchedule] = useState<PeakShavingSchedule | null>(null)
  const [editForm, setEditForm] = useState<Partial<PeakShavingSchedule>>({})
  const [editConflict, setEditConflict] = useState<{ conflict: boolean; with?: string; overlap?: string }>({ conflict: false })

  // T2: 删除确认对话框状态
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; scheduleId: string; scheduleName: string }>({
    show: false,
    scheduleId: '',
    scheduleName: '',
  })

  const openEditModal = (schedule: PeakShavingSchedule) => {
    setEditingSchedule(schedule)
    setEditForm({ ...schedule })
    setEditConflict({ conflict: false })
  }

  // 编辑表单时间变化时检测冲突
  const handleEditFormChange = (updates: Partial<PeakShavingSchedule>) => {
    const updated = { ...editForm, ...updates }
    setEditForm(updated)
    if (updates.startTime || updates.endTime) {
      if (updated.startTime && updated.endTime) {
        const result = checkScheduleConflict(
          { startTime: updated.startTime, endTime: updated.endTime, id: editingSchedule?.id },
          peakShavingSettings.schedules
        )
        setEditConflict(result)
      }
    }
  }

  const handleSaveEdit = () => {
    if (editingSchedule && editForm.name && editForm.startTime && editForm.endTime) {
      if (editConflict.conflict) return
      updatePeakShavingSchedule(editingSchedule.id, editForm)
      setEditingSchedule(null)
      setEditConflict({ conflict: false })
      // T18: 自动同步到 API
      setTimeout(() => handleScheduleChanged(), 50)
    }
  }

  // T2: 带确认的删除
  const handleDeleteClick = (schedule: PeakShavingSchedule) => {
    setDeleteConfirm({ show: true, scheduleId: schedule.id, scheduleName: schedule.name })
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirm.scheduleId) {
      deletePeakShavingSchedule(deleteConfirm.scheduleId)
      setExpandedSchedule(null)
      // T18: 自动同步到 API
      setTimeout(() => handleScheduleChanged(), 50)
    }
    setDeleteConfirm({ show: false, scheduleId: '', scheduleName: '' })
  }

  const handleDeleteCancel = () => {
    setDeleteConfirm({ show: false, scheduleId: '', scheduleName: '' })
  }

  // TOU 查找
  const [zipInput, setZipInput] = useState(peakShavingSettings.zipCode || '')
  const [touNotFound, setTouNotFound] = useState(false)

  // 新日程表单
  const [newSchedule, setNewSchedule] = useState<Partial<PeakShavingSchedule>>({
    name: '',
    startTime: '09:00',
    endTime: '17:00',
    type: 'discharge',
    enabled: true,
  })

  // 冲突检测结果
  const conflictResult = useMemo(() => {
    if (!newSchedule.startTime || !newSchedule.endTime) return { conflict: false }
    return checkScheduleConflict(
      { startTime: newSchedule.startTime, endTime: newSchedule.endTime },
      peakShavingSettings.schedules
    )
  }, [newSchedule.startTime, newSchedule.endTime, peakShavingSettings.schedules])

  // 当前模式
  const getCurrentMode = () => {
    if (!peakShavingSettings.enabled) return 'disabled'
    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const activeSchedule = peakShavingSettings.schedules.find(s => {
      if (!s.enabled) return false
      return currentTime >= s.startTime && currentTime < s.endTime
    })
    return activeSchedule?.type || 'idle'
  }
  const currentMode = getCurrentMode()

  // 改进的节省计算（v1.1）
  const calculateSavings = () => {
    const { peakPrice, offPeakPrice, chargingEfficiency = 0.95, depthOfDischarge = 0.90, executionRate = 0.85 } = peakShavingSettings
    const batteryCapacity = powerStation.totalWh / 1000 // kWh
    const dailyCycles = 1

    const dailySavings = (peakPrice - offPeakPrice)
      * batteryCapacity
      * dailyCycles
      * chargingEfficiency
      * depthOfDischarge
      * executionRate

    return {
      daily: dailySavings,
      monthly: dailySavings * 30,
      yearly: dailySavings * 365,
    }
  }
  const savings = calculateSavings()

  // TOU 查找处理
  const handleTouLookup = () => {
    const result = lookupTOURate(zipInput)
    setTouNotFound(!result)
    if (result) {
      setShowTouLookup(false)
    }
  }

  // 添加日程
  const handleAddSchedule = () => {
    if (newSchedule.name && newSchedule.startTime && newSchedule.endTime) {
      addPeakShavingSchedule(newSchedule as Omit<PeakShavingSchedule, 'id'>)
      setShowAddModal(false)
      setNewSchedule({ name: '', startTime: '09:00', endTime: '17:00', type: 'discharge', enabled: true })
      // T18: 自动同步到 API
      setTimeout(() => handleScheduleChanged(), 50)
    }
  }

  const toggleScheduleEnabled = (id: string, enabled: boolean) => {
    updatePeakShavingSchedule(id, { enabled })
    // T18: 自动同步到 API
    setTimeout(() => handleScheduleChanged(), 50)
  }

  // 24h 时间轴数据
  const timelineHours = Array.from({ length: 25 }, (_, i) => i) // 0-24
  const getScheduleBlock = (hour: number) => {
    const timeStr = `${String(hour).padStart(2, '0')}:00`
    for (const s of peakShavingSettings.schedules) {
      if (!s.enabled) continue
      const sStart = timeToMinutes(s.startTime)
      const sEnd = timeToMinutes(s.endTime)
      const hMin = hour * 60
      // 跨午夜处理
      if (sEnd < sStart) {
        if (hMin >= sStart || hMin < sEnd) return s
      } else {
        if (hMin >= sStart && hMin < sEnd) return s
      }
    }
    return null
  }

  // 当前时间指示线位置
  const now = new Date()
  const currentHourOffset = (now.getHours() * 60 + now.getMinutes()) / (24 * 60)

  return (
    <div className="h-full flex flex-col bg-[#000000] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#FFFFFF] hover:bg-[#2C2C2E] transition-colors flex-shrink-0"
        >
          <ChevronLeft size={22} />
        </button>
        <h2 className="text-xl font-bold text-[#FFFFFF] flex-1">Smart Schedule</h2>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors
            ${showSettings ? 'bg-[#0D9488] text-[#000000]' : 'bg-[#1C1C1E] text-[#FFFFFF]'}`}
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">

        {/* T18: API 连接状态 + 保存按钮 */}
        <div className="mb-3 flex items-center gap-2">
          {selectedDeviceId ? (
            <>
              {peakValleyLoading ? (
                <div className="flex items-center gap-1.5 text-[11px] text-[#8E8E93] bg-[#1C1C1E] rounded-full px-3 py-1.5">
                  <Loader2 size={12} className="animate-spin text-[#0D9488]" />
                  Loading config...
                </div>
              ) : peakValleyError ? (
                <div className="flex items-center gap-1.5 text-[11px] text-[#FF9500] bg-[rgba(255,149,0,0.1)] rounded-full px-3 py-1.5">
                  <CloudOff size={12} />
                  Using cached settings
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] text-[#34C759] bg-[rgba(52,199,89,0.1)] rounded-full px-3 py-1.5">
                  <Check size={12} />
                  Synced to device
                </div>
              )}
              <div className="flex-1" />
              <button
                onClick={handleRefresh}
                disabled={peakValleyLoading}
                className="w-8 h-8 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#8E8E93] hover:text-[#0D9488] transition-colors disabled:opacity-40"
                title="Refresh from device"
              >
                <RefreshCw size={14} className={peakValleyLoading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={handleSaveToDevice}
                disabled={peakValleySaving || peakValleyLoading}
                className="flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-medium transition-colors
                  bg-[rgba(13,148,136,0.12)] text-[#0D9488] hover:bg-[rgba(13,148,136,0.2)] disabled:opacity-40"
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
            <div className="flex items-center gap-1.5 text-[11px] text-[#48484A] bg-[#1C1C1E] rounded-full px-3 py-1.5">
              <CloudOff size={12} />
              Demo mode — no device selected
            </div>
          )}
        </div>

        {/* Main Switch */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1C1C1E] rounded-[20px] p-4 mb-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors
                ${peakShavingSettings.enabled ? 'bg-[rgba(13,148,136,0.15)]' : 'bg-[#2C2C2E]'}`}>
                <Calendar size={24} className={peakShavingSettings.enabled ? 'text-[#0D9488]' : 'text-[#48484A]'} />
              </div>
              <div>
                <div className="text-[15px] font-bold text-[#FFFFFF]">Smart Schedule</div>
                <div className="text-[12px] text-[#8E8E93]">
                  {peakShavingSettings.enabled ? 'Active — Optimizing electricity cost' : 'Disabled'}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleTogglePeakShaving(!peakShavingSettings.enabled)}
              className={`w-14 h-8 rounded-full transition-colors relative
                ${peakShavingSettings.enabled ? 'bg-[#0D9488]' : 'bg-[#48484A]'}`}
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
            className="bg-[#1C1C1E] rounded-[20px] p-4 mb-4"
          >
            <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-3">Current Status</div>
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center
                ${currentMode === 'charge' ? 'bg-[rgba(52,199,89,0.15)]' :
                  currentMode === 'discharge' ? 'bg-[rgba(255,149,0,0.15)]' :
                  currentMode === 'grid' ? 'bg-[rgba(13,148,136,0.15)]' :
                  currentMode === 'battery' ? 'bg-[rgba(255,215,0,0.15)]' :
                  'bg-[#2C2C2E]'}`}>
                {currentMode === 'charge' && <Battery size={28} className="text-[#34C759]" />}
                {currentMode === 'discharge' && <Zap size={28} className="text-[#FF9500]" />}
                {currentMode === 'grid' && <Power size={28} className="text-[#0D9488]" />}
                {currentMode === 'battery' && <Battery size={28} className="text-[#FFD700]" />}
                {currentMode === 'idle' && <Clock size={28} className="text-[#8E8E93]" />}
                {currentMode === 'disabled' && <Power size={28} className="text-[#48484A]" />}
              </div>
              <div className="flex-1">
                <div className="text-[18px] font-bold text-[#FFFFFF]">
                  {currentMode === 'charge' ? 'Charging' :
                   currentMode === 'discharge' ? 'Discharging' :
                   currentMode === 'grid' ? 'Grid Power' :
                   currentMode === 'battery' ? 'Battery Power' :
                   currentMode === 'disabled' ? 'Disabled' : 'Idle'}
                </div>
                <div className="text-[12px] text-[#8E8E93]">
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
          className="bg-[#1C1C1E] rounded-[20px] p-4 mb-4"
        >
          <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-3">24h Schedule</div>

          {/* Timeline bar */}
          <div className="relative mb-2">
            {/* Background bar */}
            <div className="h-8 bg-[#2C2C2E] rounded-[8px] overflow-hidden relative">
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
              <span key={i} className="text-[8px] text-[#48484A]">{label}</span>
            ))}
          </div>

          {/* Rate labels under timeline */}
          <div className="flex items-center gap-3 mb-2">
            {peakShavingSettings.touRateInfo ? (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#FF9500]" />
                  <span className="text-[10px] text-[#8E8E93]">Peak ${peakShavingSettings.peakPrice}/kWh</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#34C759]" />
                  <span className="text-[10px] text-[#8E8E93]">Off-Peak ${peakShavingSettings.offPeakPrice}/kWh</span>
                </div>
                {peakShavingSettings.partPeakPrice && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#FFD700]" />
                    <span className="text-[10px] text-[#8E8E93]">Part-Peak ${peakShavingSettings.partPeakPrice}/kWh</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#FF9500]" />
                  <span className="text-[10px] text-[#8E8E93]">Peak ${peakShavingSettings.peakPrice}/kWh</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#34C759]" />
                  <span className="text-[10px] text-[#8E8E93]">Off-Peak ${peakShavingSettings.offPeakPrice}/kWh</span>
                </div>
              </>
            )}
          </div>

          {/* Savings estimate */}
          <div className="flex items-center justify-between pt-3 border-t border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-2">
              <DollarSign size={14} className="text-[#0D9488]" />
              <span className="text-[12px] text-[#8E8E93]">Est. daily savings</span>
            </div>
            <span className="text-[14px] font-bold text-[#0D9488]">${savings.daily.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-[#48484A] pl-[22px]">Est. monthly</span>
            <span className="text-[12px] font-semibold text-[#0D9488]">${savings.monthly.toFixed(2)}</span>
          </div>
        </motion.div>

        {/* Estimated Savings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-[#1C1C1E] rounded-[20px] p-4 mb-4"
        >
          <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-3">Estimated Savings</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-[11px] text-[#8E8E93] mb-1">Daily</div>
              <div className="text-[16px] font-bold text-[#0D9488]">${savings.daily.toFixed(2)}</div>
            </div>
            <div className="text-center border-x border-[rgba(255,255,255,0.05)]">
              <div className="text-[11px] text-[#8E8E93] mb-1">Monthly</div>
              <div className="text-[16px] font-bold text-[#0D9488]">${savings.monthly.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-[11px] text-[#8E8E93] mb-1">Yearly</div>
              <div className="text-[16px] font-bold text-[#0D9488]">${savings.yearly.toFixed(2)}</div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
            <p className="text-[10px] text-[#48484A]">
              Formula: (Peak − Off-Peak) × Capacity × Cycles × Efficiency(95%) × DoD(90%) × Execution(85%)
            </p>
          </div>
        </motion.div>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-[#1C1C1E] rounded-[20px] p-4 mb-4 overflow-hidden"
            >
              <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-3">Parameters</div>

              <div className="space-y-4">
                {/* Peak Price */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-[#FFFFFF]">Peak Price</span>
                    <span className="text-[13px] text-[#FF9500]">${peakShavingSettings.peakPrice}/kWh</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="2"
                    step="0.01"
                    value={peakShavingSettings.peakPrice}
                    onChange={(e) => updatePeakShavingSettings({ peakPrice: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-[#2C2C2E] rounded-full appearance-none cursor-pointer accent-[#FF9500]"
                  />
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
                    className="w-full h-2 bg-[#2C2C2E] rounded-full appearance-none cursor-pointer accent-[#34C759]"
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
                    className="w-full h-2 bg-[#2C2C2E] rounded-full appearance-none cursor-pointer accent-[#FFD700]"
                  />
                </div>

                {/* Power limits */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <div className="text-[11px] text-[#8E8E93] mb-1">Max Charge</div>
                    <div className="flex items-center gap-2 bg-[#2C2C2E] rounded-[12px] px-3 py-2">
                      <Battery size={14} className="text-[#34C759]" />
                      <input
                        type="number"
                        value={peakShavingSettings.maxChargePower}
                        onChange={(e) => updatePeakShavingSettings({ maxChargePower: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-[11px] text-[#8E8E93]">W</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#8E8E93] mb-1">Max Discharge</div>
                    <div className="flex items-center gap-2 bg-[#2C2C2E] rounded-[12px] px-3 py-2">
                      <Zap size={14} className="text-[#FF9500]" />
                      <input
                        type="number"
                        value={peakShavingSettings.maxDischargePower}
                        onChange={(e) => updatePeakShavingSettings({ maxDischargePower: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-[11px] text-[#8E8E93]">W</span>
                    </div>
                  </div>
                </div>

                {/* Battery limits */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-[#8E8E93] mb-1">Min SOC</div>
                    <div className="flex items-center gap-2 bg-[#2C2C2E] rounded-[12px] px-3 py-2">
                      <Battery size={14} className="text-[#FF3B30]" />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={peakShavingSettings.minBatteryLevel}
                        onChange={(e) => updatePeakShavingSettings({ minBatteryLevel: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-[11px] text-[#8E8E93]">%</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#8E8E93] mb-1">Max SOC</div>
                    <div className="flex items-center gap-2 bg-[#2C2C2E] rounded-[12px] px-3 py-2">
                      <Battery size={14} className="text-[#34C759]" />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={peakShavingSettings.maxBatteryLevel}
                        onChange={(e) => updatePeakShavingSettings({ maxBatteryLevel: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-[11px] text-[#8E8E93]">%</span>
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
            <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase">Schedule</div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 text-[12px] text-[#0D9488] font-medium"
            >
              <Plus size={14} />
              Add Schedule
            </button>
          </div>

          <div className="space-y-2">
            {peakShavingSettings.schedules.map((schedule, index) => {
              const config = scheduleTypeConfig[schedule.type]
              const Icon = config.icon
              const isExpanded = expandedSchedule === schedule.id

              return (
                <motion.div
                  key={schedule.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-[#1C1C1E] rounded-[16px] overflow-hidden transition-all
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
                      <div className="text-[14px] font-semibold text-[#FFFFFF]">{schedule.name}</div>
                      <div className="text-[11px] text-[#8E8E93]">
                        {schedule.startTime} – {schedule.endTime}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[11px] px-2 py-1 rounded-full font-medium"
                        style={{ backgroundColor: config.bgColor, color: config.color }}
                      >
                        {config.emoji} {config.label}
                      </span>
                      {isExpanded ? <ChevronUp size={18} className="text-[#8E8E93]" /> : <ChevronDown size={18} className="text-[#8E8E93]" />}
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
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[rgba(13,148,136,0.12)] text-[#0D9488] text-[12px] font-medium"
                          >
                            <Edit2 size={12} />
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleScheduleEnabled(schedule.id, !schedule.enabled)
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors
                              ${schedule.enabled ? 'bg-[#34C759] text-[#000000]' : 'bg-[#48484A] text-[#FFFFFF]'}`}
                          >
                            <Power size={12} />
                            {schedule.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteClick(schedule)
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[rgba(255,59,48,0.15)] text-[#FF3B30] text-[12px] font-medium"
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
            <div className="text-center py-8 text-[#48484A]">
              <Clock size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium text-[#8E8E93]">No schedules</p>
              <p className="text-[11px] text-[#48484A] mt-1">Add a schedule to start smart scheduling</p>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="bg-[rgba(13,148,136,0.05)] rounded-[16px] p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[rgba(13,148,136,0.15)] flex items-center justify-center flex-shrink-0">
              <TrendingDown size={16} className="text-[#0D9488]" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#FFFFFF] mb-1">How it works</div>
              <p className="text-[11px] text-[#8E8E93] leading-relaxed">
                During off-peak hours, the system charges the battery using grid power at lower rates.
                During peak hours, the battery discharges to power your devices, reducing your electricity costs.
                Smart Schedule automatically optimizes charge/discharge timing based on your local TOU rates.
              </p>
            </div>
          </div>
        </div>
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
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#1C1C1E] rounded-t-[28px] p-6 pb-10"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />
              <h3 className="text-lg font-bold text-[#FFFFFF] mb-5">Add Schedule</h3>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] mb-2 block">Schedule Name</label>
                  <input
                    type="text"
                    value={newSchedule.name}
                    onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
                    placeholder="e.g., Morning Charge"
                    className="w-full h-11 bg-[#2C2C2E] rounded-[14px] px-4 text-[14px] text-[#FFFFFF] placeholder-[#48484A] outline-none"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] mb-2 block">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(scheduleTypeConfig).map(([type, config]) => (
                      <button
                        key={type}
                        onClick={() => setNewSchedule({ ...newSchedule, type: type as PeakShavingSchedule['type'] })}
                        className={`flex items-center gap-2 p-3 rounded-[14px] transition-colors
                          ${newSchedule.type === type ? 'bg-[#2C2C2E] border border-[#0D9488]' : 'bg-[#2C2C2E]'}`}
                      >
                        <config.icon size={18} style={{ color: config.color }} />
                        <span className="text-[13px] text-[#FFFFFF]">{config.emoji} {config.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#8E8E93] mb-2 block">Start Time</label>
                    <input
                      type="time"
                      value={newSchedule.startTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, startTime: e.target.value })}
                      className="w-full h-11 bg-[#2C2C2E] rounded-[14px] px-4 text-[14px] text-[#FFFFFF] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8E8E93] mb-2 block">End Time</label>
                    <input
                      type="time"
                      value={newSchedule.endTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, endTime: e.target.value })}
                      className="w-full h-11 bg-[#2C2C2E] rounded-[14px] px-4 text-[14px] text-[#FFFFFF] outline-none"
                    />
                  </div>
                </div>

                {/* Conflict Warning */}
                {conflictResult.conflict && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 p-3 bg-[rgba(255,149,0,0.1)] rounded-[12px] border border-[rgba(255,149,0,0.2)]"
                  >
                    <AlertTriangle size={16} className="text-[#FF9500] flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[12px] font-semibold text-[#FF9500]">Schedule Conflict</div>
                      <div className="text-[11px] text-[#8E8E93]">
                        Overlaps with "{conflictResult.with}" ({conflictResult.overlap})
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 h-11 rounded-[14px] bg-[#2C2C2E] text-[#FFFFFF] text-[14px] font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSchedule}
                  disabled={!newSchedule.name}
                  className="flex-1 h-11 rounded-[14px] bg-[#0D9488] text-[#000000] text-[14px] font-semibold disabled:opacity-50"
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
              className="w-full max-w-sm bg-[#1C1C1E] rounded-[24px] p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-[#FFFFFF]">Change ZIP Code</h3>
                <button
                  onClick={() => setShowTouLookup(false)}
                  className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#8E8E93]"
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
                  className="flex-1 h-11 bg-[#2C2C2E] rounded-[14px] px-4 text-[14px] text-[#FFFFFF] placeholder-[#48484A] outline-none"
                />
                <button
                  onClick={handleTouLookup}
                  disabled={zipInput.length !== 5}
                  className="px-4 h-11 rounded-[14px] bg-[#0D9488] text-[#000000] text-[13px] font-semibold
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Look up
                </button>
              </div>

              {touNotFound && (
                <p className="text-[11px] text-[#FF9500]">ZIP code not found. Try 94025, 90210, 10001, 77001, or 60601.</p>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowTouLookup(false)}
                  className="flex-1 h-11 rounded-[14px] bg-[#2C2C2E] text-[#FFFFFF] text-[14px] font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowTouLookup(false); setShowSettings(true) }}
                  className="flex-1 h-11 rounded-[14px] bg-[#2C2C2E] text-[#8E8E93] text-[14px] font-medium"
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
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#1C1C1E] rounded-t-[28px] p-6 pb-10"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-[#FFFFFF]">Edit Schedule</h3>
                <button
                  onClick={() => setEditingSchedule(null)}
                  className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#8E8E93]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] mb-2 block">Schedule Name</label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => handleEditFormChange({ name: e.target.value })}
                    className="w-full h-11 bg-[#2C2C2E] rounded-[14px] px-4 text-[14px] text-[#FFFFFF] outline-none"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] mb-2 block">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(scheduleTypeConfig).map(([type, config]) => (
                      <button
                        key={type}
                        onClick={() => handleEditFormChange({ type: type as PeakShavingSchedule['type'] })}
                        className={`flex items-center gap-2 p-3 rounded-[14px] transition-colors
                          ${editForm.type === type ? 'bg-[#2C2C2E] border border-[#0D9488]' : 'bg-[#2C2C2E]'}`}
                      >
                        <config.icon size={18} style={{ color: config.color }} />
                        <span className="text-[13px] text-[#FFFFFF]">{config.emoji} {config.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#8E8E93] mb-2 block">Start Time</label>
                    <input
                      type="time"
                      value={editForm.startTime || ''}
                      onChange={(e) => handleEditFormChange({ startTime: e.target.value })}
                      className="w-full h-11 bg-[#2C2C2E] rounded-[14px] px-4 text-[14px] text-[#FFFFFF] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8E8E93] mb-2 block">End Time</label>
                    <input
                      type="time"
                      value={editForm.endTime || ''}
                      onChange={(e) => handleEditFormChange({ endTime: e.target.value })}
                      className="w-full h-11 bg-[#2C2C2E] rounded-[14px] px-4 text-[14px] text-[#FFFFFF] outline-none"
                    />
                  </div>
                </div>

                {/* T2: Edit Conflict Warning */}
                {editConflict.conflict && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 p-3 bg-[rgba(255,149,0,0.1)] rounded-[12px] border border-[rgba(255,149,0,0.2)]"
                  >
                    <AlertTriangle size={16} className="text-[#FF9500] flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[12px] font-semibold text-[#FF9500]">Schedule Conflict</div>
                      <div className="text-[11px] text-[#8E8E93]">
                        Overlaps with "{editConflict.with}" ({editConflict.overlap})
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEditingSchedule(null)}
                  className="flex-1 h-11 rounded-[14px] bg-[#2C2C2E] text-[#FFFFFF] text-[14px] font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editForm.name || editConflict.conflict}
                  className="flex-1 h-11 rounded-[14px] bg-[#0D9488] text-[#000000] text-[14px] font-semibold disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>

              {/* T2: Delete button in edit modal */}
              <button
                onClick={() => {
                  setEditingSchedule(null)
                  handleDeleteClick({ id: editingSchedule.id, name: editingSchedule.name } as PeakShavingSchedule)
                }}
                className="w-full mt-3 h-11 rounded-[14px] bg-transparent text-[#FF3B30] text-[13px] font-medium
                  border border-[rgba(255,59,48,0.3)] flex items-center justify-center gap-2
                  hover:bg-[rgba(255,59,48,0.08)] active:bg-[rgba(255,59,48,0.15)] transition-colors"
              >
                <Trash2 size={14} />
                Delete This Schedule
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* T2: Delete Confirmation Dialog */}
      <AnimatePresence>
        {deleteConfirm.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.8)] z-[60] flex items-center justify-center p-5"
            onClick={handleDeleteCancel}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#1C1C1E] rounded-[24px] p-6"
            >
              {/* Warning icon */}
              <div className="flex flex-col items-center mb-5">
                <div className="w-14 h-14 rounded-full bg-[rgba(255,59,48,0.12)] flex items-center justify-center mb-4">
                  <AlertTriangle size={28} className="text-[#FF3B30]" />
                </div>
                <h3 className="text-lg font-bold text-[#FFFFFF] mb-1">Delete Schedule?</h3>
                <p className="text-[13px] text-[#8E8E93] text-center">
                  Are you sure you want to delete <span className="text-[#FFFFFF] font-semibold">"{deleteConfirm.scheduleName}"</span>?
                  This action cannot be undone.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleDeleteCancel}
                  className="flex-1 h-11 rounded-[14px] bg-[#2C2C2E] text-[#FFFFFF] text-[14px] font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="flex-1 h-11 rounded-[14px] bg-[#FF3B30] text-[#FFFFFF] text-[14px] font-semibold
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
