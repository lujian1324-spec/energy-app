import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Zap, 
  Battery, 
  Clock, 
  Settings, 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Power,
  TrendingDown,
  TrendingUp,
  Sun,
  Moon,
  Edit2,
  Check,
  X
} from 'lucide-react'
import { usePowerStationStore } from '../stores/powerStationStore'
import type { PeakShavingSchedule } from '../types'

const scheduleTypeConfig = {
  charge: { label: '充电', color: '#34C759', icon: Battery, bgColor: 'rgba(52,199,89,0.15)' },
  discharge: { label: '放电', color: '#FF9500', icon: Zap, bgColor: 'rgba(255,149,0,0.15)' },
  grid: { label: '市电', color: '#01D6BE', icon: Power, bgColor: 'rgba(1,214,190,0.15)' },
  battery: { label: '电池', color: '#FFD700', icon: Battery, bgColor: 'rgba(255,215,0,0.15)' },
}

export default function PeakShavingPage() {
  const { 
    peakShavingSettings, 
    peakShavingStatus, 
    togglePeakShaving,
    updatePeakShavingSettings,
    addPeakShavingSchedule,
    updatePeakShavingSchedule,
    deletePeakShavingSchedule,
    powerStation 
  } = usePowerStationStore()
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null)
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null)
  
  // 新时间段表单
  const [newSchedule, setNewSchedule] = useState<Partial<PeakShavingSchedule>>({
    name: '',
    startTime: '09:00',
    endTime: '17:00',
    type: 'discharge',
    enabled: true,
  })

  // 计算当前应该使用的模式
  const getCurrentMode = () => {
    if (!peakShavingSettings.enabled) return 'disabled'
    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    
    const activeSchedule = peakShavingSettings.schedules.find(s => {
      if (!s.enabled) return false
      return currentTime >= s.startTime && currentTime < s.endTime
    })
    
    return activeSchedule?.type || 'idle'
  }

  const currentMode = getCurrentMode()
  
  // 计算节省金额
  const calculateSavings = () => {
    const peakPrice = peakShavingSettings.peakPrice
    const offPeakPrice = peakShavingSettings.offPeakPrice
    const batteryCapacity = powerStation.totalWh / 1000 // kWh
    const dailyCycles = 1 // 假设每天一个循环
    
    const dailySavings = (peakPrice - offPeakPrice) * batteryCapacity * dailyCycles
    return {
      daily: dailySavings,
      monthly: dailySavings * 30,
      yearly: dailySavings * 365,
    }
  }
  
  const savings = calculateSavings()

  const handleAddSchedule = () => {
    if (newSchedule.name && newSchedule.startTime && newSchedule.endTime) {
      addPeakShavingSchedule(newSchedule as Omit<PeakShavingSchedule, 'id'>)
      setShowAddModal(false)
      setNewSchedule({
        name: '',
        startTime: '09:00',
        endTime: '17:00',
        type: 'discharge',
        enabled: true,
      })
    }
  }

  const handleDeleteSchedule = (id: string) => {
    deletePeakShavingSchedule(id)
  }

  const toggleScheduleEnabled = (id: string, enabled: boolean) => {
    updatePeakShavingSchedule(id, { enabled })
  }

  return (
    <div className="h-full flex flex-col bg-[#000000] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 safe-area-top flex justify-between items-center">
        <h2 className="text-xl font-bold text-[#FFFFFF]">Peak Shaving</h2>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors
            ${showSettings ? 'bg-[#01D6BE] text-[#000000]' : 'bg-[#1C1C1E] text-[#FFFFFF]'}`}
        >
          <Settings size={18} />
        </button>
      </div>

      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
        
        {/* 主开关卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1C1C1E] rounded-[20px] p-4 mb-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors
                ${peakShavingSettings.enabled ? 'bg-[rgba(1,214,190,0.15)]' : 'bg-[#2C2C2E]'}`}>
                <Zap size={24} className={peakShavingSettings.enabled ? 'text-[#01D6BE]' : 'text-[#48484A]'} />
              </div>
              <div>
                <div className="text-[15px] font-bold text-[#FFFFFF]">Peak Shaving</div>
                <div className="text-[12px] text-[#8E8E93]">
                  {peakShavingSettings.enabled ? 'Active - Optimizing power usage' : 'Disabled'}
                </div>
              </div>
            </div>
            <button
              onClick={() => togglePeakShaving(!peakShavingSettings.enabled)}
              className={`w-14 h-8 rounded-full transition-colors relative
                ${peakShavingSettings.enabled ? 'bg-[#01D6BE]' : 'bg-[#48484A]'}`}
            >
              <motion.div
                className="w-6 h-6 rounded-full bg-[#FFFFFF] absolute top-1"
                animate={{ left: peakShavingSettings.enabled ? '28px' : '4px' }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
        </motion.div>

        {/* 当前状态卡片 */}
        {peakShavingSettings.enabled && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#1C1C1E] rounded-[20px] p-4 mb-4"
          >
            <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-3">
              Current Status
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center
                ${currentMode === 'charge' ? 'bg-[rgba(52,199,89,0.15)]' :
                  currentMode === 'discharge' ? 'bg-[rgba(255,149,0,0.15)]' :
                  currentMode === 'grid' ? 'bg-[rgba(1,214,190,0.15)]' :
                  currentMode === 'battery' ? 'bg-[rgba(255,215,0,0.15)]' :
                  'bg-[#2C2C2E]'}`}>
                {currentMode === 'charge' && <Battery size={28} className="text-[#34C759]" />}
                {currentMode === 'discharge' && <Zap size={28} className="text-[#FF9500]" />}
                {currentMode === 'grid' && <Power size={28} className="text-[#01D6BE]" />}
                {currentMode === 'battery' && <Battery size={28} className="text-[#FFD700]" />}
                {currentMode === 'idle' && <Clock size={28} className="text-[#8E8E93]" />}
                {currentMode === 'disabled' && <Power size={28} className="text-[#48484A]" />}
              </div>
              <div className="flex-1">
                <div className="text-[18px] font-bold text-[#FFFFFF]">
                  {currentMode === 'charge' ? 'Charging' :
                   currentMode === 'discharge' ? 'Discharging' :
                   currentMode === 'grid' ? 'Grid Power' :
                   currentMode === 'battery' ? 'Battery Power' :
                   currentMode === 'disabled' ? 'Disabled' :
                   'Idle'}
                </div>
                <div className="text-[12px] text-[#8E8E93]">
                  Battery: {powerStation.batteryLevel}% • {powerStation.timeToFull}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* 节省金额卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#1C1C1E] rounded-[20px] p-4 mb-4"
        >
          <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-3">
            Estimated Savings
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-[11px] text-[#8E8E93] mb-1">Daily</div>
              <div className="text-[16px] font-bold text-[#01D6BE]">${savings.daily.toFixed(2)}</div>
            </div>
            <div className="text-center border-x border-[rgba(255,255,255,0.05)]">
              <div className="text-[11px] text-[#8E8E93] mb-1">Monthly</div>
              <div className="text-[16px] font-bold text-[#01D6BE]">${savings.monthly.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-[11px] text-[#8E8E93] mb-1">Yearly</div>
              <div className="text-[16px] font-bold text-[#01D6BE]">${savings.yearly.toFixed(2)}</div>
            </div>
          </div>
        </motion.div>

        {/* 设置面板 */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-[#1C1C1E] rounded-[20px] p-4 mb-4 overflow-hidden"
            >
              <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase mb-3">
                Electricity Price Settings
              </div>
              
              <div className="space-y-4">
                {/* 高峰电价 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-[#FFFFFF]">Peak Price</span>
                    <span className="text-[13px] text-[#FF9500]">${peakShavingSettings.peakPrice}/kWh</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="2"
                    step="0.1"
                    value={peakShavingSettings.peakPrice}
                    onChange={(e) => updatePeakShavingSettings({ peakPrice: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-[#2C2C2E] rounded-full appearance-none cursor-pointer accent-[#FF9500]"
                  />
                </div>
                
                {/* 低谷电价 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-[#FFFFFF]">Off-Peak Price</span>
                    <span className="text-[13px] text-[#34C759]">${peakShavingSettings.offPeakPrice}/kWh</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={peakShavingSettings.offPeakPrice}
                    onChange={(e) => updatePeakShavingSettings({ offPeakPrice: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-[#2C2C2E] rounded-full appearance-none cursor-pointer accent-[#34C759]"
                  />
                </div>

                {/* 功率限制 */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <div className="text-[11px] text-[#8E8E93] mb-1">Max Charge</div>
                    <div className="flex items-center gap-2 bg-[#2C2C2E] rounded-[12px] px-3 py-2">
                      <Battery size={14} className="text-[#34C759]" />
                      <input
                        type="number"
                        value={peakShavingSettings.maxChargePower}
                        onChange={(e) => updatePeakShavingSettings({ maxChargePower: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-[11px] text-[#8E8E93]">W</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#8E8E93] mb-1">Max Discharge</div>
                    <div className="flex items-center gap-2 bg-[#2C2C2E] rounded-[12px] px-3 py-2">
                      <Zap size={14} className="text-[#FF9500]" />
                      <input
                        type="number"
                        value={peakShavingSettings.maxDischargePower}
                        onChange={(e) => updatePeakShavingSettings({ maxDischargePower: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-[11px] text-[#8E8E93]">W</span>
                    </div>
                  </div>
                </div>

                {/* 电池限制 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-[#8E8E93] mb-1">Min Battery</div>
                    <div className="flex items-center gap-2 bg-[#2C2C2E] rounded-[12px] px-3 py-2">
                      <Battery size={14} className="text-[#FF3B30]" />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={peakShavingSettings.minBatteryLevel}
                        onChange={(e) => updatePeakShavingSettings({ minBatteryLevel: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-[11px] text-[#8E8E93]">%</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#8E8E93] mb-1">Max Battery</div>
                    <div className="flex items-center gap-2 bg-[#2C2C2E] rounded-[12px] px-3 py-2">
                      <Battery size={14} className="text-[#34C759]" />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={peakShavingSettings.maxBatteryLevel}
                        onChange={(e) => updatePeakShavingSettings({ maxBatteryLevel: parseInt(e.target.value) || 0 })}
                        className="bg-transparent text-[13px] text-[#FFFFFF] w-full outline-none"
                      />
                      <span className="text-[11px] text-[#8E8E93]">%</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 时间段列表 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-bold text-[#8E8E93] tracking-widest uppercase">
              Schedule
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 text-[12px] text-[#01D6BE] font-medium"
            >
              <Plus size={14} />
              Add
            </button>
          </div>

          <div className="space-y-2">
            {peakShavingSettings.schedules.map((schedule, index) => {
              const config = scheduleTypeConfig[schedule.type]
              const Icon = config.icon
              const isExpanded = expandedSchedule === schedule.id
              
              return (
                <motion.div
                  key={schedule.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-[#1C1C1E] rounded-[16px] overflow-hidden transition-all
                    ${schedule.enabled ? '' : 'opacity-50'}`}
                >
                  <div 
                    className="p-4 flex items-center gap-3 cursor-pointer"
                    onClick={() => setExpandedSchedule(isExpanded ? null : schedule.id)}
                  >
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: config.bgColor }}
                    >
                      <Icon size={20} style={{ color: config.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold text-[#FFFFFF]">{schedule.name}</div>
                      <div className="text-[11px] text-[#8E8E93]">
                        {schedule.startTime} - {schedule.endTime}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span 
                        className="text-[11px] px-2 py-1 rounded-full font-medium"
                        style={{ 
                          backgroundColor: config.bgColor,
                          color: config.color 
                        }}
                      >
                        {config.label}
                      </span>
                      {isExpanded ? <ChevronUp size={18} className="text-[#8E8E93]" /> : <ChevronDown size={18} className="text-[#8E8E93]" />}
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-[rgba(255,255,255,0.05)] px-4 py-3"
                      >
                        <div className="flex items-center justify-between">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleScheduleEnabled(schedule.id, !schedule.enabled)
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors
                              ${schedule.enabled ? 'bg-[#34C759] text-[#000000]' : 'bg-[#48484A] text-[#FFFFFF]'}`}
                          >
                            <Power size={12} />
                            {schedule.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteSchedule(schedule.id)
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[rgba(255,59,48,0.15)] text-[#FF3B30] text-[12px] font-medium"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>

          {peakShavingSettings.schedules.length === 0 && (
            <div className="text-center py-8 text-[#48484A]">
              <Clock size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium text-[#8E8E93]">No schedules</p>
              <p className="text-[11px] text-[#48484A] mt-1">Add a schedule to start peak shaving</p>
            </div>
          )}
        </div>

        {/* 说明文字 */}
        <div className="bg-[rgba(1,214,190,0.05)] rounded-[16px] p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[rgba(1,214,190,0.15)] flex items-center justify-center flex-shrink-0">
              <TrendingDown size={16} className="text-[#01D6BE]" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#FFFFFF] mb-1">How it works</div>
              <p className="text-[11px] text-[#8E8E93] leading-relaxed">
                During off-peak hours, the system charges the battery using grid power. 
                During peak hours, the battery discharges to power your devices, 
                reducing your electricity costs.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Schedule Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[rgba(0,0,0,0.8)] z-50 flex items-end"
            onClick={() => setShowAddModal(false)}
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
              <h3 className="text-lg font-bold text-[#FFFFFF] mb-5">Add Schedule</h3>
              
              <div className="space-y-4">
                {/* 名称 */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] mb-2 block">Schedule Name</label>
                  <input
                    type="text"
                    value={newSchedule.name}
                    onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
                    placeholder="e.g., Morning Charge"
                    className="w-full h-11 bg-[#2C2C2E] rounded-[14px] px-4 text-[14px] text-[#FFFFFF] placeholder-[#48484A] outline-none"
                  />
                </div>
                
                {/* 类型 */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] mb-2 block">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(scheduleTypeConfig).map(([type, config]) => (
                      <button
                        key={type}
                        onClick={() => setNewSchedule({ ...newSchedule, type: type as PeakShavingSchedule['type'] })}
                        className={`flex items-center gap-2 p-3 rounded-[14px] transition-colors
                          ${newSchedule.type === type ? 'bg-[#2C2C2E] border border-[#01D6BE]' : 'bg-[#2C2C2E]'}`}
                      >
                        <config.icon size={18} style={{ color: config.color }} />
                        <span className="text-[13px] text-[#FFFFFF]">{config.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* 时间 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#8E8E93] mb-2 block">Start Time</label>
                    <input
                      type="time"
                      value={newSchedule.startTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, startTime: e.target.value })}
                      className="w-full h-11 bg-[#2C2C2E] rounded-[14px] px-4 text-[14px] text-[#FFFFFF] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#8E8E93] mb-2 block">End Time</label>
                    <input
                      type="time"
                      value={newSchedule.endTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, endTime: e.target.value })}
                      className="w-full h-11 bg-[#2C2C2E] rounded-[14px] px-4 text-[14px] text-[#FFFFFF] outline-none"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 h-11 rounded-[14px] bg-[#2C2C2E] text-[#FFFFFF] text-[14px] font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSchedule}
                  disabled={!newSchedule.name}
                  className="flex-1 h-11 rounded-[14px] bg-[#01D6BE] text-[#000000] text-[14px] font-semibold disabled:opacity-50"
                >
                  Add Schedule
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
