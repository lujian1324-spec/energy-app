import { useState } from 'react'
import { motion } from 'framer-motion'
import { Sun, Zap, DollarSign, Globe, Monitor, Smartphone, Lightbulb, Share2 } from 'lucide-react'
import BatteryRing from '../components/BatteryRing'
import { usePowerStationStore } from '../stores/powerStationStore'

const periods = ['Day', 'Week', 'Month'] as const
type Period = typeof periods[number]

const allData = {
  Day: { charge: [0, 0, 12, 30, 55, 70, 48], discharge: [0, 0, 8,  20, 38, 52, 30] },
  Week:  { charge: [55, 70, 48, 78, 62, 40, 28], discharge: [38, 52, 60, 42, 56, 72, 30] },
  Month: { charge: [60, 50, 75, 65, 80, 55, 45], discharge: [45, 40, 65, 55, 70, 48, 35] },
}

const dayLabels = {
  Day: ['0h', '4h', '8h', '12h', '16h', '20h', '24h'],
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
 <div className="h-full flex flex-col bg-[#000000] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-2 pb-2 safe-area-top flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-[#FFFFFF]">Energy Stats</h2>
          <p className="text-xs text-[#8E8E93] mt-1">This Week · March 2026</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] text-[#8E8E93] hover:text-[#01D6BE] transition-colors"
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: 'PowerFlow Energy Stats',
                  text: `Solar Charged: 12.8 kWh · Total Output: 9.4 kWh · Cost Saved: $2.1`,
                  url: window.location.href,
                })
              } else {
                alert('Share feature not available')
              }
            }}
          >
            <Share2 size={18} />
          </button>
          <div className="flex bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-full p-1">
 {periods.map((p) => (
 <button
 key={p}
 onClick={() => setPeriod(p)}
 className={`
 text-[11px] font-semibold px-3 py-1 rounded-full transition-all duration-200
 ${period === p 
 ? 'bg-[#01D6BE] text-[#000000] (1,214,190,0.4)]' 
 : 'text-[#8E8E93] hover:text-[#FFFFFF]'
 }
 `}
 >
 {p}
 </button>
 ))}
          </div>
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
 { icon: Sun, value: '12.8', unit: 'kWh', label: 'Solar Charged', trend: '↑ 18%', trendUp: true, color: '#34C759' },
 { icon: Zap, value: '9.4', unit: 'kWh', label: 'Total Output', trend: '↓ 5%', trendUp: false, color: '#01D6BE' },
 { icon: DollarSign, value: '$2.1', unit: '', label: 'Cost Saved', trend: '↑ 12%', trendUp: true, color: '#FF9500' },
 { icon: Globe, value: '6.4', unit: 'kg', label: 'CO₂ Reduced', trend: '↑ 18%', trendUp: true, color: '#A855F7' },
 ].map((stat, i) => {
 const Icon = stat.icon
 return (
 <div 
 key={i}
 className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] p-4 relative overflow-hidden"
 >
 <div 
 className="absolute top-0 left-0 right-0 h-0.5"
 style={{ backgroundColor: stat.color }}
 />
 <Icon size={18} className="mb-2" style={{ color: stat.color }} />
 <div className="text-[22px] font-extrabold text-[#FFFFFF] tracking-tight">
 {stat.value}<small className="text-xs font-normal text-[#8E8E93]">{stat.unit}</small>
 </div>
 <div className="text-[11px] text-[#8E8E93] mt-1">{stat.label}</div>
 <div className={`text-[10px] mt-1 ${stat.trendUp ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
 {stat.trend} vs Last Week
 </div>
 </div>
 )
 })}
 </motion.div>

 {/* 柱状图 */}
 <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] p-4 mb-4">
 <div className="flex justify-between items-center mb-4">
 <div className="text-sm font-bold text-[#FFFFFF]">Weekly Charge / Discharge</div>
 <div className="flex gap-3">
 <div className="flex items-center gap-1.5 text-[10px] text-[#8E8E93]">
 <div className="w-2 h-2 rounded-full bg-[#34C759]" />
 <span>Charge</span>
 </div>
 <div className="flex items-center gap-1.5 text-[10px] text-[#8E8E93]">
 <div className="w-2 h-2 rounded-full bg-[#01D6BE]" />
 <span>Usage</span>
 </div>
 </div>
 </div>
 
{/* 柱子 */}
<div className="flex items-end gap-1.5 h-[140px]">
 {currentData.charge.map((charge, i) => (
 <div key={i} className="flex-1 flex items-end gap-0.5 h-full relative">
 <div 
 className="flex-1 rounded-t bg-[#34C759] min-h-[4px]"
 style={{ height: `${charge}%` }}
 />
 <div 
 className="flex-1 rounded-t bg-[#01D6BE] min-h-[4px]"
 style={{ height: `${currentData.discharge[i]}%` }}
 />
 </div>
 ))}
 </div>
 {/* 分隔线 */}
 <div className="h-px bg-[rgba(1,214,190,0.08)] my-1.5" />
 {/* X 轴标签 */}
 <div className="flex gap-1.5">
 {days.map((day) => (
 <div key={day} className="flex-1 text-center text-[9px] text-[#48484A]">{day}</div>
 ))}
 </div>
 </div>

{/* 电池容量环形图 */}
<div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] p-4 mb-4">
<div className="flex justify-between items-center mb-3">
<div className="text-sm font-bold text-[#FFFFFF]">Battery Capacity</div>
<div className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
bg-[rgba(52,199,89,0.12)] text-[#34C759] border border-[rgba(52,199,89,0.25)]
text-[10px] font-semibold">
Good
</div>
</div>

<div className="flex items-center gap-6">
{/* 储能容量环形 - 加大加粗版 */}
<div className="flex-shrink-0">
<BatteryRing 
percentage={powerStation.batteryLevel} 
size={180} 
strokeWidth={20}
isCharging={powerStation.isCharging}
uid="stats-page"
/>
</div>

{/* 右侧统计 */}
<div className="flex-1 grid grid-cols-2 gap-3">
<div className="text-center bg-[rgba(255,255,255,0.03)] rounded-[12px] p-2.5">
<div className="text-[14px] font-bold text-[#FFFFFF]">
{powerStation.batteryHealth}%
</div>
<div className="text-[9px] text-[#8E8E93] mt-0.5">Health</div>
</div>
<div className="text-center bg-[rgba(255,255,255,0.03)] rounded-[12px] p-2.5">
<div className="text-[14px] font-bold text-[#34C759]">
{powerStation.temperature}°C
</div>
<div className="text-[9px] text-[#8E8E93] mt-0.5">Temp</div>
</div>
<div className="text-center bg-[rgba(255,255,255,0.03)] rounded-[12px] p-2.5">
<div className="text-[14px] font-bold text-[#01D6BE]">
{powerStation.cycleCount}
</div>
<div className="text-[9px] text-[#8E8E93] mt-0.5">Cycles</div>
</div>
<div className="text-center bg-[rgba(255,255,255,0.03)] rounded-[12px] p-2.5">
<div className="text-[14px] font-bold text-[#FF9500]">
1000Wh
</div>
<div className="text-[9px] text-[#8E8E93] mt-0.5">Capacity</div>
</div>
</div>
</div>
</div>

 {/* 用电分布 */}
 <div className="mb-4">
 <div className="text-[13px] font-bold text-[#8E8E93] tracking-wider uppercase mb-2.5">
 Power Distribution
 </div>
 <div className="flex flex-col gap-2.5">
 {deviceUsage.map((device) => {
 const Icon = device.icon
 const colorMap: Record<string, string> = {
 blue: '#01D6BE',
 green:  '#34C759',
 orange: '#FF9500',
 purple: '#A855F7' // 统一与全局 purple 色一致
 }
 const color = colorMap[device.color]
 
 return (
 <div 
 key={device.name}
 className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[14px] p-3.5 
 flex items-center gap-3"
 >
 <Icon size={20} style={{ color }} />
 <div className="flex-1">
 <div className="text-[13px] font-semibold text-[#FFFFFF]">{device.name}</div>
 <div className="mt-1.5 h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
 <div 
 className="h-full rounded-full transition-all duration-500"
 style={{ 
 width: `${device.percent}%`,
 background: color,
 boxShadow: `0 0 8px ${color}66`
 }}
 />
 </div>
 </div>
 <div className="text-right">
 <div className="text-[15px] font-bold" style={{ color }}>
 {device.kwh}<span className="text-[11px] text-[#8E8E93]">kWh</span>
 </div>
 <div className="text-[11px] text-[#8E8E93] mt-0.5">{device.percent}%</div>
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
