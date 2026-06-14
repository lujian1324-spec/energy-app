import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import ProvisioningPage from './ProvisioningPage'
import {
  Zap,
  AlertTriangle,
  X,
  Plus,
  QrCode,
  Bluetooth,
  RefreshCw,
  Bell,
  BatteryWarning,
  Wifi,
  WifiOff,
  Thermometer,
  Activity,
  Sun,
  ChevronRight,
  Info,
  Battery,
  Clock,
  MapPin,
  Hash,
  Cpu,
  Server,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { useDeviceStore } from '../stores/deviceStore'
import { useAuthStore } from '../stores/authStore'
import sierro1000Img from '../assets/sierro-1000.webp'
import { mapFieldsToRealtime } from '../api/deviceApi'
import type { DeviceListItem, DeviceStateField } from '../api/deviceApi'
import BatteryTag from '../components/BatteryTag'

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
    alarms,
    loadAlarms,
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

  // 设备实时状态缓存
  const [realtimeCache, setRealtimeCache] = useState<DeviceRealtimeCache>({})
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
    if (isAuthenticated) loadAlarms()
  }, [fetchDevices, isAuthenticated, loadAlarms])

  // ── 加载设备实时状态（每个设备） ──
  const fetchDeviceRealtime = useCallback(async (deviceId: number | string) => {
    const idStr = String(deviceId)
    setRealtimeCache(prev => ({
      ...prev,
      [idStr]: { ...prev[idStr], fields: {}, raw: {}, loading: true, lastUpdated: 0 },
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
    return '#FF3530'
  }

  // 电源开关切换（本地 UI 状态）
  const togglePower = (deviceId: string | number, e: React.MouseEvent) => {
    e.stopPropagation()
    const idStr = String(deviceId)
    setPowerStates(prev => ({ ...prev, [idStr]: !(prev[idStr] ?? true) }))
  }

  // 是否有低电量设备（用于最新通知 Banner）
  const lowBatteryDevice = devices.find(d => {
    const soc = getDeviceNum(d.id, 'soc')
    return soc !== null && soc < 30
  })

  // ── BatteryTag 电量标签（横式电池 + 充电闪电 + 百分比 / Disconnected） ──
  const BatteryTag = ({ level, connected, charging }: { level: number; connected: boolean; charging: boolean }) => {
    if (!connected) {
      return (
        <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#4B1512] text-[#FF3530] text-body-md font-semibold">
          Disconnected
        </span>
      )
    }
    const color = getTagColor(level)
    const fill = Math.max(4, Math.min(100, level))
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3A3A3A]">
        {/* 横式电池 */}
        <span className="relative inline-flex items-center">
          <span className="relative w-[22px] h-[12px] rounded-[3px] border-s flex items-center" style={{ borderColor: '#8C8C8C' }}>
            <span
              className="absolute left-[1.5px] top-[1.5px] bottom-[1.5px] rounded-[1.5px]"
              style={{ width: `calc(${fill}% - 3px)`, backgroundColor: color }}
            />
            {charging && (
              <Zap size={9} className="relative mx-auto text-white" fill="currentColor" strokeWidth={0} />
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
          <WifiOff size={48} className="text-[#636366] mb-3 opacity-40" />
          <p className="text-sm font-medium text-[#A0A0A5] mb-1">Not signed in</p>
          <p className="text-xs text-[#636366] mb-6 text-center">Sign in to view your devices and real-time parameters</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-[#01D6BE] rounded-full text-[#000000] text-[13px] font-semibold"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[#141414] overflow-hidden">
      {/* Guest Sign In Banner */}
      {isGuest && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-[rgba(1,214,190,0.1)] border-b border-[rgba(1,214,190,0.15)] px-5 py-2.5 safe-area-top"
        >
          <div className="flex items-center justify-between">
            <p className="text-label text-[#AEAEB2]">
              Browsing as <span className="text-[#01D6BE] font-medium">Guest</span>
            </p>
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#01D6BE] rounded-full text-[#000000] text-caption font-semibold active:scale-[0.97] transition-transform"
            >
              Sign In <ChevronRight size={12} />
            </button>
          </div>
        </motion.div>
      )}

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
              className="w-11 h-11 rounded-full bg-[#262626] flex items-center justify-center text-white hover:bg-[#333333] transition-colors active:scale-95"
            >
              <Plus size={20} />
            </button>
            <button
              onClick={() => navigate('/notifications')}
              aria-label="Notifications"
              className="relative w-11 h-11 rounded-full bg-[#262626] flex items-center justify-center text-white hover:bg-[#333333] transition-colors active:scale-95"
            >
              <Bell size={20} />
              {(lowBatteryDevice || devices.some(d => d.isAlarmed)) && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#FF3530] border-2 border-[#141414]" />
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
              <span className="text-label text-[#FF3B30] flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-[#FF3B30]">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
        {/* PRD v1.1 §4.2.5: 最新通知 Banner */}
        {alarms.length > 0 && (() => {
          const latest = alarms[0]
          const levelColor: Record<string, string> = {
            critical: '#FF3B30', major: '#FF3B30', warning: '#FF9500', minor: '#FF9500', info: '#01D6BE',
          }
          const dot = levelColor[latest.alarmLevel] || '#01D6BE'
          return (
            <motion.button
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => navigate('/notifications')}
              className="mb-3 w-full px-4 py-3 rounded-[20px] bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.18)] flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
              aria-label="View latest notification"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${dot}26` }}>
                <AlertTriangle size={16} style={{ color: dot }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-label font-semibold text-[#FFFFFF] truncate">
                  {latest.alarmMessage || `Alarm ${latest.alarmCode}`}
                </p>
                <p className="text-xs text-[#A0A0A5] mt-0.5">
                  {latest.deviceName ? `${latest.deviceName} · ` : ''}{latest.createdAt ? new Date(latest.createdAt).toLocaleString() : ''}
                </p>
              </div>
              <ChevronRight size={16} className="text-[#636366] flex-shrink-0" />
            </motion.button>
          )
        })()}

        {/* Low Battery Warning Banner */}
        {devices.some(d => {
          const soc = getDeviceNum(d.id, 'soc')
          return soc !== null && soc < 20
        }) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 px-4 py-3 rounded-[20px] bg-[rgba(255,59,48,0.12)] border border-[rgba(255,59,48,0.2)] flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-[#FF3B30] flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#FF3B30]">Low Battery</p>
              {devices.filter(d => {
                const soc = getDeviceNum(d.id, 'soc')
                return soc !== null && soc < 20
              }).slice(0, 1).map(d => (
                <p key={d.id} className="text-caption text-[#FF3B30] opacity-80 truncate">
                  {d.name} — Estimated remaining time: {getDeviceField(String(d.id), 'remainingTime') || 'calculating...'}
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
              const soc = getDeviceNum(device.id, 'soc') ?? 0
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
                  {/* Top row: SOC + Online status + Refresh */}
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-display font-extrabold ${getBatteryColor(soc)} leading-none`}>
                      {soc}
                      <span className="text-body-lg font-bold">%</span>
                    </span>
                    <div className="flex items-center gap-1">
                      {/* Online indicator */}
                      {device.isOnline ? (
                        <Wifi size={12} className="text-[#34C759]" />
                      ) : (
                        <WifiOff size={12} className="text-[#636366]" />
                      )}
                      {/* Refresh single device */}
                      <button
                        onClick={(e) => handleRefreshDevice(device.id, e)}
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                      >
                        <RefreshCw
                          size={11}
                          className={`text-[#A0A0A5] ${refreshingId === String(device.id) ? 'animate-spin' : ''}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Charging indicator */}
                  {isCharging && (
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingDown size={10} className="text-[#34C759]" />
                      <span className="text-xs text-[#34C759] font-medium">Charging {Math.abs(batteryPower)}W</span>
                    </div>
                  )}

                  {/* Device Icon + Name */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-body-md">{getDeviceIcon(device.deviceSortKey)}</span>
                    <span className="text-[13px] font-semibold text-[#FFFFFF] truncate">
                      {device.name}
                    </span>
                  </div>

                  {/* Model / SN / Station */}
                  <div className="text-caption text-[#A0A0A5] truncate">
                    {device.gatherProtocolNameDisplay || device.model || 'Power Station'}
                  </div>

                  {/* Bottom: temperature + mode */}
                  <div className="flex items-center gap-2 mt-1.5">
                    {batteryTemp !== null && (
                      <span className="text-xs text-[#A0A0A5] flex items-center gap-0.5">
                        <Thermometer size={9} />
                        {batteryTemp}°C
                      </span>
                    )}
                    {workMode !== null && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-[rgba(1,214,190,0.1)] text-[#01D6BE]">
                        {getWorkModeLabel(workMode)}
                      </span>
                    )}
                    <BatteryTag level={soc} connected={connected} charging={isCharging} />
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
          /* List Layout */
          <div className="flex flex-col gap-2.5">
            {devices.map((device, index) => {
              const soc = getDeviceNum(device.id, 'soc') ?? 0
              const batteryPower = getDeviceNum(device.id, 'batteryPower')
              const outputPower = getDeviceNum(device.id, 'outputPower')
              const batteryTemp = getDeviceNum(device.id, 'batteryTemp')
              const workMode = getDeviceNum(device.id, 'workMode')
              const isCharging = batteryPower !== null && batteryPower > 0

              return (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
                  onClick={() => handleDeviceClick(device)}
                  className="flex items-center gap-3.5 p-4 bg-[#262626] rounded-[18px] cursor-pointer active:bg-[#333333] transition-all duration-200"
                >
                  {/* Left: Icon */}
                  <div className="w-11 h-11 rounded-l bg-[rgba(1,214,190,0.12)] flex items-center justify-center flex-shrink-0 text-lg relative">
                    {getDeviceIcon(device.deviceSortKey)}
                    {/* Online dot */}
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#262626] ${device.isOnline ? 'bg-[#34C759]' : 'bg-[#636366]'}`} />
                  </div>

                  {/* Middle: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body-md font-semibold text-[#FFFFFF] truncate">{device.name}</span>
                      {!device.isOnline && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[rgba(72,72,74,0.3)] text-[#636366]">Offline</span>}
                      {device.isAlarmed && <AlertTriangle size={12} className="text-[#FF3B30] flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-[#A0A0A5]">{device.gatherProtocolNameDisplay || device.model || 'Power Station'}</span>
                      {device.serialNumber && (
                        <span className="text-xs text-[#636366] hidden sm:inline">SN: {device.serialNumber.slice(-8)}</span>
                      )}
                    </div>

                    {/* Parameter badges - PRD v1.1 §4.2.3: Battery Tag 水平电池图标 */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <BatteryTag level={soc} isCharging={isCharging} size="sm" />
                      {batteryPower !== null && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[rgba(52,199,89,0.1)] text-[#34C759]">
                          {isCharging ? `${Math.abs(batteryPower)}W in` : `${Math.abs(batteryPower)}W out`}
                        </span>
                      )}
                      {outputPower !== null && outputPower > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[rgba(255,149,0,0.1)] text-[#FF9500]">
                          Out {outputPower}W
                        </span>
                      )}
                      {batteryTemp !== null && (
                        <span className="text-xs text-[#A0A0A5] flex items-center gap-0.5">
                          <Thermometer size={9} /> {batteryTemp}°C
                        </span>
                      )}
                      {workMode !== null && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[rgba(1,214,190,0.1)] text-[#01D6BE]">
                          {getWorkModeLabel(workMode)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Refresh + Chevron */}
                  <div className="flex flex-col items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleRefreshDevice(device.id, e)}
                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                    >
                      <RefreshCw
                        size={13}
                        className={`text-[#A0A0A5] ${refreshingId === String(device.id) ? 'animate-spin' : ''}`}
                      />
                    </button>
                    <ChevronRight size={16} className="text-[#636366]" />
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Empty State */}
        {!deviceLoading && devices.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
            <Zap size={48} className="mx-auto mb-3 text-[#636366] opacity-30" />
            <p className="text-sm font-medium text-[#A0A0A5] mb-1">No devices found</p>
            <p className="text-xs text-[#636366] mb-1">
              {error ? 'Check your network connection' : 'Tap + to add your first device'}
            </p>
            {error ? (
              <button onClick={fetchDevices} className="px-6 py-3 rounded-m border-m border-primary text-primary text-body-lg font-semibold flex items-center gap-2 active:scale-95 transition-transform">
                <RefreshCw size={18} /> Retry
              </button>
            ) : (
              <button onClick={() => setShowAddModal(true)} className="px-7 py-3.5 rounded-m border-m border-primary text-primary text-body-lg font-semibold flex items-center gap-2 active:scale-95 transition-transform">
                <Plus size={20} /> Add Device
              </button>
            )}
          </motion.div>
        )}
      </div>

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
                  <div className="w-10 h-10 rounded-l bg-[rgba(1,214,190,0.12)] flex items-center justify-center text-lg">
                    {getDeviceIcon(showDeviceParams.deviceSortKey)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#FFFFFF]">{showDeviceParams.name}</h3>
                    <div className="text-caption text-[#A0A0A5]">{showDeviceParams.gatherProtocolNameDisplay || showDeviceParams.model}</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowDeviceParams(null)}
                  className="w-8 h-8 rounded-full bg-[#333333] flex items-center justify-center text-[#A0A0A5]"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto scrollbar-hide p-5 space-y-4">
                {/* Device Meta Info */}
                <div className="space-y-3">
                  <h4 className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase">Device Info</h4>
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
                            <Icon size={14} className="text-[#636366]" />
                            <span className="text-[13px] text-[#A0A0A5]">{row.label}</span>
                          </div>
                          <span className="text-[13px] font-medium text-[#FFFFFF] truncate max-w-[180px]" style={row.valueColor ? { color: row.valueColor } : {}}>
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
                    <h4 className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase">Real-Time Parameters</h4>
                    {realtimeCache[String(showDeviceParams.id)]?.loading ? (
                      <RefreshCw size={12} className="text-[#01D6BE] animate-spin" />
                    ) : (
                      <button
                        onClick={() => fetchDeviceRealtime(showDeviceParams.id)}
                        className="text-caption text-[#01D6BE] flex items-center gap-1"
                      >
                        <RefreshCw size={11} /> Refresh
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { label: 'SOC', value: `${getDeviceNum(showDeviceParams.id, 'soc') ?? '--'}%`, icon: Battery, color: '#34C759' },
                      { label: 'Battery', value: `${getDeviceNum(showDeviceParams.id, 'batteryPower') ?? '--'}W`, icon: TrendingDown, color: '#01D6BE' },
                      { label: 'AC Power', value: `${getDeviceNum(showDeviceParams.id, 'acPower') ?? '--'}W`, icon: Zap, color: '#01D6BE' },
                      { label: 'Solar', value: `${getDeviceNum(showDeviceParams.id, 'solarPower') ?? '--'}W`, icon: Sun, color: '#FF9500' },
                      { label: 'Output', value: `${getDeviceNum(showDeviceParams.id, 'outputPower') ?? '--'}W`, icon: TrendingUp, color: '#A0A0A5' },
                      { label: 'Temp', value: `${getDeviceNum(showDeviceParams.id, 'batteryTemp') ?? '--'}°C`, icon: Thermometer, color: '#FF9500' },
                    ].map((item) => {
                      const Icon = item.icon
                      return (
                        <div key={item.label} className="bg-[#141414] rounded-l p-3 flex flex-col items-center">
                          <Icon size={14} style={{ color: item.color }} className="mb-1.5" />
                          <div className="text-body-md font-bold text-[#FFFFFF]">{item.value}</div>
                          <div className="text-[9px] text-[#A0A0A5] mt-0.5">{item.label}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Port Status */}
                <div className="space-y-3">
                  <h4 className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase">Port Controls</h4>
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
                          <span className="text-[13px] text-[#FFFFFF]">{port.label}</span>
                          <span className={`text-label px-2 py-0.5 rounded-full font-medium ${
                            isEnabled ? 'bg-[rgba(52,199,89,0.15)] text-[#34C759]' : 'bg-[rgba(255,255,255,0.06)] text-[#636366]'
                          }`}>
                            {isEnabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="bg-[#141414] rounded-l px-4 py-3 flex items-center justify-between">
                    <span className="text-[13px] text-[#FFFFFF]">Work Mode</span>
                    <span className="text-label px-2 py-0.5 rounded-full bg-[rgba(1,214,190,0.1)] text-[#01D6BE] font-medium">
                      {getWorkModeLabel(getDeviceNum(showDeviceParams.id, 'workMode'))}
                    </span>
                  </div>
                </div>

                {/* All API Fields (for debugging) */}
                {realtimeCache[String(showDeviceParams.id)]?.fields && (
                  <div className="space-y-3">
                    <h4 className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase">All Parameters</h4>
                    <div className="bg-[#141414] rounded-l divide-y divide-[rgba(255,255,255,0.04)]">
                      {Object.entries(realtimeCache[String(showDeviceParams.id)].fields)
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([key, field]) => (
                          <div key={key} className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-label text-[#A0A0A5] font-mono">{field.name || key}</span>
                            <span className="text-label text-[#FFFFFF] font-mono">
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
                  className="w-full py-3 rounded-l bg-[#01D6BE] text-[#000000] text-body-md font-semibold flex items-center justify-center gap-2"
                >
                  View Full Dashboard <ChevronRight size={16} />
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
                    className="flex items-center gap-4 p-4 bg-[#333333] rounded-l text-left transition-all">
                    <span className="text-2xl">{opt.icon}</span>
                    <div className="flex-1">
                      <div className="text-body-md font-semibold" style={{ color: opt.color }}>{opt.label}</div>
                      <div className="text-caption text-[#A0A0A5] mt-0.5">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAddModal(false)}
                className="w-full mt-4 h-11 rounded-l bg-[rgba(255,255,255,0.06)] text-[#A0A0A5] text-sm font-medium">
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
              className="w-full max-w-sm bg-[#262626] rounded-[24px] p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-[#FFFFFF]">Bluetooth Devices</h3>
                <button onClick={() => { setShowBleScan(false); setIsScanning(false); setScanError(null); setScannedDevices([]) }}
                  className="w-8 h-8 rounded-full bg-[#333333] flex items-center justify-center text-[#A0A0A5]">
                  <X size={18} />
                </button>
              </div>
              {isScanning && scannedDevices.length === 0 && !scanError && (
                <div className="flex flex-col items-center justify-center py-10">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 rounded-full border-2 border-[#01D6BE] border-t-transparent mb-4" />
                  <p className="text-body-md text-[#A0A0A5]">Scanning for devices...</p>
                </div>
              )}
              {scanError && (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-12 h-12 rounded-full bg-[rgba(255,59,48,0.15)] flex items-center justify-center mb-3">
                    <Bluetooth size={24} className="text-[#FF3B30]" />
                  </div>
                  <p className="text-body-md text-[#FF3B30] text-center mb-1">Scan Failed</p>
                  <p className="text-label text-[#A0A0A5] text-center px-4">{scanError}</p>
                </div>
              )}
              {!isScanning && !scanError && scannedDevices.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-12 h-12 rounded-full bg-[#333333] flex items-center justify-center mb-3">
                    <Bluetooth size={24} className="text-[#A0A0A5]" />
                  </div>
                  <p className="text-body-md text-[#A0A0A5]">No devices found</p>
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
                className="w-9 h-9 rounded-full bg-[#333333] flex items-center justify-center text-[#FFFFFF]">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center px-5">
              {!qrResult ? (
                <>
                  <div className="relative w-64 h-64 mb-6">
                    <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover rounded-[20px]" playsInline muted />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute inset-0 border-2 border-[#01D6BE] rounded-[20px]">
                      {([['top-0 left-0', 'border-t-4 border-l-4'], ['top-0 right-0', 'border-t-4 border-r-4'], ['bottom-0 left-0', 'border-b-4 border-l-4'], ['bottom-0 right-0', 'border-b-4 border-r-4']] as const).map(([pos, border], i) => (
                        <div key={i} className={`absolute w-8 h-8 ${pos} ${border} border-[#01D6BE] rounded-sm`} />
                      ))}
                    </div>
                    {!qrScanning && !qrError && (
                      <div className="absolute inset-0 bg-[#262626] rounded-[20px] flex items-center justify-center">
                        <QrCode size={64} className="text-[#636366]" />
                      </div>
                    )}
                  </div>
                  {qrError ? (
                    <div className="text-center">
                      <p className="text-body-md text-[#FF3B30] mb-2">{qrError}</p>
                      <button onClick={startQrScan} className="px-5 py-2 bg-[#01D6BE] rounded-full text-[#000000] text-[13px] font-semibold">Retry</button>
                    </div>
                  ) : (
                    <>
                      <p className="text-[15px] font-semibold text-[#FFFFFF] mb-1">Point camera at QR code</p>
                      <p className="text-label text-[#A0A0A5]">The code will be scanned automatically</p>
                    </>
                  )}
                </>
              ) : (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-sm bg-[#262626] rounded-[24px] p-6">
                  <div className="w-16 h-16 rounded-full bg-[rgba(52,199,89,0.15)] flex items-center justify-center mx-auto mb-4">
                    <QrCode size={32} className="text-[#34C759]" />
                  </div>
                  <h4 className="text-lg font-bold text-[#FFFFFF] text-center mb-2">QR Code Scanned!</h4>
                  <div className="bg-[#333333] rounded-l p-4 mb-5">
                    <pre className="text-label text-[#A0A0A5] whitespace-pre-wrap break-all">{qrResult}</pre>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setQrResult(null); startQrScan() }} className="flex-1 h-11 rounded-l bg-[#333333] text-[#FFFFFF] text-body-md font-medium">Scan Again</button>
                    <button onClick={() => { stopQrScan(); setShowQrScan(false); setQrResult(null); setQrError(null) }} className="flex-1 h-11 rounded-l bg-[#01D6BE] text-[#000000] text-body-md font-semibold">Add Device</button>
                  </div>
                </motion.div>
              )}
            </div>
            <div className="p-5 safe-area-bottom text-center">
              <p className="text-caption text-[#636366]">Make sure the QR code is well-lit and in focus</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Add Device Modal */}
      <AnimatePresence>
        {showManualAdd && (
          <motion.div initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }}
            className="fixed inset-0 z-50 bg-[#262626] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4">
              <button onClick={() => setShowManualAdd(false)} className="w-9 h-9 rounded-full bg-[#333333] flex items-center justify-center text-[#FFFFFF]">
                <X size={20} />
              </button>
              <h3 className="text-base font-bold text-[#FFFFFF]">Add Device Manually</h3>
              <div className="w-9" />
            </div>
            <div className="flex-1 p-5">
              <p className="text-[13px] text-[#A0A0A5] mb-6">Manual device entry is under development. Please use Bluetooth Scan or QR Code to add devices.</p>
              <button onClick={() => setShowManualAdd(false)} className="w-full py-3 rounded-l bg-[rgba(1,214,190,0.12)] text-[#01D6BE] font-semibold text-[13px]">OK</button>
            </div>
          </motion.div>
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
