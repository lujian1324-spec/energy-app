import { motion } from 'framer-motion'
import { Plus, RefreshCw } from 'lucide-react'

/** Device list empty state: honeycomb illustration + Add Device. Error keeps title/subtitle. */
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center text-center pt-16 px-6">
      <img
        src={`${import.meta.env.BASE_URL}ds-device-empty.svg`}
        alt=""
        className="w-[200px] h-[200px] object-contain mb-7 select-none"
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
          <button onClick={onRetry} className="px-6 py-3 rounded-l border-m border-primary text-primary text-body-lg font-semibold flex items-center gap-2 active:scale-95 transition-transform">
            <RefreshCw size={18} /> Retry
          </button>
        </>
      ) : (
        <>
          <h2 className="text-title-lg font-semibold text-ink-3 mb-2">
            Ready to get started?
          </h2>
          <p className="text-label text-ink-5 mb-8 max-w-[280px]">
            Add your first Sierro device to protect essential devices and stay prepared for outages.
          </p>
          <button onClick={onAddDevice} className="h-11 px-4 rounded-m border-m border-primary text-primary text-body-lg font-semibold flex items-center gap-2 active:scale-95 transition-transform">
            <Plus size={18} className="text-primary" strokeWidth={2.5} /> Add Device
          </button>
        </>
      )}
    </motion.div>
  )
}
