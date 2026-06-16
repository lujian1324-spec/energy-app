import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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
  LayoutGrid,
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
} from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import ToggleSwitch from '../components/ToggleSwitch'
import { DataSourceTag, DemoBanner, LastSync, SampleRate, type DataSource } from '../components/DataTrust'
import { formatTemp } from '../utils/localization'
import DeviceDetailPage from './DeviceDetailPage'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime, mapFiringAlarms } from '../api/deviceApi'
import type { DeviceAlert } from '../types'
import {
  showPowerOutageNotification,
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
    energyFlow,
    energyFlowLoading,
    energyFlowError,
    loadEnergyFlow,
  } = useDeviceStore()

  // UI state
  const [showNotifications, setShowNotifications] = useState(false)
  const [showDisplaySettings, setShowDisplaySettings] = useState(false)
  const [showLockScreenAlert, setShowLockScreenAlert] = useState(false)
  const [showAlerts, setShowAlerts] = useState(false)
  const [alertList, setAlertList] = useState<DeviceAlert[]>([])
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default')
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false)
  const [dismissingAlarmId, setDismissingAlarmId] = useState<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [showDeviceDetail, setShowDeviceDetail] = useState(false)
  const [powerDataSource, setPowerDataSource] = useState<'battery' | 'ac' | 'solar' | 'output'>('battery')
  const [controlLoading, setControlLoading] = useState<string | null>(null)
  // PRD v1.1 §8: 数据来源标识
  const [dataSource] = useState<DataSource>('ble')
  // PRD v1.1 §8.2: Demo Mode 检测 (无设备时或离线时)
  const isDemoMode = !navigator.onLine

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
      loadAlarms(Number(id))
    }
  }, [id])

  // ─── 每 30 秒自动刷新设备状态 ───
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (selectedDeviceId) {
      pollRef.current = setInterval(() => {
        loadDeviceState(selectedDeviceId)
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
      loadAlarms(Number(selectedDeviceId))
      alarmPollRef.current = setInterval(() => {
        loadAlarms(Number(selectedDeviceId))
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

  // ─── 计算显示值（带 fallback） ───
  const soc = realtime?.soc ?? 0
  const batteryPower = realtime?.batteryPower ?? 0
  const acPower = realtime?.acPower ?? 0
  const solarPower = realtime?.solarPower ?? 0
  const outputPower = realtime?.outputPower ?? 0
  const batteryTemp = realtime?.batteryTemp ?? 0
  const inputPower = Math.max(acPower, solarPower, 0)
  const currentDeviceListItem = devices.find(d => String(d.id) === selectedDeviceId)
  const deviceModel = selectedDeviceDetails?.gatherProtocolNameDisplay ?? selectedDeviceDetails?.model ?? ''

  // ─── 预估剩余时间 ───
  const remainingTimeDisplay = useMemo(() => {
    if (soc <= 0 || outputPower <= 0) return null
    // Default capacity: 1kWh (Sierro 1000) or 2kWh (Sierro 2000)
    const modelLower = deviceModel?.toLowerCase() ?? ''
    const capacityWh = modelLower.includes('2000') ? 2000 : 1000
    const remainingWh = (soc / 100) * capacityWh
    const hours = remainingWh / outputPower
    if (hours >= 1) {
      const h = Math.floor(hours)
      const m = Math.round((hours - h) * 60)
      return `${h}h ${m}m remaining`
    }
    const m = Math.round(hours * 60)
    if (m <= 0) return null
    return `${m}m remaining`
  }, [soc, outputPower, deviceModel])

  const chargeTimeDisplay = useMemo(() => {
    if (soc >= 100 || inputPower <= 0) return null
    const modelLower = deviceModel?.toLowerCase() ?? ''
    const capacityWh = modelLower.includes('2000') ? 2000 : 1000
    const toChargeWh = ((100 - soc) / 100) * capacityWh
    const hours = toChargeWh / inputPower
    if (hours >= 1) {
      const h = Math.floor(hours)
      const m = Math.round((hours - h) * 60)
      return `${h}h ${m}m to full`
    }
    const m = Math.round(hours * 60)
    if (m <= 0) return null
    return `${m}m to full`
  }, [soc, inputPower, deviceModel])
  const acOut1Enable = realtime?.acOut1Enable ?? false
  const acOut2Enable = realtime?.acOut2Enable ?? false
  const usbOut1Enable = realtime?.usbOut1Enable ?? false
  const sleepMode = realtime?.sleepMode ?? false
  const workMode = realtime?.workMode ?? 0
  const isCharging = batteryPower > 0
  const deviceName = selectedDeviceDetails?.name ?? currentDeviceListItem?.name ?? 'Device'
  const isOnline = selectedDeviceDetails?.isOnline ?? false

  // Quick Controls local state (synced with real data)
  const [localSleepMode, setLocalSleepMode] = useState(sleepMode)
  const [activeMode, setActiveMode] = useState<'backup' | 'saving'>(workMode === 2 ? 'saving' : 'backup')

  // Sync local state with real data changes
  useEffect(() => {
    setLocalSleepMode(sleepMode)
    setActiveMode(workMode === 2 ? 'saving' : 'backup')
  }, [sleepMode, workMode])

  // ─── 设备控制写入 ───
  const handleToggleSleepMode = async () => {
    if (!selectedDeviceId) return
    const newValue = !localSleepMode
    setLocalSleepMode(newValue)
    setControlLoading('sleepMode')
    try {
      await controlDevice(selectedDeviceId, 'sleepMode', newValue)
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

  // ─── 手动刷新 ───
  const handleRefresh = async () => {
    if (!selectedDeviceId) return
    await loadDeviceState(selectedDeviceId)
  }

  // ─── Notifications permission ───
  useEffect(() => {
    setPushPermission(getNotificationPermission())
    if (isIOS()) {
      const iosStatus = getIOSPushStatus()
      console.log('[OverviewPage] iOS Push Status:', iosStatus)
    }
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
  const handleDismissAlarm = async (alarmId: number) => {
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

  // ─── Power chart data (mock SVG paths for now) ───
  const powerChartData = useMemo(() => ({
    battery: { value: batteryPower, color: '#34C759' },
    ac: { value: acPower, color: '#01D6BE' },
    solar: { value: solarPower, color: '#FF9500' },
    output: { value: outputPower, color: '#A0A0A5' },
  }), [batteryPower, acPower, solarPower, outputPower])

  const currentChartData = powerChartData[powerDataSource]

  // ─── Real-time rolling power buffer (last 30 readings) for the chart ───
  const [powerHistory, setPowerHistory] = useState<
    { battery: number; ac: number; solar: number; output: number }[]
  >([])
  useEffect(() => {
    if (!isOnline) { setPowerHistory([]); return }
    setPowerHistory(prev =>
      [...prev, { battery: batteryPower, ac: acPower, solar: solarPower, output: outputPower }].slice(-30)
    )
  }, [batteryPower, acPower, solarPower, outputPower, isOnline])

  // Build SVG points (viewBox 0 0 300 80) from the buffered series
  const chartSeries = powerHistory.map(p => p[powerDataSource])
  const chartMax = Math.max(...chartSeries, 1)
  const chartPts = chartSeries.length >= 2
    ? chartSeries.map((v, i) => {
        const x = (i / (chartSeries.length - 1)) * 300
        const y = 75 - (v / chartMax) * 70
        return [x, y] as const
      })
    : []
  const chartLinePoints = chartPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const chartAreaPoints = chartPts.length ? `${chartLinePoints} 300,80 0,80` : ''

  return (
    <div className={`h-full flex flex-col bg-[#141414] overflow-hidden relative pt-6 ${isDemoMode ? 'demo-mode' : ''}`}>
      {/* PRD v1.1 §8.2: DEMO MODE 顶部黄色横幅 */}
      <DemoBanner show={isDemoMode} onRetry={handleRefresh} />

      {/* Status bar spacer */}
      <div className="h-8 px-5 flex justify-between items-center opacity-0">
        <span className="text-[12px] text-[#FFFFFF]">{soc}%</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-3">
          {/* Left: Back */}
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center text-[#FFFFFF] hover:bg-[#333333] transition-colors flex-shrink-0"
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
                <h2 className="text-[18px] font-bold text-[#FFFFFF] max-w-[180px] truncate">
                  {deviceName}
                </h2>
                {/* PRD §4.1.2: chevron only when multiple devices */}
                {devices.length > 1 && (
                  <ChevronDown
                    size={16}
                    className={`text-[#FFFFFF] transition-transform duration-200 ${showDeviceDropdown ? 'rotate-180' : ''}`}
                  />
                )}
              </div>
              {/* PRD §4.1.1: Connected / Disconnected subtitle under device name */}
              <span className={`text-[12px] mt-0.5 ${isOnline ? 'text-[#A0A0A5]' : 'text-[#FF3530]'}`}>
                {isOnline ? 'Connected' : 'Disconnected'}
              </span>
            </button>

            {/* Dropdown - real device list */}
            <AnimatePresence>
              {showDeviceDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-2 w-[260px] bg-[#262626] rounded-[16px] border border-[rgba(1,214,190,0.15)] shadow-xl z-50 overflow-hidden"
                >
                  <div className="py-2">
                    <div className="px-3 py-2 text-[10px] text-[#A0A0A5] uppercase tracking-wider">
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
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center
                            ${isSelected
                              ? 'bg-[rgba(1,214,190,0.15)] text-[#01D6BE]'
                              : 'bg-[rgba(255,255,255,0.06)] text-[#A0A0A5]'
                            }`}
                          >
                            <Battery size={18} />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <div className={`text-[13px] font-semibold truncate ${isSelected ? 'text-[#01D6BE]' : 'text-[#FFFFFF]'}`}>
                              {device.name}
                            </div>
                            <div className="text-[10px] text-[#A0A0A5] flex items-center gap-1.5">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${device.isOnline ? 'bg-[#34C759]' : 'bg-[#636366]'}`} />
                              {device.isOnline ? 'Online' : 'Offline'}
                              {device.model && ` · ${device.model}`}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-[#01D6BE]" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Settings + Bell */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowDeviceDetail(true)}
              className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center text-[#FFFFFF] hover:bg-[#333333] transition-colors"
            >
              <Settings size={18} />
            </button>
            <motion.button
              onClick={() => setShowAlerts(true)}
              whileTap={{ scale: 0.85 }}
              className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center relative"
            >
              <Bell size={18} className="text-[#FFFFFF]" />
              {(unreadAlarmCount > 0 || activeFiringCount > 0) && (
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#FF3B30]" />
              )}
            </motion.button>
          </div>
        </div>

        {/* Loading state */}
        {stateLoading && !realtime ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-[#01D6BE] animate-spin" />
            <span className="ml-3 text-[13px] text-[#A0A0A5]">Loading device data...</span>
          </div>
        ) : (
          <>
            {/* Battery Hero — PRD §4.1.1: ring + Input/Output only */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-5 mb-4 bg-[#262626] rounded-[24px] p-5"
            >
              <div className="flex justify-center mb-5">
                <BatteryRing
                  percentage={soc}
                  isCharging={isCharging}
                  connected={isOnline}
                  timeToFull={chargeTimeDisplay ?? '--'}
                  timeRemaining={(remainingTimeDisplay ?? '').replace(' remaining', '') || '--'}
                />
              </div>

              {/* Input (AC + Solar) / Output — PRD §4.1.1 / §4.1.3: three values */}
              <div className="flex items-stretch justify-center gap-3">
                {/* Input block: AC + Solar */}
                <div className="flex-1 max-w-[180px] rounded-[16px] bg-[rgba(1,214,190,0.10)] border border-[rgba(1,214,190,0.25)] px-3 py-2">
                  <div className="flex items-center gap-1 mb-1.5">
                    <TrendingDown size={12} className="text-[#01D6BE]" />
                    <span className="text-[11px] font-medium text-[#01D6BE]">Input</span>
                  </div>
                  <div className="flex items-center justify-around">
                    <div className="flex flex-col items-center">
                      <span className="text-[13px] font-bold text-[#FFFFFF]">{isOnline ? `${acPower}W` : '-'}</span>
                      <span className="text-[9px] text-[#A0A0A5] mt-0.5">AC</span>
                    </div>
                    <span className="text-[#01D6BE] text-[13px] font-semibold px-1">+</span>
                    <div className="flex flex-col items-center">
                      <span className="text-[13px] font-bold text-[#FFFFFF]">{isOnline ? `${solarPower}W` : '-'}</span>
                      <span className="text-[9px] text-[#FF9500] mt-0.5">Solar</span>
                    </div>
                  </div>
                </div>
                {/* Output block */}
                <div className="flex-1 max-w-[120px] rounded-[16px] bg-[#333333] px-3 py-2">
                  <div className="flex items-center gap-1 mb-1.5">
                    <TrendingUp size={12} className="text-[#A0A0A5]" />
                    <span className="text-[11px] font-medium text-[#A0A0A5]">Output</span>
                  </div>
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-[13px] font-bold text-[#FFFFFF]">{isOnline ? `${outputPower}W` : '-'}</span>
                    <span className="text-[9px] text-[#A0A0A5] mt-0.5">Load</span>
                  </div>
                </div>
              </div>

              {/* PRD v1.1 §11.1: 温度 °F 北美默认 + 数据来源标签 */}
              {batteryTemp > 0 && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  <Thermometer size={12} className="text-[#A0A0A5]" aria-hidden="true" />
                  <span className="text-[11px] text-[#A0A0A5]">Battery: {formatTemp(batteryTemp, 'F')}</span>
                </div>
              )}

              {/* Energy Flow Error */}
              {energyFlowError && (
                <div className="text-center mt-2 text-[10px] text-[#FF3B30]">
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
                  className="mx-5 mb-3 bg-[#262626] rounded-[20px] overflow-hidden"
                >
                  <button
                    onClick={() => toggleGroupCollapse(group.key)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-[#A0A0A5]" />
                      <span className="text-[12px] font-semibold text-[#FFFFFF]">{group.name}</span>
                      <span className="text-[10px] text-[#636366]">({visibleItems.length})</span>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`text-[#A0A0A5] transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
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
                              <span className="text-[10px] text-[#A0A0A5] truncate mr-2">{item.nameDisplay}</span>
                              <span className="text-[10px] text-[#FFFFFF] font-mono whitespace-nowrap">
                                {item.valueDisplay}{item.unit ? ` ${item.unit}` : ''}
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
              transition={{ delay: 0.05 }}
              className="mx-5 mb-4"
            >
              <div className="text-[11px] font-bold text-[#A0A0A5] tracking-widest uppercase mb-2.5 px-1">
                Quick Controls
              </div>
              <div className="bg-[#262626] rounded-[20px] overflow-hidden">
                {/* Sleep Mode */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-[rgba(255,255,255,0.06)]">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors
                      ${localSleepMode ? 'bg-[rgba(1,214,190,0.15)]' : 'bg-[rgba(255,255,255,0.06)]'}`}>
                      <Moon size={16} className={localSleepMode ? 'text-[#01D6BE]' : 'text-[#A0A0A5]'} />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-[#FFFFFF]">Sleep Mode</div>
                      <div className="text-[10px] text-[#A0A0A5]">Low power standby · 5W output</div>
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
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors
                      ${activeMode === 'backup' ? 'bg-[rgba(255,149,0,0.15)]' : 'bg-[rgba(52,199,89,0.15)]'}`}>
                      {activeMode === 'backup'
                        ? <Shield size={16} className="text-[#FF9500]" />
                        : <Leaf size={16} className="text-[#34C759]" />
                      }
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-[#FFFFFF]">
                        {activeMode === 'backup' ? 'Backup Mode' : 'Saving Mode'}
                      </div>
                      <div className="text-[10px] text-[#A0A0A5]">
                        {activeMode === 'backup' ? 'Prioritize backup reserve' : 'Optimize energy efficiency'}
                      </div>
                    </div>
                  </div>
                  <div className="flex bg-[#141414] rounded-full p-0.5">
                    <button
                      onClick={() => handleSetWorkMode('backup')}
                      disabled={controlLoading === 'workMode'}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all
                        ${activeMode === 'backup'
                          ? 'bg-[#FF9500] text-[#000000]'
                          : 'text-[#A0A0A5] hover:text-[#FFFFFF]'
                        }`}
                    >
                      Backup
                    </button>
                    <button
                      onClick={() => handleSetWorkMode('saving')}
                      disabled={controlLoading === 'workMode'}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all
                        ${activeMode === 'saving'
                          ? 'bg-[#34C759] text-[#000000]'
                          : 'text-[#A0A0A5] hover:text-[#FFFFFF]'
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
              transition={{ delay: 0.08 }}
              className="mx-5 mb-4"
            >
              <div className="text-[11px] font-bold text-[#A0A0A5] tracking-widest uppercase mb-2.5 px-1">
                Ports
              </div>
              <div className="bg-[#262626] rounded-[20px] overflow-hidden">
                {[
                  { label: 'AC Output 1', enabled: acOut1Enable, key: 'acOut1Enable' },
                  { label: 'AC Output 2', enabled: acOut2Enable, key: 'acOut2Enable' },
                  { label: 'USB Output', enabled: usbOut1Enable, key: 'usbOut1Enable' },
                ].map((port, index) => (
                  <div
                    key={port.key}
                    className={`flex items-center justify-between px-4 py-3.5
                      ${index < 2 ? 'border-b border-[rgba(255,255,255,0.06)]' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors
                        ${port.enabled ? 'bg-[rgba(52,199,89,0.15)]' : 'bg-[rgba(255,255,255,0.06)]'}`}>
                        <Zap size={16} className={port.enabled ? 'text-[#34C759]' : 'text-[#636366]'} />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-[#FFFFFF]">{port.label}</div>
                        <div className="text-[10px] text-[#A0A0A5]">
                          {port.enabled ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                    </div>
                    <ToggleSwitch
                      isOn={port.enabled}
                      onToggle={() => {
                        if (!selectedDeviceId) return
                        const newValue = !port.enabled
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

            {/* Real-Time Power chart card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mx-5 mb-5 bg-[#262626] rounded-[24px] p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-semibold text-[#FFFFFF]">Real-Time Power</span>
                <motion.span
                  key={isOnline ? currentChartData.value : 'offline'}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    backgroundColor: isOnline ? `${currentChartData.color}26` : 'rgba(160,160,165,0.15)',
                    color: isOnline ? currentChartData.color : '#A0A0A5'
                  }}
                >
                  {isOnline ? `${currentChartData.value}W` : '-'}
                </motion.span>
              </div>

              {/* Chart area — PRD §4.1.2: Disconnected shows guidance text */}
              <div className="h-24 relative overflow-hidden mb-3">
                {!isOnline ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                    <AlertTriangle size={26} className="text-[#FF3530] mb-2" />
                    <span className="text-[15px] font-bold text-[#FFFFFF]">Device disconnected</span>
                    <span className="text-[12px] text-[#A0A0A5] mt-1">Reconnect the device to view chart data.</span>
                  </div>
                ) : (
                  <svg width="100%" height="100%" viewBox="0 0 300 80" preserveAspectRatio="none">
                    <line x1="0" y1="20" x2="300" y2="20" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                    <line x1="0" y1="40" x2="300" y2="40" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                    <line x1="0" y1="60" x2="300" y2="60" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                    {chartPts.length >= 2 ? (
                      <>
                        <motion.polyline
                          key={`line-${powerDataSource}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.5 }}
                          points={chartLinePoints}
                          fill="none"
                          stroke={currentChartData.color}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <motion.polygon
                          key={`fill-${powerDataSource}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          points={chartAreaPoints}
                          fill={currentChartData.color}
                          fillOpacity="0.1"
                        />
                      </>
                    ) : (
                      <line x1="0" y1="70" x2="300" y2="70" stroke={currentChartData.color} strokeWidth="2" strokeLinecap="round" />
                    )}
                  </svg>
                )}
              </div>

              {/* PRD v1.1 §8.2: 采样率标注 */}
              <div className="flex items-center justify-between mb-2">
                <LastSync lastSyncAt={selectedDeviceState?.time ? new Date(selectedDeviceState.time).getTime() : undefined} />
                <SampleRate intervalSec={30} />
              </div>

              {/* Bottom 4 tabs */}
              <div className="flex justify-around pt-3 border-t border-[rgba(255,255,255,0.06)]">
                {[
                  { key: 'battery' as const, label: 'Battery', icon: Battery },
                  { key: 'ac' as const, label: 'AC', icon: LayoutGrid },
                  { key: 'solar' as const, label: 'Solar', icon: Sun },
                  { key: 'output' as const, label: 'Output', icon: TrendingUp },
                ].map((item) => {
                  const Icon = item.icon
                  const isActive = powerDataSource === item.key
                  return (
                    <button
                      key={item.key}
                      onClick={() => setPowerDataSource(item.key)}
                      className={`flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-all
                        ${isActive ? 'bg-[rgba(1,214,190,0.15)]' : 'hover:bg-[rgba(255,255,255,0.03)]'}`}
                    >
                      <Icon size={18} className={isActive ? 'text-[#01D6BE]' : 'text-[#A0A0A5]'} />
                      <span className={`text-[10px] font-medium ${isActive ? 'text-[#01D6BE]' : 'text-[#A0A0A5]'}`}>
                        {item.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </div>

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
              className="w-full bg-[#262626] rounded-t-[28px] p-5 pb-8"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-4" />
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-[#FF9500]" />
                  <h3 className="text-base font-bold text-[#FFFFFF]">Device Alerts</h3>
                </div>
                <div className="flex items-center gap-2">
                  {unreadAlarmCount > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[rgba(255,59,48,0.12)] text-[#FF3B30] font-semibold">
                      {unreadAlarmCount} Active
                    </span>
                  )}
                  <button onClick={() => setShowAlerts(false)} className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center">
                    <X size={14} className="text-[#A0A0A5]" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 max-h-[450px] overflow-y-auto scrollbar-hide">
                {alarmLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="text-[#01D6BE] animate-spin" />
                    <span className="ml-2 text-[13px] text-[#A0A0A5]">Loading alarms...</span>
                  </div>
                )}

                {!alarmLoading && alertList.length === 0 && alarms.length === 0 && (
                  <div className="text-center py-8">
                    <Check size={32} className="mx-auto mb-2 text-[#34C759]" />
                    <p className="text-[13px] text-[#A0A0A5]">No active alerts</p>
                    <p className="text-[11px] text-[#636366] mt-1">All systems normal</p>
                  </div>
                )}

                {/* Real-time firing alarms */}
                {alertList.map((alert, index) => {
                  const severityColors: Record<string, { bg: string; dot: string; text: string }> = {
                    critical: { bg: 'bg-[rgba(255,59,48,0.06)]', dot: '#FF3B30', text: 'text-[#FF3B30]' },
                    major: { bg: 'bg-[rgba(255,59,48,0.06)]', dot: '#FF3B30', text: 'text-[#FF3B30]' },
                    minor: { bg: 'bg-[rgba(255,149,0,0.06)]', dot: '#FF9500', text: 'text-[#FF9500]' },
                    info: { bg: 'bg-[rgba(1,214,190,0.04)]', dot: '#01D6BE', text: 'text-[#01D6BE]' },
                  }
                  const colors = severityColors[alert.severity] || severityColors.info

                  return (
                    <div
                      key={`firing-${alert.alarmId}-${index}`}
                      className={`flex items-start gap-3 p-3.5 rounded-[16px] ${colors.bg}`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        <CircleDot size={14} style={{ color: colors.dot }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[13px] font-semibold text-[#FFFFFF]`}>
                            {alert.alarmMessage || `Alarm ${alert.alarmCode}`}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} font-medium`}>
                            LIVE
                          </span>
                        </div>
                        <div className="text-[11px] mt-0.5 text-[#A0A0A5]">
                          Code: {alert.alarmCode} · {alert.severity}
                        </div>
                      </div>
                      <div className="text-[10px] text-[#636366] whitespace-nowrap mt-0.5">
                        {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'now'}
                      </div>
                    </div>
                  )
                })}

                {/* History alarms from API */}
                {!alarmLoading && alarms.map((alarm) => {
                  const levelColors: Record<string, { bg: string; dot: string; text: string }> = {
                    critical: { bg: 'bg-[rgba(255,59,48,0.06)]', dot: '#FF3B30', text: 'text-[#FF3B30]' },
                    major: { bg: 'bg-[rgba(255,59,48,0.06)]', dot: '#FF3B30', text: 'text-[#FF3B30]' },
                    warning: { bg: 'bg-[rgba(255,149,0,0.06)]', dot: '#FF9500', text: 'text-[#FF9500]' },
                    minor: { bg: 'bg-[rgba(255,149,0,0.06)]', dot: '#FF9500', text: 'text-[#FF9500]' },
                    info: { bg: 'bg-[rgba(1,214,190,0.04)]', dot: '#01D6BE', text: 'text-[#01D6BE]' },
                  }
                  const colors = levelColors[alarm.alarmLevel] || levelColors.info

                  return (
                    <div
                      key={`alarm-${alarm.id}`}
                      className={`flex items-start gap-3 p-3.5 rounded-[16px] transition-colors
                        ${alarm.isProcessed ? 'bg-[rgba(255,255,255,0.02)]' : colors.bg}`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {alarm.isProcessed
                          ? <Check size={14} className="text-[#34C759]" />
                          : <CircleDot size={14} style={{ color: colors.dot }} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] font-semibold ${alarm.isProcessed ? 'text-[#636366]' : 'text-[#FFFFFF]'}`}>
                          {alarm.alarmMessage || `Alarm ${alarm.alarmCode}`}
                        </div>
                        <div className="text-[11px] mt-0.5 text-[#A0A0A5]">
                          Code: {alarm.alarmCode} · Level: {alarm.alarmLevel}
                          {alarm.deviceName && <> · <span className="text-[#A0A0A5]">{alarm.deviceName}</span></>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div className="text-[10px] text-[#636366] whitespace-nowrap">
                          {alarm.createdAt ? new Date(alarm.createdAt).toLocaleString() : ''}
                        </div>
                        {!alarm.isProcessed && (
                          <button
                            onClick={() => handleDismissAlarm(alarm.id)}
                            disabled={dismissingAlarmId === alarm.id}
                            className="text-[10px] text-[#01D6BE] px-2 py-0.5 rounded-full bg-[rgba(1,214,190,0.1)] disabled:opacity-50 flex items-center gap-1"
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
                      if (selectedDeviceId) loadAlarms(Number(selectedDeviceId), Math.ceil(alarms.length / 20) + 1, 20, true)
                    }}
                    className="w-full py-2.5 text-[12px] text-[#01D6BE] font-medium"
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
              className="w-full bg-[#262626] rounded-b-[28px] p-5 pt-4"
            >
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-base font-bold text-[#FFFFFF]">Alert History</h3>
                  {unreadAlarmCount > 0 && <span className="text-[11px] text-[#FF3B30]">{unreadAlarmCount} unread</span>}
                  {unreadAlarmCount === 0 && alarms.length > 0 && <span className="text-[11px] text-[#A0A0A5]">{alarms.length} total</span>}
                </div>
                <button onClick={() => setShowNotifications(false)} className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center">
                  <X size={14} className="text-[#A0A0A5]" />
                </button>
              </div>
              <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto scrollbar-hide">
                {alarmLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="text-[#01D6BE] animate-spin" />
                  </div>
                ) : alarms.length === 0 ? (
                  <div className="text-center py-8">
                    <Check size={28} className="mx-auto mb-2 text-[#34C759]" />
                    <p className="text-[13px] text-[#A0A0A5]">No alarm history</p>
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
                    const dotColor = levelColorMap[alarm.alarmLevel] || '#01D6BE'

                    return (
                      <div
                        key={`notif-${alarm.id}`}
                        className={`flex items-start gap-3 p-3.5 rounded-[16px] ${alarm.isProcessed ? 'bg-[rgba(255,255,255,0.03)]' : 'bg-[rgba(255,59,48,0.04)]'}`}
                      >
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: alarm.isProcessed ? '#636366' : dotColor }} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] font-semibold ${alarm.isProcessed ? 'text-[#A0A0A5]' : 'text-[#FFFFFF]'}`}>
                            {alarm.alarmMessage || alarm.alarmCode}
                          </div>
                          <div className="text-[11px] text-[#636366] mt-0.5">
                            {alarm.deviceName && <>{alarm.deviceName} · </>}
                            {alarm.createdAt ? new Date(alarm.createdAt).toLocaleString() : ''}
                          </div>
                        </div>
                        {alarm.isProcessed && <Check size={12} className="text-[#636366] mt-1 flex-shrink-0" />}
                      </div>
                    )
                  })
                )}
              </div>
              {alarms.length > 15 && (
                <button
                  onClick={() => { setShowNotifications(false); setShowAlerts(true) }}
                  className="w-full mt-2 py-2 text-[12px] text-[#01D6BE] font-medium"
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
              className="w-full bg-[#262626] rounded-t-[28px] p-6 pb-10"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-bold text-[#FFFFFF]">Display Settings</h3>
                <button onClick={() => setShowDisplaySettings(false)} className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center">
                  <X size={14} className="text-[#A0A0A5]" />
                </button>
              </div>
              <p className="text-[11px] text-[#636366] mb-4">Choose which sections to show on the overview screen</p>
              <div className="flex flex-col gap-2">
                {displayItems.map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between py-3 border-b border-[rgba(255,255,255,0.06)]">
                    <div className="flex items-center gap-3">
                      {displayConfig[key] ? <Eye size={15} className="text-[#01D6BE]" /> : <EyeOff size={15} className="text-[#636366]" />}
                      <div>
                        <div className={`text-[13px] font-medium ${displayConfig[key] ? 'text-[#FFFFFF]' : 'text-[#636366]'}`}>{label}</div>
                        <div className="text-[10px] text-[#636366]">{desc}</div>
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
