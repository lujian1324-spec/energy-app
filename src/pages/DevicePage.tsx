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

  // 最新通知 Banner 关闭状态（仅 UI）
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // 设备电源开关本地状态（仅 UI；不触发 API）
  const [powerStates, setPowerStates] = useState<Record<string, boolean>>({})

  // 设备实时状态缓存 — demo 模式下用 getDemoDeviceState 同步预填，避免加载前显示 0% / --%
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

  // 设备参数详情 modal
  const [showDeviceParams, setShowDeviceParams] = useState<DeviceListItem | null>(null)

  // BLE scan state
  const [isScanning, setIsScanning] = useState(false)
  const [scannedDevices, setScannedDevices] = useState<BleDevice[]>([])
  const [scanError, setScanError] = useState<string | null>(null)
  // BLE permission sheet
  const [blePermissionType, setBlePermissionType] = useState<'unsupported' | 'denied' | null>(null)

  // QR scan state
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
  // 扫码识别出的设备序列号/ID（用于录入）
  const [scannedSerial, setScannedSerial] = useState('')
  const [scannedName, setScannedName] = useState('')
  const animationFrameRef = useRef<number | null>(null)

  // ── 打开 QR 弹窗时自动获取摄像头权限并开始扫描，关闭时释放摄像头 ──
  useEffect(() => {
    if (showQrScan) {
      startQrScan()
    }
    return () => { stopQrScan() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQrScan])

  // APP-002: returning from OS camera settings while QR overlay is open → auto-retry
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

  // ── 加载设备列表 ──
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

  // ── 加载设备实时状态（每个设备，独立请求） ──
  // 注意：不能用 store.loadDeviceState，它用单槽 selectedDeviceState + stateRequestSeq
  // 做单设备防抖，并发拉多个设备时只有最后一个生效，其余会被丢弃。这里直接调用
  // fetchDeviceState API，按 deviceId 各自写入 realtimeCache，互不干扰。
  const fetchDeviceRealtime = useCallback(async (deviceId: number | string) => {
    const idStr = String(deviceId)
    // Demo 模式直接用本地模拟数据
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
    // Keep the previous fields/raw while refreshing so the battery icon doesn't
    // briefly flash 0% on every periodic re-fetch — only flip the loading flag.
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

  // 监听 selectedDeviceState 变化并更新缓存
  useEffect(() => {
    // 更新缓存，不依赖 selectedDeviceId（首次加载时可能尚无选中设备）
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

  // Passthrough-based battery SOC poll: every 10s per device, replaces the cloud
  // API for remainingBatteryCapacity (and also updates AC/Solar/Output/Battery-Power
  // from the same READ_ALL_STATUS frame since it's free). Stops when leaving the page.
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
      // passthrough can fail silently — cloud API poll still provides a fallback
    }
  }, [])

  // 页面进入后立即 passthrough 获取电池 SOC，之后每 10s 更新一次；离开页面停止
  useEffect(() => {
    if (devices.length === 0 || !isAuthenticated) return
    const pollBattery = () => devices.forEach(d => fetchBatteryPassthrough(d.id))
    pollBattery()
    const timer = setInterval(pollBattery, 10_000)
    return () => clearInterval(timer)
  }, [devices, isAuthenticated, fetchBatteryPassthrough])

  // Cloud API poll: full device state (fields for params modal, alarms, etc.) every 60s
  useEffect(() => {
    if (devices.length === 0 || !isAuthenticated) return
    const refreshAll = () => devices.forEach(d => fetchDeviceRealtime(d.id))
    refreshAll()
    const timer = setInterval(refreshAll, 60000)
    return () => clearInterval(timer)
  }, [devices, isAuthenticated, fetchDeviceRealtime])

  // ── 刷新单个设备 ──
  const handleRefreshDevice = async (deviceId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setRefreshingId(String(deviceId))
    await fetchDeviceRealtime(deviceId)
    setRefreshingId(null)
  }

  // ── 刷新全部设备 ──
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

  // ── 从缓存获取实时参数 ──
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

  // Real product photo for all devices — default to transparent SIERRO product image
  const getDeviceImage = (_sortKey?: string): string => sierroProductImg

  const getWorkModeLabel = (mode: number | null | undefined): string => {
    if (mode === 1) return 'Backup'
    if (mode === 2) return 'Eco'
    return 'Normal'
  }

  // ── 蓝牙扫描权限检查 ──
  const handleBleScan = useCallback(async () => {
    setShowAddModal(false)

    // Native app: Bluetooth is handled by the Capacitor plugin (permission is
    // requested at scan time), so skip the Web Bluetooth checks and go straight
    // to provisioning, where the in-app device list scan runs.
    if (supportsDeviceListScan()) {
      setShowProvisioning(true)
      return
    }

    // Web Bluetooth not available (iOS Safari / Firefox)
    if (!('bluetooth' in navigator)) {
      setBlePermissionType('unsupported')
      return
    }

    // getAvailability() is just a hint — it may return false in newer Chrome
    // when the Permissions-Policy header isn't set, even with Bluetooth on.
    // Don't block the user here; the actual permission prompt happens when
    // navigator.bluetooth.requestDevice() is called inside ProvisioningPage.
    setShowProvisioning(true)
  }, [])

  const handleDeviceClick = (device: DeviceListItem) => {
    useDeviceStore.getState().selectDevice(String(device.id))
    navigate(`/device/${device.id}`)
  }

  // 设备型号显示（Sierro 1000 / Sierro 2000）。云端 `model` 字段对真实设备常返回 null，
  // 所以在它和 gatherProtocolNameDisplay 都缺失时，按板载额定功率(ratedPower)推断——
  // 500W 板 = Sierro 1000，1000W 板 = Sierro 2000（对照 src/data/deviceModels.ts 的规格表），
  // 这是设备自身真实上报的硬件参数，比云端可能缺失的 model 字符串更可靠。
  const getDeviceModel = (device: DeviceListItem): string => {
    if (device.model) return device.model
    if (device.gatherProtocolNameDisplay) return device.gatherProtocolNameDisplay
    if (device.ratedPower) return device.ratedPower >= 750 ? 'Sierro 2000' : 'Sierro 1000'
    return 'Sierro'
  }

  // 电量标签颜色（依 BatteryTag 9 状态规范）
  // 60-100% 绿/主色，20-59% 橘，1-19% 红
  const getTagColor = (level: number): string => {
    // Real 0% is missing-data's sibling, not Disconnected: gray, not danger red.
    if (level <= 0) return '#8C8C8C'
    if (level >= 60) return '#34C759'
    if (level >= 20) return '#FF9500'
    return '#FF3B30'
  }

  // 正在下发开关指令的设备（防抖，避免重复点击）
  const [togglingPower, setTogglingPower] = useState<Set<string>>(new Set())

  // 电源开关切换：通过 Modbus 透传写 0x0080
  //   开机 → 0x01AA (FRAMES.AC_POWER_ON)，关机 → 0xAA01 (FRAMES.AC_POWER_OFF)
  const togglePower = async (deviceId: string | number, e: React.MouseEvent) => {
    e.stopPropagation()
    const idStr = String(deviceId)
    if (togglingPower.has(idStr)) return
    hapticMedium() // 设备电源开关：中触反馈确认操作

    const current = powerStates[idStr] ?? true
    const next = !current
    // 乐观更新 UI
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
      // 失败回滚 + 提示
      setPowerStates(prev => ({ ...prev, [idStr]: current }))
      setError(err instanceof Error ? err.message : 'Failed to switch power')
    } finally {
      setTogglingPower(prev => { const s = new Set(prev); s.delete(idStr); return s })
    }
  }

  // 是否有低电量设备（用于最新通知 Banner）
  const lowBatteryThreshold = settings.lowBatteryThreshold ?? 30
  const lowBatteryDevice = devices.find(d => {
    const remainingBatteryCapacity = getDeviceNum(d.id, 'remainingBatteryCapacity')
    return remainingBatteryCapacity !== null && remainingBatteryCapacity < lowBatteryThreshold
  })

  // 低电量横幅剩余时间：统一走 batteryTimeLabel（容量 = acInvOutputPower×2，缺省 1000）
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

  // 铃铛红点：仅在存在「未清除的实时告警」时显示（与 Notifications 列表同源）。
  // 跨所有已缓存设备统计 firing 告警，去重后再扣掉用户已点掉的那些。
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
