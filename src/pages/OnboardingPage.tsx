/**
 * Onboarding flow (PRD §4.7.3)
 *
 * Shown after a user's first sign-up. Two steps:
 *   1. Name   — ask the user what to call them (persisted to UserProfile)
 *   2. Device — guide the user to add their first device, or skip for now
 *
 * "Connect Device" opens the standard Add Device (BLE provisioning) flow;
 * "Skip for now" drops straight into the home screen with no devices.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import ProvisioningPage from './ProvisioningPage'
import { saveUserProfile, getUserProfile } from '../db/powerflowDB'
import { useAuthStore } from '../stores/authStore'

type Step = 'name' | 'device'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [showProvisioning, setShowProvisioning] = useState(false)

  const handleNameNext = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const existing = await getUserProfile()
      await saveUserProfile({
        name: trimmed,
        email: existing?.email ?? user?.email ?? '',
        phone: existing?.phone,
        avatar: existing?.avatar ?? null,
        memberSince: existing?.memberSince ?? new Date().toISOString(),
        updatedAt: Date.now(),
      })
    } catch (err) {
      console.error('[Onboarding] saveUserProfile failed:', err)
    } finally {
      setSaving(false)
      setStep('device')
    }
  }

  const finish = () => navigate('/devices', { replace: true })

  // ─── Add Device flow (BLE provisioning) ──────────────────────────────────
  if (showProvisioning) {
    return <ProvisioningPage onClose={finish} />
  }

  // ─── Step 2: Add first device ─────────────────────────────────────────────
  if (step === 'device') {
    return (
      <div className="h-full flex flex-col bg-ink-13">
        {/* Skip for now */}
        <div className="px-4 pt-5 flex justify-end safe-area-top">
          <button
            onClick={finish}
            className="text-body-md text-ink-6 active:opacity-70"
          >
            Skip for now
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          {/* Illustration */}
          <div className="w-28 h-28 rounded-[28px] bg-[rgba(1,214,190,0.12)] flex items-center justify-center mb-8">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
              <rect x="6" y="2" width="12" height="20" rx="3" stroke="#01D6BE" strokeWidth="1.5" />
              <path d="M13 7l-3 5h4l-3 5" stroke="#01D6BE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <h1 className="text-headline-lg font-bold text-white mb-3">Add your first device</h1>
          <p className="text-body-lg text-ink-6 max-w-[300px]">
            Connect a Sierro device to start monitoring power, battery, and savings in real time.
          </p>
        </div>

        {/* Connect Device */}
        <div className="px-6 pb-10 safe-area-bottom">
          <button
            onClick={() => setShowProvisioning(true)}
            className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold active:scale-[0.98] transition-transform"
          >
            Connect Device
          </button>
        </div>
      </div>
    )
  }

  // ─── Step 1: Name ─────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-ink-13">
      <div className="px-4 pt-5 safe-area-top" />

      <div className="flex-1 px-6 pt-10">
        <h1 className="text-headline-lg font-bold text-white mb-2">What should we call you?</h1>
        <p className="text-body-md text-ink-6 mb-8">
          This is how you'll appear in the Sierro app.
        </p>

        {/* Name input card */}
        <div className="bg-ink-10 rounded-l px-4 py-4 flex items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
            className="flex-1 bg-transparent text-body-lg text-white placeholder:text-ink-7 outline-none caret-primary"
          />
          {name.length > 0 && (
            <button onClick={() => setName('')}>
              <X size={16} className="text-ink-7" />
            </button>
          )}
        </div>
      </div>

      {/* Continue */}
      <div className="px-6 pb-10 safe-area-bottom">
        <button
          onClick={handleNameNext}
          disabled={!name.trim() || saving}
          className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
            disabled:bg-primary-dark disabled:text-[rgba(0,0,0,0.4)] transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
