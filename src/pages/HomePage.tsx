import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
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
  Share2
} from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import { usePowerStationStore } from '../stores/powerStationStore'
import type { OperatingMode } from '../types'

const modes: { id: OperatingMode; name: string; description: string; icon: React.ElementType }[] = [
  { id: 'solar', name: 'SOLAR', description: 'Solar PV\nPriority', icon: Sun },
  { id: 'backup', name: 'BACKUP', description: 'Auto switch\non outage', icon: Home },
  { id: 'car', name: 'CAR', description: 'Vehicle\nCharging', icon: Car },
  { id: 'outdoor', name: 'OUTDOOR', description: 'Quiet\nMode', icon: Mountain },
]

const quickActions = [
  { icon: Lightbulb, label: 'LED Light' },
  { icon: Zap, label: 'Quiet Mode' },
  { icon: FileText, label: 'Usage Report' },
  { icon: RefreshCw, label: 'Cycle Mode' },
  { icon: Wifi, label: 'Remote' },
  { icon: Share2, label: 'Data Share' },
]

export default function HomePage() {
  const { powerStation, settings, setMode } = usePowerStationStore()
  const [currentTime, setCurrentTime] = useState(() => 
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  )
  // 用 ref 保存 interval，防止 stale-closure 内存泄漏
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const tick = () => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      )
    }
    // 对齐到下一分钟整点后开始循环
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

  return (
    <div className="h-full flex flex-col bg-[#080E1A] overflow-hidden">
      {/* 状态栏 */}
      <div className="flex justify-between items-center px-6 pt-3 pb-2 safe-area-top">
        <span className="text-[15px] font-semibold text-[#E8F4FF] tracking-wide">{currentTime}</span>
        <div className="flex items-center gap-1.5">
          {/* 信号图标 */}
          <svg width="16" height="11" viewBox="0 0 16 11" className="fill-[#E8F4FF]">
            <rect x="0" y="3" width="3" height="8" rx="0.5" opacity="0.3"/>
            <rect x="4" y="2" width="3" height="9" rx="0.5" opacity="0.5"/>
            <rect x="8" y="0.5" width="3" height="10.5" rx="0.5" opacity="0.8"/>
            <rect x="12" y="0" width="3" height="11" rx="0.5"/>
          </svg>
          {/* 电池图标 */}
          <div className="flex items-center gap-1 text-[11px] text-[#E8F4FF] font-medium">
            <svg width="22" height="11" viewBox="0 0 22 11">
              <rect x="0" y="1" width="19" height="9" rx="2" stroke="#E8F4FF" strokeWidth="1" fill="none"/>
              <rect x="19.5" y="3.5" width="2.5" height="4" rx="1" fill="#E8F4FF" opacity="0.6"/>
              {/* 电量条：宽度随实际电量动态变化，最大 17px */}
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
            <button className="w-9 h-9 rounded-[14px] bg-[#111E33] border border-[rgba(0,212,255,0.08)] 
                             flex items-center justify-center relative">
              <Bell size={18} className="text-[#E8F4FF]" />
              <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#FF4757] 
                            border-2 border-[#080E1A] shadow-[0_0_6px_#FF4757]" />
            </button>
            <button className="w-9 h-9 rounded-[14px] bg-[#111E33] border border-[rgba(0,212,255,0.08)] 
                             flex items-center justify-center">
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
          {/* 背景光晕 */}
          <div className="absolute w-[200px] h-[200px] rounded-full 
                        bg-[radial-gradient(circle,rgba(0,212,255,0.08),transparent_70%)] 
                        -top-10 -right-10 pointer-events-none" />
          
          {/* 顶部行 */}
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

          {/* 电池环形和信息 */}
          <div className="flex items-center gap-5">
            <BatteryRing 
              percentage={powerStation.batteryLevel} 
              isCharging={powerStation.isCharging}
            />
            <div className="flex-1 flex flex-col gap-3">
              <div>
                <div className="text-[10px] text-[#7A9AB8] tracking-wide uppercase">Remaining</div>
                <div className="text-base font-bold text-[#00D4FF]">
                  {powerStation.remainingWh}<span className="text-[11px] font-normal text-[#7A9AB8] ml-0.5">Wh</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#7A9AB8] tracking-wide uppercase">Full In</div>
                <div className="text-base font-bold text-[#FFB800]">{powerStation.timeToFull}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#7A9AB8] tracking-wide uppercase">Solar In</div>
                <div className="text-base font-bold text-[#00FF9C]">
                  +{powerStation.inputPower}<span className="text-[11px] font-normal text-[#7A9AB8] ml-0.5">W</span>
                </div>
              </div>
            </div>
          </div>

          {/* 电量进度条 */}
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-[#7A9AB8] mb-1.5">
              <span>0%</span>
              <span className="text-[#9BB8D4]">CURRENT</span>
              <span className="text-[#00FF9C] font-semibold">{powerStation.batteryLevel}% · {powerStation.remainingWh}Wh</span>
            </div>
            {/* overflow-visible 让限额标记线可以突出轨道 */}
            <div className="h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-visible relative">
              <motion.div 
                className="h-full rounded-full bg-gradient-to-r from-[#0090FF] to-[#00D4FF] 
                         shadow-[0_0_8px_rgba(0,212,255,0.4)]"
                initial={{ width: 0 }}
                animate={{ width: `${powerStation.batteryLevel}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
              {/* 动态充电限额标记线 */}
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
                  <Icon 
                    size={20} 
                    className={`mb-1.5 ${isActive ? 'text-[#00D4FF]' : 'text-[#7A9AB8]'}`}
                  />
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

        {/* 端口状态 */}
        <div className="px-5 mb-3">
          <div className="text-[13px] font-bold text-[#7A9AB8] tracking-wider uppercase mb-2.5">
            Port Status
          </div>
          <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
            {powerStation.ports.filter(p => p.status === 'active').map((port) => (
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
                  ${port.type === 'usb-out' ? 'bg-[rgba(0,212,255,0.12)] text-[#00D4FF]' : ''}
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
                    ${port.type === 'ac-out' || port.type === 'usb-out' ? 'text-[#00FF9C]' : 'text-[#00D4FF]'}
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

        {/* 快捷操作 */}
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
                  whileTap={{ scale: 0.95 }}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0"
                >
                  <div className="w-[54px] h-[54px] rounded-[20px] bg-[#111E33] 
                                border border-[rgba(0,212,255,0.08)]
                                flex items-center justify-center
                                hover:border-[rgba(0,212,255,0.4)] hover:bg-[rgba(0,212,255,0.06)]
                                transition-all duration-250">
                    <Icon size={22} className="text-[#E8F4FF]" />
                  </div>
                  <span className="text-[10px] text-[#7A9AB8] whitespace-nowrap">{action.label}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
