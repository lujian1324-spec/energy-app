import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'

interface BatteryRingProps {
  percentage: number
  size?: number
  strokeWidth?: number
  isCharging?: boolean
  timeToFull?: string
  uid?: string
}

export default function BatteryRing({ 
  percentage, 
  size = 160, 
  strokeWidth = 10,
  isCharging = false,
  timeToFull = '1h 24m',
  uid = 'default',
}: BatteryRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const safePercent = Math.max(0, Math.min(100, percentage))
  const safeDashoffset = circumference - (safePercent / 100) * circumference

  return (
    <div 
      className="relative"
      style={{ width: size, height: size }}
    >
      <svg 
        width={size} 
        height={size} 
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* 背景圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#2C2C2E"
          strokeWidth={strokeWidth}
        />
        
        {/* 进度圆环 - 纯色扁平 */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#01D6BE"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: safeDashoffset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      
      {/* 中心内容 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* 电量百分比 */}
        <div className="text-[40px] font-extrabold text-[#FFFFFF] leading-none tracking-tight">
          {safePercent}<span className="text-lg font-medium text-[#8E8E93]">%</span>
        </div>
        
        {/* Charging 状态或倒计时 */}
        {isCharging ? (
          <div className="flex items-center gap-1 mt-1">
            <Zap size={12} className="text-[#01D6BE]" />
            <span className="text-[10px] font-semibold text-[#01D6BE] tracking-wide">CHARGING</span>
          </div>
        ) : (
          <div className="text-[10px] text-[#8E8E93] mt-1 tracking-wide">
            {timeToFull} to full
          </div>
        )}
      </div>
    </div>
  )
}
