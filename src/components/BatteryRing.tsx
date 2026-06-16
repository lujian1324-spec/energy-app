import { motion } from 'framer-motion'
import { Zap, BatteryMedium, AlertTriangle, BatteryWarning, BatteryLow, Plug } from 'lucide-react'

interface BatteryRingProps {
  percentage: number
  size?: number
  strokeWidth?: number
  isCharging?: boolean
  isPlugged?: boolean
  connected?: boolean
  timeToFull?: string
  timeRemaining?: string
  uid?: string
}

// PRD v1.1 §5.1: BatteryRing 9 种状态
// 0=critical (<5%), 1=low (<15%), 2=warning (<25%), 3=normal-low, 4=normal, 5=normal-high, 
// 6=full (>=95%), 7=charging, 8=plugged
export type BatteryState = 'critical' | 'low' | 'warning' | 'normal' | 'good' | 'full' | 'charging' | 'plugged' | 'unknown'

function getBatteryState(percentage: number, isCharging: boolean, isPlugged: boolean): BatteryState {
  // Fully charged takes priority — a battery at 100% can't still be "charging" even
  // if net power into it is momentarily positive.
  if (percentage >= 95) return 'full'
  if (isCharging) return 'charging'
  if (isPlugged) return 'plugged'
  if (percentage <= 5) return 'critical'
  if (percentage <= 15) return 'low'
  if (percentage <= 25) return 'warning'
  return 'normal'
}

const STATE_COLOR: Record<BatteryState, string> = {
  critical: '#FF3B30',
  low: '#FF3B30',
  warning: '#FF9500',
  normal: '#01D6BE',
  good: '#01D6BE',
  full: '#01D6BE',
  charging: '#01D6BE',
  plugged: '#01D6BE',
  unknown: '#636366',
}

const STATE_LABEL: Record<BatteryState, string> = {
  critical: 'CRITICAL',
  low: 'LOW BATTERY',
  warning: 'LOW',
  normal: '',
  good: '',
  full: 'FULL',
  charging: 'CHARGING',
  plugged: 'PLUGGED IN',
  unknown: '',
}

export default function BatteryRing({
  percentage,
  size = 160,
  strokeWidth = 10,
  isCharging = false,
  isPlugged = false,
  connected = true,
  timeToFull = '1h 24m',
  timeRemaining = '4h 30m',
  uid = 'default',
}: BatteryRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const safePercent = Math.max(0, Math.min(100, percentage))
  // PRD §5.1: Disconnected → grey ring, no progress, "-" / "Disconnected"
  const safeDashoffset = connected ? circumference - (safePercent / 100) * circumference : circumference

  const state = connected ? getBatteryState(safePercent, isCharging, isPlugged) : 'unknown'
  const ringColor = STATE_COLOR[state]
  const stateLabel = connected ? STATE_LABEL[state] : 'Disconnected'
  const isFull = state === 'full'
  const showTime = connected && !isCharging && !isPlugged && !isFull

  // 选择状态图标 (色盲友好, PRD v1.1 §9.1)
  const StateIcon = isFull ? BatteryMedium : isCharging ? Zap : isPlugged ? Plug : safePercent <= 15 ? BatteryWarning : safePercent <= 25 ? AlertTriangle : BatteryMedium

  // 可访问性标签 (PRD v1.1 §9.1)
  const ariaLabel = !connected
    ? 'Battery disconnected'
    : isFull
    ? `Battery full, ${safePercent} percent`
    : isCharging
    ? `Battery charging, ${safePercent} percent, ${timeToFull} until full`
    : isPlugged
      ? `Battery plugged in, ${safePercent} percent`
      : safePercent <= 15
        ? `Battery low, ${safePercent} percent remaining, ${timeRemaining} runtime`
        : `Battery ${safePercent} percent, ${timeRemaining} runtime`

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        aria-hidden="true"
      >
        {/* 背景圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#333333"
          strokeWidth={strokeWidth}
        />

        {/* 进度圆环 - 按状态着色 */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
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
        {/* 电量百分比 — Disconnected/0 显示 - (PRD §5.1) */}
        <div className="text-[40px] font-extrabold text-[#FFFFFF] leading-none tracking-tight">
          {connected ? (
            <>{safePercent}<span className="text-lg font-medium text-[#A0A0A5]">%</span></>
          ) : (
            <span className="text-[#636366]">-</span>
          )}
        </div>

        {/* 状态标签 / 时间 */}
        {stateLabel ? (
          <div className="flex items-center gap-1 mt-1">
            <StateIcon size={12} style={{ color: ringColor }} aria-hidden="true" />
            <span
              className="text-[10px] font-semibold tracking-wide"
              style={{ color: ringColor }}
            >
              {stateLabel}
            </span>
          </div>
        ) : showTime ? (
          <div className="text-[10px] text-[#A0A0A5] mt-1 tracking-wide" aria-hidden="true">
            {timeRemaining} remaining
          </div>
        ) : isCharging ? (
          <div className="text-[10px] text-[#A0A0A5] mt-1 tracking-wide" aria-hidden="true">
            {timeToFull} to full
          </div>
        ) : null}
      </div>
    </div>
  )
}
