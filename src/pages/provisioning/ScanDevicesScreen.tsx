/**
 * BLE scan / permission / radar list screens.
 */
import { motion } from 'framer-motion'
import { ChevronLeft, WifiOff, Loader2, AlertCircle } from 'lucide-react'
import { toast } from '../../components/Toast'
import { openAppSettings } from '../../utils/openAppSettings'
import { isDtuid } from '../../utils/dtuidParser'
import { resetBleInit } from '../../utils/permissions'
import { useProvisionStore } from '../../stores/provisionStore'

type FoundDevice = {
  name: string
  serial: string
  deviceId?: string
  bleName?: string
  status?: number
}

const radarRings = [0, 1, 2, 3]

function displayTitleFromDtuid(dtuid: string): string {
  return `Sierro · ${dtuid.slice(-4)}`
}

type Props = {
  bleStatus: 'checking' | 'no_permission' | 'bt_off' | 'ready'
  setBleStatus: (s: 'checking' | 'no_permission' | 'bt_off' | 'ready') => void
  foundDevices: FoundDevice[]
  handleClose: () => void
  handleScan: () => void
  handleSelectDevice: (d: FoundDevice) => void
  setUiScreen: (s: 'scan' | 'qr' | 'naming' | 'icon' | 'provisioning') => void
}

