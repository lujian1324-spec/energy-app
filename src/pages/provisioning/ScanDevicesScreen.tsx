/**
 * BLE scan / permission / radar list screens (design p26 searching, p27 BT off).
 */
import { motion } from 'framer-motion'
import { Loader2, Bluetooth } from 'lucide-react'
import Icon from '../../components/Icon'
import blePermissionArt from '../../assets/illustrations/ble-network-permission.png'
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

const radarRings = [0, 1, 2, 3]

type Props = {
  bleStatus: 'checking' | 'no_permission' | 'bt_off' | 'ready'
  setBleStatus: (s: 'checking' | 'no_permission' | 'bt_off' | 'ready') => void
  foundDevices: FoundDevice[]
  handleClose: () => void
  handleScan: () => void
  handleSelectDevice: (d: FoundDevice) => void
  setUiScreen: (s: 'scan' | 'qr' | 'naming' | 'icon' | 'provisioning') => void
}

/**
 * Add Device header (handoff `A_1.3.1_Add Device Main Page`).
 *
 * Scan QR is a teal text action in the top-right of the bar — it replaced the
 * grey bottom-sheet button and its "Can't find your device?" hint line. When
 * Bluetooth is off or its permission was denied, the action reads as disabled.
 */
function AddDeviceHeader({ onBack, onScanQr, scanQrDisabled }: {
  onBack: () => void
  onScanQr: () => void
  scanQrDisabled?: boolean
}) {
  return (
    <div className="px-4 pt-5 pb-4 grid grid-cols-[40px_1fr_auto] items-center gap-3 safe-area-top">
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
        disabled={scanQrDisabled}
        className="relative h-10 px-1 text-title-md font-semibold text-primary disabled:text-primary-dark-active active:opacity-70 transition-opacity before:absolute before:content-[''] before:-inset-2"
      >
        Scan QR
      </button>
    </div>
  )
}

function PhoneRadar({ compact, searching }: { compact?: boolean; searching: boolean }) {
  const box = compact ? 'w-28 h-28' : 'w-[280px] h-[280px]'
  const base = compact ? 28 : 72
  const step = compact ? 20 : 48
  const phoneW = compact ? 28 : 58
  const phoneH = compact ? 54 : 112
  const radius = compact ? 8 : 16
  return (
    <div className={`relative flex items-center justify-center ${box}`}>
      {radarRings.map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-white/[0.12]"
          style={{ width: base + i * step, height: base + i * step }}
          animate={{ opacity: searching ? [0.38, 0.08, 0.38] : 0.16 }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.35, ease: 'easeInOut' }}
        />
      ))}
      <div
        className="relative z-10 bg-[#141414] border-[2.5px] border-[#C8C8C8]"
        style={{
          width: phoneW,
          height: phoneH,
          borderRadius: radius,
          boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
        }}
      >
        <div
          className="absolute bg-[#C8C8C8] rounded-r-sm"
          style={{ right: compact ? -3 : -4, top: compact ? 12 : 24, width: compact ? 2 : 3, height: compact ? 10 : 20 }}
        />
        <div
          className="absolute bg-[#C8C8C8] rounded-r-sm"
          style={{ right: compact ? -3 : -4, top: compact ? 26 : 50, width: compact ? 2 : 3, height: compact ? 7 : 14 }}
        />
      </div>
    </div>
  )
}

function BluetoothOffIllustration() {
  return (
    <div className="relative w-[220px] h-[280px] flex items-center justify-center">
      <div className="w-[176px] h-[268px] rounded-[42px] bg-[#1A1A1A] border-[3px] border-[#C8C8C8] relative shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
        <div className="absolute left-5 top-7 w-[84px] h-[84px] rounded-[22px] bg-[#2A2A2A] grid grid-cols-2 gap-2.5 p-3">
          <div className="rounded-full bg-[#111]" />
          <div className="rounded-full bg-[#111]" />
          <div className="rounded-full bg-[#111]" />
          <div className="rounded-full bg-[#111]" />
        </div>
        <div className="absolute right-5 top-7 w-[84px] h-[84px] rounded-[22px] bg-[#3A3A3A] flex items-center justify-center">
          <div className="w-11 h-11 rounded-[14px] bg-[#0A84FF] flex items-center justify-center">
            <Bluetooth size={22} className="text-white" strokeWidth={2.4} />
          </div>
        </div>
      </div>
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

  // Permission denied — full page (handoff `-v Bluetooth and/or local network Access Denied`),
  // replacing the old centred-modal treatment.
  if (bleStatus === 'no_permission') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        <AddDeviceHeader onBack={handleClose} onScanQr={openQr} scanQrDisabled />
        <div className="flex-1 flex flex-col items-center px-8 text-center pt-6 overflow-y-auto scrollbar-hide">
          <h2 className="text-headline-md font-bold text-white mb-2 max-w-[320px]">
            Allow Bluetooth and Local Network Access
          </h2>
          <p className="text-body-md text-ink-6 max-w-[320px] mb-6">
            Required to find, connect, and communicate with your Sierro device.
          </p>
          <img
            src={blePermissionArt}
            alt=""
            aria-hidden
            className="w-[240px] h-[240px] object-contain select-none pointer-events-none"
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
            className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold active:scale-[0.98] transition-transform"
          >
            Open Settings
          </button>
          <button
            onClick={() => { resetBleInit(); setBleStatus('ready'); store.setErrorMessage(null); handleScan() }}
            className="w-full h-14 rounded-full bg-ink-10 text-white text-body-lg font-semibold active:scale-[0.98] transition-transform"
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
        <AddDeviceHeader onBack={handleClose} onScanQr={openQr} scanQrDisabled />
        <div className="flex-1 flex flex-col items-center px-6 text-center pt-6">
          <h2 className="text-headline-md font-bold text-white mb-2">Turn on Bluetooth</h2>
          <p className="text-body-md text-ink-6 max-w-[320px] mb-8">
            Enable Bluetooth from Control Center or Settings to automatically find and connect your device.
          </p>
          <div className="flex-1 flex items-center justify-center min-h-[220px]">
            <BluetoothOffIllustration />
          </div>
        </div>
        <div className="pb-10 safe-area-bottom" />
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
        <div className={`flex flex-col items-center shrink-0 ${hasDevices ? 'pt-1 pb-3' : 'flex-1 justify-center'}`}>
          {!hasDevices && !hasError && (
            <div className="text-center mb-6 px-2">
              <p className="text-headline-md font-bold text-white mb-2">Searching for nearby devices...</p>
              <p className="text-body-md text-ink-6">Keep your phone near the Sierro device and make sure it&apos;s powered on.</p>
            </div>
          )}

          <div className={`relative flex items-center justify-center w-full ${hasDevices ? 'min-h-24 mb-1' : 'min-h-56 mb-2'}`}>
            <PhoneRadar compact={hasDevices} searching={isSearching || (!hasDevices && !hasError)} />
          </div>

          {hasError && (
            <div className="text-center mb-2">
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
