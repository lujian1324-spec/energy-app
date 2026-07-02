import { useState, useEffect, useMemo } from 'react'
import { useSleepModeScheduler, loadSchedule, saveSchedule } from '../hooks/useSleepModeScheduler'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Loader2,
  Battery,
  Zap,
  Refrigerator,
  Server,
  Lamp,
  Fish,
  PlugZap,
  Wifi,
  BookOpen,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime, toggleSleepMode, setWorkMode, passthroughDevice } from '../api/deviceApi'
import { FRAMES } from '../protocols/modbusProtocol'
import { loadRatedParams, saveRatedParams, type RatedParams } from '../db/powerflowDB'
import { SIERRO_MODELS, SIERRO_MODEL_LIST, generateSerial, type SierroModel } from '../data/deviceModels'
import sierro1000Img from '../assets/sierro-1000.webp'
import appVersion from '../version.json'

interface DeviceDetailPageProps {
  /** When rendered as an overlay (inside OverviewPage) a custom back handler is
   *  passed; when mounted as a standalone route we fall back to navigate(-1). */
  onBack?: () => void
}

type Screen = 'main' | 'editName' | 'displayIcon' | 'deviceInfo' | 'sleepMode'

const DISPLAY_ICONS = [
  { id: 'zap', Icon: Zap, label: 'Power Station' },
  { id: 'refrigerator', Icon: Refrigerator, label: 'Refrigerator' },
  { id: 'server', Icon: Server, label: 'Server' },
  { id: 'lamp', Icon: Lamp, label: 'Lamp' },
  { id: 'fish', Icon: Fish, label: 'Aquarium' },
  { id: 'plugzap', Icon: PlugZap, label: 'EV Charger' },
  { id: 'wifi', Icon: Wifi, label: 'Router' },
  { id: 'cpap', Icon: BookOpen, label: 'CPAP' },
]

