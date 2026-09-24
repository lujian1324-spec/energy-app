import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'

/** Shown while the phone has no network (APP-20260923-002). Copy per the acceptance list. */
export const OFFLINE_COPY = 'No internet connection. Check your network and try again.'

/**
 * `className` sets the spacing around the banner (e.g. `pt-4`). It sits on the
 * wrapper that animates the height, so the gap opens and closes with the banner
 * instead of jumping in before it.
 */
export default function OfflineBanner({ show, className = '' }: { show: boolean; className?: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className={`overflow-hidden ${className}`}
        >
          <div className="bg-warning/[0.08] border border-warning/[0.2] rounded-l px-4 py-2.5 flex items-center gap-2">
            <WifiOff size={14} className="text-warning flex-shrink-0" aria-hidden />
            <span className="text-label text-warning flex-1">{OFFLINE_COPY}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
