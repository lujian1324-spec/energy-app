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
import { mapFieldsToRealtime } from '../api/deviceApi'
import { applySleepSchedule } from '../api/smartScheduleControl'
import {
  applyBatteryPriority,
  batteryPriorityErrorMessage,
} from '../api/batteryPriorityControl'
import { toast } from '../components/Toast'
import {
  loadConfirmedPriority,
  resolveBatteryPriority,
  saveConfirmedPriority,
  type BatteryPriority,
} from '../utils/batteryPriority'
import { formatTemp } from '../utils/localization'
import { sanitizeUiCopy, toUserFacingError } from '../utils/uiCopy'
import { loadRatedParams, saveRatedParams, type RatedParams } from '../db/powerflowDB'
import { SIERRO_MODELS, SIERRO_MODEL_LIST, DEVICE_NAME_MAX, generateSerial, type SierroModel } from '../data/deviceModels'
import sierro1000Img from '../assets/sierro-1000.webp'
import { DEV_TOOLS_ENABLED } from '../config/devTools'
import { SMART_SCHEDULE_PAUSED } from '../config/smartSchedule'
import { backgroundScheduleNotice } from '../utils/scheduleOutcome'
import { getSavedScheduleEnabled, subscribeActiveScheduleMode } from '../utils/activeScheduleMode'
import FanSpeedCard from './device/FanSpeedCard'
import { FAN_CONTROL_ENABLED } from '../config/fanControl'

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
 * Chip showing the 12-hour label. Tapping it toggles an inline wheel picker that
 * opens 12px below its row rather than the native OS picker, which floated over
 * the other time row and hid it (`ui-fix-doc-20260911/02-sleep-timepicker`).
 *
 * Declared here, not inside the page: a component defined during render is a new
 * type on every render, so React throws the old node away and mounts a fresh one.
 * This page polls live device state, and each poll was remounting the control out
 * from under the open picker — which is what made the picker close by itself a
 * moment after it opened.
 */
function TimeChip({ label, value, active, onToggle }: {
  label: string
  value: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={active}
      onClick={onToggle}
      className={`inline-flex items-center rounded-m px-3 py-1.5 transition-colors ${
        active ? 'bg-primary/[0.15] text-primary' : 'bg-ink-9 text-white'
      }`}
    >
      <span className="text-body-md tnum">{fmt12(value)}</span>
    </button>
  )
}

const WHEEL_ITEM = 36 // px — one row in the wheel column

/**
 * One scroll-snap wheel column (hours or minutes). Two spacers half the visible
 * height tall let the first and last value snap to the centred highlight band.
 * A short debounce after scrolling settles on the nearest row and reports it.
 */
