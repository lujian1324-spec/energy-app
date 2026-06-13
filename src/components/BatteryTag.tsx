import { motion } from 'framer-motion'

interface BatteryTagProps {
  /** 电池电量百分比 0-100 */
  level: number
  /** 是否正在充电 */
  isCharging?: boolean
  /** 尺寸 sm | md */
  size?: 'sm' | 'md'
  /** 是否显示百分比文字（默认 true） */
  showLabel?: boolean
  /** ARIA 标签覆盖 */
  ariaLabel?: string
}

/**
 * PRD v1.1 §4.2.3 + §5: 水平电池图标 Tag
 * 用于 DevicePage 列表项顶部展示电量
 *
 * 9 种状态: 0/低/中/高 + 充电/不充电
 * WCAG: 带 ARIA label，颜色 ≥3:1 对比度
 */
export default function BatteryTag({
  level,
  isCharging = false,
  size = 'sm',
  showLabel = true,
  ariaLabel,
}: BatteryTagProps) {
  const clampedLevel = Math.max(0, Math.min(100, level))
  const displayLevel = Math.round(clampedLevel)

  // 颜色规则: 0 灰色, <20 红, <60 橙, ≥60 绿
  const getColor = () => {
    if (clampedLevel <= 0) return { fill: '#636366', bg: 'rgba(99,99,102,0.15)' }
    if (clampedLevel < 20) return { fill: '#FF3B30', bg: 'rgba(255,59,48,0.15)' }
    if (clampedLevel < 60) return { fill: '#FF9500', bg: 'rgba(255,149,0,0.15)' }
    return { fill: '#34C759', bg: 'rgba(52,199,89,0.15)' }
  }

  const dims = size === 'md'
    ? { w: 36, h: 16, capW: 3, capH: 8, stroke: 1.5, labelSize: 11 }
    : { w: 28, h: 12, capW: 2, capH: 6, stroke: 1.2, labelSize: 10 }

  const colors = getColor()
  // 内填充宽度 = (w - stroke*2 - 2) * level / 100
  const innerW = dims.w - dims.stroke * 2 - 2
  const fillW = (innerW * clampedLevel) / 100

  return (
    <div className="inline-flex items-center gap-1.5">
      <div
        className="relative inline-flex items-center"
        style={{ width: dims.w + dims.capW + 2, height: dims.h }}
        role="img"
        aria-label={ariaLabel ?? `Battery ${displayLevel}%${isCharging ? ', charging' : ''}`}
      >
        {/* 主体边框 */}
        <div
          className="relative rounded-[3px]"
          style={{
            width: dims.w,
            height: dims.h,
            border: `${dims.stroke}px solid ${colors.fill}`,
            backgroundColor: colors.bg,
          }}
        >
          {/* 内填充（带动画） */}
          <motion.div
            key={displayLevel}
            initial={{ width: 0 }}
            animate={{ width: fillW }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="absolute left-0 top-0 bottom-0 rounded-[2px]"
            style={{ backgroundColor: colors.fill }}
          />
        </div>
        {/* 电池正极帽 */}
        <div
          className="rounded-r-[2px]"
          style={{
            width: dims.capW,
            height: dims.capH,
            backgroundColor: colors.fill,
            marginLeft: 1,
          }}
        />
        {/* 充电闪电图标叠加（仅充电时） */}
        {isCharging && clampedLevel > 0 && (
          <svg
            className="absolute pointer-events-none"
            style={{
              left: (dims.w - 10) / 2,
              top: (dims.h - 10) / 2,
              width: 10,
              height: 10,
            }}
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7 1L3 7H6L5 11L9 5H6L7 1Z"
              fill="#FFFFFF"
              stroke="#FFFFFF"
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      {showLabel && (
        <span
          className="font-semibold tabular-nums"
          style={{ color: colors.fill, fontSize: dims.labelSize }}
        >
          {displayLevel}%
        </span>
      )}
    </div>
  )
}
