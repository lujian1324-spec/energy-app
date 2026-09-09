/**
 * BLE scan / permission / radar list screens (design p26 searching, p27 BT off).
 */
import { Loader2 } from 'lucide-react'
import Icon from '../../components/Icon'
import AddDeviceHeader from './AddDeviceHeader'
import { toast } from '../../components/Toast'
import { openAppSettings } from '../../utils/openAppSettings'
import { isDtuid } from '../../utils/dtuidParser'
import { formatScanDisplayName } from '../../utils/scanDisplayName'
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
  foundDevices: FoundDevice[]
  handleClose: () => void
  handleScan: () => void
  handleSelectDevice: (d: FoundDevice) => void
  setUiScreen: (s: 'scan' | 'qr' | 'naming' | 'icon' | 'provisioning') => void
}

/**
 * Lights up the three rings the radar art already draws, inner to outer, so a
 * live scan reads as a wave travelling outward.
 *
 * The circles are traced off the handoff frame: in the art's own 317x239.5 box
 * they share a centre at (158, 158) with radii 61.25, 112.25 and 158. The art
 * fades each ring towards its own bottom, so the stroke carries the same fade
 * as a gradient over the ring's bounding box.
 */
function RadarPulse() {
  return (
    <svg
      viewBox="0 0 317 239.5"
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      <defs>
        <linearGradient id="radar-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#01D6BE" stopOpacity="0.85" />
          <stop offset="0.25" stopColor="#01D6BE" stopOpacity="1" />
          <stop offset="0.5" stopColor="#01D6BE" stopOpacity="0.9" />
          <stop offset="0.75" stopColor="#01D6BE" stopOpacity="0.45" />
          <stop offset="1" stopColor="#01D6BE" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[61.25, 112.25, 158].map((r, i) => (
        <circle
          key={r}
          cx={158}
          cy={158}
          r={r}
          fill="none"
          stroke="url(#radar-fade)"
          strokeWidth={1.5}
          className={`radar-ring${i > 0 ? ` radar-ring-${i + 1}` : ''}`}
        />
      ))}
    </svg>
  )
}

export default function ScanDevicesScreen(p: Props) {
  const store = useProvisionStore()
  const { bleStatus, foundDevices, handleClose, handleScan, handleSelectDevice, setUiScreen } = p
  const isSearching = store.isOperating
  const hasDevices = foundDevices.length > 0
  const hasError = !isSearching && store.errorMessage && !hasDevices
  const isCheckingBle = bleStatus === 'checking'
  const openQr = () => setUiScreen('qr')
  const showWebPickerCta = !supportsDeviceListScan() && !isSearching && !hasDevices && !hasError

  /* A_1.3.1 -v Bluetooth and/or local network Access Denied: headline at y210 in
     two lines, subtitle at y264 in label/ink-5, art at y337 and one filled button
     at y580. The screen used to start at pt-8, which put the whole block 44 high,
     and it carried a second "I've Allowed It" button the frame does not have —
     ProvisioningPage re-checks the permission on resume and restarts the scan by
     itself, so the manual retry was only ever a fallback. */
  if (bleStatus === 'no_permission') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        <AddDeviceHeader onBack={handleClose} onScanQr={openQr} />
        <div className="flex-1 min-h-0 flex flex-col items-center px-4 text-center">
          <h2 className="mt-[76px] text-title-lg font-semibold text-ink-3">
            Allow Bluetooth and Local Network Access
          </h2>
          {/* The frame breaks this after "Sierro". Inter is narrower than the SF
              Pro the frame is set in and would keep it on one line at the full
              370 measure, which pulls the art and the button 15 up. */}
          <p className="mt-[7px] text-label text-ink-5 max-w-[336px]">
            Required to find, connect, and communicate with your Sierro device.
          </p>
          <img
            src={`${import.meta.env.BASE_URL}ds-bt-permission.png`}
            alt=""
            width={242}
            height={227}
            className="mt-[47px] w-[242px] max-w-full h-auto select-none"
            draggable={false}
          />
          <button
            onClick={async () => {
              const ok = await openAppSettings()
              if (!ok) {
                toast.info('Open Settings → Apps → Sierro → Permissions → Nearby devices, and allow it.')
              }
            }}
            className="mt-[16px] w-full h-12 rounded-l bg-primary text-primary-darker text-body-lg font-semibold active:scale-[0.98] transition-transform"
          >
            Open Settings
          </button>
        </div>
      </div>
    )
  }

  /* A_1.3.1 -v Bluetooth off: same rhythm — headline y210, subtitle y240, art
     y313 — and no button. */
  if (bleStatus === 'bt_off') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        <AddDeviceHeader onBack={handleClose} onScanQr={openQr} />
        <div className="flex-1 min-h-0 flex flex-col items-center px-4 text-center">
          <h2 className="mt-[76px] text-title-lg font-semibold text-ink-3">Turn on Bluetooth</h2>
          <p className="mt-[7px] text-label text-ink-5">
            Enable Bluetooth from Control Center or Settings to automatically find and connect your device.
          </p>
          <img
            src={`${import.meta.env.BASE_URL}ds-bt-off.png`}
            alt=""
            width={206}
            height={227}
            className="mt-[47px] w-[206px] max-w-full h-auto select-none"
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
          <div className="relative mt-[33px] w-[317px] max-w-full">
            <img
              src={`${import.meta.env.BASE_URL}ds-scan-radar.png`}
              alt=""
              width={317}
              height={240}
              className="w-full h-auto select-none"
              draggable={false}
            />
            {isSearching && <RadarPulse />}
          </div>
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
                      className="w-16 h-[30px] shrink-0 rounded-m border-s border-primary text-primary text-label font-normal active:scale-[0.96] transition-transform"
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
