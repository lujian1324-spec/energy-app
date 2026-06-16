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
    navigate(-1)
  }, [selectedDeviceId, peakShavingSettings, savePeakValleyGeneral, navigate])

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

        {/* Toggle */}
        <div className="bg-[#262626] rounded-l p-4 mb-4 flex items-center justify-between">
          <span className="text-body-md font-semibold text-white">Smart Schedule</span>
          <button
            onClick={() => handleTogglePeakShaving(!peakShavingSettings.enabled)}
            className={`w-14 h-8 rounded-full relative transition-colors ${peakShavingSettings.enabled ? 'bg-primary' : 'bg-[#636366]'}`}
          >
            <motion.div
              className="w-6 h-6 rounded-full bg-white absolute top-1"
              animate={{ left: peakShavingSettings.enabled ? '28px' : '4px' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </button>
        </div>

        {/* Clock Donut SVG — draggable handles (iPhone sleep-style) */}
        <div className="flex justify-center mb-4 select-none">
          <svg
            ref={svgRef}
            width={240}
            height={240}
            viewBox="0 0 240 240"
            style={{ touchAction: 'none' }}
          >
            {/* Background ring */}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#333333" strokeWidth={strokeW} />

            {/* Schedule arcs */}
            {arcs.map(({ startDeg, endDeg, color, schedule }) => (
              <path
                key={schedule.id}
                d={arcPath(cx, cy, r, startDeg, endDeg)}
                fill="none"
                stroke={color}
                strokeWidth={strokeW}
                strokeLinecap="round"
                style={{ cursor: 'pointer' }}
                onClick={() => { if (!drag) openEditModal(schedule) }}
              />
            ))}

            {/* Clock face inner circle */}
            <circle cx={cx} cy={cy} r={innerFaceR} fill="#1A1A1A" />

            {/* Hour tick marks */}
            {Array.from({ length: 24 }, (_, i) => {
              const deg = ((i / 24) * 360 - 90) * (Math.PI / 180)
              const innerR = innerFaceR - 4
              const outerR = innerFaceR
              return (
                <line
                  key={i}
                  x1={cx + innerR * Math.cos(deg)}
                  y1={cy + innerR * Math.sin(deg)}
                  x2={cx + outerR * Math.cos(deg)}
                  y2={cy + outerR * Math.sin(deg)}
                  stroke="#444"
                  strokeWidth={i % 6 === 0 ? 2 : 1}
                />
              )
            })}

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

            {/* Moon (top / midnight) & Sun (bottom / noon) */}
            <text x={cx} y={cy - innerFaceR + 22} textAnchor="middle" dominantBaseline="middle" fontSize={16}>🌙</text>
            <text x={cx} y={cy + innerFaceR - 22} textAnchor="middle" dominantBaseline="middle" fontSize={16}>☀️</text>

            {/* Center text */}
            <text x={cx} y={cy - 4} textAnchor="middle" fill="#FFFFFF" fontSize={dragLabel ? 15 : 12} fontFamily="Inter, sans-serif" fontWeight="600">
              {dragLabel ?? (peakShavingSettings.enabled ? 'Active' : 'Off')}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" fill="#636366" fontSize={9} fontFamily="Inter, sans-serif">
              {dragLabel ? 'Drag to adjust' : 'Smart Schedule'}
            </text>

            {/* Drag handles (start / end of each arc) */}
            {arcs.map(({ startDeg, endDeg, color, schedule }) => {
              const [sx, sy] = polar(startDeg)
              const [ex, ey] = polar(endDeg)
              return (
                <g key={`h-${schedule.id}`}>
                  <circle
                    cx={sx} cy={sy} r={11}
                    fill="#FFFFFF" stroke={color} strokeWidth={2.5}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).releasePointerCapture?.(e.pointerId); setDrag({ id: schedule.id, which: 'start' }) }}
                  />
                  <circle
                    cx={ex} cy={ey} r={11}
                    fill="#FFFFFF" stroke={color} strokeWidth={2.5}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).releasePointerCapture?.(e.pointerId); setDrag({ id: schedule.id, which: 'end' }) }}
                  />
                </g>
              )
            })}
          </svg>
        </div>

        {/* Peak / Off-Peak / Idle cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Peak card */}
          <div className="bg-[#262626] rounded-l p-3 border border-[rgba(255,149,0,0.3)]">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-[#FF9500]" />
              <span className="text-caption font-semibold text-[#FF9500]">Peak</span>
            </div>
            <div className="text-label font-bold text-white mb-1">
              {peakSchedule
                ? `${minutesToLabel(timeToMinutes(peakSchedule.startTime))} - ${minutesToLabel(timeToMinutes(peakSchedule.endTime))}`
                : 'No peak set'}
            </div>
            <p className="text-tiny text-[#A0A0A5] leading-relaxed">
              Sierro discharging, powering your connected devices with stored energy.
            </p>
          </div>

          {/* Off-Peak card */}
          <div className="bg-[#262626] rounded-l p-3 border border-[rgba(1,214,190,0.3)]">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-caption font-semibold text-primary">Off-Peak</span>
            </div>
            <div className="text-label font-bold text-white mb-1">
              {offPeakSchedule
                ? `${minutesToLabel(timeToMinutes(offPeakSchedule.startTime))} - ${minutesToLabel(timeToMinutes(offPeakSchedule.endTime))}`
                : 'No off-peak set'}
            </div>
            <p className="text-tiny text-[#A0A0A5] leading-relaxed">
              Sierro charging, storing cheap grid electricity overnight.
            </p>
          </div>
        </div>

        {/* Idle hint */}
        <div className="bg-[#262626] rounded-l p-3 mb-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#636366]" />
          <div className="flex-1">
            <span className="text-label font-semibold text-[#A0A0A5]">Idle</span>
            <p className="text-tiny text-[#636366]">Gaps on the clock — grid powers devices directly, Sierro stays idle.</p>
          </div>
        </div>

        {/* Schedule list — add & delete */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-body-md font-semibold text-white">Time Periods</span>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-tiny text-primary border border-[rgba(1,214,190,0.4)] rounded-full px-3 py-1 flex items-center gap-1"
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
                <div key={s.id} className="bg-[#262626] rounded-l p-3 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                  <button onClick={() => openEditModal(s)} className="flex-1 min-w-0 text-left">
                    <div className="text-label font-semibold text-white truncate">{s.name}</div>
                    <div className="text-tiny text-[#A0A0A5]">
                      {cfg.label} · {minutesToLabel(timeToMinutes(s.startTime))} – {minutesToLabel(timeToMinutes(s.endTime))}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteClick(s)}
                    className="w-8 h-8 rounded-full bg-[#333333] flex items-center justify-center text-danger flex-shrink-0 active:scale-95 transition-transform"
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Price section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-body-md font-semibold text-white">Price</span>
            {!showPartPeak && (
              <button
                onClick={() => setShowPartPeak(true)}
                className="text-tiny text-primary border border-[rgba(1,214,190,0.4)] rounded-full px-3 py-1"
              >
                Add Part-Peak Price
              </button>
            )}
          </div>
          <div className="bg-[#262626] rounded-l p-4 space-y-4">
            <div>
              <label className="text-caption text-[#A0A0A5] block mb-1">Peak Price</label>
              <div className="flex items-center gap-2">
                <span className="text-body-md text-[#A0A0A5]">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={peakShavingSettings.peakPrice}
                  onChange={(e) => updatePeakShavingSettings({ peakPrice: parseFloat(e.target.value) || 0 })}
                  className="flex-1 bg-transparent text-body-md text-white outline-none border-b border-[rgba(255,255,255,0.12)] pb-1"
                />
                <span className="text-caption text-[#636366]">/kWh</span>
              </div>
            </div>
            <div>
              <label className="text-caption text-[#A0A0A5] block mb-1">Off-Peak Price</label>
              <div className="flex items-center gap-2">
                <span className="text-body-md text-[#A0A0A5]">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={peakShavingSettings.offPeakPrice}
                  onChange={(e) => updatePeakShavingSettings({ offPeakPrice: parseFloat(e.target.value) || 0 })}
                  className="flex-1 bg-transparent text-body-md text-white outline-none border-b border-[rgba(255,255,255,0.12)] pb-1"
                />
                <span className="text-caption text-[#636366]">/kWh</span>
              </div>
            </div>
            {showPartPeak && (
              <div>
                <label className="text-caption text-[#A0A0A5] block mb-1">Part-Peak Price</label>
                <div className="flex items-center gap-2">
                  <span className="text-body-md text-[#A0A0A5]">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={peakShavingSettings.partPeakPrice || 0.28}
                    onChange={(e) => updatePeakShavingSettings({ partPeakPrice: parseFloat(e.target.value) || 0 })}
                    className="flex-1 bg-transparent text-body-md text-white outline-none border-b border-[rgba(255,255,255,0.12)] pb-1"
                  />
                  <span className="text-caption text-[#636366]">/kWh</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Parameters section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-body-md font-semibold text-white">Parameters</span>
            <button className="text-tiny text-primary border border-[rgba(1,214,190,0.4)] rounded-full px-3 py-1">
              Optimize
            </button>
          </div>
          <div className="bg-[#262626] rounded-l p-4 grid grid-cols-2 gap-4">
            <div>
              <label className="text-caption text-[#A0A0A5] block mb-1">
                Max Charge <span className="text-danger">*</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={peakShavingSettings.maxChargePower}
                  onChange={(e) => updatePeakShavingSettings({ maxChargePower: parseInt(e.target.value) || 0 })}
                  className="w-full bg-transparent text-body-md text-white outline-none border-b border-[rgba(255,255,255,0.12)] pb-1"
                />
                <span className="text-caption text-[#636366] flex-shrink-0">W</span>
              </div>
              <p className="text-tiny text-[#636366] mt-1">Charging speed during off-peak</p>
            </div>
            <div>
              <label className="text-caption text-[#A0A0A5] block mb-1">
                Max Discharge <span className="text-danger">*</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={peakShavingSettings.maxDischargePower}
                  onChange={(e) => updatePeakShavingSettings({ maxDischargePower: parseInt(e.target.value) || 0 })}
                  className="w-full bg-transparent text-body-md text-white outline-none border-b border-[rgba(255,255,255,0.12)] pb-1"
                />
                <span className="text-caption text-[#636366] flex-shrink-0">W</span>
              </div>
              <p className="text-tiny text-[#636366] mt-1">Discharging speed during peak</p>
            </div>
            <div>
              <label className="text-caption text-[#A0A0A5] block mb-1">
                Min SOC <span className="text-danger">*</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0" max="100"
                  value={peakShavingSettings.minBatteryLevel}
                  onChange={(e) => updatePeakShavingSettings({ minBatteryLevel: parseInt(e.target.value) || 0 })}
                  className="w-full bg-transparent text-body-md text-white outline-none border-b border-[rgba(255,255,255,0.12)] pb-1"
                />
                <span className="text-caption text-[#636366] flex-shrink-0">%</span>
              </div>
              <p className="text-tiny text-[#636366] mt-1">Minimum battery level</p>
            </div>
            <div>
              <label className="text-caption text-[#A0A0A5] block mb-1">
                Max SOC <span className="text-danger">*</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0" max="100"
                  value={peakShavingSettings.maxBatteryLevel}
                  onChange={(e) => updatePeakShavingSettings({ maxBatteryLevel: parseInt(e.target.value) || 0 })}
                  className="w-full bg-transparent text-body-md text-white outline-none border-b border-[rgba(255,255,255,0.12)] pb-1"
                />
                <span className="text-caption text-[#636366] flex-shrink-0">%</span>
              </div>
              <p className="text-tiny text-[#636366] mt-1">Maximum charge level</p>
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
                    className="w-full h-11 bg-[#333333] rounded-m px-4 text-body-md text-white placeholder-[#636366] outline-none"
                  />
                </div>
                <div>
                  <label className="text-caption text-[#A0A0A5] mb-2 block">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(scheduleTypeConfig).map(([type, config]) => (
                      <button
                        key={type}
                        onClick={() => setNewSchedule({ ...newSchedule, type: type as PeakShavingSchedule['type'] })}
                        className={`flex items-center gap-2 p-3 rounded-m transition-colors
                          ${newSchedule.type === type ? 'bg-[#3A3A3A] border border-primary' : 'bg-[#333333]'}`}
                      >
                        <config.icon size={16} style={{ color: config.color }} />
                        <span className="text-body-md text-white">{config.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-caption text-[#A0A0A5] mb-2 block">Start</label>
                    <input type="time" value={newSchedule.startTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, startTime: e.target.value })}
                      className="w-full h-11 bg-[#333333] rounded-m px-4 text-body-md text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-caption text-[#A0A0A5] mb-2 block">End</label>
                    <input type="time" value={newSchedule.endTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, endTime: e.target.value })}
                      className="w-full h-11 bg-[#333333] rounded-m px-4 text-body-md text-white outline-none" />
                  </div>
                </div>
                {conflictResult.conflict && (
                  <div className="flex items-start gap-2 p-3 bg-[rgba(255,149,0,0.1)] rounded-m border border-[rgba(255,149,0,0.2)]">
                    <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-caption font-semibold text-warning">Schedule Conflict</div>
                      <div className="text-tiny text-[#A0A0A5]">Overlaps with "{conflictResult.with}" ({conflictResult.overlap})</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAddModal(false)} className="flex-1 h-11 rounded-m bg-[#333333] text-white text-body-md font-medium">Cancel</button>
                <button onClick={handleAddSchedule} disabled={!newSchedule.name || conflictResult.conflict}
                  className="flex-1 h-11 rounded-m bg-primary text-black text-body-md font-semibold disabled:opacity-50">
                  Add
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Schedule Modal */}
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
                  <label className="text-caption text-[#A0A0A5] mb-2 block">Name</label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => handleEditFormChange({ name: e.target.value })}
                    className="w-full h-11 bg-[#333333] rounded-m px-4 text-body-md text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-caption text-[#A0A0A5] mb-2 block">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(scheduleTypeConfig).map(([type, config]) => (
                      <button
                        key={type}
                        onClick={() => handleEditFormChange({ type: type as PeakShavingSchedule['type'] })}
                        className={`flex items-center gap-2 p-3 rounded-m transition-colors
                          ${editForm.type === type ? 'bg-[#3A3A3A] border border-primary' : 'bg-[#333333]'}`}
                      >
                        <config.icon size={16} style={{ color: config.color }} />
                        <span className="text-body-md text-white">{config.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-caption text-[#A0A0A5] mb-2 block">Start</label>
                    <input type="time" value={editForm.startTime || ''}
                      onChange={(e) => handleEditFormChange({ startTime: e.target.value })}
                      className="w-full h-11 bg-[#333333] rounded-m px-4 text-body-md text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-caption text-[#A0A0A5] mb-2 block">End</label>
                    <input type="time" value={editForm.endTime || ''}
                      onChange={(e) => handleEditFormChange({ endTime: e.target.value })}
                      className="w-full h-11 bg-[#333333] rounded-m px-4 text-body-md text-white outline-none" />
                  </div>
                </div>
                {editConflict.conflict && (
                  <div className="flex items-start gap-2 p-3 bg-[rgba(255,149,0,0.1)] rounded-m border border-[rgba(255,149,0,0.2)]">
                    <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-caption font-semibold text-warning">Conflict</div>
                      <div className="text-tiny text-[#A0A0A5]">Overlaps with "{editConflict.with}" ({editConflict.overlap})</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingSchedule(null)} className="flex-1 h-11 rounded-m bg-[#333333] text-white text-body-md font-medium">Cancel</button>
                <button onClick={handleSaveEdit} disabled={!editForm.name || editConflict.conflict}
                  className="flex-1 h-11 rounded-m bg-primary text-black text-body-md font-semibold disabled:opacity-50">
                  Save
                </button>
              </div>
              <button
                onClick={() => {
                  setEditingSchedule(null)
                  handleDeleteClick({ id: editingSchedule.id, name: editingSchedule.name } as PeakShavingSchedule)
                }}
                className="w-full mt-3 h-11 rounded-m border border-[rgba(255,53,48,0.3)] text-danger text-body-md font-medium flex items-center justify-center gap-2"
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
                <button onClick={() => setDeleteConfirm({ show: false, scheduleId: '', scheduleName: '' })}
                  className="flex-1 h-11 rounded-m bg-[#333333] text-white text-body-md font-medium">
                  Cancel
                </button>
                <button onClick={handleDeleteConfirm}
                  className="flex-1 h-11 rounded-m bg-danger text-white text-body-md font-semibold">
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
