import { motion } from 'framer-motion'
import Icon from '../../components/Icon'
import { formatLowBatteryBannerCopy } from '../../utils/formatLowBatteryBannerCopy'

/**
 * Red low-battery bar — handoff `A_1.1.1_Homepage -v 有 alert`.
 * Measured off the 4x export: card 370x71 @ x16, radius 12, padding 14,
 * outage icon 20, 12px gap, title body_medium/semibold, body label, close 12.
 * Dismiss X and threshold trigger stay in DevicePage.
 */
export default function LowBatteryBanner({
  name,
  durationStr,
  threshold = 30,
  onOpen,
  onDismiss,
}: {
  name: string
  durationStr: string | null
  threshold?: number
  onOpen: () => void
  onDismiss: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      onClick={onOpen}
      className="mt-4 rounded-l bg-danger-darker p-[14px] flex items-start gap-3 cursor-pointer"
    >
      <Icon name="outage" size={20} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-body-md font-semibold text-white">Low Battery</p>
        <p className="text-label text-white mt-0.5">
          {formatLowBatteryBannerCopy(name, durationStr, threshold)}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        aria-label="Dismiss notification"
        className="flex-shrink-0 active:scale-90 transition-transform"
      >
        <Icon name="close" size={12} />
      </button>
    </motion.div>
  )
}