export default function DeviceDetailPage({ onBack }: DeviceDetailPageProps) {
  const { powerStation, updateDeviceNameById, peakShavingSettings } =
    usePowerStationStore()
  const navigate = useNavigate()
  const { id: routeId } = useParams<{ id: string }>()

  // ── Real device data (useDeviceStore) — used when mounted as a route ──
  const { devices, selectedDeviceId, selectedDeviceState, selectDevice, loadDeviceState, renameDeviceLocal, removeDevice, updateDeviceInfo, isDemoMode } = useDeviceStore()
  const realDevice = devices.find(d => String(d.id) === routeId)

  // Standalone route: ensure the real device + its realtime state are loaded
  useEffect(() => {
    if (routeId) {
      selectDevice(routeId)
      loadDeviceState(routeId)
    }
  }, [routeId, selectDevice, loadDeviceState])

  // Initialize sleepMode from real device state when it loads
  useEffect(() => {
    const val = selectedDeviceState?.fields?.sleepMode?.value
    if (val !== undefined && val !== null) {
      setSleepMode(val ? 'On' : 'Off')
    }
  }, [selectedDeviceState])

  // Initialize workMode from real device state when it loads
  useEffect(() => {
    const val = selectedDeviceState?.fields?.workMode?.value
    if (val === 0 || val === 1 || val === 2) {
      setWorkMode_(val as 0 | 1 | 2)
    }
  }, [selectedDeviceState])

  // Realtime fields (battery health / cycles / temp / voltage) for Device Info
  const realtime = useMemo(
    () => (selectedDeviceState?.fields ? mapFieldsToRealtime(selectedDeviceState.fields) : null),
    [selectedDeviceState]
  )
  const rtField = (key: string): string | undefined => selectedDeviceState?.fields?.[key]?.valueDisplay

  // Rated params fetched from IndexedDB (populated by deviceStore after login/add)
  const [ratedParams, setRatedParams] = useState<RatedParams | null>(null)
  const deviceIdForRated = routeId ?? selectedDeviceId ?? ''
  useEffect(() => {
    if (!deviceIdForRated) return
    loadRatedParams(deviceIdForRated).then(p => setRatedParams(p ?? null))
  }, [deviceIdForRated])

  // Prefer real device info, fall back to the mock powerStation profile
  const deviceName = realDevice?.name ?? powerStation.name
  const handleBack = onBack ?? (() => navigate(-1))

  const [screen, setScreen] = useState<Screen>('main')
  const [editName, setEditName] = useState(deviceName)
  // 设备名称编辑：当前正在编辑的目标设备 + 下拉选择器
  const [editTargetId, setEditTargetId] = useState<string>(routeId ?? selectedDeviceId ?? '')
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false)
  const [sleepMode, setSleepMode] = useState<'Off' | 'On'>('Off')
  const [sleepFrom, setSleepFrom] = useState('22:00')
  const [sleepTo, setSleepTo] = useState('09:00')
  const [showWorkModeMenu, setShowWorkModeMenu] = useState(false)
  const [workModeDraft, setWorkModeDraft] = useState<0 | 1 | 2>(1)
  const WORK_MODES: { label: string; desc: string; value: 0 | 1 | 2 }[] = [
    { label: 'Backup', desc: 'Reserve 100% for backup', value: 1 },
    { label: 'Savings', desc: 'Reserve 60% for backup', value: 2 },
  ]
  const [workMode, setWorkMode_] = useState<0 | 1 | 2>(1)
  const [selectedIcon, setSelectedIcon] = useState(() =>
    (routeId ? localStorage.getItem(`sierro-display-icon-${routeId}`) : null) ?? 'zap'
  )
  const [pendingIcon, setPendingIcon] = useState(() =>
    (routeId ? localStorage.getItem(`sierro-display-icon-${routeId}`) : null) ?? 'zap'
  )
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showModelSheet, setShowModelSheet] = useState(false)

  // 手动选择型号：写入该型号默认参数到本地档案，并刷新 Device Info
  const applyModel = async (model: SierroModel) => {
    if (!deviceIdForRated) return
    const spec = SIERRO_MODELS[model]
    const serialNumber = ratedParams?.serialNumber || realDevice?.serialNumber || generateSerial(spec, deviceIdForRated)
    const profile: RatedParams = {
      deviceId: deviceIdForRated,
      acInvOutputPower: spec.acInvOutputPower,
      fetchedAt: Date.now(),
      model: spec.model,
      ratedPower: spec.ratedPower,
      ratedChargePower: spec.ratedChargePower,
      batteryType: spec.batteryType,
      batteryHealth: spec.batteryHealth,
      serialNumber,
    }
    try { await saveRatedParams(profile); setRatedParams(profile) } catch { /* ignore */ }
    setShowModelSheet(false)
  }
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Sleep Mode Scheduler ────────────────────────────────────────────────────
  const deviceIdForScheduler = routeId ?? selectedDeviceId ?? ''
  const model = ratedParams?.model ?? realDevice?.model ?? powerStation.model ?? 'Sierro 1000'
  const schedulerPowers = model.includes('2000')
    ? { sleepW: 300, wakeW: 800 }
    : { sleepW: 150, wakeW: 400 }

  // Load persisted schedule on mount
  useEffect(() => {
    if (!deviceIdForScheduler) return
    const saved = loadSchedule(deviceIdForScheduler)
    if (saved) {
      setSleepMode(saved.enabled ? 'On' : 'Off')
      setSleepFrom(saved.sleepFrom)
      setSleepTo(saved.sleepTo)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIdForScheduler])

  const { nextEventLabel, nextEventMs, lastSentAt, lastSentLabel } = useSleepModeScheduler({
    enabled: sleepMode === 'On',
    sleepFrom,
    sleepTo,
    deviceId: deviceIdForScheduler,
    model,
  })

  const fmtCountdown = (ms: number): string => {
    if (ms <= 0) return '—'
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const fmtTime = (d: Date | null): string => {
    if (!d) return '—'
    return d.toLocaleTimeString()
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  // 当前正在编辑的目标设备及其原始名称（用于判断 Save 是否可点击）
  const editTargetDevice = devices.find(d => String(d.id) === editTargetId)
  const editTargetOriginalName = editTargetDevice?.name ?? deviceName
  const nameChanged = editName.trim().length > 0 && editName.trim() !== editTargetOriginalName

  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const handleSaveName = async () => {
    if (!nameChanged) return
    const trimmed = editName.trim()
    const targetId = editTargetId || routeId || selectedDeviceId
    if (!targetId) return

    // 乐观更新：先同步本地两个 store（home page + 详情/下拉菜单）
    renameDeviceLocal(targetId, trimmed)
    updateDeviceNameById(targetId, trimmed)

    // 持久化到服务端（demo 模式下跳过真实接口）
    if (targetId && !isDemoMode) {
      setSavingName(true)
      setNameError(null)
      try {
        const result = await updateDeviceInfo({ id: targetId, name: trimmed })
        if (!(result.code === 0 || result.code === '0')) {
          // 回滚本地名称
          renameDeviceLocal(targetId, editTargetOriginalName)
          updateDeviceNameById(targetId, editTargetOriginalName)
          setNameError(result.message ?? 'Failed to save name')
          setSavingName(false)
          return
        }
      } catch (err) {
        renameDeviceLocal(targetId, editTargetOriginalName)
        updateDeviceNameById(targetId, editTargetOriginalName)
        setNameError(err instanceof Error ? err.message : 'Network error')
        setSavingName(false)
        return
      }
      setSavingName(false)
    }

    setShowDeviceDropdown(false)
    setScreen('main')
  }

  // 切换下拉中选择的设备：载入其当前名称
  const handleSelectDevice = (id: string) => {
    setEditTargetId(id)
    const dev = devices.find(d => String(d.id) === id)
    setEditName(dev?.name ?? '')
    setShowDeviceDropdown(false)
  }

  const handleSaveIcon = () => {
    setSelectedIcon(pendingIcon)
    if (routeId) {
      localStorage.setItem(`sierro-display-icon-${routeId}`, pendingIcon)
    }
    setScreen('main')
  }

  const handleDeleteDevice = async () => {
    const id = routeId ?? selectedDeviceId
    if (!id) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const result = await removeDevice([id])
      if (!(result.code === 0 || result.code === '0')) {
        setDeleteError(result.message ?? 'Failed to delete device')
        setDeleting(false)
        return
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Network error')
      setDeleting(false)
      return
    }
    setDeleting(false)
    setShowDeleteConfirm(false)
    handleBack()
  }

  const CurrentIconComp =
    DISPLAY_ICONS.find((i) => i.id === selectedIcon)?.Icon ?? Battery

  // ─── Back button (shared) ─────────────────────────────────────────────────

  const BackBtn = ({ to }: { to: Screen | 'parent' }) => (
    <button
      onClick={() => (to === 'parent' ? handleBack() : setScreen(to as Screen))}
      className="w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
    >
      <ChevronLeft size={20} className="text-white" />
    </button>
  )

  // ─── Info row (Device Info screen) ───────────────────────────────────────

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between px-4 py-4 border-b border-white/5 last:border-0">
      <span className="text-body-md text-ink-6">{label}</span>
      <span className="text-body-md text-white">{value}</span>
    </div>
  )

  // ─── Settings row (main screen) ───────────────────────────────────────────

  const SettingsRow = ({
    label,
    value,
    preview,
    onPress,
  }: {
    label: string
    value?: string
    preview?: React.ReactNode
    onPress: () => void
  }) => (
    <div
      onClick={onPress}
      className="rounded-l bg-ink-10 mb-2 px-4 py-4 flex items-center justify-between cursor-pointer active:opacity-70 transition-opacity"
    >
      <span className="text-body-lg text-white">{label}</span>
      <div className="flex items-center gap-2">
        {preview}
        {value !== undefined && (
          <span className="text-body-md text-ink-6">{value}</span>
        )}
        <ChevronRight size={18} className="text-ink-6" />
      </div>
    </div>
  )

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN: Edit Name
  // ═════════════════════════════════════════════════════════════════════════

  if (screen === 'editName') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3 relative safe-area-top">
          <BackBtn to="main" />
          <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
            Device Name
          </h1>
          <button
            onClick={handleSaveName}
            disabled={!nameChanged || savingName}
            className={`ml-auto text-body-lg font-semibold transition-colors flex items-center gap-1.5 ${
              nameChanged && !savingName ? 'text-primary' : 'text-[#4A4A4A] cursor-not-allowed'
            }`}
          >
            {savingName && <Loader2 size={16} className="animate-spin" />}
            Save
          </button>
        </div>

        {/* Device selector dropdown — pick which device to rename */}
        {devices.length > 1 && (
          <div className="px-4 pt-2">
            <span className="text-caption text-ink-6 block mb-2 px-1">Select Device</span>
            <div className="relative">
              <button
                onClick={() => setShowDeviceDropdown(v => !v)}
                className="w-full rounded-l bg-ink-10 px-4 py-4 flex items-center justify-between active:opacity-70 transition-opacity"
              >
                <span className="text-body-lg text-white truncate">
                  {editTargetDevice?.name ?? editTargetOriginalName}
                </span>
                <ChevronDown
                  size={18}
                  className={`text-ink-6 transition-transform ${showDeviceDropdown ? 'rotate-180' : ''}`}
                />
              </button>
              {showDeviceDropdown && (
                <div className="absolute left-0 right-0 mt-2 z-10 rounded-l bg-ink-10 border border-white/10 overflow-hidden shadow-xl">
                  {devices.map((d) => {
                    const isSel = String(d.id) === editTargetId
                    return (
                      <button
                        key={d.id}
                        onClick={() => handleSelectDevice(String(d.id))}
                        className="w-full px-4 py-3.5 flex items-center justify-between border-b border-white/5 last:border-0 active:bg-white/5"
                      >
                        <span className={`text-body-md ${isSel ? 'text-primary font-semibold' : 'text-white'}`}>
                          {d.name}
                        </span>
                        {isSel && <Check size={16} className="text-primary" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pt-4">
          <span className="text-caption text-ink-6 block mb-2 px-1">Name</span>
          <div className="rounded-l bg-ink-10 px-4 py-4 flex items-center gap-3">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-body-lg text-white outline-none caret-primary"
              placeholder="Device name"
            />
            {editName.length > 0 && (
              <button
                onClick={() => setEditName('')}
                className="w-6 h-6 rounded-full bg-ink-6/30 flex items-center justify-center"
              >
                <X size={14} className="text-ink-6" />
              </button>
            )}
          </div>
          {nameError && (
            <p className="text-label text-danger mt-2 px-1">{nameError}</p>
          )}
        </div>
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN: Display Icon
  // ═════════════════════════════════════════════════════════════════════════

  if (screen === 'displayIcon') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3 relative safe-area-top">
          <BackBtn to="main" />
          <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
            Select Display Icon
          </h1>
        </div>

        {/* Grid */}
        <div className="flex-1 px-4 pt-4">
          <div className="grid grid-cols-4 gap-3">
            {/* Device photo option */}
            <button
              onClick={() => setPendingIcon('photo')}
              className={`flex flex-col items-center gap-2 py-4 rounded-l transition-colors ${
                pendingIcon === 'photo' ? 'bg-primary' : 'bg-ink-10'
              }`}
            >
              <img
                src={sierro1000Img}
                alt="Device"
                className="w-7 h-7 object-contain"
              />
              <span
                className={`text-label ${
                  pendingIcon === 'photo' ? 'text-black font-semibold' : 'text-ink-6'
                }`}
              >
                Device
              </span>
            </button>
            {DISPLAY_ICONS.map(({ id, Icon, label }) => (
              <button
                key={id}
                onClick={() => setPendingIcon(id)}
                className={`flex flex-col items-center gap-2 py-4 rounded-l transition-colors ${
                  pendingIcon === id ? 'bg-primary' : 'bg-ink-10'
                }`}
              >
                <Icon
                  size={28}
                  className={pendingIcon === id ? 'text-black' : 'text-ink-6'}
                />
                <span
                  className={`text-label ${
                    pendingIcon === id ? 'text-black font-semibold' : 'text-ink-6'
                  }`}
                >
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Save button */}
        <div className="px-4 pb-8 pt-4">
          <button
            onClick={handleSaveIcon}
            className="w-full h-12 rounded-l bg-primary text-black font-semibold text-body-lg active:scale-95 transition-transform"
          >
            Save
          </button>
        </div>
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN: Device Info
  // ═════════════════════════════════════════════════════════════════════════

  if (screen === 'deviceInfo') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3 relative safe-area-top">
          <BackBtn to="main" />
          <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
            Device Info
          </h1>
        </div>

        {/* Info list */}
        <div className="flex-1 overflow-y-auto px-4 pt-2">
          <div className="rounded-l bg-ink-10 overflow-hidden">
            <button
              onClick={() => setShowModelSheet(true)}
              className="w-full flex items-center justify-between px-4 py-4 border-b border-white/5 active:bg-white/5 transition-colors"
            >
              <span className="text-body-md text-ink-6">Model</span>
              <span className="flex items-center gap-1.5">
                <span className="text-body-md text-white">{ratedParams?.model || realDevice?.model || powerStation.model || 'Sierro 1000'}</span>
                <ChevronRight size={16} className="text-ink-6" />
              </span>
            </button>
            <InfoRow
              label="Serial Number"
              value={realDevice?.serialNumber || ratedParams?.serialNumber || (powerStation as any).serialNumber || 'SNXXXX'}
            />
            <InfoRow
              label="Rated Capacity"
              value={
                ratedParams
                  ? `${((ratedParams.acInvOutputPower * 2) / 1000).toFixed(1)} kWh`
                  : realDevice?.ratedPower
                    ? `${realDevice.ratedPower.toFixed(1)} kWh`
                    : '--'
              }
            />
            <InfoRow label="Battery Type" value={ratedParams?.batteryType || 'LFP'} />
            <InfoRow
              label="Firmware Version"
              value={realDevice?.softwareVersion || appVersion.version || '--'}
            />
            <InfoRow
              label="Rated Output Power"
              value={(ratedParams?.ratedPower ?? realDevice?.ratedPower) ? `${ratedParams?.ratedPower ?? realDevice?.ratedPower}W` : '--'}
            />
            <InfoRow
              label="Rated Charging Power"
              value={ratedParams?.ratedChargePower != null ? `${ratedParams.ratedChargePower}W` : '--'}
            />
            <InfoRow label="Rated Voltage" value="120V" />
            <InfoRow label="Frequency" value="60Hz" />
            <InfoRow
              label="Battery Health"
              value={rtField('batteryHealth') || (ratedParams?.batteryHealth != null ? `${ratedParams.batteryHealth}%` : '100%')}
            />
            <InfoRow
              label="Cycles"
              value={rtField('numberOfBatteryUsageCycles') || realtime?.numberOfBatteryUsageCycles?.toString() || '--'}
            />
            <InfoRow
              label="Temperature"
              value={rtField('batteryTemp') || `${powerStation.temperature || '82.4'}°F`}
            />
            <InfoRow
              label="Wi-Fi Status"
              value={realDevice ? (realDevice.isOnline ? 'Connected' : 'Offline') : 'Connected'}
            />
          </div>

          {/* Modbus 透传入口 */}
          <div className="mt-4 space-y-2">
            <button
              onClick={() => navigate(`/device/${routeId ?? selectedDeviceId}/passthrough`)}
              className="w-full flex items-center justify-between px-4 py-4 rounded-l bg-ink-10 active:opacity-70 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <span className="text-body-lg font-semibold text-primary">Modbus Debug</span>
              </div>
              <ChevronRight size={18} className="text-ink-6" />
            </button>
            <button
              onClick={() => navigate(`/device/${routeId ?? selectedDeviceId}/debug-params`)}
              className="w-full flex items-center justify-between px-4 py-4 rounded-l bg-ink-10 active:opacity-70 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <span className="text-body-lg font-semibold text-ink-7">Debug Params</span>
              </div>
              <ChevronRight size={18} className="text-ink-6" />
            </button>
          </div>
        </div>

        {/* Device Model Bottom Sheet (lives in the Device Info screen) */}
        {showModelSheet && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
            onClick={() => setShowModelSheet(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-ink-11 rounded-t-2xl overflow-hidden pb-8"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
              <div className="flex items-center justify-between px-6 pt-3 pb-2">
                <span className="text-title-md font-semibold text-white flex-1 text-center">Select Device Model</span>
                <button
                  onClick={() => setShowModelSheet(false)}
                  className="absolute right-4 w-9 h-9 rounded-full bg-[#3A3A3C] flex items-center justify-center"
                >
                  <X size={16} className="text-white" />
                </button>
              </div>
              <p className="text-caption text-ink-6 text-center px-6 pb-2">
                Sets the serial number prefix and default rated parameters.
              </p>
              <div className="px-4 pt-3 space-y-3">
                {SIERRO_MODEL_LIST.map(spec => {
                  const selected = (ratedParams?.model || realDevice?.model || 'Sierro 1000') === spec.model
                  return (
                    <button
                      key={spec.model}
                      onClick={() => applyModel(spec.model)}
                      className={`w-full rounded-l border px-4 py-4 text-left transition-colors ${
                        selected ? 'border-primary bg-primary/15' : 'border-white/15 bg-transparent'
                      }`}
                    >
                      <p className={`text-title-md font-semibold ${selected ? 'text-white' : 'text-ink-7'}`}>{spec.model}</p>
                      <p className={`text-body-md mt-0.5 ${selected ? 'text-ink-5' : 'text-ink-7'}`}>
                        {spec.ratedPower}W · {(spec.ratedCapacityWh / 1000).toFixed(1)}kWh · charge {spec.ratedChargePower}W · {spec.batteryType}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN: Sleep Mode
  // ═════════════════════════════════════════════════════════════════════════

  if (screen === 'sleepMode') {
    const enabled = sleepMode === 'On'

    const handleSaveSleepMode = async () => {
      const deviceId = routeId ?? selectedDeviceId
      if (deviceId) {
        try { await toggleSleepMode(deviceId, enabled) } catch { /* noop */ }
        // Persist schedule to localStorage
        saveSchedule(deviceId, { enabled, sleepFrom, sleepTo })
      }
      setScreen('main')
    }

    // Format "HH:MM" → "h:MM AM/PM"
    const fmt = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      const ampm = h < 12 ? 'AM' : 'PM'
      const h12 = h % 12 === 0 ? 12 : h % 12
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
    }

    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3 relative safe-area-top">
          <BackBtn to="main" />
          <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
            Sleep Mode
          </h1>
          <button
            onClick={handleSaveSleepMode}
            className="ml-auto text-body-lg font-semibold text-primary"
          >
            Save
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8 space-y-6">
          {/* Toggle row */}
          <div className="rounded-l bg-ink-10 px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body-lg text-white">Sleep Mode</p>
                <p className="text-caption text-ink-6 mt-0.5">
                  Low-noise charging · Sleep: {schedulerPowers.sleepW}W / Wake: {schedulerPowers.wakeW}W
                </p>
              </div>
              <button
                onClick={() => setSleepMode(enabled ? 'Off' : 'On')}
                className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${enabled ? 'bg-primary' : 'bg-[#3A3A3C]'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
          </div>

          {/* Time section — only shown when enabled */}
          {enabled && (
            <div>
              <p className="text-body-md font-semibold text-white mb-2">Time</p>
              <div className="rounded-l bg-ink-10 overflow-hidden">
                {/* Sleep start → low power */}
                <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
                  <div>
                    <p className="text-body-lg text-white">Sleep</p>
                    <p className="text-caption text-ink-7">AC charging power → {schedulerPowers.sleepW}W</p>
                  </div>
                  <input
                    type="time"
                    value={sleepFrom}
                    onChange={e => setSleepFrom(e.target.value)}
                    className="bg-[#3A3A3C] text-white text-body-md rounded-m px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary [color-scheme:dark]"
                  />
                </div>
                {/* Wake end → full power */}
                <div className="flex items-center justify-between px-4 py-4">
                  <div>
                    <p className="text-body-lg text-white">Wake</p>
                    <p className="text-caption text-ink-7">AC charging power → {schedulerPowers.wakeW}W</p>
                  </div>
                  <input
                    type="time"
                    value={sleepTo}
                    onChange={e => setSleepTo(e.target.value)}
                    className="bg-[#3A3A3C] text-white text-body-md rounded-m px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary [color-scheme:dark]"
                  />
                </div>
              </div>
              <p className="text-caption text-ink-7 mt-2 px-1">
                {fmt(sleepFrom)} → {schedulerPowers.sleepW}W · {fmt(sleepTo)} → {schedulerPowers.wakeW}W
              </p>
            </div>
          )}

          {/* Scheduler Status Card — shown when enabled */}
          {enabled && (
            <div>
              <p className="text-body-md font-semibold text-white mb-2">Scheduler Status</p>
              <div className="rounded-l bg-ink-10 overflow-hidden px-4 py-4 space-y-3">
                <p className="text-caption text-ink-7">
                  {model} · Sleep: {schedulerPowers.sleepW}W / Wake: {schedulerPowers.wakeW}W
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-body-md text-ink-6">Next event</span>
                  <div className="text-right">
                    <p className="text-body-md text-primary font-semibold">{nextEventLabel}</p>
                    <p className="text-caption text-primary">{fmtCountdown(nextEventMs)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-body-md text-ink-7">Last sent</span>
                  <div className="text-right">
                    <p className="text-caption text-ink-7">{lastSentLabel || '—'}</p>
                    <p className="text-caption text-ink-7">{fmtTime(lastSentAt)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN: Main — Device Settings
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 relative safe-area-top">
        <BackBtn to="parent" />
        <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
          Device Settings
        </h1>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8">
        {/* Device Name */}
        <SettingsRow
          label="Device Name"
          value={deviceName}
          onPress={() => {
            const targetId = routeId ?? selectedDeviceId ?? ''
            setEditTargetId(targetId)
            setEditName(deviceName)
            setShowDeviceDropdown(false)
            setScreen('editName')
          }}
        />

        {/* Display Icon */}
        <SettingsRow
          label="Display Icon"
          preview={
            <div className="w-7 h-7 rounded-m bg-primary/10 flex items-center justify-center">
              {selectedIcon === 'photo' ? (
                <img src={sierro1000Img} alt="Device" className="w-5 h-5 object-contain" />
              ) : (
                <CurrentIconComp size={16} className="text-primary" />
              )}
            </div>
          }
          onPress={() => {
            setPendingIcon(selectedIcon)
            setScreen('displayIcon')
          }}
        />

        {/* Device Info */}
        <SettingsRow
          label="Device Info"
          onPress={() => setScreen('deviceInfo')}
        />

        {/* Sleep Mode */}
        <SettingsRow
          label="Sleep Mode"
          value={sleepMode}
          onPress={() => setScreen('sleepMode')}
        />

        {/* Battery Priority */}
        <SettingsRow
          label="Battery Priority"
          value={WORK_MODES.find(m => m.value === workMode)?.label ?? 'Backup'}
          onPress={() => {
            setWorkModeDraft(workMode === 2 ? 2 : 1)
            setShowWorkModeMenu(true)
          }}
        />

        {/* Smart Schedule */}
        <SettingsRow
          label="Smart Schedule"
          value={peakShavingSettings?.enabled ? 'On' : 'Off'}
          onPress={() => navigate('/smart-schedule')}
        />

        {/* Delete Device */}
        <div className="mt-4">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full rounded-l bg-ink-10 px-4 py-4 text-body-lg font-semibold text-danger active:opacity-70 transition-opacity"
          >
            Delete Device
          </button>
        </div>
      </div>

      {/* Battery Priority Bottom Sheet */}
      {showWorkModeMenu && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
          onClick={() => setShowWorkModeMenu(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-ink-11 rounded-t-2xl overflow-hidden pb-8"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-3 pb-2">
              <span className="text-title-md font-semibold text-white flex-1 text-center">
                Select Battery Priority
              </span>
              <button
                onClick={() => setShowWorkModeMenu(false)}
                className="absolute right-4 w-9 h-9 rounded-full bg-[#3A3A3C] flex items-center justify-center"
              >
                <X size={16} className="text-white" />
              </button>
            </div>

            <div className="px-4 pt-4 space-y-3">
              {WORK_MODES.map(m => {
                const selected = workModeDraft === m.value
                return (
                  <button
                    key={m.value}
                    onClick={() => setWorkModeDraft(m.value)}
                    className={`w-full rounded-l border px-4 py-4 text-center transition-colors ${
                      selected
                        ? 'border-primary bg-primary/15'
                        : 'border-white/15 bg-transparent'
                    }`}
                  >
                    <p className={`text-title-md font-semibold ${selected ? 'text-white' : 'text-ink-7'}`}>
                      {m.label}
                    </p>
                    <p className={`text-body-md mt-0.5 ${selected ? 'text-ink-5' : 'text-ink-7'}`}>
                      {m.desc}
                    </p>
                  </button>
                )
              })}
            </div>

            <div className="px-4 pt-5">
              <button
                onClick={async () => {
                  setWorkMode_(workModeDraft)
                  setShowWorkModeMenu(false)
                  const deviceId = routeId ?? selectedDeviceId
                  if (deviceId) {
                    try { await setWorkMode(deviceId, workModeDraft) } catch { /* noop */ }
                    // Battery Priority → PV/电池优先操作 (0x86)：
                    //   Savings(2) → 使能 0x01AA；Backup(1) → 禁用 0xAA01
                    try {
                      const frame = workModeDraft === 2 ? FRAMES.PV_BATT_PRIORITY_ON : FRAMES.PV_BATT_PRIORITY_OFF
                      await passthroughDevice(deviceId, { data: frame, noOutput: true })
                    } catch { /* noop */ }
                  }
                }}
                className="w-full h-12 rounded-l bg-primary text-black font-semibold text-body-lg active:scale-95 transition-transform"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 px-4 pb-8">
          <div className="w-full max-w-sm bg-ink-11 rounded-l overflow-hidden">
            <div className="px-6 pt-6 pb-4 text-center">
              <p className="text-title-md font-semibold text-white mb-2">Delete Device</p>
              <p className="text-body-md text-ink-6">
                Are you sure you want to delete <span className="text-white font-semibold">{deviceName}</span>? This action cannot be undone.
              </p>
              {deleteError && (
                <p className="text-label text-danger mt-3">{deleteError}</p>
              )}
            </div>
            <div className="border-t border-white/10 flex">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-4 text-body-lg text-white border-r border-white/10 active:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDevice}
                disabled={deleting}
                className="flex-1 py-4 text-body-lg font-semibold text-danger active:bg-white/5 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 size={16} className="animate-spin text-danger" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
