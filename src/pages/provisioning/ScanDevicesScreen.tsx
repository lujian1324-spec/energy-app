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
import ErrorToast from '../../components/ErrorToast'

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
    <div className="relative px-4 pb-4 flex items-center safe-area-top-header">
      <button
        onClick={onBack}
        aria-label="Back"
        className="relative w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center before:absolute before:content-[''] before:-inset-1"
      >
        <Icon name="chevron-left" size={24} />
      </button>
      {/* A_1.3.1 centres the title on the frame, not in the space the back button
          and Scan QR leave behind — a grid column put it 17px off centre. */}
      <h1 className="absolute left-1/2 -translate-x-1/2 text-title-md font-semibold text-white">
        Add Device
      </h1>
      <button
        onClick={onScanQr}
        className="ml-auto text-body-lg font-normal text-primary active:opacity-70 px-1"
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
          <h2 className="text-title-lg font-semibold text-ink-3 mb-3">Allow Bluetooth and Local Network Access</h2>
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
          <h2 className="text-title-lg font-semibold text-ink-3 mb-2">Turn on Bluetooth</h2>
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
              {/* A_1.3.1 starts the headline at y210; the art follows 34 below it. */}
              <div className="text-center mb-8 px-2 pt-[81px]">
                <p className="text-title-lg font-semibold text-ink-3 mb-2">Searching for nearby devices...</p>
                <p className="text-body-md text-ink-5">Keep your phone near the Sierro device and make sure it's powered on.</p>
              </div>
              {/* The SVG carries ~60px of empty box above its rings; A_1.3.1 starts
                  the art 35 under the subtitle. */}
              <img
                src={`${import.meta.env.BASE_URL}ds-searching-bt.svg`}
                alt=""
                className="w-full max-w-[330px] h-auto select-none -mt-[60px]"
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
            {/* A_1.3.2 sets this in body_large semibold on white, not a tracked cap label. */}
            <p className="text-body-lg font-semibold text-white mb-3 shrink-0">
              Found Devices ({foundDevices.length})
            </p>
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div className="flex flex-col gap-3 pb-2">
                {foundDevices.map((device, i) => (
                  <div
                    key={device.deviceId || device.serial || i}
                    className="bg-ink-10 rounded-l h-[68px] px-4 flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-body-lg font-semibold text-white truncate">
                        {formatScanDisplayName({ name: device.name, serial: device.serial, deviceId: device.deviceId })}
                      </p>
                      <p className="text-tiny text-ink-6 mt-0.5 truncate">
                        {isDtuid(device.serial) ? device.serial : 'Sierro'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleSelectDevice(device)}
                      className="w-16 h-8 shrink-0 rounded-m border-s border-primary text-primary text-body-md font-semibold active:scale-[0.96] transition-transform"
                    >
                      Connect
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* A_1.3.2 -v Connect Fail: the failure rides in a toast above the fold. */}
        {hasDevices && store.errorMessage && (
          <div className="pb-2 shrink-0">
            <ErrorToast message={store.errorMessage} onDismiss={() => store.setErrorMessage(null)} />
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
