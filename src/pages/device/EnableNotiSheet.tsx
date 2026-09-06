import { Capacitor } from '@capacitor/core'
import { motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import Icon from '../../components/Icon'
import { PUSH_ENABLED } from '../../config/webPush'
import { initNativePush } from '../../utils/nativePush'
import { requestNotifications } from '../../utils/permissions'
import {
  enableWebPush,
  refreshNotificationPermission,
  requestNotificationPermission,
} from '../../utils/pushNotification'

export const ENABLE_NOTI_SEEN_KEY = 'sierro-enable-noti-seen'

export async function enableDeviceNotifications(): Promise<void> {
  try {
    await requestNotifications()
    await refreshNotificationPermission()
    if (Capacitor.isNativePlatform()) {
      if (PUSH_ENABLED) await initNativePush()
    } else {
      await requestNotificationPermission()
      if (PUSH_ENABLED) await enableWebPush()
    }
  } catch {
    /* OS prompt dismissed or plugin unavailable */
  }
}

export default function EnableNotiSheet({
  onClose,
}: {
  onClose: () => void
}) {
  const dismiss = async (enable: boolean) => {
    try { localStorage.setItem(ENABLE_NOTI_SEEN_KEY, '1') } catch { /* ignore */ }
    if (enable) await enableDeviceNotifications()
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/[0.7] flex items-end"
      onClick={() => void dismiss(false)}
    >
      <motion.div
        initial={{ y: 280, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 280, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-ink-12 rounded-t-[28px] px-6 pt-4 pb-10 safe-area-bottom"
      >
        <div className="flex justify-end mb-2">
          <button
            onClick={() => void dismiss(false)}
            aria-label="Close"
            className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <img
          src={`${import.meta.env.BASE_URL}ds-enable-noti.svg`}
          alt=""
          className="w-full max-w-[280px] h-auto mx-auto mb-6 select-none"
          draggable={false}
        />
        <h3 className="text-headline-md font-semibold text-white text-center mb-5">
          Stay informed about your device
        </h3>
        <div className="flex flex-col gap-3 mb-8 px-1">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-success flex items-center justify-center flex-shrink-0">
              <Check size={14} className="text-white" strokeWidth={3} />
            </div>
            <span className="text-body-md text-white">Important device alerts</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-danger flex items-center justify-center flex-shrink-0">
              <X size={14} className="text-white" strokeWidth={3} />
            </div>
            <span className="text-body-md text-white">Ads and promotional messages</span>
          </div>
        </div>
        <button
          onClick={() => void dismiss(true)}
          className="w-full h-14 rounded-l bg-primary text-black text-body-lg font-semibold active:scale-[0.98] transition-transform"
        >
          Enable Notifications
        </button>
      </motion.div>
    </motion.div>
  )
}
