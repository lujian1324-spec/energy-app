import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Sun,
  Zap,
  Pencil,
  TrendingUp,
  TrendingDown,
  X,
  Check,
  Eye,
  EyeOff,
  Loader2,
  LayoutGrid,
} from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'
import { 
  showPowerOutageNotification,
  getNotificationPermission,
  requestNotificationPermission,
  getIOSPushStatus,
  isIOS
} from '../utils/pushNotification'

const notifications = [
  { id: 1, type: 'info', title: 'Battery at 90%', desc: 'Estimated full charge in 1h 24m', time: '2 min ago', read: false },
  { id: 2, type: 'success', title: 'Solar Input Active', desc: 'Solar panel connected · +280W', time: '15 min ago', read: false },
  { id: 3, type: 'warning', title: 'AC Out 2 Idle', desc: 'Port has no load for 2 hours', time: '1h ago', read: true },
  { id: 4, type: 'info', title: 'ECO Mode Available', desc: 'Output load below 10W threshold', time: '2h ago', read: true },
]

// 锁屏断电警报弹窗数据
const powerOutageAlert = {
  title: 'Power outage. Backup activated.',
  desc: 'The remaining 90% battery will last up to 16 hours.',
  time: 'Now',
}

export default function OverviewPage() {
  const { powerStation, settings, updateSettings, updateDeviceName } = usePowerStationStore()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showDisplaySettings, setShowDisplaySettings] = useState(false)
  const [showLockScreenAlert, setShowLockScreenAlert] = useState(false)
  const [notifList, setNotifList] = useState(notifications)
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default')
  const [isPushing, setIsPushing] = useState(false)
  
  // 设备名称编辑状态
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState(powerStation.name)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const [displayConfig, setDisplayConfig] = useState({
    showBatteryRing: true,
    showSolarInput: true,
    showTimeToFull: true,
    showPortStatus: true,
  })

  // Real-Time Power 图表数据源切换
  const [powerDataSource, setPowerDataSource] = useState<'ac' | 'solar' | 'output'>('ac')

  // 三组模拟数据
  const powerData = {
    ac: {
      value: 400,
      points: "0,50 30,42 60,45 90,35 120,40 150,28 180,38 210,32 240,36 270,30 300,34",
      fillPoints: "0,50 30,42 60,45 90,35 120,40 150,28 180,38 210,32 240,36 270,30 300,34 300,80 0,80",
      color: '#01D6BE',
    },
    solar: {
      value: 280,
      points: "0,55 30,50 60,52 90,45 120,48 150,40 180,42 210,38 240,40 270,35 300,38",
      fillPoints: "0,55 30,50 60,52 90,45 120,48 150,40 180,42 210,38 240,40 270,35 300,38 300,80 0,80",
      color: '#FF9500',
    },
    output: {
      value: 200,
      points: "0,60 30,58 60,55 90,52 120,54 150,50 180,52 210,48 240,50 270,46 300,48",
      fillPoints: "0,60 30,58 60,55 90,52 120,54 150,50 180,52 210,48 240,50 270,46 300,48 300,80 0,80",
      color: '#8E8E93',
    },
  }

  const currentPowerData = powerData[powerDataSource]

  // 检查推送权限状态
  useEffect(() => {
    setPushPermission(getNotificationPermission())
    
    // 检查 iOS 推送支持状态
    if (isIOS()) {
      const iosStatus = getIOSPushStatus()
      console.log('[OverviewPage] iOS Push Status:', iosStatus)
      if (!iosStatus.supported) {
        console.warn('[OverviewPage] iOS Push not supported:', iosStatus.message)
      }
    }
  }, [])

  // 处理铃铛按钮点击 - 动态反馈 + 10秒后推送
  const handleBellClick = async () => {
    // 检查 iOS 支持状态
    if (isIOS()) {
      const iosStatus = getIOSPushStatus()
      if (!iosStatus.supported) {
        alert(iosStatus.message)
        return
      }
    }
    
    // 视觉反馈：按钮缩放动画
    setIsPushing(true)
    
    // 请求权限
    const permission = await requestNotificationPermission()
    setPushPermission(permission)
    
    if (permission === 'granted') {
      // 10秒后发送推送通知
      setTimeout(() => {
        showPowerOutageNotification()
        setIsPushing(false)
      }, 10000)
    } else {
      setIsPushing(false)
    }
  }

  const unreadCount = notifList.filter(n => !n.read).length
  const markAllRead = () => setNotifList(prev => prev.map(n => ({ ...n, read: true })))

  // 处理开始编辑设备名称
  const handleStartEditName = () => {
    setEditName(powerStation.name)
    setIsEditingName(true)
    // 聚焦输入框
    setTimeout(() => nameInputRef.current?.focus(), 100)
  }

  // 处理保存设备名称
  const handleSaveName = () => {
    const trimmedName = editName.trim()
    if (trimmedName && trimmedName !== powerStation.name) {
      updateDeviceName(trimmedName)
    }
    setIsEditingName(false)
  }

  // 处理取消编辑
  const handleCancelEditName = () => {
    setEditName(powerStation.name)
    setIsEditingName(false)
  }

  // 处理输入框键盘事件
  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName()
    } else if (e.key === 'Escape') {
      handleCancelEditName()
    }
  }

  const displayItems = [
    { key: 'showBatteryRing', label: 'Battery Ring', desc: 'Main power ring gauge' },
    { key: 'showSolarInput', label: 'Solar Input', desc: 'Solar charging info' },
    { key: 'showTimeToFull', label: 'Time to Full', desc: 'Estimated full charge time' },
    { key: 'showPortStatus', label: 'Port Status', desc: 'Active port display' },
  ] as const

  return (
    <div className="h-full flex flex-col bg-[#000000] overflow-hidden relative pt-6">
      {/* 顶部隐形状态栏区域 - 用于对齐手机状态栏 */}
      <div className="h-8 px-5 flex justify-between items-center opacity-0">
        <span className="text-[12px] text-[#FFFFFF]">{powerStation.batteryLevel}%</span>
      </div>

      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Header - 扁平化：设备名 + 编辑图标 + 设置图标 */}
        <div className="flex justify-between items-center px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    onBlur={handleSaveName}
                    className="text-xl font-bold text-[#FFFFFF] tracking-wide bg-transparent border-b-2 border-[#01D6BE] outline-none w-[160px]"
                    maxLength={20}
                  />
                  <button 
                    onClick={handleSaveName}
                    className="w-6 h-6 rounded-full bg-[#01D6BE] flex items-center justify-center"
                  >
                    <Check size={12} className="text-[#000000]" />
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-[#FFFFFF] tracking-wide">{powerStation.name}</h2>
                  <button 
                    onClick={handleStartEditName}
                    className="w-6 h-6 rounded-full bg-[#1C1C1E] flex items-center justify-center hover:bg-[#2C2C2E] transition-colors"
                  >
                    <Pencil size={12} className="text-[#8E8E93]" />
                  </button>
                </>
              )}
            </div>
            <p className="text-xs text-[#8E8E93] mt-0.5">Connected</p>
          </div>
          <motion.button
            onClick={handleBellClick}
            disabled={isPushing}
            whileTap={{ scale: 0.85 }}
            animate={isPushing ? { 
              scale: [1, 1.1, 1],
              transition: { duration: 0.5, repeat: Infinity }
            } : {}}
            className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center relative
              disabled:opacity-70 transition-colors"
          >
            {isPushing ? (
              <Loader2 size={16} className="text-[#01D6BE] animate-spin" />
            ) : (
              <Bell size={18} className="text-[#FFFFFF]" />
            )}
            {unreadCount > 0 && !isPushing && (
              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#FF3B30]" />
            )}
          </motion.button>
        </div>

        {/* 电量英雄区 - 扁平化 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-5 mb-5 bg-[#1C1C1E] rounded-[24px] p-5"
        >
          <div className="flex justify-center mb-4">
            <BatteryRing
              percentage={powerStation.batteryLevel}
              isCharging={powerStation.isCharging}
              timeToFull="1h 24m"
            />
          </div>

          {/* 输入/输出功率标签 - Input 绿色高亮，Output 灰色 */}
          <div className="flex justify-center gap-4 mb-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[rgba(1,214,190,0.15)] border border-[rgba(1,214,190,0.3)]">
              <TrendingDown size={13} className="text-[#01D6BE]" />
              <span className="text-[11px] text-[#01D6BE]">Input</span>
              <span className="text-[12px] font-semibold text-[#01D6BE]">
                {powerStation.inputPower}W
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2C2C2E]">
              <TrendingUp size={13} className="text-[#8E8E93]" />
              <span className="text-[11px] text-[#8E8E93]">Output</span>
              <span className="text-[12px] font-semibold text-[#8E8E93]">
                {powerStation.outputPower}W
              </span>
            </div>
          </div>
        </motion.div>

        {/* Real-Time Power 大卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mx-5 mb-5 bg-[#1C1C1E] rounded-[24px] p-4"
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-semibold text-[#FFFFFF]">Real-Time Power</span>
            <motion.span 
              key={currentPowerData.value}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
              style={{ 
                backgroundColor: `${currentPowerData.color}26`,
                color: currentPowerData.color 
              }}
            >
              {currentPowerData.value}w
            </motion.span>
          </div>
          
          {/* 图表区域 */}
          <div className="h-24 relative overflow-hidden mb-3">
            <svg width="100%" height="100%" viewBox="0 0 300 80" preserveAspectRatio="none">
              {/* 网格线 */}
              <line x1="0" y1="20" x2="300" y2="20" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <line x1="0" y1="40" x2="300" y2="40" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <line x1="0" y1="60" x2="300" y2="60" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              {/* 动态折线 */}
              <motion.polyline
                key={`line-${powerDataSource}`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                points={currentPowerData.points}
                fill="none"
                stroke={currentPowerData.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* 动态填充区域 */}
              <motion.polygon
                key={`fill-${powerDataSource}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                points={currentPowerData.fillPoints}
                fill={currentPowerData.color}
                fillOpacity="0.1"
              />
            </svg>
          </div>
          
          {/* 底部三个可切换选项 - AC / Solar / Output */}
          <div className="flex justify-around pt-3 border-t border-[rgba(255,255,255,0.06)]">
            {[
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

        {/* 三个小卡片 - AC / Solar / Output */}
        <div className="px-5 mb-5">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'AC', value: '400W', icon: Zap, color: '#01D6BE' },
              { label: 'Solar', value: '0W', icon: Sun, color: '#8E8E93' },
              { label: 'Output', value: '200W', icon: TrendingUp, color: '#8E8E93' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="bg-[#1C1C1E] rounded-[18px] p-3.5 flex flex-col items-center">
                  <Icon size={18} className="mb-2" style={{ color: item.color }} />
                  <div className="text-[11px] text-[#8E8E93] mb-1">{item.label}</div>
                  <div className="text-[16px] font-bold text-[#FFFFFF]">{item.value}</div>
                </div>
              )
            })}
          </div>
        </div>


      </div>

      {/* ===== 通知面板 ===== */}
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
                  <h3 className="text-base font-bold text-[#FFFFFF]">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-[11px] text-[#FF3B30]">{unreadCount} unread</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-[11px] text-[#01D6BE] px-3 py-1 rounded-full
                        bg-[rgba(1,214,190,0.1)]"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center"
                  >
                    <X size={14} className="text-[#8E8E93]" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto scrollbar-hide">
                {notifList.map((n) => {
                  const typeColors: Record<string, string> = {
                    info: '#01D6BE',
                    success: '#34C759',
                    warning: '#FF9500',
                    error: '#FF3B30',
                  }
                  
                  return (
                    <div
                      key={n.id}
                      onClick={() => setNotifList(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))}
                      className={`flex items-start gap-3 p-3.5 rounded-[16px] cursor-pointer
                        ${n.read
                          ? 'bg-[rgba(255,255,255,0.03)]'
                          : 'bg-[rgba(1,214,190,0.05)]'
                        }`}
                    >
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: n.read ? 'transparent' : typeColors[n.type] }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] font-semibold ${n.read ? 'text-[#8E8E93]' : 'text-[#FFFFFF]'}`}>
                          {n.title}
                        </div>
                        <div className="text-[11px] text-[#48484A] mt-0.5">{n.desc}</div>
                      </div>
                      <div className="text-[10px] text-[#48484A] whitespace-nowrap mt-0.5">{n.time}</div>
                      {n.read && <Check size={12} className="text-[#48484A] mt-1 flex-shrink-0" />}
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
                <button
                  onClick={() => setShowDisplaySettings(false)}
                  className="w-7 h-7 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center"
                >
                  <X size={14} className="text-[#8E8E93]" />
                </button>
              </div>
              <p className="text-[11px] text-[#48484A] mb-4">Choose which sections to show on the overview screen</p>
              <div className="flex flex-col gap-2">
                {displayItems.map(({ key, label, desc }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-3 border-b border-[rgba(255,255,255,0.06)]"
                  >
                    <div className="flex items-center gap-3">
                      {displayConfig[key]
                        ? <Eye size={15} className="text-[#01D6BE]" />
                        : <EyeOff size={15} className="text-[#48484A]" />
                      }
                      <div>
                        <div className={`text-[13px] font-medium ${displayConfig[key] ? 'text-[#FFFFFF]' : 'text-[#48484A]'}`}>
                          {label}
                        </div>
                        <div className="text-[10px] text-[#48484A]">{desc}</div>
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

      {/* ===== 锁屏断电警报弹窗 ===== */}
      <AnimatePresence>
        {showLockScreenAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] flex items-start justify-center pt-16 px-4"
            onClick={() => setShowLockScreenAlert(false)}
          >
            {/* 锁屏背景模糊效果 */}
            <div className="absolute inset-0 bg-[rgba(0,0,0,0.4)] backdrop-blur-sm" />

            {/* 锁屏通知卡片 */}
            <motion.div
              initial={{ y: -40, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[340px] bg-[rgba(245,245,245,0.95)] rounded-[24px] p-4 shadow-2xl"
            >
              {/* 时间显示 */}
              <div className="flex justify-center mb-3">
                <span className="text-[11px] font-medium text-[#8E8E93] tracking-wide">
                  {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              </div>

              {/* 通知内容 */}
              <div className="flex items-start gap-3">
                {/* App Icon */}
                <div className="w-11 h-11 rounded-[12px] bg-[#000000] flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-bold text-[#01D6BE] tracking-wider">PF</span>
                </div>

                {/* 文字内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[12px] font-semibold text-[#1C1C1E]">SIERRO</span>
                    <span className="text-[10px] text-[#8E8E93]">{powerOutageAlert.time}</span>
                  </div>
                  <div className="text-[13px] font-bold text-[#1C1C1E] leading-snug mb-1">
                    {powerOutageAlert.title}
                  </div>
                  <div className="text-[12px] text-[#666666] leading-relaxed">
                    {powerOutageAlert.desc}
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-[rgba(0,0,0,0.08)]">
                <button
                  onClick={() => setShowLockScreenAlert(false)}
                  className="flex-1 py-2 rounded-[10px] bg-[rgba(0,0,0,0.06)] text-[12px] font-medium text-[#666666] hover:bg-[rgba(0,0,0,0.1)] transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => { setShowLockScreenAlert(false); setShowNotifications(true) }}
                  className="flex-1 py-2 rounded-[10px] bg-[#01D6BE] text-[12px] font-semibold text-[#000000] hover:bg-[#01A88F] transition-colors"
                >
                  View Details
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
