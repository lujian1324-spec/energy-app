import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { formatLowBatteryBannerCopy } from '../../utils/formatLowBatteryBannerCopy'

/** Red low-battery bar (design p6). Dismiss X and threshold trigger stay in DevicePage. */
export default function LowBatteryBanner({
  name,
  durationStr,
  onOpen,
  onDismiss,
}: {
  name: string
  durationStr: string | null
  onOpen: () => void
  onDismiss: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      onClick={onOpen}
      className="mb-3 rounded-l bg-danger-darker px-3 py-3 flex items-start gap-3 cursor-pointer min-h-[54px]"
    >
      <div className="flex-1 min-w-0">
        <p className="text-body-md font-semibold text-white leading-tight truncate">Low Battery</p>
        <p className="text-caption text-white mt-0.5 leading-snug">
          {formatLowBatteryBannerCopy(name, durationStr)}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        aria-label="Dismiss notification"
        className="text-white flex-shrink-0 active:scale-90 transition-transform"
      >
        <X size={16} />
      </button>
    </motion.div>
  )
}
