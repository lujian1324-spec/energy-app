import { motion } from 'framer-motion'

interface BatteryRingProps {
  percentage: number
  size?: number
  strokeWidth?: number
  isCharging?: boolean
  /** 唯一 ID 前缀，防止多个实例 SVG 渐变 ID 冲突 */
  uid?: string
}

export default function BatteryRing({ 
  percentage, 
  size = 130, 
  strokeWidth = 8,
  isCharging = false,
  uid = 'default',
}: BatteryRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  // 防止超界：percentage 限制在 0~100
  const safePercent = Math.max(0, Math.min(100, percentage))
  const safeDashoffset = circumference - (safePercent / 100) * circumference

  const gradId  = `ringGrad-${uid}`
  const glowId  = `glow-${uid}`

  return (
    <div 
      className={`relative ${isCharging ? 'animate-pulse-ring' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg 
        width={size} 
        height={size} 
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0090FF" />
            <stop offset="100%" stopColor="#01D6BE" />
          </linearGradient>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* 背景圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(1,214,190,0.08)"
          strokeWidth={strokeWidth}
        />
        
        {/* 进度圆环 */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: safeDashoffset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          filter={`url(#${glowId})`}
          style={{
            filter: 'drop-shadow(0 0 6px rgba(1,214,190,0.6))'
          }}
        />
      </svg>
      
      {/* 中心内容 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[32px] font-extrabold text-[#FFFFFF] leading-none tracking-tight">
          {safePercent}<span className="text-sm font-medium text-[#8E8E93]">%</span>
        </div>
        <div className="text-[10px] text-[#8E8E93] mt-1 tracking-wide">CHARGE</div>
      </div>
    </div>
  )
}
