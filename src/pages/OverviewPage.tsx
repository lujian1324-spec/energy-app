import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useCountUp } from '../hooks/useCountUp'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Sun,
  Zap,
  TrendingUp,
  TrendingDown,
  X,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Info,
  ChevronDown,
  ChevronLeft,
  Battery,
  Settings,
  Moon,
  Shield,
  Leaf,
  AlertTriangle,
  CircleDot,
  Thermometer,
  RefreshCw,
  Wifi,
  WifiOff,
  Calendar,
  Sliders,
  ChevronRight,
  Bluetooth,
} from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import ToggleSwitch from '../components/ToggleSwitch'
import RealTimePowerChart from '../components/RealTimePowerChart'
import { DataSourceTag, DemoBanner, type DataSource } from '../components/DataTrust'
import {
  formatTemp,
  translateEnergyFlowGroupLabel,
  translateEnergyFlowFieldLabel,
  translateEnergyFlowFieldValue,
  translateEnergyFlowUnit,
} from '../utils/localization'
import DeviceDetailPage from './DeviceDetailPage'
import { useDeviceStore } from '../stores/deviceStore'
import { usePowerStationStore } from '../stores/powerStationStore'
import { mapFieldsToRealtime, mapFiringAlarms } from '../api/deviceApi'
import { useLiveDeviceStatus } from '../hooks/useLiveDeviceStatus'
import {
  scanForDirectDevices,
  connectDirectTo,
  connectDirectWeb,
  disconnectDirect,
  getDirectManager,
  supportsDeviceListScan,
  setAcOutputBle,
  setDcOutputBle,
  setSleepPowerBle,
  type ProvisionScanDevice,
} from '../protocols/bleDirect'
import type { IBleProvisionManager } from '../protocols/bleProvision'
import { isApiSuccess } from '../utils/apiClient'
import { loadRatedParams } from '../db/powerflowDB'
import { describeAlarmCode } from '../utils/alarmText'
import PullToRefresh from '../components/PullToRefresh'
import type { DeviceAlert } from '../types'
import { detectOutageFromFields } from '../utils/powerOutageNotification'
import { batteryTimeLabel } from '../utils/batteryTime'
import {
  showPowerOutageNotification,
  showSolarChargingNotification,
  getNotificationPermission,
  requestNotificationPermission,
  getIOSPushStatus,
  isIOS
} from '../utils/pushNotification'

