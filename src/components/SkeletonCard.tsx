import { motion } from 'framer-motion'

/** 单条骨架脉冲块 */
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <motion.div
      animate={{ opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      className={`bg-ink-9 rounded-l ${className ?? ''}`}
    />
  )
}

/** 设备卡片骨架屏 */
export function DeviceCardSkeleton() {
  return (
    <div className="bg-ink-10 rounded-l p-4 flex items-center gap-3">
      {/* 图标 */}
      <SkeletonBlock className="w-11 h-11 rounded-l flex-shrink-0" />

      {/* 文字 */}
      <div className="flex-1 space-y-2">
        <SkeletonBlock className="h-3.5 w-[120px]" />
        <SkeletonBlock className="h-2.5 w-[80px]" />
      </div>

      {/* 右侧电量 */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <SkeletonBlock className="h-3.5 w-[36px]" />
        <SkeletonBlock className="h-2 w-[24px]" />
      </div>
    </div>
  )
}

/** 列表区骨架屏（n 张卡片） */
export function DeviceListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <DeviceCardSkeleton key={i} />
      ))}
    </div>
  )
}

export default DeviceCardSkeleton
