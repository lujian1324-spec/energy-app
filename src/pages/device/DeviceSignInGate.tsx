import { WifiOff } from 'lucide-react'

export default function DeviceSignInGate({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <div className="px-5 pt-4 pb-3 safe-area-top">
        <h1 className="text-display font-display text-white">Device</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-5">
        <WifiOff size={48} className="text-ink-7 mb-3 opacity-40" />
        <p className="text-sm font-medium text-ink-6 mb-1">Not signed in</p>
        <p className="text-xs text-ink-7 mb-6 text-center">Sign in to view your devices and real-time parameters</p>
        <button
          onClick={onSignIn}
          className="px-6 py-2.5 bg-primary rounded-full text-ink-13 text-body-md font-semibold"
        >
          Sign In
        </button>
      </div>
    </div>
  )
}
