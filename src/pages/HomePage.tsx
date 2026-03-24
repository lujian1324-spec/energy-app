import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Settings,
  Sun,
  Home,
  Car,
  Mountain,
  ArrowRight,
  Zap,
  Lightbulb,
  FileText,
  RefreshCw,
  Wifi,
  Share2,
  X,
  Check,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
} from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'
import type { OperatingMode } from '../types'

const modes: { id: OperatingMode; name: string; description: string; icon: React.ElementType }[] = [
  { id: 'solar', name: 'SOLAR', description: 'Solar PV\nPriority', icon: Sun },
  { id: 'backup', name: 'BACKUP', description: 'Auto switch\non outage', icon: Home },
  { id: 'car', name: 'CAR', description: 'Vehicle\nCharging', icon: Car },
  { id: 'outdoor', name: 'OUTDOOR', description: 'Quiet\nMode', icon: Mountain },
]

// 通知数据
const notifications = [
  { id: 1, type: 'info', title: 'Battery at 76%', desc: 'Estimated full charge in 1h 24m', time: '2 min ago', read: false },
  { id: 2, type: 'success', title: 'Solar Input Active', desc: 'Solar panel connected · +280W', time: '15 min ago', read: false },
  { id: 3, type: 'warning', title: 'AC Out 2 Idle', desc: 'Port has no load for 2 hours', time: '1h ago', read: true },
  { id: 4, type: 'info', title: 'ECO Mode Available', desc: 'Output load below 10W threshold', time: '2h ago', read: true },
]

