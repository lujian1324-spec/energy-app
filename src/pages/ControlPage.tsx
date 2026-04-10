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
  Clock,
  Sun,
  BarChart3,
  Battery,
  Plug
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

  // 功率统计标签页状态
  const [powerTab, setPowerTab] = useState<'input' | 'output' | 'solar'>('input')
  
  // 三种功率数据（模拟）
  const powerDataMap = {
    input: {
      label: 'INPUT POWER',
      data: [50, 50, 50, 50, 100, 200, 300, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400],
      maxPower: 500,
      currentPower: 400,
      color: '#01D6BE'
    },
    output: {
      label: 'OUTPUT POWER',
      data: [100, 120, 150, 180, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200],
      maxPower: 500,
      currentPower: 200,
      color: '#34C759'
    },
    solar: {
      label: 'SOLAR POWER',
      data: [0, 0, 50, 100, 150, 200, 250, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280, 280],
      maxPower: 500,
      currentPower: 280,
      color: '#FF9500'
    }
  }
  
  const currentPowerData = powerDataMap[powerTab]

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
              <span className="text-[#01D6BE] text-lg font-semibold">400W</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#8E8E93] text-lg font-medium">Output</span>
              <span className="text-[#8E8E93] text-lg font-semibold">200W</span>
            </div>
          </div>
        </motion.div>

        {/* 实时功率图表 - 按照参考图重新设计 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#1C1C1E] rounded-[20px] p-4 mb-4"
        >
          {/* 头部：标题 + 图表图标 */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[#8E8E93] text-xs tracking-wider">REAL-TIME POWER</span>
            <BarChart3 size={18} className="text-[#8E8E93]" />
          </div>
          
          {/* 图表区域 */}
          <div className="relative h-[200px]">
            {/* Y轴网格线 - 水平虚线 */}
            <div className="absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="border-t border-[#2C2C2E] border-dashed w-full" />
              ))}
            </div>
            
            {/* 折线图 */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
              {/* 折线 - 绿色 */}
              <path
                d={`M0,${80} L20,${80} L40,${80} L55,${60} L70,${20} L100,${20}`}
                fill="none"
                stroke="#01D6BE"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-500"
              />
            </svg>
            
            {/* 当前值标签 - 右上角黑色背景 */}
            <div className="absolute top-0 right-0 bg-[#000000] rounded-lg px-3 py-1.5">
              <span className="text-[#FFFFFF] text-lg font-semibold">400 w</span>
            </div>
          </div>
          
          {/* 底部图标 - 电池、插头、设置 */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#2C2C2E]">
            <button
              onClick={() => setPowerTab('input')}
              className={`transition-all ${powerTab === 'input' ? 'text-[#01D6BE]' : 'text-[#8E8E93]'}`}
            >
              <Battery size={20} />
            </button>
            <button
              onClick={() => setPowerTab('output')}
              className={`transition-all ${powerTab === 'output' ? 'text-[#01D6BE]' : 'text-[#8E8E93]'}`}
            >
              <Plug size={20} />
            </button>
            <button
              onClick={() => setPowerTab('solar')}
              className={`transition-all ${powerTab === 'solar' ? 'text-[#01D6BE]' : 'text-[#8E8E93]'}`}
            >
              <SlidersHorizontal size={20} />
            </button>
          </div>
        </motion.div>

        {/* Solar / AC Input / AC Output 三个卡片 - 统一样式 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-3 gap-3"
        >
          {/* Solar 卡片 */}
          <div className="bg-[#1C1C1E] rounded-[20px] p-4 flex flex-col items-center">
            <Sun size={18} className="text-[#8E8E93] mb-2" />
            <span className="text-[#FFFFFF] text-xs mb-1">Solar</span>
            <span className="text-[#FFFFFF] text-lg font-semibold">{powerStation.inputPower}W</span>
          </div>
          
          {/* AC Input 卡片 */}
          <div className="bg-[#1C1C1E] rounded-[20px] p-4 flex flex-col items-center">
            <Zap size={18} className="text-[#8E8E93] mb-2" />
            <span className="text-[#FFFFFF] text-xs mb-1">AC Input</span>
            <span className="text-[#FFFFFF] text-lg font-semibold">400W</span>
          </div>
          
          {/* AC Output 卡片 */}
          <div className="bg-[#1C1C1E] rounded-[20px] p-4 flex flex-col items-center">
            <Zap size={18} className="text-[#8E8E93] mb-2" />
            <span className="text-[#FFFFFF] text-xs mb-1">AC Output</span>
            <span className="text-[#FFFFFF] text-lg font-semibold">{powerStation.outputPower}W</span>
          </div>
        </motion.div>

      </div>
    </div>
  )
}
