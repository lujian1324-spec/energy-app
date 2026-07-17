/**
 * First-launch permission prompt.
 *
 * Requests Notifications, Camera, Bluetooth, Wi-Fi/Network and persistent
 * Storage via the shared permissions utility (src/utils/permissions.ts).
 *
 * Shows once then sets a localStorage flag so it never re-appears.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HardDrive, Wifi } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PUSH_ENABLED } from '../config/webPush'
import Icon from './Icon'
import {
  PERMISSION_DEFS,
  type PermissionId,
  type PermissionResult,
} from '../utils/permissions'

const STORAGE_KEY = 'sierro_permissions_asked'

// Per-permission icon (Icon component name, or a Lucide fallback)
const ICONS: Record<PermissionId, { name?: string; Lucide?: LucideIcon }> = {
  storage: { Lucide: HardDrive },
  notifications: { name: 'bell' },
  camera: { name: 'scan' },
  bluetooth: { name: 'bluetooth' },
  wifi: { Lucide: Wifi },
}

function PermIcon({ id, size = 20 }: { id: PermissionId; size?: number }) {
  const cfg = ICONS[id]
  if (cfg.name) return <Icon name={cfg.name} size={size} />
  if (cfg.Lucide) return <cfg.Lucide size={size} className="text-primary" />
  return null
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

// 推送未就绪时不申请通知权限（避免为不可用功能索权，商店拒审风险）。
// 蓝牙权限不在首次启动时申请 — 改为在实际触发 BLE 扫描时才请求，
// 避免用户尚未尝试添加设备就弹出蓝牙权限对话框导致高拒绝率。
const GATE_DEFS = PERMISSION_DEFS.filter(d => d.id !== 'notifications' || PUSH_ENABLED).filter(d => d.id !== 'bluetooth')

export default function PermissionsGate({ onDone }: Props) {
  const [step, setStep] = useState<'intro' | 'asking' | 'done'>('intro')
  const [results, setResults] = useState<Record<string, PermissionResult>>({})

  const handleAllow = async () => {
    setStep('asking')
    // Mark immediately so a stuck/closed prompt never re-traps the user.
    markPermissionsAsked()

    // Request sequentially so native prompts don't overlap.
    const r: Record<string, PermissionResult> = {}
    for (const def of GATE_DEFS) {
      r[def.id] = await def.request()
      setResults({ ...r })
    }
    setStep('done')
  }

  const handleSkip = () => {
    markPermissionsAsked()
    onDone()
  }

  const labelFor = (res?: PermissionResult): { text: string; cls: string } => {
    switch (res?.state) {
      case 'granted': return { text: 'Allowed', cls: 'text-success' }
      case 'denied': return { text: 'Denied', cls: 'text-warning' }
      case 'unsupported': return { text: 'N/A', cls: 'text-ink-7' }
      default: return { text: 'Optional', cls: 'text-ink-6' }
    }
  }

  return (
    <div className="fixed inset-0 z-[999] bg-ink-12 flex flex-col items-center px-6 safe-area-top safe-area-bottom">
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
              <Icon name="privacy" size={40} />
            </div>

            <h1 className="text-headline-lg font-bold text-white text-center mb-2">
              App Permissions
            </h1>
            <p className="text-body-md text-ink-6 text-center mb-6 max-w-[280px] leading-relaxed">
              Sierro needs a few permissions to give you the full experience.
            </p>

            {/* Permission list */}
            <div className="w-full space-y-3 mb-4">
              {GATE_DEFS.map(({ id, title, description }) => (
                <div key={id} className="flex items-start gap-4 bg-ink-10 rounded-l px-4 py-4">
                  <div className="w-10 h-10 rounded-l bg-[rgba(1,214,190,0.1)] flex items-center justify-center flex-shrink-0">
                    <PermIcon id={id} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-lg font-semibold text-white">{title}</p>
                    <p className="text-body-md text-ink-6 mt-0.5 leading-snug">{description}</p>
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
            <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-body-lg text-ink-6">Requesting permissions…</p>
            <p className="text-caption text-ink-7 text-center max-w-[220px]">
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
              <Icon name="privacy" size={40} />
            </div>
            <h1 className="text-headline-lg font-bold text-white text-center mb-2">All Set</h1>
            <p className="text-body-md text-ink-6 text-center mb-6 max-w-[260px] leading-relaxed">
              You can re-test or update permissions anytime in Settings.
            </p>

            <div className="w-full space-y-3 mb-4">
              {GATE_DEFS.map(({ id, title }) => {
                const lbl = labelFor(results[id])
                return (
                  <div key={id} className="flex items-center gap-4 bg-ink-10 rounded-l px-4 py-3.5">
                    <div className="w-9 h-9 rounded-m bg-[rgba(1,214,190,0.08)] flex items-center justify-center flex-shrink-0">
                      <PermIcon id={id} size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block text-body-md font-medium text-white">{title}</span>
                      {results[id]?.detail && (
                        <span className="block text-caption text-ink-7 mt-0.5 truncate">{results[id]!.detail}</span>
                      )}
                    </div>
                    <span className={`text-label font-semibold flex-shrink-0 ${lbl.cls}`}>{lbl.text}</span>
                  </div>
                )
              })}
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
              className="w-full h-14 rounded-full bg-primary text-black font-semibold text-body-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              Allow All <Icon name="chevron-right" size={18} />
            </button>
            <button
              onClick={handleSkip}
              className="w-full h-12 text-body-md text-ink-7 active:opacity-70"
            >
              Skip for now
            </button>
          </>
        )}
        {step === 'asking' && (
          <button
            onClick={onDone}
            className="w-full h-12 text-body-md text-ink-7 active:opacity-70"
          >
            Continue
          </button>
        )}
        {step === 'done' && (
          <button
            onClick={onDone}
            className="w-full h-14 rounded-full bg-primary text-black font-semibold text-body-lg active:scale-[0.98] transition-transform"
          >
            Get Started
          </button>
        )}
      </div>
    </div>
  )
}