export default function HomePage() {
  const { powerStation, settings, setMode, updateSettings } = usePowerStationStore()
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  )
  const [showNotifications, setShowNotifications] = useState(false)
  const [showDisplaySettings, setShowDisplaySettings] = useState(false)
  const [notifList, setNotifList] = useState(notifications)
  const [ledOn, setLedOn] = useState(false)
  const [quietMode, setQuietMode] = useState(false)

  // 显示设置项
  const [displayConfig, setDisplayConfig] = useState({
    showBatteryRing: true,
    showSolarInput: true,
    showTimeToFull: true,
    showOperatingModes: true,
    showPortStatus: true,
    showQuickActions: true,
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const tick = () => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      )
    }
    const now = new Date()
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
    const timeout = setTimeout(() => {
      tick()
      intervalRef.current = setInterval(tick, 60000)
    }, msToNextMinute)
    return () => {
      clearTimeout(timeout)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const unreadCount = notifList.filter(n => !n.read).length

  const markAllRead = () => setNotifList(prev => prev.map(n => ({ ...n, read: true })))

  const handleQuickAction = (label: string) => {
    if (label === 'LED Light') setLedOn(v => !v)
    if (label === 'Quiet Mode') {
      setQuietMode(v => !v)
      updateSettings({ ecoMode: !settings.ecoMode })
    }
    if (label === 'Usage Report') setShowDisplaySettings(true)
    if (label === 'Cycle Mode') {
      const modeOrder: OperatingMode[] = ['solar', 'backup', 'car', 'outdoor']
      const idx = modeOrder.indexOf(powerStation.mode)
      setMode(modeOrder[(idx + 1) % modeOrder.length])
    }
    if (label === 'Remote') updateSettings({ bluetooth: !settings.bluetooth })
    if (label === 'Data Share') updateSettings({ cloudSync: !settings.cloudSync })
  }

  const quickActions = [
    { icon: Lightbulb, label: 'LED Light', active: ledOn },
    { icon: quietMode ? VolumeX : Volume2, label: 'Quiet Mode', active: quietMode },
    { icon: FileText, label: 'Usage Report', active: false },
    { icon: RefreshCw, label: 'Cycle Mode', active: false },
    { icon: Wifi, label: 'Remote', active: settings.bluetooth },
    { icon: Share2, label: 'Data Share', active: settings.cloudSync },
  ]

  const displayItems = [
    { key: 'showBatteryRing', label: 'Battery Ring', desc: 'Main power ring gauge' },
    { key: 'showSolarInput', label: 'Solar Input', desc: 'Solar charging info' },
    { key: 'showTimeToFull', label: 'Time to Full', desc: 'Estimated full charge time' },
    { key: 'showOperatingModes', label: 'Operating Modes', desc: 'Mode selector cards' },
    { key: 'showPortStatus', label: 'Port Status', desc: 'Active port display' },
    { key: 'showQuickActions', label: 'Quick Actions', desc: 'Action shortcuts bar' },
  ] as const

  return (
    <div className="h-full flex flex-col bg-[#080E1A] overflow-hidden relative">
      {/* 状态栏 */}
      <div className="flex justify-between items-center px-6 pt-3 pb-2 safe-area-top">
        <span className="text-[15px] font-semibold text-[#E8F4FF] tracking-wide">{currentTime}</span>
        <div className="flex items-center gap-1.5">
          <svg width="16" height="11" viewBox="0 0 16 11" className="fill-[#E8F4FF]">
            <rect x="0" y="3" width="3" height="8" rx="0.5" opacity="0.3"/>
            <rect x="4" y="2" width="3" height="9" rx="0.5" opacity="0.5"/>
            <rect x="8" y="0.5" width="3" height="10.5" rx="0.5" opacity="0.8"/>
            <rect x="12" y="0" width="3" height="11" rx="0.5"/>
          </svg>
          <div className="flex items-center gap-1 text-[11px] text-[#E8F4FF] font-medium">
            <svg width="22" height="11" viewBox="0 0 22 11">
              <rect x="0" y="1" width="19" height="9" rx="2" stroke="#E8F4FF" strokeWidth="1" fill="none"/>
              <rect x="19.5" y="3.5" width="2.5" height="4" rx="1" fill="#E8F4FF" opacity="0.6"/>
              <rect x="1" y="2" width={Math.round(17 * powerStation.batteryLevel / 100)} height="7" rx="1.5" fill="#00D4FF"/>
            </svg>
            {powerStation.batteryLevel}%
          </div>
        </div>
      </div>

      {/* 动态岛 */}
      <div className="flex justify-center mb-1">
        <div className="w-[120px] h-[34px] bg-black rounded-[20px] flex items-center justify-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#1a1a1a] border border-[#333]" />
        </div>
      </div>

      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-2">
          <div>
            <h2 className="text-xl font-bold text-[#E8F4FF] tracking-wide">Power Overview</h2>
            <p className="text-xs text-[#7A9AB8] mt-0.5">{powerStation.name} · Connected</p>
          </div>
          <div className="flex gap-2.5">
            {/* 铃铛 - 点击弹出通知 */}
            <button
              onClick={() => { setShowNotifications(true); setShowDisplaySettings(false) }}
              className="w-9 h-9 rounded-[14px] bg-[#111E33] border border-[rgba(0,212,255,0.08)] 
                       flex items-center justify-center relative
                       hover:border-[rgba(0,212,255,0.4)] transition-all duration-250"
            >
              <Bell size={18} className="text-[#E8F4FF]" />
              {unreadCount > 0 && (
                <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#FF4757] 
                              border-2 border-[#080E1A] shadow-[0_0_6px_#FF4757]" />
              )}
            </button>
            {/* 齿轮 - 点击弹出显示设置 */}
            <button
              onClick={() => { setShowDisplaySettings(true); setShowNotifications(false) }}
              className="w-9 h-9 rounded-[14px] bg-[#111E33] border border-[rgba(0,212,255,0.08)] 
                       flex items-center justify-center
                       hover:border-[rgba(0,212,255,0.4)] transition-all duration-250"
            >
              <Settings size={18} className="text-[#E8F4FF]" />
            </button>
          </div>
        </div>

        {/* 电量英雄区 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-5 mb-5 bg-[#111E33] border border-[rgba(0,212,255,0.08)] 
                     rounded-[28px] p-5 relative overflow-hidden"
        >
          <div className="absolute w-[200px] h-[200px] rounded-full 
                        bg-[radial-gradient(circle,rgba(0,212,255,0.08),transparent_70%)] 
                        -top-10 -right-10 pointer-events-none" />

          <div className="flex justify-between items-start mb-5">
            <div>
              <div className="text-sm font-semibold text-[#E8F4FF]">{powerStation.name}</div>
              <div className="text-[11px] text-[#7A9AB8] mt-0.5">S/N: {powerStation.serialNumber}</div>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full 
                          bg-[rgba(0,255,156,0.12)] text-[#00FF9C] border border-[rgba(0,255,156,0.25)]
                          text-[11px] font-semibold tracking-wide">
              <span className="animate-blink">●</span>
              {powerStation.isCharging ? 'Charging' : 'Discharging'}
            </div>
          </div>

          <div className="flex items-center gap-5">
            {displayConfig.showBatteryRing && (
              <BatteryRing
                percentage={powerStation.batteryLevel}
                isCharging={powerStation.isCharging}
              />
            )}
            <div className="flex-1 flex flex-col gap-3">
              <div>
                <div className="text-[10px] text-[#7A9AB8] tracking-wide uppercase">Remaining</div>
                <div className="text-base font-bold text-[#00D4FF]">
                  {powerStation.remainingWh}<span className="text-[11px] font-normal text-[#7A9AB8] ml-0.5">Wh</span>
                </div>
              </div>
              {displayConfig.showTimeToFull && (
                <div>
                  <div className="text-[10px] text-[#7A9AB8] tracking-wide uppercase">Full In</div>
                  <div className="text-base font-bold text-[#FFB800]">{powerStation.timeToFull}</div>
                </div>
              )}
              {displayConfig.showSolarInput && (
                <div>
                  <div className="text-[10px] text-[#7A9AB8] tracking-wide uppercase">Solar In</div>
                  <div className="text-base font-bold text-[#00FF9C]">
                    +{powerStation.inputPower}<span className="text-[11px] font-normal text-[#7A9AB8] ml-0.5">W</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-[#7A9AB8] mb-1.5">
              <span>0%</span>
              <span className="text-[#9BB8D4]">CURRENT</span>
              <span className="text-[#00FF9C] font-semibold">{powerStation.batteryLevel}% · {powerStation.remainingWh}Wh</span>
            </div>
            <div className="h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-visible relative">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#0090FF] to-[#00D4FF] 
                         shadow-[0_0_8px_rgba(0,212,255,0.4)]"
                initial={{ width: 0 }}
                animate={{ width: `${powerStation.batteryLevel}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-[#FFB800]
                           shadow-[0_0_5px_rgba(255,184,0,0.7)] pointer-events-none"
                style={{ left: `${settings.chargeLimit}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[#7A9AB8] mt-1.5">
              <span>EMPTY</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#FFB800]" />
                <span className="text-[#FFB800]">{settings.chargeLimit}% LIMIT</span>
              </span>
              <span>FULL</span>
            </div>
          </div>
        </motion.div>

        {/* 运行模式 */}
        {displayConfig.showOperatingModes && (
          <div className="px-5 mb-3">
            <div className="text-[13px] font-bold text-[#7A9AB8] tracking-wider uppercase mb-2.5">
              Operating Modes
            </div>
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
              {modes.map((mode) => {
                const Icon = mode.icon
                const isActive = powerStation.mode === mode.id
                return (
                  <motion.button
                    key={mode.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setMode(mode.id)}
                    className={`
                      flex-1 min-w-[80px] bg-[#111E33] border rounded-[20px] p-3.5
                      relative overflow-hidden transition-all duration-250
                      ${isActive
                        ? 'border-[rgba(0,212,255,0.4)] bg-[rgba(0,212,255,0.05)] shadow-[0_0_20px_rgba(0,212,255,0.1)]'
                        : 'border-[rgba(0,212,255,0.08)]'
                      }
                    `}
                  >
                    {isActive && (
                      <div className="absolute top-0 left-0 right-0 h-px 
                                    bg-gradient-to-r from-transparent via-[rgba(0,212,255,0.5)] to-transparent" />
                    )}
                    <Icon size={20} className={`mb-1.5 ${isActive ? 'text-[#00D4FF]' : 'text-[#7A9AB8]'}`} />
                    <div className={`text-[11px] font-bold tracking-wide uppercase mb-0.5
                                   ${isActive ? 'text-[#00D4FF]' : 'text-[#9BB8D4]'}`}>
                      {mode.name}
                    </div>
                    <div className="text-[10px] text-[#3D5A78] leading-tight whitespace-pre-line">
                      {mode.description}
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>
        )}

        {/* 端口状态 - 过滤掉 usb-out 类型端口 */}
        {displayConfig.showPortStatus && (
          <div className="px-5 mb-3">
            <div className="text-[13px] font-bold text-[#7A9AB8] tracking-wider uppercase mb-2.5">
              Port Status
            </div>
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
              {powerStation.ports
                .filter(p => p.status === 'active' && p.type !== 'usb-out')
                .map((port) => (
                <div
                  key={port.id}
                  className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] 
                           rounded-[14px] p-3.5 flex items-start gap-2.5 min-w-[140px] flex-shrink-0"
                >
                  <div className={`
                    w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                    ${port.type === 'ac-out' ? 'bg-[rgba(0,255,156,0.12)] text-[#00FF9C]' : ''}
                    ${port.type === 'ac-in' ? 'bg-[rgba(0,212,255,0.12)] text-[#00D4FF]' : ''}
                    ${port.type === 'dc-in' ? 'bg-[rgba(255,184,0,0.12)] text-[#FFB800]' : ''}
                  `}>
                    {port.type.includes('out') ? (
                      <ArrowRight size={16} />
                    ) : (
                      <Zap size={16} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#E8F4FF] truncate">{port.name}</div>
                    <div className="text-[10px] text-[#7A9AB8] mt-0.5">{port.deviceName || 'Idle'}</div>
                  </div>
                  <div className="text-right">
                    <div className={`
                      text-[13px] font-bold
                      ${port.type === 'ac-out' ? 'text-[#00FF9C]' : 'text-[#00D4FF]'}
                    `}>
                      {port.power > 0 ? `${port.type.includes('out') ? '' : '+'}${port.power}W` : '—'}
                    </div>
                    <div className="text-[9px] text-[#3D5A78]">
                      {port.power > 0 ? (port.type.includes('out') ? 'In Use' : 'Charging') : 'Unused'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 快捷操作 */}
        {displayConfig.showQuickActions && (
          <div className="px-5 pb-6">
            <div className="text-[13px] font-bold text-[#7A9AB8] tracking-wider uppercase mb-2.5">
              Quick Actions
            </div>
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
              {quickActions.map((action) => {
                const Icon = action.icon
                return (
                  <motion.button
                    key={action.label}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleQuickAction(action.label)}
                    className="flex flex-col items-center gap-1.5 flex-shrink-0"
                  >
                    <div className={`w-[54px] h-[54px] rounded-[20px] 
                                  flex items-center justify-center
                                  transition-all duration-250
                                  ${action.active
                                    ? 'bg-[rgba(0,212,255,0.15)] border border-[rgba(0,212,255,0.5)] shadow-[0_0_12px_rgba(0,212,255,0.2)]'
                                    : 'bg-[#111E33] border border-[rgba(0,212,255,0.08)] hover:border-[rgba(0,212,255,0.4)] hover:bg-[rgba(0,212,255,0.06)]'
                                  }`}>
                      <Icon size={22} className={action.active ? 'text-[#00D4FF]' : 'text-[#E8F4FF]'} />
                    </div>
                    <span className={`text-[10px] whitespace-nowrap ${action.active ? 'text-[#00D4FF]' : 'text-[#7A9AB8]'}`}>
                      {action.label}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ===== 通知面板 ===== */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.6)] backdrop-blur-sm z-50 flex items-start"
            onClick={() => setShowNotifications(false)}
          >
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#111E33] border-b border-[rgba(0,212,255,0.15)] rounded-b-[28px] p-5 pt-4"
            >
              {/* 标题栏 */}
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-base font-bold text-[#E8F4FF]">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-[11px] text-[#FF4757]">{unreadCount} unread</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-[11px] text-[#00D4FF] px-3 py-1 rounded-full
                                 bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.2)]"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center"
                  >
                    <X size={14} className="text-[#7A9AB8]" />
                  </button>
                </div>
              </div>

              {/* 通知列表 */}
              <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto scrollbar-hide">
                {notifList.map((n) => {
                  const typeColors: Record<string, string> = {
                    info: '#00D4FF',
                    success: '#00FF9C',
                    warning: '#FFB800',
                    error: '#FF4757',
                  }
                  return (
                    <div
                      key={n.id}
                      onClick={() => setNotifList(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))}
                      className={`flex items-start gap-3 p-3.5 rounded-[16px] cursor-pointer transition-all
                                 ${n.read
                                   ? 'bg-[rgba(255,255,255,0.03)]'
                                   : 'bg-[rgba(0,212,255,0.05)] border border-[rgba(0,212,255,0.12)]'
                                 }`}
                    >
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: n.read ? 'transparent' : typeColors[n.type] }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] font-semibold ${n.read ? 'text-[#7A9AB8]' : 'text-[#E8F4FF]'}`}>
                          {n.title}
                        </div>
                        <div className="text-[11px] text-[#3D5A78] mt-0.5">{n.desc}</div>
                      </div>
                      <div className="text-[10px] text-[#3D5A78] whitespace-nowrap mt-0.5">{n.time}</div>
                      {n.read && <Check size={12} className="text-[#3D5A78] mt-1 flex-shrink-0" />}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== 显示设置面板 ===== */}
      <AnimatePresence>
        {showDisplaySettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.6)] backdrop-blur-sm z-50 flex items-end"
            onClick={() => setShowDisplaySettings(false)}
          >
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#111E33] border-t border-[rgba(0,212,255,0.15)] rounded-t-[28px] p-6 pb-10"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.15)] rounded-full mx-auto mb-5" />
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-bold text-[#E8F4FF]">Display Settings</h3>
                <button
                  onClick={() => setShowDisplaySettings(false)}
                  className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center"
                >
                  <X size={14} className="text-[#7A9AB8]" />
                </button>
              </div>
              <p className="text-[11px] text-[#3D5A78] mb-4">Choose which sections to show on the home screen</p>
              <div className="flex flex-col gap-2">
                {displayItems.map(({ key, label, desc }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-3 border-b border-[rgba(0,212,255,0.06)]"
                  >
                    <div className="flex items-center gap-3">
                      {displayConfig[key]
                        ? <Eye size={15} className="text-[#00D4FF]" />
                        : <EyeOff size={15} className="text-[#3D5A78]" />
                      }
                      <div>
                        <div className={`text-[13px] font-medium ${displayConfig[key] ? 'text-[#E8F4FF]' : 'text-[#3D5A78]'}`}>
                          {label}
                        </div>
                        <div className="text-[10px] text-[#3D5A78]">{desc}</div>
                      </div>
                    </div>
                    <ToggleSwitch
                      isOn={displayConfig[key]}
                      onToggle={() => setDisplayConfig(prev => ({ ...prev, [key]: !prev[key] }))}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