export default function ScanDevicesScreen(p: Props) {
  const store = useProvisionStore()
  const { bleStatus, setBleStatus, foundDevices, handleClose, handleScan, handleSelectDevice, setUiScreen } = p
  const isSearching = store.isOperating
  const hasDevices = foundDevices.length > 0
  const hasError = !isSearching && store.errorMessage && !hasDevices
  const isCheckingBle = bleStatus === 'checking'

  if (bleStatus === 'no_permission') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        <div className="px-4 pt-5 pb-4 flex items-center safe-area-top">
          <button onClick={handleClose} aria-label="Back" className="relative w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center before:absolute before:content-[''] before:-inset-1">
            <ChevronLeft size={20} className="text-white" />
          </button>
          <h1 className="text-title-lg font-semibold text-white ml-3">Add Device</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="w-20 h-20 rounded-[28px] bg-danger/[0.1] flex items-center justify-center mb-6">
            <AlertCircle size={36} className="text-danger" />
          </div>
          <h2 className="text-headline-md font-bold text-white mb-3">Permission Required</h2>
          <p className="text-body-md text-ink-6 mb-8">
            Sierro needs the <span className="text-white font-semibold">Nearby devices</span> (Bluetooth)
            permission to find your device. Open Settings → Permissions → Nearby devices and allow it,
            then come back and try again.
          </p>
        </div>
        <div className="px-6 pb-10 safe-area-bottom space-y-3">
          <button
            onClick={async () => {
              const ok = await openAppSettings()
              if (!ok) {
                toast.info('Open Settings → Apps → Sierro → Permissions → Nearby devices, and allow it.')
              }
            }}
            className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold active:scale-[0.98] transition-transform"
          >
            Open Settings
          </button>
          <button
            onClick={() => { resetBleInit(); setBleStatus('ready'); store.setErrorMessage(null); handleScan() }}
            className="w-full h-14 rounded-full bg-ink-10 text-white text-body-lg font-semibold active:scale-[0.98] transition-transform"
          >
            I've Allowed It — Try Again
          </button>
        </div>
      </div>
    )
  }

  if (bleStatus === 'bt_off') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        <div className="px-4 pt-5 pb-4 flex items-center safe-area-top">
          <button onClick={handleClose} aria-label="Back" className="relative w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center before:absolute before:content-[''] before:-inset-1">
            <ChevronLeft size={20} className="text-white" />
          </button>
          <h1 className="text-title-lg font-semibold text-white ml-3">Add Device</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="w-20 h-20 rounded-[28px] bg-primary/[0.1] flex items-center justify-center mb-6">
            <WifiOff size={36} className="text-primary" />
          </div>
          <h2 className="text-headline-md font-bold text-white mb-3">Bluetooth is Off</h2>
          <p className="text-body-md text-ink-6 mb-8">
            Please enable Bluetooth on your device to scan for nearby Sierro devices.
          </p>
        </div>
        <div className="px-6 pb-10 safe-area-bottom space-y-3">
          <button
            onClick={() => setBleStatus('ready')}
            className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold"
          >
            I've Enabled Bluetooth
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      {isCheckingBle && (
        <div className="absolute inset-0 z-20 bg-ink-12/85 flex flex-col items-center justify-center">
          <Loader2 size={32} className="text-primary animate-spin mb-4" />
          <p className="text-body-lg text-white">Checking Bluetooth…</p>
        </div>
      )}
      <div className="px-4 pt-5 pb-4 flex items-center justify-between safe-area-top">
        <button
          onClick={handleClose}
          aria-label="Back"
          className="relative w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center before:absolute before:content-[''] before:-inset-1"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-title-lg font-semibold text-white">Add Device</h1>
        <button
          onClick={() => setUiScreen('qr')}
          className="text-body-md font-semibold text-primary"
        >
          Scan QR
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-6">
        <div className={`flex flex-col items-center shrink-0 ${hasDevices ? 'pt-1 pb-3' : 'flex-1 justify-center'}`}>
          <div className="relative flex items-center justify-center w-full min-h-56 mb-2">
          <div className={`relative flex items-center justify-center ${hasDevices ? 'w-28 h-28' : 'w-56 h-56'}`}>
            {radarRings.map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border border-primary"
                style={{
                  width: (hasDevices ? 28 : 56) + i * (hasDevices ? 20 : 40),
                  height: (hasDevices ? 28 : 56) + i * (hasDevices ? 20 : 40),
                }}
                animate={{ opacity: isSearching ? [0.6, 0.1, 0.6] : 0.15 }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.4,
                  ease: 'easeInOut',
                }}
              />
            ))}
            <div className={`${hasDevices ? 'w-10 h-10' : 'w-16 h-16'} rounded-l bg-ink-10 flex items-center justify-center z-10`}>
              <svg width={hasDevices ? 18 : 28} height={hasDevices ? 18 : 28} viewBox="0 0 24 24" fill="none">
                <rect x="5" y="2" width="14" height="20" rx="3" stroke="#01D6BE" strokeWidth="1.5"/>
                <circle cx="12" cy="18" r="1" fill="#01D6BE"/>
              </svg>
            </div>
          </div>
          </div>

          {isSearching && !hasDevices && (
            <div className="text-center mb-6">
              <p className="text-body-lg font-semibold text-white mb-1">Searching for nearby devices...</p>
              <p className="text-body-md text-ink-6">Make sure your device is powered on and nearby.</p>
            </div>
          )}

          {!isSearching && !hasDevices && !store.errorMessage && (
            <div className="text-center mb-6">
              <p className="text-body-lg font-semibold text-white mb-1">Ready to Scan</p>
              <p className="text-body-md text-ink-6">Tap the button below to search for nearby devices.</p>
            </div>
          )}

          {hasError && (
            <div className="text-center mb-6">
              <p className="text-body-lg font-semibold text-white mb-1">No Devices Found</p>
              <p className="text-body-md text-ink-6">Make sure your device is powered on and Bluetooth is enabled.</p>
            </div>
          )}
        </div>

        {hasDevices && (
          <div className="flex-1 min-h-0 flex flex-col mb-3">
            <p className="text-caption font-bold text-ink-6 tracking-widest uppercase mb-3 px-1 shrink-0">
              Found Devices ({foundDevices.length})
            </p>
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div className="flex flex-col gap-2 pb-2">
                {foundDevices.map((device, i) => (
                  <div
                    key={device.deviceId || device.serial || i}
                    className="bg-ink-10 rounded-l px-4 py-4 flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-body-lg font-semibold text-white tracking-wide truncate">
                        {isDtuid(device.serial) ? displayTitleFromDtuid(device.serial) : (device.name || 'Sierro')}
                      </p>
                      <p className="text-caption text-ink-6 mt-0.5 truncate">
                        {isDtuid(device.serial) ? device.serial : 'Sierro'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleSelectDevice(device)}
                      className="px-4 h-9 shrink-0 rounded-full border border-primary text-primary text-body-md font-semibold active:scale-[0.96] transition-transform"
                    >
                      Connect
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="pb-10 safe-area-bottom space-y-3">
          {(hasError || !isSearching) && !hasDevices && (
            <button
              onClick={handleScan}
              disabled={isSearching}
              className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
                disabled:bg-primary-dark disabled:text-black/[0.4] transition-colors"
            >
              {hasError ? 'Search Again' : 'Search for Devices'}
            </button>
          )}
          {isSearching && (
            <button
              disabled
              className="w-full h-14 rounded-full bg-primary-dark text-black/[0.4] text-body-lg font-semibold flex items-center justify-center gap-2"
            >
              <Loader2 size={18} className="animate-spin" />
              Searching...
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
