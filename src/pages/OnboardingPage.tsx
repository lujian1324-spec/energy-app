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
import Icon from '../components/Icon'
import ProvisioningPage from './ProvisioningPage'

export default function OnboardingPage() {
  const navigate = useNavigate()

  const [showProvisioning, setShowProvisioning] = useState(false)

  const finish = () => navigate('/devices', { replace: true })

  // ─── Add Device flow (BLE provisioning) ──────────────────────────────────
  if (showProvisioning) {
    return <ProvisioningPage onClose={finish} />
  }

  // ─── Add first device ──────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-ink-12">
      <div className="px-4 pt-5 flex items-center justify-between safe-area-top">
        <button
          onClick={finish}
          aria-label="Back"
          className="relative w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center before:absolute before:content-[''] before:-inset-1"
        >
          <Icon name="chevron-left" size={20} />
        </button>
        <button
          onClick={finish}
          className="text-body-md text-primary active:opacity-70"
        >
          Skip for now
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center px-8 text-center pt-6">
        <h1 className="text-headline-lg font-bold text-white mb-3">Add Your First Device</h1>
        <p className="text-body-lg text-ink-6 max-w-[300px] mb-8">
          We'll help you find and connect your Sierro device in a few simple steps.
        </p>
        <img
          src={`${import.meta.env.BASE_URL}ds-onboarding.svg`}
          alt=""
          className="w-full max-w-[320px] h-auto select-none"
          draggable={false}
        />
      </div>

      <div className="px-6 pb-10 safe-area-bottom">
        <button
          onClick={() => setShowProvisioning(true)}
          className="w-full h-14 rounded-l bg-primary text-black text-body-lg font-semibold active:scale-[0.98] transition-transform"
        >
          Connect Device
        </button>
      </div>
    </div>
  )
}
