import { motion } from 'framer-motion'

interface BatteryRingProps {
  percentage: number
  size?: number
  strokeWidth?: number
  isCharging?: boolean
  uid?: string
}

export default function BatteryRing({ 
  percentage, 
  size = 150, 
  strokeWidth = 10,
  isCharging = false,
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
 <div className="text-[36px] font-extrabold text-[#FFFFFF] leading-none tracking-tight">
 {safePercent}<span className="text-sm font-medium text-[#8E8E93]">%</span>
 </div>
 <div className="text-[10px] text-[#8E8E93] mt-1 tracking-wide">CHARGE</div>
 </div>
 </div>
  )
}
