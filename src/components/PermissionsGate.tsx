/**
 * First-launch permission prompt.
 *
 * Requests Camera (via getUserMedia), Bluetooth (via requestDevice),
 * and explains Storage access (IndexedDB / localStorage — always granted
 * in modern browsers, so we show it as informational).
 *
 * Shows once then sets a localStorage flag so it never re-appears.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Bluetooth, HardDrive, Bell, ChevronRight, Shield } from 'lucide-react'

const STORAGE_KEY = 'sierro_permissions_asked'

/**
 * Resolve a promise but never hang: if it doesn't settle within `ms`,
 * fall back to `fallback`. Critical for Android WebView (Capacitor) where
 * getUserMedia / Notification.requestPermission can hang forever when the
 * native permission bridge isn't wired up, freezing this gate.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

interface Permission {
  id: 'storage' | 'notifications' | 'camera' | 'bluetooth'
  Icon: React.FC<{ size?: number; className?: string }>
  title: string
  description: string
}

const PERMISSIONS: Permission[] = [
  {
    id: 'storage',
    Icon: HardDrive,
    title: 'Local Storage',
    description: 'Save your profile, avatar, and settings on this device.',
  },
  {
    id: 'notifications',
    Icon: Bell,
    title: 'Notifications',
    description: 'Get alerted instantly when a power outage or device alarm occurs.',
  },
  {
    id: 'camera',
    Icon: Camera,
    title: 'Camera',
    description: 'Scan QR codes to add devices and update your profile photo.',
  },
  {
    id: 'bluetooth',
    Icon: Bluetooth,
    title: 'Bluetooth',
    description: 'Connect directly to your SIERRO device for setup and control.',
  },
]

async function requestCamera(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    stream.getTracks().forEach(t => t.stop())
    return true
  } catch {
    return false
  }
}

async function requestBluetooth(): Promise<boolean> {
  try {
    if (!('bluetooth' in navigator)) return false
    // requestDevice opens the browser picker — user can cancel
    await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true })
    return true
  } catch {
    // User cancelled or BT unavailable — not a fatal error
    return false
  }
}

export function hasAskedPermissions(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export function markPermissionsAsked(): void {
  localStorage.setItem(STORAGE_KEY, '1')
}

interface Props {
  onDone: () => void
}

export default function PermissionsGate({ onDone }: Props) {
  const [step, setStep] = useState<'intro' | 'asking' | 'done'>('intro')
  const [results, setResults] = useState<Record<string, boolean>>({})

  const handleAllow = async () => {
    setStep('asking')
    // Mark immediately so a stuck/closed prompt never re-traps the user.
    markPermissionsAsked()
    const r: Record<string, boolean> = { storage: true }

    // Notifications — guard against WebView hangs (8s cap)
    try {
      if ('Notification' in window && Notification.permission !== 'denied') {
        const perm = await withTimeout(Notification.requestPermission(), 8000, 'default' as NotificationPermission)
        r.notifications = perm === 'granted'
      } else if ('Notification' in window) {
        r.notifications = Notification.permission === 'granted'
      } else {
        r.notifications = false
      }
    } catch {
      r.notifications = false
    }

    // Camera — getUserMedia can hang in WebView; cap at 10s
    r.camera = await withTimeout(requestCamera(), 10000, false)

    // Bluetooth — Web Bluetooth picker; cap at 10s
    r.bluetooth = await withTimeout(requestBluetooth(), 10000, false)

    setResults(r)
    setStep('done')
  }

  const handleSkip = () => {
    markPermissionsAsked()
    onDone()
  }

  return (
    <div className="fixed inset-0 z-[999] bg-[#141414] flex flex-col items-center px-6 safe-area-top safe-area-bottom">
      <div className="flex-1 w-full overflow-y-auto scrollbar-hide">
      <AnimatePresence mode="wait">
        {step === 'intro' && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="flex flex-col items-center w-full pt-12"
          >
            {/* Shield icon */}
            <div className="w-20 h-20 rounded-[28px] bg-[rgba(1,214,190,0.1)] border border-[rgba(1,214,190,0.25)] flex items-center justify-center mb-6">
              <Shield size={40} className="text-[#01D6BE]" />
            </div>

            <h1 className="text-headline-lg font-bold text-white text-center mb-2">
              App Permissions
            </h1>
            <p className="text-body-md text-[#BFBFBF] text-center mb-6 max-w-[280px] leading-relaxed">
              Sierro needs a few permissions to give you the full experience.
            </p>

            {/* Permission list */}
            <div className="w-full space-y-3 mb-4">
              {PERMISSIONS.map(({ id, Icon, title, description }) => (
                <div key={id} className="flex items-start gap-4 bg-[#262626] rounded-l px-4 py-4">
                  <div className="w-10 h-10 rounded-l bg-[rgba(1,214,190,0.1)] flex items-center justify-center flex-shrink-0">
                    <Icon size={20} className="text-[#01D6BE]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-lg font-semibold text-white">{title}</p>
                    <p className="text-body-md text-[#BFBFBF] mt-0.5 leading-snug">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'asking' && (
          <motion.div
            key="asking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-full gap-4"
          >
            <div className="w-12 h-12 rounded-full border-2 border-[#01D6BE] border-t-transparent animate-spin" />
            <p className="text-body-lg text-[#BFBFBF]">Requesting permissions…</p>
            <p className="text-caption text-[#8C8C8C] text-center max-w-[220px]">
              Please respond to any system prompts that appear.
            </p>
          </motion.div>
        )}

        {step === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center w-full pt-12"
          >
            <div className="w-20 h-20 rounded-[28px] bg-[rgba(52,199,89,0.1)] border border-[rgba(52,199,89,0.25)] flex items-center justify-center mb-6">
              <Shield size={40} className="text-[#34C759]" />
            </div>
            <h1 className="text-headline-lg font-bold text-white text-center mb-2">All Set</h1>
            <p className="text-body-md text-[#BFBFBF] text-center mb-6 max-w-[260px] leading-relaxed">
              You can always update permissions in your device Settings app.
            </p>

            <div className="w-full space-y-3 mb-4">
              {PERMISSIONS.map(({ id, Icon, title }) => (
                <div key={id} className="flex items-center gap-4 bg-[#262626] rounded-l px-4 py-3.5">
                  <div className="w-9 h-9 rounded-m bg-[rgba(1,214,190,0.08)] flex items-center justify-center flex-shrink-0">
                    <Icon size={18} className="text-[#01D6BE]" />
                  </div>
                  <span className="flex-1 text-body-md font-medium text-white">{title}</span>
                  <span
                    className={`text-label font-semibold ${
                      results[id] === false ? 'text-[#FF9500]' : 'text-[#34C759]'
                    }`}
                  >
                    {results[id] === false ? 'Denied' : 'Allowed'}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Bottom CTA — pinned, always visible */}
      <div className="w-full shrink-0 pt-3 pb-6 space-y-3">
        {step === 'intro' && (
          <>
            <button
              onClick={handleAllow}
              className="w-full h-14 rounded-full bg-[#01D6BE] text-black font-semibold text-body-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              Allow All <ChevronRight size={18} />
            </button>
            <button
              onClick={handleSkip}
              className="w-full h-12 text-body-md text-[#8C8C8C] active:opacity-70"
            >
              Skip for now
            </button>
          </>
        )}
        {step === 'asking' && (
          <button
            onClick={onDone}
            className="w-full h-12 text-body-md text-[#8C8C8C] active:opacity-70"
          >
            Continue
          </button>
        )}
        {step === 'done' && (
          <button
            onClick={onDone}
            className="w-full h-14 rounded-full bg-[#01D6BE] text-black font-semibold text-body-lg active:scale-[0.98] transition-transform"
          >
            Get Started
          </button>
        )}
      </div>
    </div>
  )
}
