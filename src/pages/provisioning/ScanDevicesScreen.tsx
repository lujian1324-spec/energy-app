/**
 * BLE scan / permission / radar list screens (design p26 searching, p27 BT off).
 */
import { Loader2 } from 'lucide-react'
import Icon from '../../components/Icon'
import { toast } from '../../components/Toast'
import { openAppSettings } from '../../utils/openAppSettings'
import { isDtuid } from '../../utils/dtuidParser'
import { formatScanDisplayName } from '../../utils/scanDisplayName'
import { resetBleInit } from '../../utils/permissions'
import { supportsDeviceListScan } from '../../protocols/bleProvision'
import { useProvisionStore } from '../../stores/provisionStore'

type FoundDevice = {
  name: string
  serial: string
  deviceId?: string
  bleName?: string
  status?: number
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

function AddDeviceHeader({ onBack, onScanQr }: { onBack: () => void; onScanQr: () => void }) {
  return (
    <div className="px-4 pt-5 pb-4 grid grid-cols-[40px_1fr_auto] items-center gap-2 safe-area-top">
      <button
        onClick={onBack}
        aria-label="Back"
        className="relative w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center before:absolute before:content-[''] before:-inset-1"
      >
        <Icon name="chevron-left" size={20} />
      </button>
      <h1 className="text-title-lg font-semibold text-white text-center">Add Device</h1>
      <button
        onClick={onScanQr}
        className="text-body-md font-semibold text-primary active:opacity-70 px-1"
      >
        Scan QR
      </button>
    </div>
  )
}

export default function ScanDevicesScreen(p: Props) {
  const store = useProvisionStore()
  const { bleStatus, setBleStatus, foundDevices, handleClose, handleScan, handleSelectDevice, setUiScreen } = p
  const isSearching = store.isOperating
  const hasDevices = foundDevices.length > 0
  const hasError = !isSearching && store.errorMessage && !hasDevices
  const isCheckingBle = bleStatus === 'checking'
  const openQr = () => setUiScreen('qr')
  const showWebPickerCta = !supportsDeviceListScan() && !isSearching && !hasDevices && !hasError

  if (bleStatus === 'no_permission') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        <AddDeviceHeader onBack={handleClose} onScanQr={openQr} />
        <div className="flex-1 flex flex-col items-center px-6 text-center pt-8">
          <h2 className="text-headline-md font-bold text-white mb-3">Allow Bluetooth and Local Network Access</h2>
          <p className="text-body-md text-ink-6 max-w-[320px] mb-8">
            Required to find, connect, and communicate with your Sierro device.
          </p>
          <img
            src={`${import.meta.env.BASE_URL}ds-bt-permission.svg`}
            alt=""
            className="w-full max-w-[280px] h-auto select-none"
            draggable={false}
          />
        </div>
        <div className="px-6 pb-10 safe-area-bottom space-y-3">
          <button
            onClick={async () => {
              const ok = await openAppSettings()
              if (!ok) {
                toast.info('Open Settings → Apps → Sierro → Permissions → Nearby devices, and allow it.')
              }
            }}
            className="w-full h-14 rounded-l bg-primary text-black text-body-lg font-semibold active:scale-[0.98] transition-transform"
          >
            Open Settings
          </button>
          <button
            onClick={() => { resetBleInit(); setBleStatus('ready'); store.setErrorMessage(null); handleScan() }}
            className="w-full h-12 text-body-md text-ink-6 active:opacity-70"
          >
            I&apos;ve Allowed It — Try Again
          </button>
        </div>
      </div>
    )
  }

  if (bleStatus === 'bt_off') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        <AddDeviceHeader onBack={handleClose} onScanQr={openQr} />
        <div className="flex-1 flex flex-col items-center px-6 text-center pt-8">
          <h2 className="text-headline-md font-bold text-white mb-2">Turn on Bluetooth</h2>
          <p className="text-body-md text-ink-6 max-w-[320px] mb-8">
            Enable Bluetooth from Control Center or Settings to automatically find and connect your device.
          </p>
          <img
            src={`${import.meta.env.BASE_URL}ds-bt-off.svg`}
            alt=""
            className="w-full max-w-[240px] h-auto select-none"
            draggable={false}
          />
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
      <AddDeviceHeader onBack={handleClose} onScanQr={openQr} />

      <div className="flex-1 min-h-0 flex flex-col px-6">
        <div className={`flex flex-col items-center shrink-0 ${hasDevices ? 'pt-1 pb-3' : 'flex-1'}`}>
          {!hasDevices && !hasError && (
            <>
              <div className="text-center mb-8 px-2 pt-6">
                <p className="text-headline-md font-bold text-white mb-2">Searching for nearby devices...</p>
                <p className="text-body-md text-ink-6">Keep your phone near the Sierro device and make sure it's powered on.</p>
              </div>
              <img
                src={`${import.meta.env.BASE_URL}ds-searching-bt.svg`}
                alt=""
                className="w-full max-w-[280px] h-auto select-none"
                draggable={false}
              />
            </>
          )}

          {hasError && (
            <div className="text-center mb-2 pt-10">
              <p className="text-body-lg font-semibold text-white mb-1">No Devices Found</p>
              <p className="text-body-md text-ink-6">Make sure your device is powered on and nearby.</p>
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
                        {formatScanDisplayName({ name: device.name, serial: device.serial, deviceId: device.deviceId })}
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

        <div className="pb-10 safe-area-bottom">
          {(hasError || showWebPickerCta) && (
            <button
              onClick={handleScan}
              disabled={isSearching}
              className="w-full h-12 rounded-[20px] text-primary text-body-md font-semibold mb-3 active:scale-[0.98] transition-transform disabled:opacity-40"
            >
              {hasError ? 'Search Again' : 'Search for Devices'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
