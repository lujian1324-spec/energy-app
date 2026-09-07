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

  /* A_1.3.1 / A_1.3.2 keep one header block across every scan state: headline at
     y210, subtitle at y240 and the radar at y300. The list, the Search Again CTA
     and the connect-fail toast all hang off the bottom of that same art. */
  const headline = hasError ? 'No Devices Found' : 'Searching for nearby devices...'
  const subtitle = hasError
    ? "We couldn't find any nearby devices. Make sure your Sierro device is powered on and nearby."
    : "Keep your phone near the Sierro device and make sure it's powered on."

  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      {isCheckingBle && (
        <div className="absolute inset-0 z-20 bg-ink-12/85 flex flex-col items-center justify-center">
          <Loader2 size={32} className="text-primary animate-spin mb-4" />
          <p className="text-body-lg text-white">Checking Bluetooth…</p>
        </div>
      )}
      <AddDeviceHeader onBack={handleClose} onScanQr={openQr} />

      <div className="flex-1 min-h-0 flex flex-col px-4 safe-area-bottom">
        <div className="shrink-0 flex flex-col items-center text-center">
          <h2 className="mt-[76px] text-title-lg font-semibold text-ink-3">{headline}</h2>
          <p className="mt-2 text-label text-ink-5 max-w-[344px]">{subtitle}</p>
          {/* Cropped straight out of the handoff frame at 3x, so the rings and the
              product shot land on the same pixels the design does. */}
          <img
            src={`${import.meta.env.BASE_URL}ds-scan-radar.png`}
            alt=""
            width={317}
            height={240}
            className="mt-[33px] w-[317px] max-w-full h-auto select-none"
            draggable={false}
          />
        </div>

        {(hasError || showWebPickerCta) && (
          <button
            onClick={handleScan}
            disabled={isSearching}
            className="mt-[17px] shrink-0 w-full h-12 rounded-l bg-primary text-primary-darker text-body-lg font-semibold active:scale-[0.98] transition-transform disabled:opacity-40"
          >
            {hasError ? 'Search Again' : 'Search for Devices'}
          </button>
        )}

        {hasDevices && (
          <div className="mt-[17px] flex-1 min-h-0 flex flex-col">
            <p className="text-body-md font-semibold text-ink-2 mb-2 shrink-0">
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
                    className="bg-ink-10 rounded-l h-[68px] px-3 flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-body-md font-semibold text-ink-2 truncate">
                        {formatScanDisplayName({ name: device.name, serial: device.serial, deviceId: device.deviceId })}
                      </p>
                      <p className="text-tiny text-ink-4 mt-0.5 truncate">
                        {isDtuid(device.serial) ? device.serial : 'Sierro'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleSelectDevice(device)}
                      className="w-16 h-[30px] shrink-0 rounded-m border-s border-primary text-primary text-body-md font-semibold active:scale-[0.96] transition-transform"
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
          <div className="shrink-0 pt-2 pb-[3px]">
            <ErrorToast message={store.errorMessage} onDismiss={() => store.setErrorMessage(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
