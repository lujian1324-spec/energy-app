import { useState } from 'react'
import { motion } from 'framer-motion'
import { Sun, Zap, DollarSign, Globe, Monitor, Smartphone, Lightbulb } from 'lucide-react'
import { usePowerStationStore } from '../stores/powerStationStore'

const periods = ['Day', 'Week', 'Month'] as const
type Period = typeof periods[number]

const allData = {
  Day:   { charge: [0, 0, 12, 30, 55, 70, 48], discharge: [0, 0, 8,  20, 38, 52, 30] },
  Week:  { charge: [55, 70, 48, 78, 62, 40, 28], discharge: [38, 52, 60, 42, 56, 72, 30] },
  Month: { charge: [60, 50, 75, 65, 80, 55, 45], discharge: [45, 40, 65, 55, 70, 48, 35] },
}

const dayLabels = {
  Day:   ['0h', '4h', '8h', '12h', '16h', '20h', '24h'],
  Week:  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  Month: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'],
}

const deviceUsage = [
  { name: 'Laptop', icon: Monitor, kwh: 3.8, percent: 40, color: 'blue' },
  { name: 'Phone Charging', icon: Smartphone, kwh: 1.6, percent: 17, color: 'green' },
  { name: 'LED Lighting', icon: Lightbulb, kwh: 1.1, percent: 12, color: 'orange' },
  { name: 'Other Devices', icon: Zap, kwh: 2.9, percent: 31, color: 'purple' },
]

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('Week')
  const { powerStation } = usePowerStationStore()

  const currentData = allData[period]
  const days = dayLabels[period]

  return (
    <div className="h-full flex flex-col bg-[#080E1A] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-4 safe-area-top flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-[#E8F4FF]">Energy Stats</h2>
          <p className="text-xs text-[#7A9AB8] mt-1">This Week · March 2026</p>
        </div>
        <div className="flex bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-full p-1">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`
                text-[11px] font-semibold px-3 py-1 rounded-full transition-all duration-200
                ${period === p 
                  ? 'bg-[#00D4FF] text-[#080E1A] shadow-[0_0_8px_rgba(0,212,255,0.4)]' 
                  : 'text-[#7A9AB8] hover:text-[#E8F4FF]'
                }
              `}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
        {/* 概览卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-2.5 mb-4"
        >
          {[
            { icon: Sun, value: '12.8', unit: 'kWh', label: 'Solar Charged', trend: '↑ 18%', trendUp: true, color: '#00FF9C' },
            { icon: Zap, value: '9.4', unit: 'kWh', label: 'Total Output', trend: '↓ 5%', trendUp: false, color: '#00D4FF' },
            { icon: DollarSign, value: '$2.1', unit: '', label: 'Cost Saved', trend: '↑ 12%', trendUp: true, color: '#FFB800' },
            { icon: Globe, value: '6.4', unit: 'kg', label: 'CO₂ Reduced', trend: '↑ 18%', trendUp: true, color: '#A855F7' },
          ].map((stat, i) => {
            const Icon = stat.icon
            return (
              <div 
                key={i}
                className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-[20px] p-4 relative overflow-hidden"
              >
                <div 
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: `linear-gradient(90deg, ${stat.color}, transparent)` }}
                />
                <Icon size={18} className="mb-2" style={{ color: stat.color }} />
                <div className="text-[22px] font-extrabold text-[#E8F4FF] tracking-tight">
                  {stat.value}<small className="text-xs font-normal text-[#7A9AB8]">{stat.unit}</small>
                </div>
                <div className="text-[11px] text-[#7A9AB8] mt-1">{stat.label}</div>
                <div className={`text-[10px] mt-1 ${stat.trendUp ? 'text-[#00FF9C]' : 'text-[#FF4757]'}`}>
                  {stat.trend} vs Last Week
                </div>
              </div>
            )
          })}
        </motion.div>

        {/* 柱状图 */}
        <div className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-[20px] p-4 mb-4">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm font-bold text-[#E8F4FF]">Weekly Charge / Discharge</div>
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5 text-[10px] text-[#7A9AB8]">
                <div className="w-2 h-2 rounded-full bg-[#00FF9C]" />
                <span>Charge</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#7A9AB8]">
                <div className="w-2 h-2 rounded-full bg-[#00D4FF]" />
                <span>Usage</span>
              </div>
            </div>
          </div>
          
          {/* 柱子 */}
          <div className="flex items-end gap-1.5 h-[80px]">
            {currentData.charge.map((charge, i) => (
              <div key={i} className="flex-1 flex items-end gap-0.5 h-full relative">
                <div 
                  className="flex-1 rounded-t bg-gradient-to-t from-[rgba(0,255,156,0.4)] to-[#00FF9C] min-h-[4px]"
                  style={{ height: `${charge}%` }}
                />
                <div 
                  className="flex-1 rounded-t bg-gradient-to-t from-[rgba(0,212,255,0.4)] to-[#00D4FF] min-h-[4px]"
                  style={{ height: `${currentData.discharge[i]}%` }}
                />
              </div>
            ))}
          </div>
          {/* 分隔线 */}
          <div className="h-px bg-[rgba(0,212,255,0.08)] my-1.5" />
          {/* X 轴标签 */}
          <div className="flex gap-1.5">
            {days.map((day) => (
              <div key={day} className="flex-1 text-center text-[9px] text-[#3D5A78]">{day}</div>
            ))}
          </div>
        </div>

        {/* 电池健康图表 */}
        <div className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-[20px] p-4 mb-4">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm font-bold text-[#E8F4FF]">Battery Health · Temp</div>
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                          bg-[rgba(0,255,156,0.12)] text-[#00FF9C] border border-[rgba(0,255,156,0.25)]
                          text-[10px] font-semibold">
              Good
            </div>
          </div>
          
          <div className="h-20 relative mt-1">
            <svg className="w-full h-full" viewBox="0 0 335 80" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.25"/>
                  <stop offset="100%" stopColor="#00D4FF" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <line x1="0" y1="20" x2="335" y2="20" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
              <line x1="0" y1="40" x2="335" y2="40" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
              <line x1="0" y1="60" x2="335" y2="60" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
              <path d="M0,55 C40,50 80,45 120,42 C160,39 200,35 240,38 C280,41 310,36 335,30 L335,80 L0,80 Z"
                    fill="url(#lineGrad)"/>
              <path d="M0,55 C40,50 80,45 120,42 C160,39 200,35 240,38 C280,41 310,36 335,30"
                    fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round"
                    filter="drop-shadow(0 0 4px rgba(0,212,255,0.6))"/>
              <circle cx="0" cy="55" r="3.5" fill="#00D4FF" filter="drop-shadow(0 0 4px #00D4FF)"/>
              <circle cx="120" cy="42" r="3.5" fill="#00D4FF" filter="drop-shadow(0 0 4px #00D4FF)"/>
              <circle cx="240" cy="38" r="3.5" fill="#00D4FF" filter="drop-shadow(0 0 4px #00D4FF)"/>
              <circle cx="335" cy="30" r="4.5" fill="#00D4FF" filter="drop-shadow(0 0 6px #00D4FF)"/>
              <text x="310" y="24" fontSize="9" fill="#7A9AB8">33°C</text>
              <text x="4" y="18" fontSize="9" fill="#3D5A78">40°C</text>
              <text x="4" y="58" fontSize="9" fill="#3D5A78">20°C</text>
            </svg>
          </div>
          
          {/* 健康统计 */}
          <div className="flex gap-0 mt-2 pt-3 border-t border-[rgba(0,212,255,0.08)]">
            <div className="flex-1 text-center">
              <div className="text-[15px] font-bold text-[#E8F4FF]">
                {powerStation.batteryHealth}<span className="text-[10px] text-[#7A9AB8]">%</span>
              </div>
              <div className="text-[10px] text-[#7A9AB8] mt-0.5">Battery Health</div>
            </div>
            <div className="w-px bg-[rgba(0,212,255,0.08)]" />
            <div className="flex-1 text-center">
              <div className="text-[15px] font-bold text-[#00FF9C]">
                {powerStation.temperature}<span className="text-[10px] text-[#7A9AB8]">°C</span>
              </div>
              <div className="text-[10px] text-[#7A9AB8] mt-0.5">Temperature</div>
            </div>
            <div className="w-px bg-[rgba(0,212,255,0.08)]" />
            <div className="flex-1 text-center">
              <div className="text-[15px] font-bold text-[#00D4FF]">
                {powerStation.cycleCount}<span className="text-[10px] text-[#7A9AB8]">×</span>
              </div>
              <div className="text-[10px] text-[#7A9AB8] mt-0.5">Cycles</div>
            </div>
          </div>
        </div>

        {/* 用电分布 */}
        <div className="mb-4">
          <div className="text-[13px] font-bold text-[#7A9AB8] tracking-wider uppercase mb-2.5">
            Power Distribution
          </div>
          <div className="flex flex-col gap-2.5">
            {deviceUsage.map((device) => {
              const Icon = device.icon
              const colorMap: Record<string, string> = {
                blue:   '#00D4FF',
                green:  '#00FF9C',
                orange: '#FFB800',
                purple: '#A855F7'   // 统一与全局 purple 色一致
              }
              const color = colorMap[device.color]
              
              return (
                <div 
                  key={device.name}
                  className="bg-[#111E33] border border-[rgba(0,212,255,0.08)] rounded-[14px] p-3.5 
                           flex items-center gap-3"
                >
                  <Icon size={20} style={{ color }} />
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#E8F4FF]">{device.name}</div>
                    <div className="mt-1.5 h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                      <div 
                      className="h-full rounded-full transition-all duration-500"
                        style={{ 
                          width: `${device.percent}%`,
                          background: `linear-gradient(90deg, ${color}dd, ${color})`,
                          boxShadow: `0 0 8px ${color}66`
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-bold" style={{ color }}>
                      {device.kwh}<span className="text-[11px] text-[#7A9AB8]">kWh</span>
                    </div>
                    <div className="text-[11px] text-[#7A9AB8] mt-0.5">{device.percent}%</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
