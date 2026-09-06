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
      {/* 4x export A_2.2.2: header box 80, title title_large/ink-3 at y154, subtitle
          body_medium/ink-5, illustration 258 wide at y312, ink-9 hairline at y769 and a
          370x44 filled button (radius m, primary-darker label) at y781. */}
      <div className="px-4 pb-5 safe-area-top-header flex items-center justify-between">
        <button
          onClick={finish}
          aria-label="Back"
          className="relative w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center before:absolute before:content-[''] before:-inset-1"
        >
          <Icon name="chevron-left" size={24} />
        </button>
        <button
          onClick={finish}
          className="text-body-md text-primary active:opacity-70"
        >
          Skip for now
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center px-6 text-center">
        <h1 className="mt-[18px] text-title-lg font-semibold text-ink-3">Add Your First Device</h1>
        <p className="mt-3 text-body-md text-ink-5">
          We'll help you find and connect your Sierro device in a few simple steps.
        </p>
        <img
          src={`${import.meta.env.BASE_URL}ds-onboarding.svg`}
          alt=""
          className="mt-[90px] w-[300px] h-auto select-none"
          draggable={false}
        />
      </div>

      <div
        className="border-t border-ink-9 px-4 pt-3"
        style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px)) + 16px)' }}
      >
        <button
          onClick={() => setShowProvisioning(true)}
          className="w-full h-11 rounded-m bg-primary text-primary-darker text-body-lg font-semibold active:scale-[0.98] transition-transform"
        >
          Connect Device
        </button>
      </div>
    </div>
  )
}
