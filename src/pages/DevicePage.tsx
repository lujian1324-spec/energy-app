import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import ProvisioningPage from './ProvisioningPage'
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
} from 'lucide-react'
import Icon from '../components/Icon'
import PullToRefresh from '../components/PullToRefresh'
import ManualAddDeviceModal from '../components/ManualAddDeviceModal'
import { useDeviceStore } from '../stores/deviceStore'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import sierro1000Img from '../assets/sierro-1000.webp'
import { mapFieldsToRealtime } from '../api/deviceApi'
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

export default function DevicePage() {
  const navigate = useNavigate()
  const {
    devices,
    deviceLoading,
    loadDevices,
    loadStations,
    loadDeviceState,
    selectedDeviceState,
    stateLoading,
    isDemoMode,
  } = useDeviceStore()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const isGuest = useAuthStore(s => s.isGuest)

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

  // QR scan state
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrScanning, setQrScanning] = useState(false)
  const [qrResult, setQrResult] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // ── 加载设备列表 ──
  const fetchDevices = useCallback(async () => {
    setError(null)
    try {
      await loadDevices(1, 50)
      await loadStations(1, 50)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices')
    }
  }, [loadDevices, loadStations])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  // ── 加载设备实时状态（每个设备） ──
  const fetchDeviceRealtime = useCallback(async (deviceId: number | string) => {
    const idStr = String(deviceId)
    // Keep the previous fields/raw while refreshing so the battery icon doesn't
    // briefly flash 0% on every periodic re-fetch — only flip the loading flag.
    setRealtimeCache(prev => ({
      ...prev,
      [idStr]: { ...prev[idStr], loading: true },
    }))
    try {
      await loadDeviceState(deviceId)
    } catch {
      setRealtimeCache(prev => ({
        ...prev,
        [idStr]: { ...prev[idStr], loading: false },
      }))
    }
  }, [loadDeviceState])

  // 监听 selectedDeviceState 变化并更新缓存
  const prevSelectedIdRef = useRef<string | null>(null)
  useEffect(() => {
    const currentId = useDeviceStore.getState().selectedDeviceId
    if (!currentId) return

    // 新的设备状态数据到来
    if (selectedDeviceState && selectedDeviceState.deviceId) {
      const idStr = String(selectedDeviceState.deviceId)
      const mapped = mapFieldsToRealtime(selectedDeviceState.fields)
      setRealtimeCache(prev => ({
        ...prev,
        [idStr]: {
          fields: selectedDeviceState.fields,
          raw: mapped,
          loading: false,
          lastUpdated: Date.now(),
        },
      }))
    }
  }, [selectedDeviceState])

  // 页面加载后为每个设备获取实时状态
  useEffect(() => {
    if (devices.length > 0 && isAuthenticated) {
      devices.forEach(d => {
        if (!realtimeCache[String(d.id)] || Date.now() - (realtimeCache[String(d.id)]?.lastUpdated ?? 0) > 60000) {
          fetchDeviceRealtime(d.id)
        }
      })
    }
  }, [devices, isAuthenticated])

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

  // Real product photo for SIERRO power stations (falls back to emoji elsewhere)
  const getDeviceImage = (sortKey: string): string | null => {
    const key = sortKey?.toLowerCase() ?? ''
    if (key.includes('storage') || key.includes('power') || key.includes('sierro')) return sierro1000Img
    return null
  }

  const getWorkModeLabel = (mode: number | null | undefined): string => {
    if (mode === 1) return 'Backup'
    if (mode === 2) return 'Eco'
    return 'Normal'
  }

  const handleDeviceClick = (device: DeviceListItem) => {
    useDeviceStore.getState().selectDevice(String(device.id))
    navigate(`/device/${device.id}`)
  }

  // 设备型号显示（Sierro 1000 / Sierro 2000 ...）
  const getDeviceModel = (device: DeviceListItem): string =>
    device.model || device.gatherProtocolNameDisplay || 'Sierro'

  // 电量标签颜色（依 BatteryTag 9 状态规范）
  // 60-100% 绿/主色，20-59% 橘，1-19% 红
  const getTagColor = (level: number): string => {
    if (level >= 60) return '#34C759'
    if (level >= 20) return '#FF9500'
    return '#FF3B30'
  }

  // 电源开关切换（本地 UI 状态）
  const togglePower = (deviceId: string | number, e: React.MouseEvent) => {
    e.stopPropagation()
    const idStr = String(deviceId)
    setPowerStates(prev => ({ ...prev, [idStr]: !(prev[idStr] ?? true) }))
  }

  // 是否有低电量设备（用于最新通知 Banner）
  const lowBatteryDevice = devices.find(d => {
    const remainingBatteryCapacity = getDeviceNum(d.id, 'remainingBatteryCapacity')
    return remainingBatteryCapacity !== null && remainingBatteryCapacity < 30
  })

  // 未读通知红点（查看通知页后清零）
  const hasUnreadNotifications = useNotificationStore(s => s.unreadCount()) > 0

  // ── BatteryTag 电量标签（横式电池 + 充电闪电 + 百分比 / Disconnected） ──
  const BatteryTag = ({ level, connected, charging, unknown }: { level: number; connected: boolean; charging: boolean; unknown?: boolean }) => {
    if (!connected) {
      return (
        <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#4B1512] text-[#FF3B30] text-body-md font-semibold">
          Disconnected
        </span>
      )
    }
    // No realtime data fetched yet — show a neutral placeholder instead of a misleading 0%.
    if (unknown) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3A3A3A]">
          <span className="w-[22px] h-[12px] rounded-s border-s animate-pulse" style={{ borderColor: '#8C8C8C' }} />
          <span className="text-body-md font-semibold text-[#8C8C8C]">--%</span>
        </span>
      )
    }
    const color = getTagColor(level)
    const fill = Math.max(4, Math.min(100, level))
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3A3A3A]">
        {/* 横式电池 */}
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
          {/* 电池正极 */}
          <span className="w-[2px] h-[5px] rounded-r-[1px] ml-[1px]" style={{ backgroundColor: '#8C8C8C' }} />
        </span>
        <span className="text-body-md font-semibold text-white">{level}%</span>
      </span>
    )
  }

  // ── 电源开关组件（disconnected 时 disabled） ──
  const PowerToggle = ({ deviceId, on, disabled }: { deviceId: string | number; on: boolean; disabled: boolean }) => (
    <button
      onClick={(e) => { if (!disabled) togglePower(deviceId, e) }}
      disabled={disabled}
      aria-label="Power toggle"
      className={`relative w-[52px] h-[31px] rounded-full transition-colors duration-200 flex-shrink-0 ${
        disabled
          ? 'bg-[#454545] opacity-50 cursor-not-allowed'
          : on
            ? 'bg-primary active:scale-95'
            : 'bg-[#454545] active:scale-95'
      } transition-transform`}
    >
      <span
        className={`absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-sm transition-all duration-200 ${
          on && !disabled ? 'left-[23px]' : 'left-[2px]'
        }`}
      />
    </button>
  )

  // ── 未登录 + 非游客 → 强制引导登录 ──
  if (!isAuthenticated && !isGuest) {
    return (
      <div className="h-full flex flex-col bg-[#141414] overflow-hidden">
        <div className="px-5 pt-4 pb-3 safe-area-top">
          <h1 className="text-display font-display text-white">Device</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <WifiOff size={48} className="text-[#8C8C8C] mb-3 opacity-40" />
          <p className="text-sm font-medium text-[#BFBFBF] mb-1">Not signed in</p>
          <p className="text-xs text-[#8C8C8C] mb-6 text-center">Sign in to view your devices and real-time parameters</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-[#01D6BE] rounded-full text-[#000000] text-body-md font-semibold"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[#141414] overflow-hidden">
      {/* Header */}
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
              className="w-11 h-11 rounded-full bg-[#262626] flex items-center justify-center text-white hover:bg-[#454545] transition-colors active:scale-95"
            >
              <Icon name="add" size={20} />
            </button>
            <button
              onClick={() => navigate('/notifications')}
              aria-label="Notifications"
              className="relative w-11 h-11 rounded-full bg-[#262626] flex items-center justify-center text-white hover:bg-[#454545] transition-colors active:scale-95"
            >
              <Icon name="bell" size={20} />
              {(hasUnreadNotifications || lowBatteryDevice || devices.some(d => d.isAlarmed)) && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#FF3B30] border-2 border-[#141414]" />
              )}
            </button>
          </div>
        </div>

        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.15)] rounded-l px-4 py-2.5 flex items-center gap-2 mb-1"
            >
              <AlertTriangle size={14} className="text-[#FF3B30] flex-shrink-0" />
              <span className="text-[12px] text-[#FF3B30] flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-[#FF3B30]">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Scrollable content — pull-to-refresh */}
      <PullToRefresh onRefresh={async () => { await loadDevices(1, 50) }}>
      <div className="px-4 pb-4">
        {/* 最新通知 Banner（可按 X 关闭） */}
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
                  {lowBatteryDevice.name} • Battery below 30%, estimated remaining time: {getDeviceField(String(lowBatteryDevice.id), 'remainingTime') || '1h 24m'}
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

        {/* Loading Skeleton */}
        {deviceLoading && devices.length === 0 ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-l p-5 bg-[#262626] animate-pulse h-[150px]" />
            ))}
          </div>
        ) : devices.length > 0 ? (
          /* Device Card List (newest on top — devices[0] assumed newest) */
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
                  className="bg-[#262626] rounded-l p-5 cursor-pointer active:scale-[0.99] transition-transform"
                >
                  {/* Top row: Display icon/photo + BatteryTag */}
                  <div className="flex items-start justify-between mb-3">
                    {getDeviceImage(device.deviceSortKey) ? (
                      <div className="w-14 h-14 flex items-center justify-center">
                        <img
                          src={getDeviceImage(device.deviceSortKey)!}
                          alt={getDeviceModel(device)}
                          className="w-full h-full object-contain drop-shadow-sm"
                        />
                      </div>
                    ) : (
                      <span className="text-[28px] leading-none">{getDeviceIcon(device.deviceSortKey)}</span>
                    )}
                    <BatteryTag level={remainingBatteryCapacity} unknown={!remainingBatteryCapacityKnown} connected={connected} charging={isCharging} />
                  </div>

                  {/* Name (up to 2 lines, then ...) */}
                  <h3 className="text-title-lg font-semibold text-white leading-tight line-clamp-2 break-words">
                    {device.name}
                  </h3>

                  {/* Model */}
                  <p className="text-body-md text-ink-7 mt-0.5">{getDeviceModel(device)}</p>

                  {/* Power toggle (disabled when disconnected) */}
                  <div className="flex justify-end mt-3" onClick={(e) => e.stopPropagation()}>
                    <PowerToggle deviceId={device.id} on={powerOn} disabled={!connected} />
                  </div>
                </motion.div>
              )
            })}
          </div>
        ) : (
          /* Empty State */
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center text-center pt-24 px-6">
            <div className="w-40 h-40 rounded-l bg-[#3A3A3A] mb-7 flex items-center justify-center">
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

      {/* ===== 设备参数详情 Modal ===== */}
      <AnimatePresence>
        {showDeviceParams && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.7)] z-50 flex items-end"
            onClick={() => setShowDeviceParams(null)}
          >
            <motion.div
              initial={{ y: 400, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 400, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-h-[85vh] bg-[#262626] rounded-t-[28px] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[rgba(255,255,255,0.06)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center text-lg">
                    {getDeviceImage(showDeviceParams.deviceSortKey) ? (
                      <img
                        src={getDeviceImage(showDeviceParams.deviceSortKey)!}
                        alt={showDeviceParams.model || 'Sierro'}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-l bg-[rgba(1,214,190,0.12)] flex items-center justify-center">
                        {getDeviceIcon(showDeviceParams.deviceSortKey)}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF]">{showDeviceParams.name}</h3>
                    <div className="text-[11px] text-[#BFBFBF]">{showDeviceParams.gatherProtocolNameDisplay || showDeviceParams.model}</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowDeviceParams(null)}
                  className="w-8 h-8 rounded-full bg-[#454545] flex items-center justify-center text-[#BFBFBF]"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto scrollbar-hide p-5 space-y-4">
                {/* Device Meta Info */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold text-[#BFBFBF] tracking-widest uppercase">Device Info</h4>
                  <div className="bg-[#141414] rounded-l divide-y divide-[rgba(255,255,255,0.06)]">
                    {[
                      { icon: Hash, label: 'Serial Number', value: showDeviceParams.serialNumber || '--' },
                      { icon: Server, label: 'Station', value: showDeviceParams.stationName || '--' },
                      { icon: Cpu, label: 'Firmware', value: showDeviceParams.softwareVersion || '--' },
                      { icon: Activity, label: 'Protocol', value: showDeviceParams.gatherProtocolNumber || '--' },
                      { icon: Wifi, label: 'Status', value: showDeviceParams.isOnline ? 'Online' : 'Offline', valueColor: showDeviceParams.isOnline ? '#34C759' : '#FF3B30' },
                      { icon: MapPin, label: 'Location', value: showDeviceParams.place || '--' },
                      { icon: Clock, label: 'Last Data', value: showDeviceParams.lastDataAt ? new Date(showDeviceParams.lastDataAt).toLocaleString() : '--' },
                    ].map((row) => {
                      const Icon = row.icon
                      return (
                        <div key={row.label} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Icon size={14} className="text-[#8C8C8C]" />
                            <span className="text-body-md text-[#BFBFBF]">{row.label}</span>
                          </div>
                          <span className="text-body-md font-medium text-[#FFFFFF] truncate max-w-[180px]" style={row.valueColor ? { color: row.valueColor } : {}}>
                            {row.value}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Real-time Parameters */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-bold text-[#BFBFBF] tracking-widest uppercase">Real-Time Parameters</h4>
                    {realtimeCache[String(showDeviceParams.id)]?.loading ? (
                      <RefreshCw size={12} className="text-[#01D6BE] animate-spin" />
                    ) : (
                      <button
                        onClick={() => fetchDeviceRealtime(showDeviceParams.id)}
                        className="text-[11px] text-[#01D6BE] flex items-center gap-1"
                      >
                        <RefreshCw size={11} /> Refresh
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { label: 'SOC', value: `${getDeviceNum(showDeviceParams.id, 'remainingBatteryCapacity') ?? '--'}%`, icon: Battery, color: '#34C759' },
                      { label: 'Battery', value: `${getDeviceNum(showDeviceParams.id, 'batteryPower') ?? '--'}W`, icon: TrendingDown, color: '#01D6BE' },
                      { label: 'AC Power', value: `${getDeviceNum(showDeviceParams.id, 'acPower') ?? '--'}W`, icon: Zap, color: '#01D6BE' },
                      { label: 'Solar', value: `${getDeviceNum(showDeviceParams.id, 'solarPower') ?? '--'}W`, icon: Sun, color: '#FF9500' },
                      { label: 'Output', value: `${getDeviceNum(showDeviceParams.id, 'outputPower') ?? '--'}W`, icon: TrendingUp, color: '#BFBFBF' },
                      { label: 'Temp', value: `${getDeviceNum(showDeviceParams.id, 'batteryTemp') ?? '--'}°C`, icon: Thermometer, color: '#FF9500' },
                    ].map((item) => {
                      const Icon = item.icon
                      return (
                        <div key={item.label} className="bg-[#141414] rounded-l p-3 flex flex-col items-center">
                          <Icon size={14} style={{ color: item.color }} className="mb-1.5" />
                          <div className="text-[14px] font-bold text-[#FFFFFF]">{item.value}</div>
                          <div className="text-tiny text-[#BFBFBF] mt-0.5">{item.label}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Port Status */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold text-[#BFBFBF] tracking-widest uppercase">Port Controls</h4>
                  <div className="bg-[#141414] rounded-l divide-y divide-[rgba(255,255,255,0.06)]">
                    {[
                      { label: 'AC Output 1', key: 'acOut1Enable' },
                      { label: 'AC Output 2', key: 'acOut2Enable' },
                      { label: 'USB Output', key: 'usbOut1Enable' },
                      { label: 'Sleep Mode', key: 'sleepMode' },
                    ].map((port) => {
                      const val = getDeviceField(showDeviceParams.id, port.key)
                      const isEnabled = val === 'true' || val === '1'
                      return (
                        <div key={port.key} className="flex items-center justify-between px-4 py-3">
                          <span className="text-body-md text-[#FFFFFF]">{port.label}</span>
                          <span className={`text-[12px] px-2 py-0.5 rounded-full font-medium ${
                            isEnabled ? 'bg-[rgba(52,199,89,0.15)] text-[#34C759]' : 'bg-[rgba(255,255,255,0.06)] text-[#8C8C8C]'
                          }`}>
                            {isEnabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="bg-[#141414] rounded-l px-4 py-3 flex items-center justify-between">
                    <span className="text-body-md text-[#FFFFFF]">Work Mode</span>
                    <span className="text-[12px] px-2 py-0.5 rounded-full bg-[rgba(1,214,190,0.1)] text-[#01D6BE] font-medium">
                      {getWorkModeLabel(getDeviceNum(showDeviceParams.id, 'workMode'))}
                    </span>
                  </div>
                </div>

                {/* All API Fields (for debugging) */}
                {realtimeCache[String(showDeviceParams.id)]?.fields && (
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-[#BFBFBF] tracking-widest uppercase">All Parameters</h4>
                    <div className="bg-[#141414] rounded-l divide-y divide-[rgba(255,255,255,0.04)]">
                      {Object.entries(realtimeCache[String(showDeviceParams.id)].fields)
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([key, field]) => (
                          <div key={key} className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-[12px] text-[#BFBFBF] font-mono">{field.name || key}</span>
                            <span className="text-[12px] text-[#FFFFFF] font-mono">
                              {field.valueDisplay ?? String(field.value ?? '--')}
                            </span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom: Go to device detail */}
              <div className="p-5 border-t border-[rgba(255,255,255,0.06)]">
                <button
                  onClick={() => { setShowDeviceParams(null); navigate(`/device/${showDeviceParams.id}`) }}
                  className="w-full py-3 rounded-l bg-[#01D6BE] text-[#000000] text-[14px] font-semibold flex items-center justify-center gap-2"
                >
                  View Full Dashboard <Icon name="chevron-right" size={16} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Device Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.7)] z-50 flex items-end"
            onClick={() => setShowAddModal(false)}>
            <motion.div initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#262626] rounded-t-[28px] p-6 pb-10">
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />
              <h3 className="text-base font-bold text-[#FFFFFF] mb-5">Add New Device</h3>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Bluetooth Scan', desc: 'Find nearby BLE devices', color: '#01D6BE', icon: '📡', action: () => { setShowAddModal(false); setShowProvisioning(true) } },
                  { label: 'Wi-Fi Setup', desc: 'Connect via local network', color: '#34C759', icon: '📶' },
                  { label: 'Manual Entry', desc: 'Enter device code manually', color: '#FF9500', icon: '⌨️', action: () => { setShowAddModal(false); setShowManualAdd(true) } },
                  { label: 'Scan QR Code', desc: 'Scan device QR code', color: '#01D6BE', icon: '📷', action: () => { setShowAddModal(false); setShowQrScan(true) } },
                ].map((opt) => (
                  <button key={opt.label}
                    onClick={() => { if ('action' in opt && opt.action) opt.action(); else setShowAddModal(false) }}
                    className="flex items-center gap-4 p-4 bg-[#454545] rounded-l text-left transition-all">
                    <span className="text-2xl">{opt.icon}</span>
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold" style={{ color: opt.color }}>{opt.label}</div>
                      <div className="text-[11px] text-[#BFBFBF] mt-0.5">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAddModal(false)}
                className="w-full mt-4 h-11 rounded-l bg-[rgba(255,255,255,0.06)] text-[#BFBFBF] text-sm font-medium">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BLE Scan Modal */}
      <AnimatePresence>
        {showBleScan && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.8)] z-50 flex items-center justify-center p-5"
            onClick={() => { setShowBleScan(false); setIsScanning(false); setScanError(null); setScannedDevices([]) }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#262626] rounded-l p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-[#FFFFFF]">Bluetooth Devices</h3>
                <button onClick={() => { setShowBleScan(false); setIsScanning(false); setScanError(null); setScannedDevices([]) }}
                  className="w-8 h-8 rounded-full bg-[#454545] flex items-center justify-center text-[#BFBFBF]">
                  <X size={18} />
                </button>
              </div>
              {isScanning && scannedDevices.length === 0 && !scanError && (
                <div className="flex flex-col items-center justify-center py-10">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 rounded-full border-2 border-[#01D6BE] border-t-transparent mb-4" />
                  <p className="text-[14px] text-[#BFBFBF]">Scanning for devices...</p>
                </div>
              )}
              {scanError && (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-12 h-12 rounded-full bg-[rgba(255,59,48,0.15)] flex items-center justify-center mb-3">
                    <Icon name="bluetooth" size={24} />
                  </div>
                  <p className="text-[14px] text-[#FF3B30] text-center mb-1">Scan Failed</p>
                  <p className="text-[12px] text-[#BFBFBF] text-center px-4">{scanError}</p>
                </div>
              )}
              {!isScanning && !scanError && scannedDevices.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-12 h-12 rounded-full bg-[#454545] flex items-center justify-center mb-3">
                    <Icon name="bluetooth" size={24} />
                  </div>
                  <p className="text-[14px] text-[#BFBFBF]">No devices found</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Scan Modal */}
      <AnimatePresence>
        {showQrScan && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.9)] z-50 flex flex-col">
            <div className="flex items-center justify-between p-5 safe-area-top">
              <h3 className="text-lg font-bold text-[#FFFFFF]">Scan QR Code</h3>
              <button onClick={() => { stopQrScan(); setShowQrScan(false); setQrResult(null); setQrError(null) }}
                className="w-9 h-9 rounded-full bg-[#454545] flex items-center justify-center text-[#FFFFFF]">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center px-5">
              {!qrResult ? (
                <>
                  <div className="relative w-64 h-64 mb-6">
                    <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover rounded-l" playsInline muted />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute inset-0 border-2 border-[#01D6BE] rounded-l">
                      {([['top-0 left-0', 'border-t-4 border-l-4'], ['top-0 right-0', 'border-t-4 border-r-4'], ['bottom-0 left-0', 'border-b-4 border-l-4'], ['bottom-0 right-0', 'border-b-4 border-r-4']] as const).map(([pos, border], i) => (
                        <div key={i} className={`absolute w-8 h-8 ${pos} ${border} border-[#01D6BE] rounded-sm`} />
                      ))}
                    </div>
                    {!qrScanning && !qrError && (
                      <div className="absolute inset-0 bg-[#262626] rounded-l flex items-center justify-center">
                        <Icon name="scan" size={64} className="opacity-50" />
                      </div>
                    )}
                  </div>
                  {qrError ? (
                    <div className="text-center">
                      <p className="text-[14px] text-[#FF3B30] mb-2">{qrError}</p>
                      <button onClick={startQrScan} className="px-5 py-2 bg-[#01D6BE] rounded-full text-[#000000] text-body-md font-semibold">Retry</button>
                    </div>
                  ) : (
                    <>
                      <p className="text-body-lg font-semibold text-[#FFFFFF] mb-1">Point camera at QR code</p>
                      <p className="text-[12px] text-[#BFBFBF]">The code will be scanned automatically</p>
                    </>
                  )}
                </>
              ) : (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-sm bg-[#262626] rounded-l p-6">
                  <div className="w-16 h-16 rounded-full bg-[rgba(52,199,89,0.15)] flex items-center justify-center mx-auto mb-4">
                    <Icon name="scan" size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-[#FFFFFF] text-center mb-2">QR Code Scanned!</h4>
                  <div className="bg-[#454545] rounded-l p-4 mb-5">
                    <pre className="text-[12px] text-[#BFBFBF] whitespace-pre-wrap break-all">{qrResult}</pre>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setQrResult(null); startQrScan() }} className="flex-1 h-11 rounded-l bg-[#454545] text-[#FFFFFF] text-[14px] font-medium">Scan Again</button>
                    <button onClick={() => { stopQrScan(); setShowQrScan(false); setQrResult(null); setQrError(null) }} className="flex-1 h-11 rounded-l bg-[#01D6BE] text-[#000000] text-[14px] font-semibold">Add Device</button>
                  </div>
                </motion.div>
              )}
            </div>
            <div className="p-5 safe-area-bottom text-center">
              <p className="text-[11px] text-[#8C8C8C]">Make sure the QR code is well-lit and in focus</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Add Device Modal */}
      <AnimatePresence>
        {showManualAdd && (
          <ManualAddDeviceModal onClose={() => setShowManualAdd(false)} />
        )}
      </AnimatePresence>

      {/* BLE 配网页面（全屏覆盖） */}
      <AnimatePresence>
        {showProvisioning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ProvisioningPage onClose={() => setShowProvisioning(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  // ── QR helpers (kept for QR modal) ──

  function stopQrScan() {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    setQrScanning(false)
  }

  async function startQrScan() {
    setQrScanning(true)
    setQrError(null)
    setQrResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (err) {
      setQrError(`Camera error: ${err instanceof Error ? err.message : String(err)}`)
      setQrScanning(false)
    }
  }
}