export default function OverviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // ─── 真实数据源：deviceStore ───
  const {
    devices,
    selectedDeviceId,
    selectedDeviceDetails,
    selectedDeviceState,
    stateLoading,
    selectDevice,
    controlDevice,
    loadAlarms,
    alarms,
    alarmTotal,
    alarmLoading,
    dismissAlarm,
    loadDeviceState,
    loadDeviceDetails,
    energyFlow,
    energyFlowLoading,
    energyFlowError,
    loadEnergyFlow,
  } = useDeviceStore()

  const { settings } = usePowerStationStore()

  // UI state
  const [showNotifications, setShowNotifications] = useState(false)
  const [showDisplaySettings, setShowDisplaySettings] = useState(false)
  const [showLockScreenAlert, setShowLockScreenAlert] = useState(false)
  const [showAlerts, setShowAlerts] = useState(false)
  const [alertList, setAlertList] = useState<DeviceAlert[]>([])
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default')
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false)
  const [dismissingAlarmId, setDismissingAlarmId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [showDeviceDetail, setShowDeviceDetail] = useState(false)
  const [controlLoading, setControlLoading] = useState<string | null>(null)

  // ─── 蓝牙直连模式（手动切换，云端不可达/纯本地场景）───
  const [bleManager, setBleManager] = useState<IBleProvisionManager | null>(null)
  const [directConnecting, setDirectConnecting] = useState(false)
  const [directError, setDirectError] = useState<string | null>(null)
  const [directPickList, setDirectPickList] = useState<ProvisionScanDevice[]>([])
  // 直连模式下端口开关是"最后一次动作"的乐观本地态，不是从设备读回的真值——
  // 原始 Modbus 接口没有单独的端口状态读取；READ_ALL_STATUS 不含端口位。
  const [directAcOn, setDirectAcOn] = useState(false)
  const [directDcOn, setDirectDcOn] = useState(false)
  const bleManagerRef = useRef<IBleProvisionManager | null>(null)
  useEffect(() => { bleManagerRef.current = bleManager }, [bleManager])
  // 离开页面时自动断开，不把设备遗留在直连会话中
  useEffect(() => {
    return () => { if (bleManagerRef.current) disconnectDirect().catch(() => { /* ignore */ }) }
  }, [])

  const handleConnectDirect = async () => {
    setDirectError(null)
    setDirectConnecting(true)
    setDirectPickList([])
    try {
      if (supportsDeviceListScan()) {
        const found: ProvisionScanDevice[] = []
        const seen = new Set<string>()
        const manager = await scanForDirectDevices((d) => {
          if (seen.has(d.deviceId)) return
          seen.add(d.deviceId)
          found.push(d)
        })
        await new Promise(r => setTimeout(r, 4000))
        await manager.stopScan()
        if (found.length === 0) {
          setDirectError('No nearby Sierro device found')
        } else if (found.length === 1) {
          await connectDirectTo(found[0].deviceId, found[0].name)
          setBleManager(manager)
        } else {
          setDirectPickList(found)
        }
      } else {
        // Web: 系统蓝牙选择器（单设备，无法预先列表展示）
        await connectDirectWeb()
        setBleManager(getDirectManager())
      }
    } catch (err) {
      setDirectError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setDirectConnecting(false)
    }
  }

  const handlePickDirectDevice = async (d: ProvisionScanDevice) => {
    setDirectError(null)
    setDirectConnecting(true)
    try {
      await connectDirectTo(d.deviceId, d.name)
      setBleManager(getDirectManager())
      setDirectPickList([])
    } catch (err) {
      setDirectError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setDirectConnecting(false)
    }
  }

  const handleDisconnectDirect = async () => {
    await disconnectDirect()
    setBleManager(null)
    setDirectPickList([])
    setDirectError(null)
    setDirectAcOn(false)
    setDirectDcOn(false)
  }

  // PRD v1.1 §8.2: Demo Mode 检测 (无设备时或离线时)
  const [isNetworkOnline, setIsNetworkOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setIsNetworkOnline(true)
    const down = () => setIsNetworkOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  const isDemoMode = !isNetworkOnline

  const [displayConfig, setDisplayConfig] = useState({
    showBatteryRing: true,
    showSolarInput: true,
    showTimeToFull: true,
    showPortStatus: true,
  })

  // ─── 从 URL 初始化选中设备 + 加载状态 + 告警 ───
  useEffect(() => {
    if (id) {
      selectDevice(id)
      loadAlarms(id)
    }
  }, [id])

  // ─── 拦截浏览器/系统返回手势（左滑）→ 始终回到 Device 列表页，避免回退到
  //     任意历史页面导致的闪烁。压入一个占位历史项，popstate 触发时直接跳转 ───
  const backToDevices = useCallback(() => {
    navigate('/devices', { replace: true })
  }, [navigate])

  useEffect(() => {
    const guardedHref = window.location.href
    window.history.pushState(null, '', guardedHref)
    // 只有 popstate 触发时地址仍停留在本页，才是真实的返回手势（弹出的是我们
    // 自己占位的历史项）。若地址已经变了（例如推送通知深链等外部导航触发的
    // 派生 popstate），说明不是用户返回手势，交给路由正常处理，不要抢先跳转。
    const onPopState = () => {
      if (window.location.href === guardedHref) backToDevices()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [backToDevices])

  // ─── 停留本页时的实时状态：速报模式优先，透传轮询回退（useLiveDeviceStatus）───

  // ─── 每 30 秒自动刷新设备状态 ───
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (selectedDeviceId) {
      pollRef.current = setInterval(() => {
        if (document.visibilityState === 'hidden') return
        loadDeviceState(selectedDeviceId)
        loadDeviceDetails(selectedDeviceId)  // 同时刷新 isOnline，避免显示卡在离线/"-"
      }, 30000)
      return () => {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }
  }, [selectedDeviceId])

  // ─── 每 60 秒轮询告警列表 ───
  const alarmPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (alarmPollRef.current) clearInterval(alarmPollRef.current)
    if (selectedDeviceId) {
      // 立即加载一次
      loadAlarms(selectedDeviceId)
      alarmPollRef.current = setInterval(() => {
        if (document.visibilityState === 'hidden') return
        loadAlarms(selectedDeviceId)
      }, 60000)
      return () => {
        if (alarmPollRef.current) clearInterval(alarmPollRef.current)
      }
    }
  }, [selectedDeviceId])

  // ─── 能量流动分组折叠状态（组件级，避免在 .map() 中使用 useState）───
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // ─── 每 60 秒轮询能量流动数据 ───
  const energyFlowPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (energyFlowPollRef.current) clearInterval(energyFlowPollRef.current)
    if (selectedDeviceId) {
      loadEnergyFlow(selectedDeviceId)
      energyFlowPollRef.current = setInterval(() => {
        if (document.visibilityState === 'hidden') return
        loadEnergyFlow(selectedDeviceId)
      }, 60000)
      return () => {
        if (energyFlowPollRef.current) clearInterval(energyFlowPollRef.current)
      }
    }
  }, [selectedDeviceId])

  // ─── 监听告警变化 ───
  useEffect(() => {
    if (selectedDeviceState?.firingAlarms && selectedDeviceState.firingAlarms.length > 0) {
      setAlertList(mapFiringAlarms(selectedDeviceState.firingAlarms))
    }
  }, [selectedDeviceState?.firingAlarms])

  // ─── 映射真实设备状态 ───
  const realtime = useMemo(() => {
    if (!selectedDeviceState?.fields) return null
    return mapFieldsToRealtime(selectedDeviceState.fields)
  }, [selectedDeviceState])

  // ─── 实时状态：直连模式优先于云端；否则速报模式优先（云端 5s 拉取），透传轮询回退 ───
  const { live: livePt, source: liveSource } = useLiveDeviceStatus(selectedDeviceId, true, bleManager)

  // ─── 计算显示值：优先透传实时值 livePt，回退到云端 selectedDeviceState ───
  const remainingBatteryCapacity = livePt?.soc ?? realtime?.remainingBatteryCapacity ?? 0
  const batteryPower = livePt?.batteryPower ?? realtime?.batteryPower ?? 0
  const acPower = livePt?.acPower ?? realtime?.acPower ?? 0
  const solarPower = livePt?.solarPower ?? realtime?.solarPower ?? 0
  const outputPower = livePt?.outputPower ?? realtime?.outputPower ?? 0
  const batteryTemp = livePt?.batteryTemp ?? realtime?.batteryTemp ?? 0
  const currentDeviceListItem = devices.find(d => String(d.id) === selectedDeviceId)

  // ─── 额定容量（Wh）= acInvOutputPower × 2，与 Device Info 页 Rated Capacity 同源 ───
  const [batteryCapacityWh, setBatteryCapacityWh] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (!selectedDeviceId) { setBatteryCapacityWh(undefined); return }
    loadRatedParams(selectedDeviceId)
      .then(p => setBatteryCapacityWh(p ? p.acInvOutputPower * 2 : undefined))
      .catch(() => setBatteryCapacityWh(undefined))
  }, [selectedDeviceId])

  // ─── 预估剩余时间（统一口径，见 utils/batteryTime，与 DeviceMonitorPage 一致）───
  const batteryTimeStr = useMemo(() => batteryTimeLabel({
    acPower, solarPower, outputPower,
    soc: remainingBatteryCapacity,
    capacityWh: batteryCapacityWh,
    isCharging: batteryPower > 0,
  }), [acPower, solarPower, outputPower, remainingBatteryCapacity, batteryCapacityWh, batteryPower])
  const acOut1Enable = realtime?.acOut1Enable ?? false
  const acOut2Enable = realtime?.acOut2Enable ?? false
  const usbOut1Enable = realtime?.usbOut1Enable ?? false
  const sleepMode = realtime?.sleepMode ?? false
  const workMode = realtime?.workMode ?? 0
  const isCharging = batteryPower > 0
  const deviceName = selectedDeviceDetails?.name ?? currentDeviceListItem?.name ?? 'Device'
  // 在线判定：只有"透传"往返成功才证明设备可达（能通说明在线）。
  // 速报模式的 livePt 来自云端 /state/latest，设备离线后仍会返回最后一帧旧数据，
  // 不能据此判在线——那样会把断网设备显示成 Connected 且冻结旧读数。此时以云端
  // isOnline 权威标志为准（30s 轮询刷新），离线则显示 Disconnected 与 "-"。
  const isOnline =
    (liveSource === 'ble' && livePt != null) ||
    (selectedDeviceDetails?.isOnline ?? false) ||
    (liveSource === 'passthrough' && livePt != null)

  // PRD v1.1 §8: 数据来源标识 — 直连 BLE 优先，其次云端透传/速报/Demo
  const dataSource: DataSource = bleManager
    ? 'ble'
    : isDemoMode
      ? 'demo'
      : liveSource === 'passthrough'
        ? 'modbus'
        : 'cloud'

  // ─── CountUp 动画：功率数值平滑过渡 ───
  const animatedAcPower = useCountUp(isOnline ? acPower : 0)
  const animatedSolarPower = useCountUp(isOnline ? solarPower : 0)
  const animatedOutputPower = useCountUp(isOnline ? outputPower : 0)

  // Quick Controls local state (synced with real data)
  const [localSleepMode, setLocalSleepMode] = useState(sleepMode)
  const [activeMode, setActiveMode] = useState<'backup' | 'saving'>(workMode === 2 ? 'saving' : 'backup')

  // Sync local state with real data changes
  useEffect(() => {
    setLocalSleepMode(sleepMode)
    setActiveMode(workMode === 2 ? 'saving' : 'backup')
  }, [sleepMode, workMode])

  // ─── 设备控制写入 ───
  // 直连模式：Sleep Mode 是"立即下发一次目标功率"（寄存器 0x0085），不是完整的时间窗口
  // 调度（那依赖云端保存的排程和持续巡检，不适合一次性 BLE 会话）。
  const handleToggleSleepMode = async () => {
    if (!selectedDeviceId) return
    const newValue = !localSleepMode
    setLocalSleepMode(newValue)
    setControlLoading('sleepMode')
    try {
      if (bleManager) {
        const model = currentDeviceListItem?.model ?? 'Sierro 1000'
        const ok = await setSleepPowerBle(bleManager, model, newValue)
        if (!ok) throw new Error('BLE write failed')
      } else {
        await controlDevice(selectedDeviceId, 'sleepMode', newValue)
      }
    } catch {
      setLocalSleepMode(!newValue) // rollback
    } finally {
      setControlLoading(null)
    }
  }

  const handleSetWorkMode = async (mode: 'backup' | 'saving') => {
    if (!selectedDeviceId) return
    setActiveMode(mode)
    setControlLoading('workMode')
    try {
      await controlDevice(selectedDeviceId, 'workMode', mode === 'saving' ? 2 : 0)
    } catch {
      setActiveMode(mode === 'saving' ? 'backup' : 'saving') // rollback
    } finally {
      setControlLoading(null)
    }
  }

  // ─── 手动刷新（下拉刷新 / Demo 重试）：拉取 AC/Solar/Output 等实时状态 + 在线状态 ───
  const handleRefresh = async () => {
    if (!selectedDeviceId) return
    await Promise.all([
      loadDeviceState(selectedDeviceId),
      loadDeviceDetails(selectedDeviceId),
    ])
  }

  // ─── Notifications permission ───
  // Re-read on mount AND whenever the tab regains focus (user may have granted
  // permission in SettingPage while this page was in the background).
  useEffect(() => {
    const syncPermission = () => setPushPermission(getNotificationPermission())
    syncPermission()
    if (isIOS()) {
      const iosStatus = getIOSPushStatus()
      console.log('[OverviewPage] iOS Push Status:', iosStatus)
    }
    window.addEventListener('focus', syncPermission)
    return () => window.removeEventListener('focus', syncPermission)
  }, [])

  // ─── Click outside to close dropdown ───
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDeviceDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ─── 告警统计 ───
  const unreadAlarmCount = alarms.filter(a => !a.isProcessed).length
  const activeFiringCount = alertList.filter(a => !a.isProcessed).length

  // ─── 忽略告警（调用 API） ───
  const handleDismissAlarm = async (alarmId: string) => {
    setDismissingAlarmId(alarmId)
    try {
      await dismissAlarm(alarmId)
    } catch { /* handled in store */ }
    setDismissingAlarmId(null)
  }

  const handleSelectDevice = (deviceId: string) => {
    selectDevice(deviceId)
    setShowDeviceDropdown(false)
    navigate(`/device/${deviceId}`, { replace: true })
  }

  const displayItems = [
    { key: 'showBatteryRing', label: 'Battery Ring', desc: 'Main power ring gauge' },
    { key: 'showSolarInput', label: 'Solar Input', desc: 'Solar charging info' },
    { key: 'showTimeToFull', label: 'Time to Full', desc: 'Estimated full charge time' },
    { key: 'showPortStatus', label: 'Port Status', desc: 'Active port display' },
  ] as const

  // Real-Time Power chart lives in the shared <RealTimePowerChart> component
  // (see below) so Overview and Device Monitor plot the same metric the same way.

  // ─── Solar charging notification ───────────────────────────────────────────
  const prevSolarRef = useRef(0)
  useEffect(() => {
    const prev = prevSolarRef.current
    prevSolarRef.current = solarPower
    if (prev === 0 && solarPower > 50 && pushPermission === 'granted' && settings.pushSolarStatus) {
      showSolarChargingNotification(solarPower)
    }
  }, [solarPower, pushPermission, settings.pushSolarStatus])

  // ─── Low Battery notification ────────────────────────────────────────────────
  // 已迁移到全局 useLowBatteryMonitor（App 根部挂载，覆盖所有设备且不依赖本页），
  // 此处不再单独触发，避免重复通知。

  // ─── Power Outage notification ──────────────────────────────────────────────
  // Trigger on EITHER a total AC loss (voltage collapse) OR a mains/grid fault
  // reported by the device — including undervoltage (市电欠压), which keeps the
  // voltage low-but-nonzero and therefore never trips a simple "< 10V" check.
  const prevOutageRef = useRef(false)
  useEffect(() => {
    const acInputVoltage = realtime?.acInputVoltage
    const voltageCollapsed = acInputVoltage !== undefined && acInputVoltage < 10
    const { outage: faultOutage, reason } = detectOutageFromFields(selectedDeviceState?.fields)
    const isOutage = voltageCollapsed || faultOutage
    const wasOutage = prevOutageRef.current
    prevOutageRef.current = isOutage

    if (isOutage && !wasOutage) {
      console.log('[PowerOutage] detected', { acInputVoltage, voltageCollapsed, faultOutage, reason })
    }

    if (isOutage && !wasOutage && settings.pushNotifications && pushPermission === 'granted') {
      // Calculate remaining work hours: remainingBatteryCapacity / |netChargeW|
      const netChargeW = acPower + solarPower - outputPower
      const dischargeW = Math.abs(netChargeW)
      const remainingHours = dischargeW > 0
        ? (remainingBatteryCapacity / dischargeW).toFixed(1)
        : '—'
      const soc = Math.round(remainingBatteryCapacity)

      showPowerOutageNotification(soc, remainingHours)
    }
  }, [realtime?.acInputVoltage, selectedDeviceState?.fields, settings.pushNotifications, pushPermission,
      acPower, solarPower, outputPower, remainingBatteryCapacity])

  return (
    <div
      className={`h-full flex flex-col bg-ink-12 overflow-hidden relative pt-6 safe-area-top ${isDemoMode ? 'demo-mode' : ''}`}>
      {/* PRD v1.1 §8.2: DEMO MODE 顶部黄色横幅 */}
      <DemoBanner show={isDemoMode} onRetry={handleRefresh} />

      {/* Status bar spacer */}
      <div className="h-8 px-5 flex justify-between items-center opacity-0">
        <span className="text-[12px] text-ink-1 tnum">{remainingBatteryCapacity}%</span>
      </div>

      {/* Scrollable content — pull down to refresh AC/Solar/Output + online state */}
      <PullToRefresh onRefresh={handleRefresh}>
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-3">
          {/* Left: Back */}
          <button
            onClick={backToDevices}
            className="w-9 h-9 rounded-full bg-ink-10 flex items-center justify-center text-ink-1 hover:bg-ink-9 active:scale-[0.96] transition-[background-color,transform] duration-150 flex-shrink-0"
          >
            <ChevronLeft size={22} />
          </button>

          {/* Center: Device dropdown (from real API devices) */}
          <div className="relative flex-1 flex justify-center" ref={dropdownRef}>
            <button
              onClick={() => devices.length > 1 && setShowDeviceDropdown(!showDeviceDropdown)}
              className="flex flex-col items-center"
            >
              <div className="flex items-center gap-1.5">
                <h2 className="text-[18px] font-bold text-ink-1 max-w-[180px] truncate">
                  {deviceName}
                </h2>
                {/* PRD §4.1.2: chevron only when multiple devices */}
                {devices.length > 1 && (
                  <ChevronDown
                    size={16}
                    className={`text-ink-1 transition-transform duration-200 ${showDeviceDropdown ? 'rotate-180' : ''}`}
                  />
                )}
              </div>
              {/* PRD §4.1.1: Connected / Disconnected subtitle under device name */}
              <span className={`text-[12px] mt-0.5 ${isOnline ? 'text-ink-6' : 'text-danger'}`}>
                {isOnline ? 'Connected' : 'Disconnected'}
              </span>
              <DataSourceTag source={dataSource} className="mt-1" />
            </button>

            {/* Dropdown - real device list */}
            <AnimatePresence>
              {showDeviceDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-2 w-[260px] bg-ink-10 rounded-l border border-[rgba(1,214,190,0.15)] shadow-xl z-50 overflow-hidden"
                >
                  <div className="py-2">
                    <div className="px-3 py-2 text-[10px] text-ink-6 uppercase tracking-wider">
                      Select Device
                    </div>
                    {devices.map((device) => {
                      const isSelected = String(device.id) === selectedDeviceId
                      return (
                        <button
                          key={device.id}
                          onClick={() => handleSelectDevice(String(device.id))}
                          className={`w-full flex items-center gap-3 px-3 py-3 transition-colors
                            ${isSelected
                              ? 'bg-[rgba(1,214,190,0.1)]'
                              : 'hover:bg-[rgba(255,255,255,0.05)]'
                            }`}
                        >
                          <div className={`w-9 h-9 rounded-l flex items-center justify-center
                            ${isSelected
                              ? 'bg-[rgba(1,214,190,0.15)] text-primary'
                              : 'bg-[rgba(255,255,255,0.06)] text-ink-6'
                            }`}
                          >
                            <Battery size={18} />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <div className={`text-body-md font-semibold truncate ${isSelected ? 'text-primary' : 'text-ink-1'}`}>
                              {device.name}
                            </div>
                            <div className="text-[10px] text-ink-6 flex items-center gap-1.5">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${device.isOnline ? 'bg-success' : 'bg-ink-7'}`} />
                              {device.isOnline ? 'Online' : 'Offline'}
                              {device.model && ` · ${device.model}`}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Bluetooth Direct + Settings + Bell */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={bleManager ? handleDisconnectDirect : handleConnectDirect}
              disabled={directConnecting}
              title={bleManager ? 'Disconnect Bluetooth Direct' : 'Connect Bluetooth Direct'}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-50
                ${bleManager ? 'bg-[rgba(1,214,190,0.15)] text-primary' : 'bg-ink-10 text-ink-1 hover:bg-ink-9'}`}
            >
              {directConnecting ? <Loader2 size={16} className="animate-spin" /> : <Bluetooth size={18} />}
            </button>
            <button
              onClick={() => setShowDeviceDetail(true)}
              className="w-9 h-9 rounded-full bg-ink-10 flex items-center justify-center text-ink-1 hover:bg-ink-9 transition-colors"
            >
              <Settings size={18} />
            </button>
            <motion.button
              onClick={() => setShowAlerts(true)}
              whileTap={{ scale: 0.85 }}
              className="w-9 h-9 rounded-full bg-ink-10 flex items-center justify-center relative"
            >
              <Bell size={18} className="text-ink-1" />
              {(unreadAlarmCount > 0 || activeFiringCount > 0) && (
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger" />
              )}
            </motion.button>
          </div>
        </div>

        {/* Bluetooth Direct: nearby-device picker (native, multiple found) */}
        {directPickList.length > 0 && (
          <div className="mx-5 mb-3 bg-ink-10 rounded-l overflow-hidden">
            <div className="px-3 py-2 text-[10px] text-ink-6 uppercase tracking-wider">
              Nearby Sierro Devices
            </div>
            {directPickList.map(d => (
              <button
                key={d.deviceId}
                onClick={() => handlePickDirectDevice(d)}
                className="w-full flex items-center justify-between px-4 py-3 border-t border-[rgba(255,255,255,0.06)] text-left hover:bg-[rgba(255,255,255,0.05)]"
              >
                <span className="text-body-md text-ink-1">{d.name || 'Sierro Device'}</span>
                <span className="text-[10px] text-ink-6">{d.rssi != null ? `${d.rssi} dBm` : ''}</span>
              </button>
            ))}
          </div>
        )}

        {/* Bluetooth Direct: connection error */}
        {directError && (
          <div className="mx-5 mb-3 px-4 py-3 rounded-l bg-[rgba(255,59,48,0.1)] border border-[rgba(255,59,48,0.25)] text-[12px] text-danger">
            {directError}
          </div>
        )}

        {/* Loading state */}
        {stateLoading && !realtime ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-primary animate-spin" />
            <span className="ml-3 text-body-md text-ink-6">Loading device data...</span>
          </div>
        ) : (
          <>
            {/* Battery Hero — PRD §4.1.1: ring + Input/Output only */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-5 mb-4 bg-ink-10 rounded-l p-5"
            >
              <div className="flex justify-center mb-5">
                <BatteryRing
                  percentage={remainingBatteryCapacity}
                  isCharging={isCharging}
                  connected={isOnline}
                  timeToFull={batteryTimeStr}
                  timeRemaining={batteryTimeStr}
                  rawTimeLabel
                />
              </div>

              {/* Input (AC + Solar) / Output — PRD §4.1.1 / §4.1.3: three values */}
              <div className="flex items-stretch justify-center gap-3">
                {/* Input block: AC + Solar */}
                <div className="flex-1 max-w-[180px] rounded-l bg-[rgba(1,214,190,0.10)] border border-[rgba(1,214,190,0.25)] px-3 py-2">
                  <div className="flex items-center gap-1 mb-1.5">
                    <TrendingDown size={12} className="text-primary" />
                    <span className="text-[11px] font-medium text-primary">Input</span>
                  </div>
                  <div className="flex items-center justify-around">
                    <div className="flex flex-col items-center">
                      <span className="text-body-md font-bold text-ink-1 tnum">{isOnline ? `${animatedAcPower}W` : '-'}</span>
                      <span className="text-tiny text-ink-6 mt-0.5">AC</span>
                    </div>
                    <span className="text-primary text-body-md font-semibold px-1">+</span>
                    <div className="flex flex-col items-center">
                      <span className="text-body-md font-bold text-ink-1 tnum">{isOnline ? `${animatedSolarPower}W` : '-'}</span>
                      <span className="text-tiny text-warning mt-0.5">Solar</span>
                    </div>
                  </div>
                </div>
                {/* Output block */}
                <div className="flex-1 max-w-[120px] rounded-l bg-ink-9 px-3 py-2">
                  <div className="flex items-center gap-1 mb-1.5">
                    <TrendingUp size={12} className="text-ink-6" />
                    <span className="text-[11px] font-medium text-ink-6">Output</span>
                  </div>
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-body-md font-bold text-ink-1 tnum">{isOnline ? `${animatedOutputPower}W` : '-'}</span>
                    <span className="text-tiny text-ink-6 mt-0.5">Load</span>
                  </div>
                </div>
              </div>

              {/* PRD v1.1 §11.1: 温度 °F 北美默认 + 数据来源标签 */}
              {batteryTemp > 0 && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  <Thermometer size={12} className="text-ink-6" aria-hidden="true" />
                  <span className="text-[11px] text-ink-6">Temperature: {formatTemp(batteryTemp, 'F')}</span>
                </div>
              )}

              {/* Energy Flow Error */}
              {energyFlowError && (
                <div className="text-center mt-2 text-[10px] text-danger">
                  Energy flow: {energyFlowError}
                </div>
              )}
            </motion.div>

            {/* Energy Flow Detail Groups */}
            {energyFlow?.deviceAttributeState?.groups?.map(group => {
              if (group.isHidden) return null
              const visibleItems = group.stateItems.filter(i => !i.isHidden)
              if (visibleItems.length === 0) return null
              const groupIcons: Record<string, React.ElementType> = {
                grid_status: Zap,
                pv_panel_status: Sun,
                battery_status: Battery,
                load_status: TrendingUp,
              }
              const Icon = groupIcons[group.key] || Info
              const isCollapsed = collapsedGroups.has(group.key)
              return (
                <motion.div
                  key={group.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mx-5 mb-3 bg-ink-10 rounded-l overflow-hidden"
                >
                  <button
                    onClick={() => toggleGroupCollapse(group.key)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-ink-6" />
                      <span className="text-[12px] font-semibold text-ink-1">{translateEnergyFlowGroupLabel(group.key, group.name)}</span>
                      <span className="text-[10px] text-ink-7">({visibleItems.length})</span>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`text-ink-6 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
                    />
                  </button>
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {visibleItems.map(item => (
                            <div key={item.key} className="flex justify-between items-center py-1 border-b border-[rgba(255,255,255,0.03)]">
                              <span className="text-[10px] text-ink-6 truncate mr-2">{translateEnergyFlowFieldLabel(item.key, item.nameDisplay)}</span>
                              <span className="text-[10px] text-ink-1 font-mono whitespace-nowrap">
                                {translateEnergyFlowFieldValue(item.key, item.value, item.valueDisplay)}{item.unit ? ` ${translateEnergyFlowUnit(item.unit)}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}

            {/* Quick Controls - with real data */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mx-5 mb-4"
            >
              <div className="text-[11px] font-bold text-ink-6 tracking-widest uppercase mb-2.5 px-1">
                Quick Controls
              </div>
              <div className="bg-ink-10 rounded-l overflow-hidden">
                {/* Sleep Mode */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-[rgba(255,255,255,0.06)]">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-l flex items-center justify-center transition-colors
                      ${localSleepMode ? 'bg-[rgba(1,214,190,0.15)]' : 'bg-[rgba(255,255,255,0.06)]'}`}>
                      <Moon size={16} className={localSleepMode ? 'text-primary' : 'text-ink-6'} />
                    </div>
                    <div>
                      <div className="text-body-md font-semibold text-ink-1">Sleep Mode</div>
                      <div className="text-[10px] text-ink-6">Low power standby · 5W output</div>
                    </div>
                  </div>
                  <div className={`${controlLoading === 'sleepMode' ? 'opacity-50 pointer-events-none' : ''}`}>
                    <ToggleSwitch
                      isOn={localSleepMode}
                      onToggle={handleToggleSleepMode}
                      size="sm"
                    />
                  </div>
                </div>

                {/* Backup Mode / Saving Mode (workMode) */}
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-l flex items-center justify-center transition-colors
                      ${activeMode === 'backup' ? 'bg-[rgba(255,149,0,0.15)]' : 'bg-[rgba(52,199,89,0.15)]'}`}>
                      {activeMode === 'backup'
                        ? <Shield size={16} className="text-warning" />
                        : <Leaf size={16} className="text-success" />
                      }
                    </div>
                    <div>
                      <div className="text-body-md font-semibold text-ink-1">
                        {activeMode === 'backup' ? 'Backup Mode' : 'Saving Mode'}
                      </div>
                      <div className="text-[10px] text-ink-6">
                        {activeMode === 'backup' ? 'Prioritize backup reserve' : 'Optimize energy efficiency'}
                      </div>
                    </div>
                  </div>
                  <div className="flex bg-ink-12 rounded-full p-0.5">
                    <button
                      onClick={() => handleSetWorkMode('backup')}
                      disabled={controlLoading === 'workMode'}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold active:scale-[0.96] transition-[color,background-color,transform] duration-150
                        ${activeMode === 'backup'
                          ? 'bg-warning text-ink-13'
                          : 'text-ink-6 hover:text-ink-1'
                        }`}
                    >
                      Backup
                    </button>
                    <button
                      onClick={() => handleSetWorkMode('saving')}
                      disabled={controlLoading === 'workMode'}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold active:scale-[0.96] transition-[color,background-color,transform] duration-150
                        ${activeMode === 'saving'
                          ? 'bg-success text-ink-13'
                          : 'text-ink-6 hover:text-ink-1'
                        }`}
                    >
                      Saving
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Port Controls */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mx-5 mb-4"
            >
              <div className="text-[11px] font-bold text-ink-6 tracking-widest uppercase mb-2.5 px-1">
                Ports
              </div>
              {bleManager && (
                <div className="text-[10px] text-ink-6 mb-2 px-1">
                  Bluetooth Direct: AC/DC only (no USB-specific control) · reflects your last action, not a live read
                </div>
              )}
              <div className="bg-ink-10 rounded-l overflow-hidden">
                {(bleManager
                  ? [
                      { label: 'AC Output', enabled: directAcOn, key: 'ac' },
                      { label: 'DC / USB Output', enabled: directDcOn, key: 'dc' },
                    ]
                  : [
                      { label: 'AC Output 1', enabled: acOut1Enable, key: 'acOut1Enable' },
                      { label: 'AC Output 2', enabled: acOut2Enable, key: 'acOut2Enable' },
                      { label: 'USB Output', enabled: usbOut1Enable, key: 'usbOut1Enable' },
                    ]
                ).map((port, index, arr) => (
                  <div
                    key={port.key}
                    className={`flex items-center justify-between px-4 py-3.5
                      ${index < arr.length - 1 ? 'border-b border-[rgba(255,255,255,0.06)]' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-l flex items-center justify-center transition-colors
                        ${port.enabled ? 'bg-[rgba(52,199,89,0.15)]' : 'bg-[rgba(255,255,255,0.06)]'}`}>
                        <Zap size={16} className={port.enabled ? 'text-success' : 'text-ink-7'} />
                      </div>
                      <div>
                        <div className="text-body-md font-semibold text-ink-1">{port.label}</div>
                        <div className="text-[10px] text-ink-6">
                          {port.enabled ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                    </div>
                    <ToggleSwitch
                      isOn={port.enabled}
                      onToggle={() => {
                        const newValue = !port.enabled
                        if (bleManager) {
                          const isAc = port.key === 'ac'
                          setControlLoading(port.key)
                          const write = isAc ? setAcOutputBle : setDcOutputBle
                          write(bleManager, newValue)
                            .then(ok => { if (ok) (isAc ? setDirectAcOn : setDirectDcOn)(newValue) })
                            .catch(() => { /* leave local state unchanged on failure */ })
                            .finally(() => setControlLoading(null))
                          return
                        }
                        if (!selectedDeviceId) return
                        setControlLoading(port.key)
                        controlDevice(selectedDeviceId, port.key, newValue)
                          .catch(err => console.error('[OverviewPage] controlDevice failed:', err))
                          .finally(() => setControlLoading(null))
                      }}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Energy Management shortcuts */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mx-5 mb-4"
            >
              <div className="text-[11px] font-bold text-ink-6 tracking-widest uppercase mb-2.5 px-1">
                Energy Management
              </div>
              <div className="bg-ink-10 rounded-l overflow-hidden">
                {[
                  { label: 'Smart Schedule', sub: 'Time-of-use charging', icon: Calendar, path: '/smart-schedule', color: '#01D6BE' },
                ].map((item, i) => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`w-full flex items-center justify-between px-4 py-3.5 hover:bg-[rgba(255,255,255,0.04)] transition-colors
                      ${i === 0 ? 'border-b border-[rgba(255,255,255,0.06)]' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-l flex items-center justify-center"
                        style={{ backgroundColor: `${item.color}26` }}>
                        <item.icon size={16} style={{ color: item.color }} />
                      </div>
                      <div className="text-left">
                        <div className="text-body-md font-semibold text-ink-1">{item.label}</div>
                        <div className="text-[10px] text-ink-6">{item.sub}</div>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-ink-8" />
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Real-Time Power chart card — shared with Device Monitor */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mx-5 mb-5"
            >
              <RealTimePowerChart
                deviceId={selectedDeviceId}
                isOnline={isOnline}
                values={{ battery: batteryPower, ac: acPower, solar: solarPower, output: outputPower }}
                lastSyncAt={selectedDeviceState?.time ? new Date(selectedDeviceState.time).getTime() : undefined}
              />
            </motion.div>
          </>
        )}
      </PullToRefresh>

      {/* ===== Alert Panel (real-time firingAlarms + history alarms) ===== */}
      <AnimatePresence>
        {showAlerts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.6)] z-50 flex items-end"
            onClick={() => setShowAlerts(false)}
          >
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-ink-10 rounded-t-[28px] p-5 pb-8"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-4" />
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-warning" />
                  <h3 className="text-base font-bold text-ink-1">Device Alerts</h3>
                </div>
                <div className="flex items-center gap-2">
                  {unreadAlarmCount > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[rgba(255,59,48,0.12)] text-danger font-semibold">
                      {unreadAlarmCount} Active
                    </span>
                  )}
                  <button onClick={() => setShowAlerts(false)} className="w-9 h-9 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center active:scale-[0.96] transition-transform">
                    <X size={14} className="text-ink-6" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 max-h-[450px] overflow-y-auto scrollbar-hide">
                {alarmLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="text-primary animate-spin" />
                    <span className="ml-2 text-body-md text-ink-6">Loading alarms...</span>
                  </div>
                )}

                {!alarmLoading && alertList.length === 0 && alarms.length === 0 && (
                  <div className="text-center py-8">
                    <Check size={32} className="mx-auto mb-2 text-success" />
                    <p className="text-body-md text-ink-6">No active alerts</p>
                    <p className="text-[11px] text-ink-7 mt-1">All systems normal</p>
                  </div>
                )}

                {/* Real-time firing alarms */}
                {alertList.map((alert, index) => {
                  const severityColors: Record<string, { bg: string; dot: string; text: string }> = {
                    critical: { bg: 'bg-[rgba(255,59,48,0.06)]', dot: '#FF3B30', text: 'text-danger' },
                    major: { bg: 'bg-[rgba(255,59,48,0.06)]', dot: '#FF3B30', text: 'text-danger' },
                    minor: { bg: 'bg-[rgba(255,149,0,0.06)]', dot: '#FF9500', text: 'text-warning' },
                    info: { bg: 'bg-[rgba(1,214,190,0.04)]', dot: '#01D6BE', text: 'text-primary' },
                  }
                  const colors = severityColors[alert.severity] || severityColors.info

                  return (
                    <div
                      key={`firing-${alert.alarmId}-${index}`}
                      className={`flex items-start gap-3 p-3.5 rounded-l ${colors.bg}`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        <CircleDot size={14} style={{ color: colors.dot }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-body-md font-semibold text-ink-1`}>
                            {alert.alarmMessage || describeAlarmCode(alert.alarmCode) || 'Device Alarm'}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} font-medium`}>
                            LIVE
                          </span>
                        </div>
                        <div className="text-[11px] mt-0.5 text-ink-6">
                          Code: {alert.alarmCode} · {alert.severity}
                        </div>
                      </div>
                      <div className="text-[10px] text-ink-7 whitespace-nowrap mt-0.5">
                        {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'now'}
                      </div>
                    </div>
                  )
                })}

                {/* History alarms from API */}
                {!alarmLoading && alarms.map((alarm) => {
                  const levelColors: Record<string, { bg: string; dot: string; text: string }> = {
                    critical: { bg: 'bg-[rgba(255,59,48,0.06)]', dot: '#FF3B30', text: 'text-danger' },
                    major: { bg: 'bg-[rgba(255,59,48,0.06)]', dot: '#FF3B30', text: 'text-danger' },
                    warning: { bg: 'bg-[rgba(255,149,0,0.06)]', dot: '#FF9500', text: 'text-warning' },
                    minor: { bg: 'bg-[rgba(255,149,0,0.06)]', dot: '#FF9500', text: 'text-warning' },
                    info: { bg: 'bg-[rgba(1,214,190,0.04)]', dot: '#01D6BE', text: 'text-primary' },
                  }
                  const colors = levelColors[alarm.alarmLevel ?? 'info'] || levelColors.info

                  return (
                    <div
                      key={`alarm-${alarm.id}`}
                      className={`flex items-start gap-3 p-3.5 rounded-l transition-colors
                        ${alarm.isProcessed ? 'bg-[rgba(255,255,255,0.02)]' : colors.bg}`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {alarm.isProcessed
                          ? <Check size={14} className="text-success" />
                          : <CircleDot size={14} style={{ color: colors.dot }} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-body-md font-semibold ${alarm.isProcessed ? 'text-ink-7' : 'text-ink-1'}`}>
                          {alarm.alarmMessage || alarm.name || describeAlarmCode(alarm.alarmCode ?? alarm.key) || 'Device Alarm'}
                        </div>
                        <div className="text-[11px] mt-0.5 text-ink-6">
                          Code: {alarm.alarmCode ?? alarm.key ?? '--'} · Level: {alarm.alarmLevel ?? alarm.levelDict ?? '--'}
                          {alarm.deviceName && <> · <span className="text-ink-6">{alarm.deviceName}</span></>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div className="text-[10px] text-ink-7 whitespace-nowrap">
                          {alarm.createdAt ? new Date(alarm.createdAt).toLocaleString() : ''}
                        </div>
                        {!alarm.isProcessed && (
                          <button
                            onClick={() => handleDismissAlarm(alarm.id)}
                            disabled={dismissingAlarmId === alarm.id}
                            className="text-[10px] text-primary px-2 py-0.5 rounded-full bg-[rgba(1,214,190,0.1)] disabled:opacity-50 flex items-center gap-1"
                          >
                            {dismissingAlarmId === alarm.id ? (
                              <><Loader2 size={10} className="animate-spin" /> Dismissing</>
                            ) : 'Dismiss'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Load more */}
                {alarms.length > 0 && alarms.length < alarmTotal && (
                  <button
                    onClick={() => {
                      if (selectedDeviceId) loadAlarms(selectedDeviceId, Math.ceil(alarms.length / 20) + 1, 20, true)
                    }}
                    className="w-full py-2.5 text-[12px] text-primary font-medium"
                  >
                    Load More ({alarmTotal - alarms.length} remaining)
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Notification Panel (real alarm history) ===== */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.6)] z-50 flex items-start"
            onClick={() => setShowNotifications(false)}
          >
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-ink-10 rounded-b-[28px] p-5 pt-4"
            >
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-base font-bold text-ink-1">Alert History</h3>
                  {unreadAlarmCount > 0 && <span className="text-[11px] text-danger">{unreadAlarmCount} unread</span>}
                  {unreadAlarmCount === 0 && alarms.length > 0 && <span className="text-[11px] text-ink-6">{alarms.length} total</span>}
                </div>
                <button onClick={() => setShowNotifications(false)} className="w-9 h-9 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center active:scale-[0.96] transition-transform">
                  <X size={14} className="text-ink-6" />
                </button>
              </div>
              <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto scrollbar-hide">
                {alarmLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="text-primary animate-spin" />
                  </div>
                ) : alarms.length === 0 ? (
                  <div className="text-center py-8">
                    <Check size={28} className="mx-auto mb-2 text-success" />
                    <p className="text-body-md text-ink-6">No alarm history</p>
                  </div>
                ) : (
                  alarms.slice(0, 15).map((alarm) => {
                    const levelColorMap: Record<string, string> = {
                      critical: '#FF3B30',
                      major: '#FF3B30',
                      warning: '#FF9500',
                      minor: '#FF9500',
                      info: '#01D6BE',
                    }
                    const dotColor = levelColorMap[alarm.alarmLevel ?? 'info'] || '#01D6BE'

                    return (
                      <div
                        key={`notif-${alarm.id}`}
                        className={`flex items-start gap-3 p-3.5 rounded-l ${alarm.isProcessed ? 'bg-[rgba(255,255,255,0.03)]' : 'bg-[rgba(255,59,48,0.04)]'}`}
                      >
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: alarm.isProcessed ? '#8C8C8C' : dotColor }} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-body-md font-semibold ${alarm.isProcessed ? 'text-ink-6' : 'text-ink-1'}`}>
                            {alarm.alarmMessage || alarm.alarmCode}
                          </div>
                          <div className="text-[11px] text-ink-7 mt-0.5">
                            {alarm.deviceName && <>{alarm.deviceName} · </>}
                            {alarm.createdAt ? new Date(alarm.createdAt).toLocaleString() : ''}
                          </div>
                        </div>
                        {alarm.isProcessed && <Check size={12} className="text-ink-7 mt-1 flex-shrink-0" />}
                      </div>
                    )
                  })
                )}
              </div>
              {alarms.length > 15 && (
                <button
                  onClick={() => { setShowNotifications(false); setShowAlerts(true) }}
                  className="w-full mt-2 py-2 text-[12px] text-primary font-medium"
                >
                  View All Alerts ({alarmTotal})
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Display Settings ===== */}
      <AnimatePresence>
        {showDisplaySettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.6)] z-50 flex items-end"
            onClick={() => setShowDisplaySettings(false)}
          >
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-ink-10 rounded-t-[28px] p-6 pb-10"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-bold text-ink-1">Display Settings</h3>
                <button onClick={() => setShowDisplaySettings(false)} className="w-9 h-9 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center active:scale-[0.96] transition-transform">
                  <X size={14} className="text-ink-6" />
                </button>
              </div>
              <p className="text-[11px] text-ink-7 mb-4">Choose which sections to show on the overview screen</p>
              <div className="flex flex-col gap-2">
                {displayItems.map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between py-3 border-b border-[rgba(255,255,255,0.06)]">
                    <div className="flex items-center gap-3">
                      {displayConfig[key] ? <Eye size={15} className="text-primary" /> : <EyeOff size={15} className="text-ink-7" />}
                      <div>
                        <div className={`text-body-md font-medium ${displayConfig[key] ? 'text-ink-1' : 'text-ink-7'}`}>{label}</div>
                        <div className="text-[10px] text-ink-7">{desc}</div>
                      </div>
                    </div>
                    <ToggleSwitch isOn={displayConfig[key]} onToggle={() => setDisplayConfig(prev => ({ ...prev, [key]: !prev[key] }))} size="sm" />
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Device Detail Page ===== */}
      <AnimatePresence>
        {showDeviceDetail && (
          <DeviceDetailPage onBack={() => setShowDeviceDetail(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
