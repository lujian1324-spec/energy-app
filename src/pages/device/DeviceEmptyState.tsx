import { motion } from 'framer-motion'
import { Plus, RefreshCw } from 'lucide-react'
import deviceEmptyArt from '../../assets/illustrations/device-empty.png'

/**
 * Device list empty state (Handoff `A_1.1.1_Homepage -v Empty State`).
 *
 * The honeycomb illustration, title and subtitle come from the 2026-09-02
 * handoff, which reinstated the empty-state copy that 4.7.39 had removed —
 * with new wording, not the old "No devices yet".
 */
export default function DeviceEmptyState({
  error,
  onRetry,
  onAddDevice,
}: {
  error: string | null
  onRetry: () => void
  onAddDevice: () => void
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center text-center pt-20 px-6">
      <img
        src={deviceEmptyArt}
        alt=""
        aria-hidden
        className="w-[188px] h-[188px] object-contain mb-7 select-none pointer-events-none"
        draggable={false}
      />
      {error ? (
        <>
          <h2 className="text-headline-md font-semibold text-white mb-2">
            Something went wrong
          </h2>
          <p className="text-body-lg text-ink-7 mb-8 max-w-[280px]">
            Check your network connection and try again.
          </p>
          <button onClick={onRetry} className="px-6 py-3 rounded-m border-m border-primary text-primary text-body-lg font-semibold flex items-center gap-2 active:scale-95 transition-transform">
            <RefreshCw size={18} /> Retry
          </button>
        </>
      ) : (
        <>
          <h2 className="text-headline-md font-semibold text-white mb-2">
            Ready to get started?
          </h2>
          <p className="text-body-lg text-ink-7 mb-8 max-w-[300px] leading-relaxed">
            Add your first Sierro device to protect essential devices and stay prepared for outages.
          </p>
          <button onClick={onAddDevice} className="px-7 py-3.5 rounded-m border-m border-primary text-primary text-body-lg font-semibold flex items-center gap-2 active:scale-95 transition-transform">
            <Plus size={20} className="text-primary" strokeWidth={2.5} /> Add Device
          </button>
        </>
      )}
    </motion.div>
  )
}
