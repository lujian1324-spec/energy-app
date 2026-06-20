import { useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'

const THRESHOLD = 64  // px to pull before triggering refresh

interface Props {
  onRefresh: () => Promise<void>
  children: ReactNode
}

export default function PullToRefresh({ onRefresh, children }: Props) {
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    const el = scrollRef.current
    if (el && el.scrollTop === 0) {
      startY.current = e.touches[0].clientY
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || refreshing) return
    const el = scrollRef.current
    if (el && el.scrollTop > 0) { startY.current = null; return }
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) setPullY(Math.min(dy * 0.45, THRESHOLD + 20))
  }

  const handleTouchEnd = async () => {
    if (pullY >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPullY(0)
      try { await onRefresh() } finally { setRefreshing(false) }
    } else {
      setPullY(0)
    }
    startY.current = null
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Pull indicator */}
      <AnimatePresence>
        {(pullY > 8 || refreshing) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute top-0 left-0 right-0 z-10 flex justify-center"
            style={{ height: refreshing ? 48 : pullY, overflow: 'hidden' }}
          >
            <div className="flex items-center justify-center h-12">
              {refreshing
                ? <Loader2 size={20} className="text-primary animate-spin" />
                : <motion.div
                    animate={{ rotate: pullY >= THRESHOLD ? 180 : 0 }}
                    className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full"
                  />
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-hide"
        style={{ transform: pullY > 0 ? `translateY(${pullY}px)` : undefined, transition: pullY === 0 ? 'transform 0.2s ease' : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
