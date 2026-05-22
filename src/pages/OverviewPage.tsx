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
  Trash2,
  Thermometer,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import ToggleSwitch from '../components/ToggleSwitch'
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
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removingDevice, setRemovingDevice] = useState(false)
  const [alertList, setAlertList] = useState<DeviceAlert[]>([])
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default')
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false)
  const [dismissingAlarmId, setDismissingAlarmId] = useState<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [showDeviceDetail, setShowDeviceDetail] = useState(false)
  const [powerDataSource, setPowerDataSource] = useState<'battery' | 'ac' | 'solar' | 'output'>('battery')
  const [controlLoading, setControlLoading] = useState<string | null>(null)

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
  const acOut1Enable = realtime?.acOut1Enable ?? false
  const acOut2Enable = realtime?.acOut2Enable ?? false
  const usbOut1Enable = realtime?.usbOut1Enable ?? false
  const sleepMode = realtime?.sleepMode ?? false
  const workMode = realtime?.workMode ?? 0
  const isCharging = batteryPower > 0
  const inputPower = Math.max(acPower, solarPower, 0)
  const currentDeviceListItem = devices.find(d => String(d.id) === selectedDeviceId)
  const deviceName = selectedDeviceDetails?.name ?? currentDeviceListItem?.name ?? 'Device'
  const deviceModel = selectedDeviceDetails?.gatherProtocolNameDisplay ?? selectedDeviceDetails?.model ?? ''
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
    output: { value: outputPower, color: '#8E8E93' },
  }), [batteryPower, acPower, solarPower, outputPower])

  const currentChartData = powerChartData[powerDataSource]

  return (
    <div className="h-full flex flex-col bg-[#000000] overflow-hidden relative pt-6">
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
            className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#FFFFFF] hover:bg-[#2C2C2E] transition-colors flex-shrink-0"
          >
            <ChevronLeft size={22} />
          </button>

          {/* Center: Device dropdown (from real API devices) */}
          <div className="relative flex-1 flex justify-center" ref={dropdownRef}>
            <button
              onClick={() => setShowDeviceDropdown(!showDeviceDropdown)}
              className="flex items-center gap-2"
            >
              <h2 className="text-[16px] font-bold text-[#FFFFFF] tracking-wide max-w-[180px] truncate">
                {deviceName}
              </h2>
              <ChevronDown
                size={16}
                className={`text-[#8E8E93] transition-transform duration-200 ${showDeviceDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Dropdown - real device list */}
            <AnimatePresence>
              {showDeviceDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-2 w-[260px] bg-[#1C1C1E] rounded-[16px] border border-[rgba(1,214,190,0.15)] shadow-xl z-50 overflow-hidden"
                >
                  <div className="py-2">
                    <div className="px-3 py-2 text-[10px] text-[#8E8E93] uppercase tracking-wider">
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
                              : 'bg-[rgba(255,255,255,0.06)] text-[#8E8E93]'
                            }`}
                          >
                            <Battery size={18} />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <div className={`text-[13px] font-semibold truncate ${isSelected ? 'text-[#01D6BE]' : 'text-[#FFFFFF]'}`}>
                              {device.name}
                            </div>
                            <div className="text-[10px] text-[#8E8E93] flex items-center gap-1.5">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${device.isOnline ? 'bg-[#34C759]' : 'bg-[#48484A]'}`} />
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

          {/* Right: Remove + Settings + Bell */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowRemoveConfirm(true)}
              className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#FF3B30] hover:bg-[#2C2C2E] transition-colors"
              title="Remove device"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={() => navigate('/smart-schedule')}
              className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#FFFFFF] hover:bg-[#2C2C2E] transition-colors"
            >
              <Settings size={18} />
            </button>
            <motion.button
              onClick={() => setShowAlerts(true)}
              whileTap={{ scale: 0.85 }}
              className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center relative"
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
            <span className="ml-3 text-[13px] text-[#8E8E93]">Loading device data...</span>
          </div>
        ) : (
          <>
            {/* Online/Offline status badge */}
            <div className="mx-5 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <span className="text-[11px] text-[#34C759] flex items-center gap-1">
                    <Wifi size={11} /> Online
                  </span>
                ) : (
                  <span className="text-[11px] text-[#48484A] flex items-center gap-1">
                    <WifiOff size={11} /> Offline
                  </span>
                )}
                {deviceModel && (
                  <span className="text-[11px] text-[#48484A]">· {deviceModel}</span>
                )}
              </div>
              <button
                onClick={handleRefresh}
                disabled={stateLoading}
                className="text-[11px] text-[#8E8E93] flex items-center gap-1 hover:text-[#01D6BE] transition-colors"
              >
                <RefreshCw size={11} className={stateLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {/* Battery Hero - with real data */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-5 mb-4 bg-[#1C1C1E] rounded-[24px] p-5"
            >
              {/* Energy Flow Summary Bar */}
              {energyFlow && (
                <div className="flex items-center justify-center gap-4 mb-4 text-[10px] text-[#8E8E93] flex-wrap">
                  {/* PV Panel */}
                  <div className={`flex items-center gap-1 ${energyFlow.pvPanelFlow?.isEnabled ? 'text-[#FF9500]' : 'text-[#48484A]'}`}>
                    <Sun size={10} />
                    <span>PV: {energyFlow.pvPanelFlow?.value?.valueDisplay ?? '--'} {energyFlow.pvPanelFlow?.value?.unit ?? ''}</span>
                  </div>
                  <span className="text-[#48484A]">|</span>
                  {/* Grid */}
                  <div className={`flex items-center gap-1 ${energyFlow.gridFlow?.isEnabled ? 'text-[#01D6BE]' : 'text-[#48484A]'}`}>
                    <Zap size={10} />
                    <span>Grid: {energyFlow.gridFlow?.value?.valueDisplay ?? '--'} {energyFlow.gridFlow?.value?.unit ?? ''}</span>
                  </div>
                  <span className="text-[#48484A]">|</span>
                  {/* Battery */}
                  <div className={`flex items-center gap-1 ${energyFlow.batteryFlow?.isLight ? 'text-[#34C759]' : 'text-[#8E8E93]'}`}>
                    <Battery size={10} />
                    <span>
                      Batt: {energyFlow.batteryFlow?.flowDirection === 1 ? '⚡Charge' : energyFlow.batteryFlow?.flowDirection === -1 ? '🔋Discharge' : '—'}
                      {energyFlow.batteryFlow?.value?.valueDisplay ? ` ${energyFlow.batteryFlow.value.valueDisplay}${energyFlow.batteryFlow.value.unit}` : ''}
                    </span>
                  </div>
                  <span className="text-[#48484A]">|</span>
                  {/* Load */}
                  <div className={`flex items-center gap-1 ${energyFlow.loadFlow?.isEnabled ? 'text-[#8E8E93]' : 'text-[#48484A]'}`}>
                    <TrendingUp size={10} />
                    <span>Load: {energyFlow.loadFlow?.value?.valueDisplay ?? '--'}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-center mb-4">
                <BatteryRing
                  percentage={soc}
                  isCharging={isCharging}
                  timeToFull={isCharging ? '--' : ''}
                />
              </div>

              {/* Remaining info */}
              <div className="text-center mb-4">
                <span className="text-[12px] text-[#8E8E93]">
                  {isCharging
                    ? `Charging ${Math.abs(batteryPower)}W`
                    : outputPower > 0
                      ? `Outputting ${outputPower}W`
                      : 'Idle'
                  }
                </span>
              </div>

              {/* Battery / AC / Solar / Output 4 cards */}
              <div className="grid grid-cols-4 gap-2.5 mb-4 px-0.5">
                {[
                  { label: 'Battery', value: `${soc}%`, icon: Battery, color: soc < 20 ? '#FF3B30' : soc < 60 ? '#FF9500' : '#34C759' },
                  { label: 'AC', value: `${acPower}W`, icon: Zap, color: acPower > 0 ? '#01D6BE' : '#8E8E93' },
                  { label: 'Solar', value: `${solarPower}W`, icon: Sun, color: solarPower > 0 ? '#FF9500' : '#8E8E93' },
                  { label: 'Output', value: `${outputPower}W`, icon: TrendingUp, color: outputPower > 0 ? '#8E8E93' : '#48484A' },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="bg-[#000000] rounded-[12px] p-2.5 flex flex-col items-center min-w-0">
                      <Icon size={13} className="mb-1 flex-shrink-0" style={{ color: item.color }} />
                      <div className="text-[12px] font-bold text-[#FFFFFF] truncate w-full text-center leading-tight">{item.value}</div>
                      <div className="text-[9px] text-[#8E8E93] mt-0.5 truncate w-full text-center">{item.label}</div>
                    </div>
                  )
                })}
              </div>

              {/* Input / Output power labels */}
              <div className="flex justify-center gap-4">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[rgba(1,214,190,0.15)] border border-[rgba(1,214,190,0.3)]">
                  <TrendingDown size={13} className="text-[#01D6BE]" />
                  <span className="text-[11px] text-[#01D6BE]">Input</span>
                  <span className="text-[12px] font-semibold text-[#01D6BE]">
                    {inputPower}W
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2C2C2E]">
                  <TrendingUp size={13} className="text-[#8E8E93]" />
                  <span className="text-[11px] text-[#8E8E93]">Output</span>
                  <span className="text-[12px] font-semibold text-[#8E8E93]">
                    {outputPower}W
                  </span>
                </div>
              </div>

              {/* Temperature */}
              {batteryTemp > 0 && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  <Thermometer size={12} className="text-[#8E8E93]" />
                  <span className="text-[11px] text-[#8E8E93]">Battery: {batteryTemp}°C</span>
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
                  className="mx-5 mb-3 bg-[#1C1C1E] rounded-[20px] overflow-hidden"
                >
                  <button
                    onClick={() => toggleGroupCollapse(group.key)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-[#8E8E93]" />
                      <span className="text-[12px] font-semibold text-[#FFFFFF]">{group.name}</span>
                      <span className="text-[10px] text-[#48484A]">({visibleItems.length})</span>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`text-[#8E8E93] transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
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
                              <span className="text-[10px] text-[#8E8E93] truncate mr-2">{item.nameDisplay}</span>
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
              <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-2.5 px-1">
                Quick Controls
              </div>
              <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
                {/* Sleep Mode */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-[rgba(255,255,255,0.06)]">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors
                      ${localSleepMode ? 'bg-[rgba(1,214,190,0.15)]' : 'bg-[rgba(255,255,255,0.06)]'}`}>
                      <Moon size={16} className={localSleepMode ? 'text-[#01D6BE]' : 'text-[#8E8E93]'} />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-[#FFFFFF]">Sleep Mode</div>
                      <div className="text-[10px] text-[#8E8E93]">Low power standby · 5W output</div>
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
                      <div className="text-[10px] text-[#8E8E93]">
                        {activeMode === 'backup' ? 'Prioritize backup reserve' : 'Optimize energy efficiency'}
                      </div>
                    </div>
                  </div>
                  <div className="flex bg-[#000000] rounded-full p-0.5">
                    <button
                      onClick={() => handleSetWorkMode('backup')}
                      disabled={controlLoading === 'workMode'}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all
                        ${activeMode === 'backup'
                          ? 'bg-[#FF9500] text-[#000000]'
                          : 'text-[#8E8E93] hover:text-[#FFFFFF]'
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
                          : 'text-[#8E8E93] hover:text-[#FFFFFF]'
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
              <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-2.5 px-1">
                Ports
              </div>
              <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
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
                        <Zap size={16} className={port.enabled ? 'text-[#34C759]' : 'text-[#48484A]'} />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-[#FFFFFF]">{port.label}</div>
                        <div className="text-[10px] text-[#8E8E93]">
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
                          .catch(() => {})
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
              className="mx-5 mb-5 bg-[#1C1C1E] rounded-[24px] p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-semibold text-[#FFFFFF]">Real-Time Power</span>
                <motion.span
                  key={currentChartData.value}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    backgroundColor: `${currentChartData.color}26`,
                    color: currentChartData.color
                  }}
                >
                  {currentChartData.value}W
                </motion.span>
              </div>

              {/* Chart area (SVG placeholder - shows flat line when no historical data) */}
              <div className="h-24 relative overflow-hidden mb-3">
                <svg width="100%" height="100%" viewBox="0 0 300 80" preserveAspectRatio="none">
                  <line x1="0" y1="20" x2="300" y2="20" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  <line x1="0" y1="40" x2="300" y2="40" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  <line x1="0" y1="60" x2="300" y2="60" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  <motion.polyline
                    key={`line-${powerDataSource}`}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    points="0,50 30,42 60,45 90,35 120,40 150,28 180,38 210,32 240,36 270,30 300,34"
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
                    points="0,50 30,42 60,45 90,35 120,40 150,28 180,38 210,32 240,36 270,30 300,34 300,80 0,80"
                    fill={currentChartData.color}
                    fillOpacity="0.1"
                  />
                </svg>
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
                      <Icon size={18} className={isActive ? 'text-[#01D6BE]' : 'text-[#8E8E93]'} />
                      <span className={`text-[10px] font-medium ${isActive ? 'text-[#01D6BE]' : 'text-[#8E8E93]'}`}>
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
              className="w-full bg-[#1C1C1E] rounded-t-[28px] p-5 pb-8"
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
                    <X size={14} className="text-[#8E8E93]" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 max-h-[450px] overflow-y-auto scrollbar-hide">
                {alarmLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="text-[#01D6BE] animate-spin" />
                    <span className="ml-2 text-[13px] text-[#8E8E93]">Loading alarms...</span>
                  </div>
                )}

                {!alarmLoading && alertList.length === 0 && alarms.length === 0 && (
                  <div className="text-center py-8">
                    <Check size={32} className="mx-auto mb-2 text-[#34C759]" />
                    <p className="text-[13px] text-[#8E8E93]">No active alerts</p>
                    <p className="text-[11px] text-[#48484A] mt-1">All systems normal</p>
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
                        <div className="text-[11px] mt-0.5 text-[#8E8E93]">
                          Code: {alert.alarmCode} · {alert.severity}
                        </div>
                      </div>
                      <div className="text-[10px] text-[#48484A] whitespace-nowrap mt-0.5">
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
                        <div className={`text-[13px] font-semibold ${alarm.isProcessed ? 'text-[#48484A]' : 'text-[#FFFFFF]'}`}>
                          {alarm.alarmMessage || `Alarm ${alarm.alarmCode}`}
                        </div>
                        <div className="text-[11px] mt-0.5 text-[#8E8E93]">
                          Code: {alarm.alarmCode} · Level: {alarm.alarmLevel}
                          {alarm.deviceName && <> · <span className="text-[#8E8E93]">{alarm.deviceName}</span></>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div className="text-[10px] text-[#48484A] whitespace-nowrap">
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
              className="w-full bg-[#1C1C1E] rounded-b-[28px] p-5 pt-4"
            >
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-base font-bold text-[#FFFFFF]">Alert History</h3>
                  {unreadAlarmCount > 0 && <span className="text-[11px] text-[#FF3B30]">{unreadAlarmCount} unread</span>}
                  {unreadAlarmCount === 0 && alarms.length > 0 && <span className="text-[11px] text-[#8E8E93]">{alarms.length} total</span>}
                </div>
                <button onClick={() => setShowNotifications(false)} className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center">
                  <X size={14} className="text-[#8E8E93]" />
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
                    <p className="text-[13px] text-[#8E8E93]">No alarm history</p>
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
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: alarm.isProcessed ? '#48484A' : dotColor }} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] font-semibold ${alarm.isProcessed ? 'text-[#8E8E93]' : 'text-[#FFFFFF]'}`}>
                            {alarm.alarmMessage || alarm.alarmCode}
                          </div>
                          <div className="text-[11px] text-[#48484A] mt-0.5">
                            {alarm.deviceName && <>{alarm.deviceName} · </>}
                            {alarm.createdAt ? new Date(alarm.createdAt).toLocaleString() : ''}
                          </div>
                        </div>
                        {alarm.isProcessed && <Check size={12} className="text-[#48484A] mt-1 flex-shrink-0" />}
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
              className="w-full bg-[#1C1C1E] rounded-t-[28px] p-6 pb-10"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-bold text-[#FFFFFF]">Display Settings</h3>
                <button onClick={() => setShowDisplaySettings(false)} className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center">
                  <X size={14} className="text-[#8E8E93]" />
                </button>
              </div>
              <p className="text-[11px] text-[#48484A] mb-4">Choose which sections to show on the overview screen</p>
              <div className="flex flex-col gap-2">
                {displayItems.map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between py-3 border-b border-[rgba(255,255,255,0.06)]">
                    <div className="flex items-center gap-3">
                      {displayConfig[key] ? <Eye size={15} className="text-[#01D6BE]" /> : <EyeOff size={15} className="text-[#48484A]" />}
                      <div>
                        <div className={`text-[13px] font-medium ${displayConfig[key] ? 'text-[#FFFFFF]' : 'text-[#48484A]'}`}>{label}</div>
                        <div className="text-[10px] text-[#48484A]">{desc}</div>
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

      {/* ===== Remove Device Confirm ===== */}
      <AnimatePresence>
        {showRemoveConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.7)] z-50 flex items-center justify-center p-6"
            onClick={() => setShowRemoveConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#1C1C1E] rounded-[24px] p-6"
            >
              <div className="w-14 h-14 rounded-full bg-[rgba(255,59,48,0.12)] flex items-center justify-center mx-auto mb-4">
                <Trash2 size={28} className="text-[#FF3B30]" />
              </div>
              <h3 className="text-lg font-bold text-[#FFFFFF] text-center mb-2">Remove Device</h3>
              <p className="text-[13px] text-[#8E8E93] text-center mb-6">
                Are you sure you want to remove <span className="text-[#FFFFFF] font-medium">{deviceName}</span> from your account? This will unbind it.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowRemoveConfirm(false)} className="flex-1 py-3 rounded-xl bg-[#2C2C2E] text-[#FFFFFF] text-[14px] font-medium">
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (selectedDeviceId) {
                      setRemovingDevice(true)
                      try {
                        await useDeviceStore.getState().removeDevice([Number(selectedDeviceId)])
                        navigate('/', { replace: true })
                      } catch { /* handled in store */ } finally {
                        setRemovingDevice(false)
                        setShowRemoveConfirm(false)
                      }
                    }
                  }}
                  disabled={removingDevice}
                  className="flex-1 py-3 rounded-xl bg-[#FF3B30] text-[#FFFFFF] text-[14px] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {removingDevice ? (<><Loader2 size={14} className="animate-spin" /> Removing...</>) : 'Remove'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
