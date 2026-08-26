import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { openAppSettings } from '../utils/openAppSettings'
import { requestCamera } from '../utils/permissions'
import { toast } from '../components/Toast'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import jsQR from 'jsqr'
import ProvisioningPage from './ProvisioningPage'
import { supportsDeviceListScan } from '../protocols/bleProvision'
import {
  AlertTriangle,
  X,
  RefreshCw,
  Wifi,
  WifiOff,
  Thermometer,
  Activity,
  Info,
  Clock,
  MapPin,
  Hash,
  Cpu,
  Server,
  TrendingUp,
  TrendingDown,
  Zap,
  Battery,
  Sun,
  Refrigerator,
  Lamp,
  Fish,
  PlugZap,
  BookOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Icon from '../components/Icon'
import PullToRefresh from '../components/PullToRefresh'
import ManualAddDeviceModal from '../components/ManualAddDeviceModal'
import { useDeviceStore } from '../stores/deviceStore'
import { useAuthStore } from '../stores/authStore'
import { useAlarmDismissStore, alarmKey } from '../stores/alarmDismissStore'
import { usePowerStationStore } from '../stores/powerStationStore'
import { dedupeAndFilterAlarms } from '../utils/alarmText'
import type { FiringAlarm } from '../utils/powerOutageNotification'
import sierroProductImg from '../assets/sierro-product.webp'
import { mapFieldsToRealtime, fetchDeviceState, passthroughDevice } from '../api/deviceApi'
import { FRAMES, decodePassthroughBase64, decodeLiveStatus } from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'
import { formatTemp } from '../utils/localization'
import { batteryTimeLabel } from '../utils/batteryTime'
import { hapticMedium } from '../utils/haptics'
import { loadRatedParams } from '../db/powerflowDB'
import type { DeviceListItem, DeviceStateField } from '../api/deviceApi'
import { getDemoDeviceState } from '../data/demoData'

// BLE device type
interface BleDevice {
  id: string
  name: string
  rssi?: number
}

// 设备实时状态缓存（deviceId → fields）
interface DeviceRealtimeCache {
  [deviceId: string]: {
    fields: Record<string, DeviceStateField>
    raw: ReturnType<typeof mapFieldsToRealtime>
    firingAlarms?: unknown[]
    loading: boolean
    lastUpdated: number
  }
}

// Device display icon mapping
const deviceIcons: Record<string, string> = {
  cpap: '😴',
  fridge: '🧊',
  fish_tank: '🐟',
  nas: '💾',
  wifi_router: '📶',
  powerstation: '⚡',
  default: '🔌',
}

// Lucide icons available in the Display Icon picker (must mirror DeviceDetailPage DISPLAY_ICONS)
const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  zap: Zap,
  refrigerator: Refrigerator,
  server: Server,
  lamp: Lamp,
  fish: Fish,
  plugzap: PlugZap,
  wifi: Wifi,
  cpap: BookOpen,
}

const getSavedDisplayIconId = (deviceId: string): string | null =>
  localStorage.getItem(`sierro-display-icon-${deviceId}`)

