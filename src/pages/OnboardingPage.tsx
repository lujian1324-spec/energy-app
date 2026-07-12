/**
 * Onboarding flow (PRD §4.7.3)
 *
 * Shown after a user's first sign-up. One step: guide the user to add
 * their first device, or skip for now.
 *
 * The "what should we call you?" name step was removed — the display
 * name is now just the account/username entered at registration
 * (unifies Account/Username/Name into a single concept; no separate
 * nickname to collect or keep in sync).
 *
 * "Connect Device" opens the standard Add Device (BLE provisioning) flow;
 * "Skip for now" drops straight into the home screen with no devices.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProvisioningPage from './ProvisioningPage'

export default function OnboardingPage() {
  const navigate = useNavigate()

  const [showProvisioning, setShowProvisioning] = useState(false)

  const finish = () => navigate('/devices', { replace: true })

  // ─── Add Device flow (BLE provisioning) ──────────────────────────────────
  if (showProvisioning) {
    return <ProvisioningPage onClose={finish} />
  }

  // ─── Add first device ──────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-ink-12">
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
