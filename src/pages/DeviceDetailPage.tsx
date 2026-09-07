import { useState, useEffect, useMemo, useRef } from 'react'
import { guessDeviceIconName } from './device/DeviceListCard'
import TextField from '../components/TextField'
import BottomSheet from '../components/BottomSheet'
import { useSleepModeScheduler, loadSchedule, saveSchedule } from '../hooks/useSleepModeScheduler'
import {
  ChevronRight,
  X,
  Loader2,
} from 'lucide-react'
import Icon from '../components/Icon'
import { useNavigate, useParams } from 'react-router-dom'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime, toggleSleepMode, setWorkMode, passthroughDevice } from '../api/deviceApi'
import { formatTemp } from '../utils/localization'
import { sanitizeUiCopy } from '../utils/uiCopy'
import { FRAMES } from '../protocols/modbusProtocol'
import { loadRatedParams, saveRatedParams, type RatedParams } from '../db/powerflowDB'
import { SIERRO_MODELS, SIERRO_MODEL_LIST, DEVICE_NAME_MAX, generateSerial, type SierroModel } from '../data/deviceModels'
import sierro1000Img from '../assets/sierro-1000.webp'
import { DEV_TOOLS_ENABLED } from '../config/devTools'
import { uploadSleepSchedule } from '../api/scheduleApi'

interface DeviceDetailPageProps {
  /** When rendered as an overlay (inside OverviewPage) a custom back handler is
   *  passed; when mounted as a standalone route we fall back to navigate(-1). */
  onBack?: () => void
}

type Screen = 'main' | 'editName' | 'deviceInfo' | 'sleepMode'

const DISPLAY_ICONS = [
  { id: 'zap', pack: 'thunder', label: 'Power Station' },
  { id: 'refrigerator', pack: 'fridge', label: 'Refrigerator' },
  { id: 'server', pack: 'NAS', label: 'Server' },
  { id: 'lamp', pack: 'lamp', label: 'Lamp' },
  { id: 'fish', pack: 'fish tank', label: 'Aquarium' },
  { id: 'plugzap', pack: 'power strip', label: 'Power strip' },
  { id: 'wifi', pack: 'router', label: 'Router' },
  { id: 'cpap', pack: 'CPAP', label: 'CPAP' },
]

/** `22:00` → `10:00 PM`, so the chip reads the same on a 24-hour device. */
function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return t
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

/**
 * Chip showing the 12-hour label with the native picker invisible on top.
 *
 * Declared here, not inside the page: a component defined during render is a new
 * type on every render, so React throws the old <input> away and mounts a fresh
 * one. This page polls live device state, and each poll was remounting the input
 * out from under the open picker — which is what made the picker close by itself
 * a moment after it opened.
 */
function TimeChip({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <span className="relative inline-flex items-center rounded-m bg-ink-9 px-3 py-1.5">
      <span className="text-body-md text-white tnum">{fmt12(value)}</span>
      <input
        type="time"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer [color-scheme:dark]"
      />
    </span>
  )
}