function WheelColumn({ values, selected, onSelect, ariaLabel, format }: {
  values: number[]
  selected: number
  onSelect: (v: number) => void
  ariaLabel: string
  format?: (v: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Line the column up with the current value on open and on external changes.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const idx = values.indexOf(selected)
    if (idx >= 0) el.scrollTop = idx * WHEEL_ITEM
  }, [selected, values])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / WHEEL_ITEM)))
      el.scrollTo({ top: idx * WHEEL_ITEM, behavior: 'smooth' })
      const v = values[idx]
      if (v !== selected) onSelect(v)
    }, 110)
  }

  return (
    <div className="relative flex-1" style={{ height: WHEEL_ITEM * 5 }}>
      <div
        ref={ref}
        role="listbox"
        aria-label={ariaLabel}
        onScroll={onScroll}
        className="h-full overflow-y-scroll scrollbar-hide snap-y snap-mandatory"
      >
        <div style={{ height: WHEEL_ITEM * 2 }} />
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onSelect(v)}
            className={`w-full snap-center flex items-center justify-center tnum text-title-md transition-colors ${
              v === selected ? 'text-white font-semibold' : 'text-ink-6'
            }`}
            style={{ height: WHEEL_ITEM }}
          >
            {format ? format(v) : String(v).padStart(2, '0')}
          </button>
        ))}
        <div style={{ height: WHEEL_ITEM * 2 }} />
      </div>
      {/* Centred highlight band over the selected row. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-m border-y border-ink-8"
        style={{ height: WHEEL_ITEM }}
      />
    </div>
  )
}

/** Inline hour + minute wheel picker for a "HH:MM" (24h) value. */
function InlineTimePicker({ value, onChange, onDone }: {
  value: string
  onChange: (v: string) => void
  onDone: () => void
}) {
  const [h, m] = value.split(':').map(Number)
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), [])
  const hourLabel = (v: number) => `${v % 12 === 0 ? 12 : v % 12} ${v < 12 ? 'AM' : 'PM'}`
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div className="rounded-l bg-ink-10 px-4 py-3">
      <div className="flex items-stretch gap-3">
        <WheelColumn
          values={hours}
          selected={Number.isNaN(h) ? 0 : h}
          onSelect={(nh) => onChange(`${pad(nh)}:${pad(Number.isNaN(m) ? 0 : m)}`)}
          ariaLabel="Hour"
          format={hourLabel}
        />
        <WheelColumn
          values={minutes}
          selected={Number.isNaN(m) ? 0 : m}
          onSelect={(nm) => onChange(`${pad(Number.isNaN(h) ? 0 : h)}:${pad(nm)}`)}
          ariaLabel="Minute"
        />
      </div>
      <button
        type="button"
        onClick={onDone}
        className="mt-2 w-full h-10 rounded-m bg-primary text-primary-darker font-semibold text-body-md active:scale-[0.98] transition-transform"
      >
        Done
      </button>
    </div>
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

  // ── Battery Priority (SW-04) ──
  // The device read-back is the source of truth; `pendingWorkModeRef` holds the
  // value of a write that has not been echoed back yet so the stale polls that
  // arrive in between cannot snap the row back to its old value.
  const workModeDeviceId = routeId ?? selectedDeviceId ?? ''
  const workModeRef = useRef<BatteryPriority>(loadConfirmedPriority(workModeDeviceId) ?? 1)
  const pendingWorkModeRef = useRef<BatteryPriority | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  /** Adopt a resolved priority into state + ref, remembering it when the device confirmed it. */
  const applyPriority = (deviceId: string, priority: BatteryPriority, confirmed: boolean) => {
    workModeRef.current = priority
    setWorkMode_(priority)
    if (confirmed) saveConfirmedPriority(deviceId, priority)
  }

  useEffect(() => {
    const { priority, confirmed } = resolveBatteryPriority({
      deviceWorkMode: selectedDeviceState?.fields?.workMode?.value,
      remembered: loadConfirmedPriority(workModeDeviceId),
      pending: pendingWorkModeRef.current,
      current: workModeRef.current,
    })
    if (confirmed) pendingWorkModeRef.current = null
    applyPriority(workModeDeviceId, priority, confirmed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceState, workModeDeviceId])

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
  const [savingSleep, setSavingSleep] = useState(false)
  const savingSleepRef = useRef(false)
  const [sleepApplied, setSleepApplied] = useState({ deviceId: '', enabled: false, sleepFrom: '22:00', sleepTo: '09:00' })
  // Which row's inline time picker is open (`ui-fix-doc-20260911/02`); null = none.
  const [openTimePicker, setOpenTimePicker] = useState<'from' | 'to' | null>(null)
  // Snapshot taken when the Sleep Mode screen opens; the design keeps Save dim until
  // one of these actually changes.
  const sleepBaseline = useRef({ sleepMode, sleepFrom, sleepTo })
  useEffect(() => {
    if (screen === 'sleepMode') sleepBaseline.current = { sleepMode, sleepFrom, sleepTo }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])
  const [showWorkModeMenu, setShowWorkModeMenu] = useState(false)
  const [showIconSheet, setShowIconSheet] = useState(false)
  const [workModeDraft, setWorkModeDraft] = useState<BatteryPriority>(1)
  const [savingWorkMode, setSavingWorkMode] = useState(false)
  const WORK_MODES: { label: string; desc: string; value: BatteryPriority }[] = [
    { label: 'Backup', desc: 'Reserve 100% for backup', value: 1 },
    { label: 'Savings', desc: 'Reserve 60% for backup', value: 2 },
  ]
  /** B_1.2 shows the mode on the settings row as "Backup Mode" / "Savings Mode". */
  const workModeRowLabel = (v: BatteryPriority) => {
    const m = WORK_MODES.find((x) => x.value === v) ?? WORK_MODES[0]
    return `${m.label} Mode`
  }
  const [workMode, setWorkMode_] = useState<BatteryPriority>(
    () => loadConfirmedPriority(routeId ?? selectedDeviceId ?? '') ?? 1
  )

  /**
   * SW-09 — Save writes the device's own registers (0x0086 + 0x0054) over
   * passthrough and nothing else. There is no cloud `workMode` write on this
   * path any more, so there is nothing to poll for an echo: the two accepted
   * writes ARE the confirmation, and the row keeps showing what we wrote.
   * `pendingWorkModeRef` stays set to that value so the `workMode` polls — which
   * now report a cloud field this screen no longer drives — cannot snap the row
   * onto a mode the device was never told to hold.
   */
  const saveBatteryPriority = async () => {
    const deviceId = routeId ?? selectedDeviceId
    const target = workModeDraft
    if (!deviceId) { setShowWorkModeMenu(false); return }
    if (savingWorkMode) return

    const previous = workModeRef.current
    setSavingWorkMode(true)
    pendingWorkModeRef.current = target
    applyPriority(deviceId, target, false)

    const res = await applyBatteryPriority(deviceId, target)
    if (!mountedRef.current) return

    if (res.ok) {
      // Both registers landed, so this is the mode the device is in.
      applyPriority(deviceId, target, true)
      setShowWorkModeMenu(false)
      setSavingWorkMode(false)
      return
    }

    // No fake success: put the row back where it was and leave the sheet open,
    // with the selection still on the failed choice so Save can be retried.
    pendingWorkModeRef.current = null
    applyPriority(deviceId, previous, false)
    setSavingWorkMode(false)
    toast.error(batteryPriorityErrorMessage(res))
  }
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
  const [, setScheduleRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setScheduleRevision(n => n + 1)
    const unsubscribe = subscribeActiveScheduleMode(id => {
      if (id === deviceIdForScheduler) refresh()
    })
    window.addEventListener('storage', refresh)
    return () => { unsubscribe(); window.removeEventListener('storage', refresh) }
  }, [deviceIdForScheduler])
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
    const saved = loadSchedule(deviceIdForScheduler) ?? { enabled: false, sleepFrom: '22:00', sleepTo: '09:00' }
    setSleepMode(saved.enabled ? 'On' : 'Off')
    setSleepFrom(saved.sleepFrom)
    setSleepTo(saved.sleepTo)
    setSleepApplied({ ...saved, deviceId: deviceIdForScheduler })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIdForScheduler])

  useEffect(() => {
    // The config flag is not the shared charge-window status and can be stale.
    // Never overwrite an open draft or a locally saved schedule with polling.
    if (screen === 'sleepMode' || loadSchedule(deviceIdForScheduler)) return
    const val = selectedDeviceState?.fields?.sleepMode?.value
    if (val !== undefined && val !== null) {
      setSleepMode(val === true || val === 1 || val === '1' || val === 'true' ? 'On' : 'Off')
    }
  }, [selectedDeviceState, deviceIdForScheduler, screen])

  // Keeps sending the schedule; the new Sleep Mode frame shows only the toggle and
  // the two times, so none of what it reports back is rendered any more.
  useSleepModeScheduler({
    enabled: sleepApplied.enabled,
    sleepFrom: sleepApplied.sleepFrom,
    sleepTo: sleepApplied.sleepTo,
    deviceId: sleepApplied.deviceId === deviceIdForScheduler ? deviceIdForScheduler : '',
    model,
    // SW-12: this instance writes only while Sleep Mode owns the device. If the
    // user has armed Smart Schedule on the same device, it owns 0x0085 and the
    // relay slot, and this scheduler stays quiet (AC-12-4).
    mode: 'sleep',
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
        console.error('[DeviceDetail] rename failed:', err)
        setNameError(toUserFacingError(err, 'Network error'))
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
      console.error('[DeviceDetail] delete failed:', err)
      setDeleteError(toUserFacingError(err, 'Network error'))
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
      if (savingSleepRef.current) return
      const deviceId = routeId ?? selectedDeviceId
      savingSleepRef.current = true
      setSavingSleep(true)
      try {
        if (deviceId) {
          const id = String(deviceId)
          const result = await applySleepSchedule(id, { enabled, startTime: sleepFrom, endTime: sleepTo, model })
          if (!result.ok) {
            toast.error('Could not save Sleep Mode', sanitizeUiCopy(result.detail ?? '', '') || undefined)
            return
          }
          saveSchedule(deviceId, { enabled, sleepFrom, sleepTo })
          setSleepApplied({ deviceId: id, enabled, sleepFrom, sleepTo })
          const notice = backgroundScheduleNotice({
            enabling: enabled,
            instantPowerApplied: result.instantPowerApplied,
            relayConfigured: result.relayConfigured,
            relayAccepted: result.relayAccepted,
            relayDetail: result.relayDetail,
          })
          if (notice) {
            toast.warning(notice.title, notice.message)
            // Keep the draft and its original baseline so Save stays retryable.
            return
          }
        }
        setScreen('main')
      } finally {
        savingSleepRef.current = false
        setSavingSleep(false)
      }
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
            disabled={!sleepChanged || savingSleep}
            className={`ml-auto text-body-lg font-semibold transition-colors ${
              sleepChanged ? 'text-primary' : 'text-primary/30 cursor-not-allowed'
            }`}
          >
            Save
          </button>
        </div>
        {/* 16px above the first card, not 8 (`ui-fix-doc-20260911/05-sleep-padding`). */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 space-y-6">
          {/* Figma: 16px top padding inside Sleep Mode card (was 8 / pt-2). */}
          <div className="rounded-l bg-ink-10 px-4 pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body-lg text-white">Sleep Mode</p>
                <p className="text-caption text-ink-6 mt-0.5">
                  Low-noise charging · {schedulerPowers.sleepW}W AC charging limit
                </p>
              </div>
              <button
                onClick={() => setSleepMode(enabled ? 'Off' : 'On')}
                disabled={savingSleep}
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
              {/* space-y-3 (12px) drops the open picker 12px below its row and
                  pushes the other row down so it stays visible (doc 02). */}
              <div className="space-y-3">
                <div className="rounded-l bg-ink-10 h-[68px] px-4 flex items-center justify-between">
                  <span className="text-body-lg text-white">From</span>
                  <TimeChip
                    label="Sleep from"
                    value={sleepFrom}
                    active={openTimePicker === 'from'}
                    onToggle={() => setOpenTimePicker(p => (p === 'from' ? null : 'from'))}
                  />
                </div>
                {openTimePicker === 'from' && (
                  <InlineTimePicker
                    value={sleepFrom}
                    onChange={setSleepFrom}
                    onDone={() => setOpenTimePicker(null)}
                  />
                )}
                <div className="rounded-l bg-ink-10 h-[68px] px-4 flex items-center justify-between">
                  <span className="text-body-lg text-white">To</span>
                  <TimeChip
                    label="Sleep to"
                    value={sleepTo}
                    active={openTimePicker === 'to'}
                    onToggle={() => setOpenTimePicker(p => (p === 'to' ? null : 'to'))}
                  />
                </div>
                {openTimePicker === 'to' && (
                  <InlineTimePicker
                    value={sleepTo}
                    onChange={setSleepTo}
                    onDone={() => setOpenTimePicker(null)}
                  />
                )}
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
      {/* B.1.2: rows 68 tall (Delete 52), 12px between every consecutive list item. */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3">
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
        <SettingsRow
          label="Device Info"
          onPress={() => setScreen('deviceInfo')}
        />
        <SettingsRow
          label="Sleep Mode"
          value={sleepMode}
          onPress={() => setScreen('sleepMode')}
        />
        <SettingsRow
          label="Battery Priority"
          value={workModeRowLabel(workMode)}
          onPress={() => {
            setWorkModeDraft(workMode)
            setShowWorkModeMenu(true)
          }}
        />
        {/* Not released: dev / QA builds only (config/fanControl.ts). */}
        {FAN_CONTROL_ENABLED && deviceIdForScheduler && (
          <FanSpeedCard
            deviceId={deviceIdForScheduler}
            disabled={!!realDevice && !realDevice.isOnline}
            demo={isDemoMode}
          />
        )}
        {/* SW-14: Smart Schedule is paused, so its only entry point is not
            rendered. Nothing replaces it — the row is silently absent, and the
            rows around it are unaffected. Any other link to `/smart-schedule`
            added later (the Help page's CTA on #131, for one) has to be hidden
            the same way. */}
        {!SMART_SCHEDULE_PAUSED && (
          <SettingsRow
            label="Smart Schedule"
            value={(isDemoMode ? peakShavingSettings?.enabled : getSavedScheduleEnabled(deviceIdForScheduler, 'smart')) ? 'On' : 'Off'}
            onPress={() => navigate('/smart-schedule')}
          />
        )}
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
              onClick={() => { void saveBatteryPriority() }}
              disabled={savingWorkMode || workModeDraft === workMode}
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