export default function DevicePage() {
  const navigate = useNavigate()
  const {
    devices,
    deviceLoading,
    devicesListReady,
    loadDevices,
    loadStations,
    selectedDeviceState,
    stateLoading,
    isDemoMode,
  } = useDeviceStore()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const isGuest = useAuthStore(s => s.isGuest)
  const { settings } = usePowerStationStore()

  const [showAddModal, setShowAddModal] = useState(false)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [showQrScan, setShowQrScan] = useState(false)
  const [showBleScan, setShowBleScan] = useState(false)
  const [showProvisioning, setShowProvisioning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [powerStates, setPowerStates] = useState<Record<string, boolean>>({})

  const [realtimeCache, setRealtimeCache] = useState<DeviceRealtimeCache>(() => {
    const store = useDeviceStore.getState()
    if (!store.isDemoMode) return {}
    const seed: DeviceRealtimeCache = {}
    for (const d of store.devices) {
      const state = getDemoDeviceState(d.id)
      if (state) {
        seed[String(d.id)] = {
          fields: state.fields,
          raw: mapFieldsToRealtime(state.fields),
          loading: false,
          lastUpdated: Date.now(),
        }
      }
    }
    return seed
  })
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [showDeviceParams, setShowDeviceParams] = useState<DeviceListItem | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scannedDevices, setScannedDevices] = useState<BleDevice[]>([])
  const [scanError, setScanError] = useState<string | null>(null)
  const [blePermissionType, setBlePermissionType] = useState<'unsupported' | 'denied' | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [, setQrScanning] = useState(false)
  const [qrResult, setQrResult] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [cameraDenied, setCameraDenied] = useState(false)
  const [qrVideoReady, setQrVideoReady] = useState(false)
  const qrStreamRef = useRef<MediaStream | null>(null)
  const cameraDeniedRef = useRef(cameraDenied)
  cameraDeniedRef.current = cameraDenied
  const showQrScanRef = useRef(showQrScan)
  showQrScanRef.current = showQrScan
  const [scannedSerial, setScannedSerial] = useState('')
  const [scannedName, setScannedName] = useState('')
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (showQrScan) {
      startQrScan()
    }
    return () => { stopQrScan() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQrScan])

  useEffect(() => {
    let removed = false
    let handle: { remove: () => Promise<void> } | undefined
    const setup = async () => {
      handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive || removed) return
        if (cameraDeniedRef.current && showQrScanRef.current) {
          void startQrScan()
        }
      })
    }
    void setup()
    return () => {
      removed = true
      void handle?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchDevices = useCallback(async () => {
    setError(null)
    try {
      await loadDevices(1, 50)
      const loadError = useDeviceStore.getState().deviceError
      if (loadError) throw new Error(loadError)
      await loadStations(1, 50)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices')
    }
  }, [loadDevices, loadStations])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  const fetchDeviceRealtime = useCallback(async (deviceId: number | string) => {
    const idStr = String(deviceId)
    if (useDeviceStore.getState().isDemoMode) {
      const state = getDemoDeviceState(deviceId)
      if (state) {
        setRealtimeCache(prev => ({
          ...prev,
          [idStr]: { fields: state.fields, raw: mapFieldsToRealtime(state.fields), firingAlarms: state.firingAlarms ?? [], loading: false, lastUpdated: Date.now() },
        }))
      }
      return
    }
    setRealtimeCache(prev => ({
      ...prev,
      [idStr]: { ...prev[idStr], loading: true },
    }))
    try {
      const result = await fetchDeviceState(idStr)
      if ((result.code === 0 || result.code === '0') && result.data) {
        setRealtimeCache(prev => ({
          ...prev,
          [idStr]: {
            fields: result.data!.fields,
            raw: mapFieldsToRealtime(result.data!.fields),
            firingAlarms: result.data!.firingAlarms ?? [],
            loading: false,
            lastUpdated: Date.now(),
          },
        }))
      } else {
        setRealtimeCache(prev => ({ ...prev, [idStr]: { ...prev[idStr], loading: false } }))
      }
    } catch {
      setRealtimeCache(prev => ({
        ...prev,
        [idStr]: { ...prev[idStr], loading: false },
      }))
    }
  }, [])

  useEffect(() => {
    if (selectedDeviceState && selectedDeviceState.deviceId) {
      const idStr = String(selectedDeviceState.deviceId)
      const mapped = mapFieldsToRealtime(selectedDeviceState.fields)
      setRealtimeCache(prev => ({
        ...prev,
        [idStr]: {
          fields: selectedDeviceState.fields,
          raw: mapped,
          firingAlarms: selectedDeviceState.firingAlarms ?? [],
          loading: false,
          lastUpdated: Date.now(),
        },
      }))
    }
  }, [selectedDeviceState])

  const fetchBatteryPassthrough = useCallback(async (deviceId: string | number) => {
    const idStr = String(deviceId)
    if (useDeviceStore.getState().isDemoMode) return
    try {
      const res = await passthroughDevice(idStr, { data: FRAMES.READ_ALL_STATUS })
      if (!isApiSuccess(res.code)) return
      const b64 = res.data?.base64Output ?? res.data?.content ?? res.data?.data
      const registers = decodePassthroughBase64(b64, 8)
      if (!registers) return
      const live = decodeLiveStatus(registers)
      setRealtimeCache(prev => {
        const existing = prev[idStr]
        return {
          ...prev,
          [idStr]: {
            fields: existing?.fields ?? {},
            raw: {
              ...existing?.raw,
              remainingBatteryCapacity: live.soc,
              batteryPower: live.batteryPower,
              acPower: live.acPower,
              solarPower: live.solarPower,
              outputPower: live.outputPower,
              batteryTemp: live.batteryTemp,
            },
            loading: false,
            lastUpdated: Date.now(),
          },
        }
      })
    } catch {
    }
  }, [])

  useEffect(() => {
    if (devices.length === 0 || !isAuthenticated) return
    const pollBattery = () => devices.forEach(d => fetchBatteryPassthrough(d.id))
    pollBattery()
    const timer = setInterval(pollBattery, 10_000)
    return () => clearInterval(timer)
  }, [devices, isAuthenticated, fetchBatteryPassthrough])

  useEffect(() => {
    if (devices.length === 0 || !isAuthenticated) return
    const refreshAll = () => devices.forEach(d => fetchDeviceRealtime(d.id))
    refreshAll()
    const timer = setInterval(refreshAll, 60000)
    return () => clearInterval(timer)
  }, [devices, isAuthenticated, fetchDeviceRealtime])

  const handleRefreshDevice = async (deviceId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setRefreshingId(String(deviceId))
    await fetchDeviceRealtime(deviceId)
    setRefreshingId(null)
  }

  const handleRefreshAll = async () => {
    setError(null)
    try {
      await loadDevices(1, 50)
      const loadError = useDeviceStore.getState().deviceError
      if (loadError) throw new Error(loadError)
      const latestDevices = useDeviceStore.getState().devices
      for (const d of latestDevices) {
        await fetchDeviceRealtime(d.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed')
    }
  }

  const getDeviceField = (deviceId: string | number, key: string): string => {
    const cache = realtimeCache[String(deviceId)]
    if (!cache?.fields) return '--'
    const field = cache.fields[key]
    return field?.valueDisplay ?? (field?.value !== undefined ? String(field.value) : '--')
  }

  const getDeviceNum = (deviceId: string | number, key: string): number | null => {
    const cache = realtimeCache[String(deviceId)]
    if (!cache?.raw) return null
    const val = cache.raw[key as keyof typeof cache.raw]
    return val !== undefined ? Number(val) : null
  }

  const getDeviceIcon = (sortKey: string) => {
    const key = sortKey?.toLowerCase() ?? ''
    if (key.includes('storage') || key.includes('power') || key.includes('sierro')) return deviceIcons.powerstation
    if (key.includes('fridge')) return deviceIcons.fridge
    if (key.includes('cpap')) return deviceIcons.cpap
    return deviceIcons.default
  }

  const getDeviceImage = (_sortKey?: string): string => sierroProductImg

  const getWorkModeLabel = (mode: number | null | undefined): string => {
    if (mode === 1) return 'Backup'
    if (mode === 2) return 'Eco'
    return 'Normal'
  }

  const handleBleScan = useCallback(async () => {
    setShowAddModal(false)
    if (supportsDeviceListScan()) {
      setShowProvisioning(true)
      return
    }
    if (!('bluetooth' in navigator)) {
      setBlePermissionType('unsupported')
      return
    }
    setShowProvisioning(true)
  }, [])

  const handleDeviceClick = (device: DeviceListItem) => {
    useDeviceStore.getState().selectDevice(String(device.id))
    navigate(`/device/${device.id}`)
  }

  const getDeviceModel = (device: DeviceListItem): string => {
    if (device.model) return device.model
    if (device.gatherProtocolNameDisplay) return device.gatherProtocolNameDisplay
    if (device.ratedPower) return device.ratedPower >= 750 ? 'Sierro 2000' : 'Sierro 1000'
    return 'Sierro'
  }

  const getTagColor = (level: number): string => {
    if (level <= 0) return '#8C8C8C'
    if (level >= 60) return '#34C759'
    if (level >= 20) return '#FF9500'
    return '#FF3B30'
  }

  const [togglingPower, setTogglingPower] = useState<Set<string>>(new Set())

  const togglePower = async (deviceId: string | number, e: React.MouseEvent) => {
    e.stopPropagation()
    const idStr = String(deviceId)
    if (togglingPower.has(idStr)) return
    hapticMedium()
    const current = powerStates[idStr] ?? true
    const next = !current
    setPowerStates(prev => ({ ...prev, [idStr]: next }))
    setTogglingPower(prev => new Set(prev).add(idStr))
    try {
      const res = await passthroughDevice(idStr, {
        data: next ? FRAMES.AC_POWER_ON : FRAMES.AC_POWER_OFF,
        noOutput: true,
      })
      if (!isApiSuccess(res.code)) {
        throw new Error(res.message ?? res.msg ?? 'Power command rejected')
      }
    } catch (err) {
      setPowerStates(prev => ({ ...prev, [idStr]: current }))
      setError(err instanceof Error ? err.message : 'Failed to switch power')
    } finally {
      setTogglingPower(prev => { const s = new Set(prev); s.delete(idStr); return s })
    }
  }

  const lowBatteryThreshold = settings.lowBatteryThreshold ?? 30
  const lowBatteryDevice = devices.find(d => {
    const remainingBatteryCapacity = getDeviceNum(d.id, 'remainingBatteryCapacity')
    return remainingBatteryCapacity !== null && remainingBatteryCapacity < lowBatteryThreshold
  })

  const [lowBatteryCapacityWh, setLowBatteryCapacityWh] = useState<number | undefined>(undefined)
  useEffect(() => {
    const lid = lowBatteryDevice ? String(lowBatteryDevice.id) : null
    if (!lid) { setLowBatteryCapacityWh(undefined); return }
    loadRatedParams(lid)
      .then(p => setLowBatteryCapacityWh(p ? p.acInvOutputPower * 2 : undefined))
      .catch(() => setLowBatteryCapacityWh(undefined))
  }, [lowBatteryDevice?.id])
  const lowBatteryTimeStr = lowBatteryDevice
    ? batteryTimeLabel({
        acPower: getDeviceNum(lowBatteryDevice.id, 'acPower') ?? 0,
        solarPower: getDeviceNum(lowBatteryDevice.id, 'solarPower') ?? 0,
        outputPower: getDeviceNum(lowBatteryDevice.id, 'outputPower') ?? 0,
        soc: getDeviceNum(lowBatteryDevice.id, 'remainingBatteryCapacity') ?? 0,
        capacityWh: lowBatteryCapacityWh,
        isCharging: (getDeviceNum(lowBatteryDevice.id, 'batteryPower') ?? 0) > 0,
      })
    : '--'

  const dismissedAlarms = useAlarmDismissStore(s => s.dismissed)
  const activeAlarmCount = useMemo(() => {
    let count = 0
    for (const [idStr, entry] of Object.entries(realtimeCache)) {
      const firing = dedupeAndFilterAlarms((entry.firingAlarms ?? []) as FiringAlarm[])
      for (const a of firing) {
        if (!dismissedAlarms.includes(alarmKey(idStr, a.title))) count++
      }
    }
    return count
  }, [realtimeCache, dismissedAlarms])

  const BatteryTag = ({ level, connected, charging, unknown }: { level: number; connected: boolean; charging: boolean; unknown?: boolean }) => {
    if (!connected) {
      return (
        <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#4B1512] text-danger text-body-md font-semibold">
          Disconnected
        </span>
      )
    }
    if (unknown) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink-9">
          <span className="w-[22px] h-[12px] rounded-s border-s animate-pulse" style={{ borderColor: '#8C8C8C' }} />
          <span className="text-body-md font-semibold text-ink-7">--%</span>
        </span>
      )
    }
    const color = getTagColor(level)
    const fill = Math.max(4, Math.min(100, level))
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink-9">
        <span className="relative inline-flex items-center">
          <span className="relative w-[22px] h-[12px] rounded-s border-s flex items-center" style={{ borderColor: '#8C8C8C' }}>
            <span
              className="absolute left-[1.5px] top-[1.5px] bottom-[1.5px] rounded-[1.5px]"
              style={{ width: `calc(${fill}% - 3px)`, backgroundColor: color }}
            />
            {charging && (
              <Icon name="thunder" size={9} className="relative mx-auto" />
            )}
          </span>
          <span className="w-[2px] h-[5px] rounded-r-[1px] ml-[1px]" style={{ backgroundColor: '#8C8C8C' }} />
        </span>
        <span className="text-body-md font-semibold text-white tnum">{level}%</span>
      </span>
    )
  }

  const PowerToggle = ({ deviceId, on, disabled }: { deviceId: string | number; on: boolean; disabled: boolean }) => (
    <button
      onClick={(e) => { if (!disabled) togglePower(deviceId, e) }}
      disabled={disabled}
      aria-label="Power toggle"
      className={`relative w-[52px] h-[31px] rounded-full transition-colors duration-200 flex-shrink-0 ${
        disabled
          ? 'bg-ink-9 opacity-50 cursor-not-allowed'
          : on
            ? 'bg-primary active:scale-95'
            : 'bg-ink-9 active:scale-95'
      } transition-transform`}
    >
      <span
        className={`absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-sm transition-[left,transform] duration-200 ${
          on && !disabled ? 'left-[23px]' : 'left-[2px]'
        }`}
      />
    </button>
  )

  if (!isAuthenticated && !isGuest) {
    return (
      <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
        <div className="px-5 pt-4 pb-3 safe-area-top">
          <h1 className="text-display font-display text-white">Device</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <WifiOff size={48} className="text-ink-7 mb-3 opacity-40" />
          <p className="text-sm font-medium text-ink-6 mb-1">Not signed in</p>
          <p className="text-xs text-ink-7 mb-6 text-center">Sign in to view your devices and real-time parameters</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-primary rounded-full text-ink-13 text-body-md font-semibold"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="px-5 pt-4 pb-3 safe-area-top"
      >
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-display font-display text-white">Device</h1>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowAddModal(true)}
              aria-label="Add device"
              className="w-11 h-11 rounded-full bg-ink-10 flex items-center justify-center text-white hover:bg-ink-9 transition-colors active:scale-95"
            >
              <Icon name="add" size={20} />
            </button>
            <button
              onClick={() => navigate('/notifications')}
              aria-label="Notifications"
              className="relative w-11 h-11 rounded-full bg-ink-10 flex items-center justify-center text-white hover:bg-ink-9 transition-colors active:scale-95"
            >
              <Icon name="bell" size={20} />
              {activeAlarmCount > 0 && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-danger border-2 border-ink-12" />
              )}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-danger/[0.08] border border-danger/[0.15] rounded-l px-4 py-2.5 flex items-center gap-2 mb-1"
            >
              <AlertTriangle size={14} className="text-danger flex-shrink-0" />
              <span className="text-label text-danger flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-danger">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <PullToRefresh onRefresh={async () => { await loadDevices(1, 50) }}>
      <div className="px-4 pb-4">
        <AnimatePresence>
          {lowBatteryDevice && !bannerDismissed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onClick={() => navigate('/notifications')}
              className="mb-3 rounded-l bg-[#4B1512] px-4 py-3.5 flex items-start gap-3 cursor-pointer"
            >
              <Icon name="low-battery" size={22} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-body-md font-semibold text-white leading-tight truncate">Low Battery</p>
                <p className="text-label text-white/90 mt-0.5 leading-snug">
                  {lowBatteryDevice.name} • Battery below {lowBatteryThreshold}%, estimated remaining time: {lowBatteryTimeStr.replace(/ remaining$/, '')}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setBannerDismissed(true) }}
                aria-label="Dismiss notification"
                className="text-white flex-shrink-0 active:scale-90 transition-transform"
              >
                <X size={20} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {deviceLoading && devices.length === 0 && !devicesListReady ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-l p-4 bg-ink-10 animate-pulse h-[140px]" />
            ))}
          </div>
        ) : devices.length > 0 ? (
          <div className="flex flex-col gap-3">
            {devices.map((device, index) => {
              const remainingBatteryCapacityRaw = getDeviceNum(device.id, 'remainingBatteryCapacity')
              const remainingBatteryCapacity = remainingBatteryCapacityRaw ?? 0
              const remainingBatteryCapacityKnown = remainingBatteryCapacityRaw !== null
              const batteryPower = getDeviceNum(device.id, 'batteryPower')
              const isCharging = batteryPower !== null && batteryPower > 0
              const connected = device.isOnline
              const powerOn = powerStates[String(device.id)] ?? device.isOnline

              return (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
                  onClick={() => handleDeviceClick(device)}
                  className="bg-ink-10 rounded-l p-4 cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-stretch gap-3">
                    {(() => {
                      const savedIconId = getSavedDisplayIconId(String(device.id))
                      const slotClass = "w-20 h-20 flex-shrink-0 flex items-center justify-center self-center"
                      if (savedIconId === 'custom') {
                        const customImg = localStorage.getItem(`sierro-display-icon-custom-${device.id}`)
                        if (customImg) {
                          return (
                            <div className={slotClass}>
                              <img
                                src={customImg}
                                alt={device.name}
                                className="w-full h-full object-cover rounded-m"
                              />
                            </div>
                          )
                        }
                      }
                      if (savedIconId === 'photo') {
                        return (
                          <div className={slotClass}>
                            <img
                              src={getDeviceImage(device.deviceSortKey)}
                              alt={getDeviceModel(device)}
                              className="w-full h-full object-contain drop-shadow-sm"
                            />
                          </div>
                        )
                      }
                      const SavedIcon = savedIconId ? LUCIDE_ICON_MAP[savedIconId] : null
                      if (SavedIcon) {
                        return (
                          <div className={slotClass}>
                            <SavedIcon size={48} className="text-white" />
                          </div>
                        )
                      }
                      return (
                        <div className={slotClass}>
                          <img
                            src={getDeviceImage(device.deviceSortKey)}
                            alt={getDeviceModel(device)}
                            className="w-full h-full object-contain drop-shadow-sm"
                          />
                        </div>
                      )
                    })()}
                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                      <h3 className="text-title-lg font-semibold text-white leading-tight line-clamp-2 break-words">
                        {device.name}
                      </h3>
                      <p className="text-body-md text-ink-7 mt-0.5">{getDeviceModel(device)}</p>
                    </div>
                    <div className="flex flex-col items-end justify-between flex-shrink-0">
                      <BatteryTag level={remainingBatteryCapacity} unknown={!remainingBatteryCapacityKnown} connected={connected} charging={isCharging} />
                      <div onClick={(e) => e.stopPropagation()}>
                        <PowerToggle deviceId={device.id} on={powerOn} disabled={!connected || togglingPower.has(String(device.id))} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center text-center pt-24 px-6">
            <div className="w-40 h-40 rounded-l bg-ink-9 mb-7 flex items-center justify-center">
              <Icon name="battery" size={56} className="opacity-40" />
            </div>
            <h2 className="text-headline-md font-semibold text-white mb-2">
              {error ? 'Something went wrong' : 'No devices yet'}
            </h2>
            <p className="text-body-lg text-ink-7 mb-8 max-w-[280px]">
              {error ? 'Check your network connection and try again.' : 'Add your first Sierro device to start monitoring and receiving alerts.'}
            </p>
            {error ? (
              <button onClick={fetchDevices} className="px-6 py-3 rounded-m border-m border-primary text-primary text-body-lg font-semibold flex items-center gap-2 active:scale-95 transition-transform">
                <RefreshCw size={18} /> Retry
              </button>
            ) : (
              <button onClick={() => setShowAddModal(true)} className="px-7 py-3.5 rounded-m border-m border-primary text-primary text-body-lg font-semibold flex items-center gap-2 active:scale-95 transition-transform">
                <Icon name="add" size={20} /> Add Device
              </button>
            )}
          </motion.div>
        )}
      </div>
      </PullToRefresh>
    </div>
  )
}
