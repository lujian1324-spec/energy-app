import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Cpu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getFirmwareSession, subscribeFirmwareLock } from '../utils/firmwareLock'

/**
 * Shown while a firmware update runs (v4.20.0): the app has paused every other
 * read and write (utils/firmwareLock), so the numbers on screen are frozen on
 * purpose. Tapping it opens the update's progress. Same wrapper as OfflineBanner:
 * `className` carries the spacing so it opens and closes with the banner.
 */
export default function FirmwareLockBanner({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  const [session, setSession] = useState(() => getFirmwareSession())
  useEffect(() => {
    const refresh = () => setSession(getFirmwareSession())
    const unsubscribe = subscribeFirmwareLock(refresh)
    const t = setInterval(refresh, 5000) // the lock lapses on its own after MAX_LOCK_MS
    return () => { unsubscribe(); clearInterval(t) }
  }, [])
  return (
    <AnimatePresence>
      {session && (
        <motion.div
          role="status"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className={`overflow-hidden ${className}`}
        >
          <button
            onClick={() => navigate('/firmware-update')}
            className="w-full bg-primary/[0.08] border border-primary/[0.2] rounded-l px-4 py-2.5 flex items-center gap-2 text-left"
          >
            <Cpu size={14} className="text-primary flex-shrink-0" aria-hidden />
            <span className="text-label text-primary flex-1">
              Updating firmware on {session.deviceName}. Other data is paused until it finishes.
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