export default function DeviceDetailPage({ onBack }: DeviceDetailPageProps) {
  const { powerStation, updateDeviceNameById, peakShavingSettings } =
    usePowerStationStore()
  const navigate = useNavigate()
  const { id: routeId } = useParams<{ id: string }>()

  // ── Real device data (useDeviceStore) — used when mounted as a route ──
  const { devices, selectedDeviceId, selectedDeviceState, selectDevice, loadDeviceState, renameDeviceLocal, removeDevice, updateDeviceInfo, isDemoMode } = useDeviceStore()
  const realDevice = devices.find(d => String(d.id) === routeId)

  useEffect(() => {
    if (routeId) {
      selectDevice(routeId)
      loadDeviceState(routeId)
    }
  }, [routeId, selectDevice, loadDeviceState])

  useEffect(() => {
    const val = selectedDeviceState?.fields?.sleepMode?.value
    if (val !== undefined && val !== null) {
      setSleepMode(val ? 'On' : 'Off')
    }
  }, [selectedDeviceState])

  useEffect(() => {
    const val = selectedDeviceState?.fields?.workMode?.value
    if (val === 0 || val === 1 || val === 2) {
      setWorkMode_(val as 0 | 1 | 2)
    }
  }, [selectedDeviceState])

  const realtime = useMemo(
    () => (selectedDeviceState?.fields ? mapFieldsToRealtime(selectedDeviceState.fields) : null),
    [selectedDeviceState]
  )
  const rtField = (key: string): string | undefined => selectedDeviceState?.fields?.[key]?.valueDisplay

  const batteryTempCelsius =
    realtime?.batteryTemp ??
    (selectedDeviceState?.fields?.batteryTemp?.value != null
      ? Number(selectedDeviceState.fields.batteryTemp.value)
      : undefined) ??
    powerStation.temperature
  const temperatureDisplay =
    batteryTempCelsius != null && !Number.isNaN(batteryTempCelsius)
      ? formatTemp(batteryTempCelsius, 'F')
      : '--'

  const [ratedParams, setRatedParams] = useState<RatedParams | null>(null)
  const deviceIdForRated = routeId ?? selectedDeviceId ?? ''
  useEffect(() => {
    if (!deviceIdForRated) return
    loadRatedParams(deviceIdForRated).then(p => setRatedParams(p ?? null))
  }, [deviceIdForRated])

  const deviceName = realDevice?.name ?? powerStation.name
  const handleBack = onBack ?? (() => navigate(-1))

  const [screen, setScreen] = useState<Screen>('main')
  const [editName, setEditName] = useState(deviceName)
  const [editTargetId, setEditTargetId] = useState<string>(routeId ?? selectedDeviceId ?? '')
  const [sleepMode, setSleepMode] = useState<'Off' | 'On'>('Off')
  const [sleepFrom, setSleepFrom] = useState('22:00')
  const [sleepTo, setSleepTo] = useState('09:00')
  // Snapshot taken when the Sleep Mode screen opens; the design keeps Save dim until
  // one of these actually changes.
  const sleepBaseline = useRef({ sleepMode, sleepFrom, sleepTo })
  useEffect(() => {
    if (screen === 'sleepMode') sleepBaseline.current = { sleepMode, sleepFrom, sleepTo }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])
  const [showWorkModeMenu, setShowWorkModeMenu] = useState(false)
  const [showIconSheet, setShowIconSheet] = useState(false)
  const [workModeDraft, setWorkModeDraft] = useState<0 | 1 | 2>(1)
  const WORK_MODES: { label: string; desc: string; value: 0 | 1 | 2 }[] = [
    { label: 'Backup', desc: 'Reserve 100% for backup', value: 1 },
    { label: 'Savings', desc: 'Reserve 60% for backup', value: 2 },
  ]
  /** B_1.2 shows the mode on the settings row as "Backup Mode" / "Savings Mode". */
  const workModeRowLabel = (v: 0 | 1 | 2) => {
    const m = WORK_MODES.find((x) => x.value === v) ?? WORK_MODES[0]
    return `${m.label} Mode`
  }
  const [workMode, setWorkMode_] = useState<0 | 1 | 2>(1)
  // Empty until the user picks one — the row then falls back to the icon guessed from the
  // device name, so Device Settings shows the same glyph the home card does.
  const [selectedIcon, setSelectedIcon] = useState(() =>
    (routeId ? localStorage.getItem(`sierro-display-icon-${routeId}`) : null) ?? ''
  )
  const [pendingIcon, setPendingIcon] = useState(() =>
    (routeId ? localStorage.getItem(`sierro-display-icon-${routeId}`) : null) ?? ''
  )
  // B_1.2.2 has no custom-photo tile, so nothing writes this any more; it is read
  // so a photo saved by an older build still shows on the row.
  const customImage = routeId ? localStorage.getItem(`sierro-display-icon-custom-${routeId}`) : null
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showModelSheet, setShowModelSheet] = useState(false)

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

  const deviceIdForScheduler = routeId ?? selectedDeviceId ?? ''
  const model = ratedParams?.model ?? realDevice?.model ?? powerStation.model ?? 'Sierro 1000'
  /* B_1.2.3 never shows a blank row: until a model has been picked and its rated
     params saved, Device Info reads off the spec for `model`, which is the
     Sierro 1000 by default. */
  const modelSpec = SIERRO_MODELS[model as SierroModel] ?? SIERRO_MODELS['Sierro 1000']
  const schedulerPowers = model.includes('2000')
    ? { sleepW: 300, wakeW: 800 }
    : { sleepW: 150, wakeW: 400 }

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

  // Keeps sending the schedule; the new Sleep Mode frame shows only the toggle and
  // the two times, so none of what it reports back is rendered any more.
  useSleepModeScheduler({
    enabled: sleepMode === 'On',
    sleepFrom,
    sleepTo,
    deviceId: deviceIdForScheduler,
    model,
  })

  const editTargetOriginalName =
    devices.find((d) => String(d.id) === editTargetId)?.name ?? deviceName
  const nameChanged = editName.trim().length > 0 && editName.trim() !== editTargetOriginalName

  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const handleSaveName = async () => {
    if (!nameChanged) return
    const trimmed = editName.trim()
    const targetId = editTargetId || routeId || selectedDeviceId
    if (!targetId) return
    renameDeviceLocal(targetId, trimmed)
    updateDeviceNameById(targetId, trimmed)
    if (targetId && !isDemoMode) {
      setSavingName(true)
      setNameError(null)
      try {
        const result = await updateDeviceInfo({ id: targetId, name: trimmed })
        if (!(result.code === 0 || result.code === '0')) {
          renameDeviceLocal(targetId, editTargetOriginalName)
          updateDeviceNameById(targetId, editTargetOriginalName)
          setNameError(sanitizeUiCopy(result.message, 'Failed to save name'))
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
    setScreen('main')
  }

  const handleSaveIcon = () => {
    // Saving without touching a tile keeps the guessed icon, so store that explicitly.
    const chosen = pendingIcon || guessedIconId
    setSelectedIcon(chosen)
    if (routeId) {
      localStorage.setItem(`sierro-display-icon-${routeId}`, chosen)
    }
    setShowIconSheet(false)
  }

  const handleDeleteDevice = async () => {
    const id = routeId ?? selectedDeviceId
    if (!id) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const result = await removeDevice([id])
      if (!(result.code === 0 || result.code === '0')) {
        setDeleteError(sanitizeUiCopy(result.message, 'Failed to delete device'))
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

  // The tile that counts as selected: the saved choice, or the one matching the name guess.
  const guessedIconId =
    DISPLAY_ICONS.find((i) => i.pack === guessDeviceIconName(deviceName))?.id ?? 'zap'
  const effectiveIcon = selectedIcon || guessedIconId
  const currentPack = DISPLAY_ICONS.find((i) => i.id === effectiveIcon)?.pack ?? 'thunder'

  const BackBtn = ({ to }: { to: Screen | 'parent' }) => (
    <button
      onClick={() => (to === 'parent' ? handleBack() : setScreen(to as Screen))}
      className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
    >
      <Icon name="chevron-left" size={24} />
    </button>
  )

  /**
   * B_1.2.3 draws each field as its own 68px card 12 apart, not as a divided list,
   * with the label in body_large/ink-2 and the value in body_medium/ink-6.
   */
  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-l bg-ink-10 h-[68px] px-4 flex items-center justify-between">
      <span className="text-body-lg text-ink-2">{label}</span>
      <span className="text-body-md text-ink-6">{value}</span>
    </div>
  )

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
      className="rounded-l bg-ink-10 h-[68px] px-4 flex items-center justify-between cursor-pointer active:opacity-70 transition-opacity"
    >
      <span className="text-body-lg text-ink-2">{label}</span>
      <div className="flex items-center gap-2">
        {preview}
        {value !== undefined && (
          <span className="text-body-md text-ink-6">{value}</span>
        )}
        <Icon name="chevron-right" size={24} />
      </div>
    </div>
  )

  if (screen === 'editName') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        <div className="px-4 pb-5 safe-area-top-header flex items-center gap-3 relative">
          <BackBtn to="main" />
          <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
            Device Name
          </h1>
          <button
            onClick={handleSaveName}
            disabled={!nameChanged || savingName}
            className={`ml-auto text-body-lg font-semibold transition-colors flex items-center gap-1.5 ${
              nameChanged && !savingName ? 'text-primary' : 'text-primary/30 cursor-not-allowed'
            }`}
          >
            {savingName && <Loader2 size={16} className="animate-spin" />}
            Save
          </button>
        </div>
        {/* B_1.2.1 is a single field directly under the header — the device is already
            chosen by the settings screen you came from, so there is no picker and no
            section label above it. */}
        <div className="px-4">
          <TextField
            ariaLabel="Device name"
            value={editName}
            onChange={setEditName}
            onClear={() => setEditName('')}
            placeholder="Device name"
            error={nameError || null}
            maxLength={DEVICE_NAME_MAX}
            autoFocus
          />
        </div>
      </div>
    )
  }

  if (screen === 'deviceInfo') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        <div className="px-4 pb-5 safe-area-top-header flex items-center gap-3 relative">
          <BackBtn to="main" />
          <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
            Device Info
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <div className="space-y-3">
            <button
              onClick={() => setShowModelSheet(true)}
              className="w-full rounded-l bg-ink-10 h-[68px] px-4 flex items-center justify-between active:opacity-70 transition-opacity"
            >
              <span className="text-body-lg text-ink-2">Model</span>
              {/* B_1.2.3 draws Model like every other row — the value alone, no chevron. */}
              <span className="text-body-md text-ink-6">{ratedParams?.model || realDevice?.model || powerStation.model || 'Sierro 1000'}</span>
            </button>
            <InfoRow
              label="Serial Number"
              value={realDevice?.serialNumber || ratedParams?.serialNumber || (powerStation as any).serialNumber || 'SNXXXX'}
            />
            <InfoRow
              label="Capacity"
              value={(() => {
                const kwh = ratedParams
                  ? (ratedParams.acInvOutputPower * 2) / 1000
                  : realDevice?.ratedPower ?? modelSpec.ratedCapacityWh / 1000
                if (kwh == null || Number.isNaN(Number(kwh))) return '--'
                const n = Number(kwh)
                const label = Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-6
                  ? `${Math.round(n)}`
                  : n.toFixed(1)
                return `${label} kWh`
              })()}
            />
            <InfoRow label="Battery Type" value={ratedParams?.batteryType || modelSpec.batteryType} />
            <InfoRow
              label="Charging Power"
              value={`${ratedParams?.ratedChargePower ?? modelSpec.ratedChargePower}W`}
            />
            <InfoRow
              label="Output Power"
              value={`${ratedParams?.ratedPower ?? realDevice?.ratedPower ?? modelSpec.ratedPower}W`}
            />
            <InfoRow label="Voltage" value="120V" />
            <InfoRow label="Frequency" value="60Hz" />
            <InfoRow
              label="Battery health"
              value={rtField('batteryHealth')?.replace(/\s+%/, '%') || `${ratedParams?.batteryHealth ?? modelSpec.batteryHealth}%`}
            />
            <InfoRow
              label="Cycles"
              value={rtField('numberOfBatteryUsageCycles') || realtime?.numberOfBatteryUsageCycles?.toString() || '--'}
            />
            <InfoRow
              label="Temperature"
              value={temperatureDisplay}
            />
            <InfoRow
              label="Wi-Fi Status"
              value={realDevice ? (realDevice.isOnline ? 'Connected' : 'Offline') : 'Connected'}
            />
          </div>
          {DEV_TOOLS_ENABLED && (
          <div className="mt-4 space-y-2">
            <button
              onClick={() => navigate(`/device/${routeId ?? selectedDeviceId}/passthrough`)}
              className="w-full flex items-center justify-between px-4 py-4 rounded-l bg-ink-10 active:opacity-70 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <span className="text-body-lg font-semibold text-primary">Modbus Debug</span>
              </div>
              <Icon name="chevron-right" size={24} />
            </button>
            <button
              onClick={() => navigate(`/device/${routeId ?? selectedDeviceId}/debug-params`)}
              className="w-full flex items-center justify-between px-4 py-4 rounded-l bg-ink-10 active:opacity-70 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <span className="text-body-lg font-semibold text-ink-7">Debug Params</span>
              </div>
              <Icon name="chevron-right" size={24} />
            </button>
          </div>
          )}
        </div>
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
                  className="absolute right-4 w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center"
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

  if (screen === 'sleepMode') {
    const enabled = sleepMode === 'On'
    const b = sleepBaseline.current
    const sleepChanged = b.sleepMode !== sleepMode || b.sleepFrom !== sleepFrom || b.sleepTo !== sleepTo
    const handleSaveSleepMode = async () => {
      const deviceId = routeId ?? selectedDeviceId
      if (deviceId) {
        try { await toggleSleepMode(deviceId, enabled) } catch { /* noop */ }
        saveSchedule(deviceId, { enabled, sleepFrom, sleepTo })
        void uploadSleepSchedule(String(deviceId), { enabled, sleepFrom, sleepTo, model })
      }
      setScreen('main')
    }
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        <div className="px-4 pb-5 safe-area-top-header flex items-center gap-3 relative">
          <BackBtn to="main" />
          <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
            Sleep Mode
          </h1>
          <button
            onClick={handleSaveSleepMode}
            disabled={!sleepChanged}
            className={`ml-auto text-body-lg font-semibold transition-colors ${
              sleepChanged ? 'text-primary' : 'text-primary/30 cursor-not-allowed'
            }`}
          >
            Save
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8 space-y-6">
          {/* B_1.2.4 sets the title's line box 8 below the card top, not 16. */}
          <div className="rounded-l bg-ink-10 px-4 pt-2 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body-lg text-white">Sleep Mode</p>
                <p className="text-caption text-ink-6 mt-0.5">
                  Low-noise charging · {schedulerPowers.sleepW}W AC charging limit
                </p>
              </div>
              <button
                onClick={() => setSleepMode(enabled ? 'Off' : 'On')}
                className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${enabled ? 'bg-primary' : 'bg-ink-9'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
          </div>
          {enabled && (
            <div>
              <p className="text-body-md font-semibold text-white mb-3">Time</p>
              <div className="space-y-3">
                <div className="rounded-l bg-ink-10 h-[68px] px-4 flex items-center justify-between">
                  <span className="text-body-lg text-white">From</span>
                  <TimeChip label="Sleep from" value={sleepFrom} onChange={setSleepFrom} />
                </div>
                <div className="rounded-l bg-ink-10 h-[68px] px-4 flex items-center justify-between">
                  <span className="text-body-lg text-white">To</span>
                  <TimeChip label="Sleep to" value={sleepTo} onChange={setSleepTo} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      <div className="px-4 pb-5 safe-area-top-header flex items-center gap-3 relative">
        <BackBtn to="parent" />
        <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
          Device Settings
        </h1>
      </div>
      {/* 4x/6x export: rows 68 tall, 12px apart inside a group, 24px between groups,
          groups = [Name, Icon] / [Info] / [Sleep, Battery, Smart] / [Delete 52]. */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-6">
        <div className="space-y-3">
          <SettingsRow
            label="Device Name"
            value={deviceName}
            onPress={() => {
              const targetId = routeId ?? selectedDeviceId ?? ''
              setEditTargetId(targetId)
              setEditName(deviceName)
              setScreen('editName')
            }}
          />
          <SettingsRow
            label="Display Icon"
            preview={
              effectiveIcon === 'photo' ? (
                <img src={sierro1000Img} alt="Device" className="w-6 h-6 object-contain" />
              ) : effectiveIcon === 'custom' && customImage ? (
                <img src={customImage} alt="Custom" className="w-6 h-6 object-cover rounded-s" />
              ) : (
                <Icon name={currentPack} size={24} />
              )
            }
            onPress={() => {
              setPendingIcon(effectiveIcon)
              setShowIconSheet(true)
            }}
          />
        </div>

        <SettingsRow
          label="Device Info"
          onPress={() => setScreen('deviceInfo')}
        />

        <div className="space-y-3">
          <SettingsRow
            label="Sleep Mode"
            value={sleepMode}
            onPress={() => setScreen('sleepMode')}
          />
          <SettingsRow
            label="Battery Priority"
            value={workModeRowLabel(workMode)}
            onPress={() => {
              setWorkModeDraft(workMode === 2 ? 2 : 1)
              setShowWorkModeMenu(true)
            }}
          />
          <SettingsRow
            label="Smart Schedule"
            value={peakShavingSettings?.enabled ? 'On' : 'Off'}
            onPress={() => navigate('/smart-schedule')}
          />
        </div>

        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full rounded-l bg-ink-10 h-[52px] text-body-lg font-semibold text-danger active:opacity-70 transition-opacity"
        >
          Delete Device
        </button>
      </div>
      {showWorkModeMenu && (
        <BottomSheet
          title="Select Battery Priority"
          labelledBy="battery-priority-title"
          onClose={() => setShowWorkModeMenu(false)}
        >
          <div className="mt-[21px] space-y-[11px] px-8">
            {WORK_MODES.map(m => {
              const selected = workModeDraft === m.value
              return (
                <button
                  key={m.value}
                  onClick={() => setWorkModeDraft(m.value)}
                  className={`w-full h-[63px] rounded-l border-s text-center transition-colors ${
                    selected ? 'border-primary bg-primary/15' : 'border-ink-8 bg-transparent'
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
          <div className="mt-6 px-8">
            <button
              onClick={async () => {
                setWorkMode_(workModeDraft)
                setShowWorkModeMenu(false)
                const deviceId = routeId ?? selectedDeviceId
                if (deviceId) {
                  try { await setWorkMode(deviceId, workModeDraft) } catch { /* noop */ }
                  try {
                    const frame = workModeDraft === 2 ? FRAMES.PV_BATT_PRIORITY_ON : FRAMES.PV_BATT_PRIORITY_OFF
                    await passthroughDevice(deviceId, { data: frame, noOutput: true })
                  } catch { /* noop */ }
                }
              }}
              disabled={workModeDraft === workMode}
              className="w-full h-12 rounded-m bg-primary text-primary-darker font-semibold text-body-lg
                disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
            >
              Save
            </button>
          </div>
        </BottomSheet>
      )}

      {/* B_1.2.2 — eight unlabelled 60x52 tiles over the dimmed settings list. */}
      {showIconSheet && (
        <BottomSheet
          title="Select Display Icon"
          labelledBy="display-icon-title"
          onClose={() => setShowIconSheet(false)}
        >
          <div className="mt-7 grid grid-cols-4 gap-x-4 gap-y-6 px-[57px]">
            {DISPLAY_ICONS.map(({ id, pack, label }) => {
              const pending = pendingIcon || guessedIconId
              return (
                <button
                  key={id}
                  aria-label={label}
                  aria-pressed={pending === id}
                  onClick={() => setPendingIcon(id)}
                  className={`h-[52px] rounded-l flex items-center justify-center transition-colors ${
                    pending === id ? 'bg-primary-darker' : 'bg-ink-9'
                  }`}
                >
                  <Icon name={pack} size={28} />
                </button>
              )
            })}
          </div>
          <div className="mt-7 px-[57px]">
            <button
              onClick={handleSaveIcon}
              disabled={(pendingIcon || guessedIconId) === effectiveIcon}
              className="w-full h-12 rounded-m bg-primary text-primary-darker font-semibold text-body-lg
                disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
            >
              Save
            </button>
          </div>
        </BottomSheet>
      )}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          {/* 4x export B_1.2.7: 280x158 ink-10 card, radius l, 16px padding, title
              title_large at 22 from the top, label body, two 118x44 pills 12 apart. */}
          <div className="w-[280px] bg-ink-10 rounded-l px-4 pb-4 pt-[22px] text-center">
            <p className="text-title-lg font-semibold text-white">Delete {deviceName}?</p>
            <p className="mt-1.5 text-label text-ink-5">
              This device will be removed from your account. You can add it again at any time.
            </p>
            {deleteError && (
              <p className="mt-2 text-label text-danger">{deleteError}</p>
            )}
            <div className="mt-[18px] flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 h-11 rounded-m border-s border-ink-4 text-body-lg font-semibold text-ink-4 active:scale-95 transition-transform"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDevice}
                disabled={deleting}
                className="flex-1 h-11 rounded-m bg-danger text-body-lg font-semibold text-white active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
