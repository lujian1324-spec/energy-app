import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import Icon from '../../components/Icon'

/** Device list empty state (design p2): gray square + Add Device. Error keeps title/subtitle. */
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center text-center pt-24 px-6">
      <div className="w-40 h-40 rounded-l bg-ink-9 mb-7" />
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
        <button onClick={onAddDevice} className="px-7 py-3.5 rounded-m border-m border-primary text-primary text-body-lg font-semibold flex items-center gap-2 active:scale-95 transition-transform">
          <Icon name="add" size={20} /> Add Device
        </button>
      )}
    </motion.div>
  )
}
