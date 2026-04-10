import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { 
  ChevronLeft, 
  Pencil, 
  Users, 
  Settings,
  Zap,
  LayoutGrid,
  SlidersHorizontal,
  Check,
  Clock
} from 'lucide-react'
import { usePowerStationStore } from '../stores/powerStationStore'

export default function ControlPage() {
  const { powerStation, updateDeviceName } = usePowerStationStore()
  
  // 设备名称编辑状态
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState(powerStation.name)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // 处理开始编辑设备名称
  const handleStartEditName = () => {
    setEditName(powerStation.name)
    setIsEditingName(true)
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

  // 处理输入框键盘事件
  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName()
    } else if (e.key === 'Escape') {
      setEditName(powerStation.name)
      setIsEditingName(false)
    }
  }

  // 实时功率数据（模拟）- 与参考图一致
  const powerData = [50, 50, 50, 50, 50, 50, 50, 50, 50, 200, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400]
  const maxPower = 500
  const currentPower = 400

  return (
    <div className="h-full flex flex-col bg-[#000000] overflow-hidden">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button className="w-10 h-10 flex items-center justify-center">
          <ChevronLeft size={24} className="text-[#FFFFFF]" />
        </button>
        
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
                className="text-lg font-bold text-[#FFFFFF] bg-transparent border-b-2 border-[#01D6BE] outline-none w-[140px] text-center"
                maxLength={20}
              />
              <button 
                onClick={handleSaveName}
                className="w-5 h-5 rounded-full bg-[#01D6BE] flex items-center justify-center"
              >
                <Check size={10} className="text-[#000000]" />
              </button>
            </div>
          ) : (
            <>
              <span className="text-lg font-bold text-[#FFFFFF]">{powerStation.name}</span>
              <button 
                onClick={handleStartEditName}
                className="w-5 h-5 flex items-center justify-center"
              >
                <Pencil size={14} className="text-[#01D6BE]" />
              </button>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <button className="w-10 h-10 flex items-center justify-center">
            <Users size={20} className="text-[#FFFFFF]" />
          </button>
          <button className="w-10 h-10 flex items-center justify-center">
            <Settings size={20} className="text-[#FFFFFF]" />
          </button>
        </div>
      </div>

      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-4">
        {/* 电池环形图区域 - 按照参考图重构 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center py-4"
        >
          {/* 环形图 */}
          <div className="relative w-[300px] h-[300px]">
            <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
              {/* 背景圆环 */}
              <circle
                cx="100"
                cy="100"
                r="85"
                fill="none"
                stroke="#1C1C1E"
                strokeWidth="28"
              />
              {/* 进度圆环 */}
              <circle
                cx="100"
                cy="100"
                r="85"
                fill="none"
                stroke="#01D6BE"
                strokeWidth="28"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 85 * powerStation.batteryLevel / 100} ${2 * Math.PI * 85}`}
                className="transition-all duration-1000"
              />
              {/* 刻度线 - 外圈 */}
              {Array.from({ length: 60 }).map((_, i) => {
                const angle = (i * 6 * Math.PI) / 180
                const r1 = 106
                const r2 = i % 5 === 0 ? 96 : 101
                return (
                  <line
                    key={i}
                    x1={100 + r1 * Math.cos(angle)}
                    y1={100 + r1 * Math.sin(angle)}
                    x2={100 + r2 * Math.cos(angle)}
                    y2={100 + r2 * Math.sin(angle)}
                    stroke="#2C2C2E"
                    strokeWidth={i % 5 === 0 ? 2 : 1}
                  />
                )
              })}
            </svg>
            
            {/* 中心内容 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {/* 倒计时按钮 */}
              <div className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#2C2C2E] mb-3">
                <Clock size={14} className="text-[#8E8E93]" />
                <span className="text-sm text-[#FFFFFF]">0h 15min</span>
                <ChevronLeft size={14} className="text-[#8E8E93] rotate-180" />
              </div>
              
              {/* Charging 状态 */}
              <div className="flex items-center gap-1.5 text-[#8E8E93] text-sm mb-2">
                <span>Charging</span>
                <Zap size={16} className="text-[#01D6BE]" fill="#01D6BE" />
              </div>
              
              {/* 电量百分比 */}
              <div className="flex items-baseline">
                <span className="text-[90px] font-bold text-[#FFFFFF] leading-none">{powerStation.batteryLevel}</span>
                <span className="text-2xl text-[#8E8E93] ml-1">%</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Input / Output 显示 - 按照参考图样式 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#1C1C1E] rounded-[20px] p-5 mb-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#FFFFFF] text-lg font-medium">Input</span>
              <span className="text-[#01D6BE] text-lg font-semibold">{powerStation.inputPower}W</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#8E8E93] text-lg font-medium">Output</span>
              <span className="text-[#FFFFFF] text-lg font-semibold">{powerStation.outputPower}W</span>
            </div>
          </div>
        </motion.div>

        {/* 实时功率图表 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#1C1C1E] rounded-[20px] p-4 mb-4"
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[#8E8E93] text-xs tracking-wider">REAL-TIME POWER</span>
            <div className="w-6 h-6 rounded bg-[#2C2C2E] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#8E8E93]">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M8 12h8M12 8v8"/>
              </svg>
            </div>
          </div>
          
          {/* 图表区域 */}
          <div className="relative h-32">
            {/* Y轴网格线 */}
            <div className="absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="border-t border-[#2C2C2E] w-full" />
              ))}
            </div>
            
            {/* 折线图 */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#01D6BE" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="#01D6BE" stopOpacity="0"/>
                </linearGradient>
              </defs>
              {/* 填充区域 */}
              <path
                d={`M0,${100 - (powerData[0] / maxPower) * 80} ${powerData.map((p, i) => `L${(i / (powerData.length - 1)) * 100},${100 - (p / maxPower) * 80}`).join(' ')} L100,100 L0,100Z`}
                fill="url(#lineGradient)"
                className="transition-all duration-500"
              />
              {/* 线条 */}
              <path
                d={`M0,${100 - (powerData[0] / maxPower) * 80} ${powerData.map((p, i) => `L${(i / (powerData.length - 1)) * 100},${100 - (p / maxPower) * 80}`).join(' ')}`}
                fill="none"
                stroke="#01D6BE"
                strokeWidth="2"
                className="transition-all duration-500"
              />
            </svg>
            
            {/* 当前值标签 */}
            <div className="absolute top-2 right-2 bg-[#000000] rounded-lg px-2 py-1">
              <span className="text-[#FFFFFF] text-sm font-semibold">{currentPower} w</span>
            </div>
          </div>
          
          {/* 底部图标 */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#2C2C2E]">
            <LayoutGrid size={18} className="text-[#01D6BE]" />
            <Plug size={18} className="text-[#8E8E93]" />
            <SlidersHorizontal size={18} className="text-[#8E8E93]" />
          </div>
        </motion.div>


      </div>
    </div>
  )
}
