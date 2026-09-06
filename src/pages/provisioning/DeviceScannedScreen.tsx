/**
 * `A_1.3.2_Device Scanned -v Default` — the confirmation between scanning a QR
 * code and naming the device. Measured off the 4x export at 402x874:
 *
 *   headline   headline_medium semibold, centred, cap on y155
 *   subtitle   body_medium ink-5, centred, two lines
 *   art        product photo ~117x190, centred, y220
 *   rows       Model and Serial Number, 68 tall, 12 apart, y469 and y549
 *   actions    outlined Rescan + filled Connect Device, 179x44 each 12 apart,
 *              under a hairline at y769
 */
import Icon from '../../components/Icon'
import sierro1000Img from '../../assets/sierro-1000.webp'

export default function DeviceScannedScreen({
  model,
  serial,
  onBack,
  onRescan,
  onConnect,
}: {
  model: string
  serial: string
  onBack: () => void
  onRescan: () => void
  onConnect: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      <div className="px-4 pb-5 safe-area-top-header flex items-center">
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Icon name="chevron-left" size={24} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4">
        <h1 className="mt-[15px] text-headline-md font-semibold text-white text-center">
          Device Ready to Connect
        </h1>
        <p className="mt-2 text-body-md text-ink-5 text-center">
          We identified your Sierro device. Review the details below before connecting.
        </p>

        <img
          src={sierro1000Img}
          alt=""
          aria-hidden
          className="mx-auto h-[190px] w-auto object-contain select-none"
          draggable={false}
        />

        <div className="mt-[59px] space-y-3">
          <div className="rounded-l bg-ink-10 h-[68px] px-4 flex items-center justify-between">
            <span className="text-body-lg text-ink-2">Model</span>
            <span className="text-body-md text-ink-6">{model}</span>
          </div>
          <div className="rounded-l bg-ink-10 h-[68px] px-4 flex items-center justify-between">
            <span className="text-body-lg text-ink-2">Serial Number</span>
            <span className="text-body-md text-ink-6">{serial}</span>
          </div>
        </div>
      </div>

      <div
        className="border-t border-ink-9 px-4 pt-3 flex gap-3"
        style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px)) + 16px)' }}
      >
        <button
          onClick={onRescan}
          className="flex-1 h-11 rounded-m border-m border-primary text-primary text-body-lg font-semibold active:scale-[0.98] transition-transform"
        >
          Rescan
        </button>
        <button
          onClick={onConnect}
          className="flex-1 h-11 rounded-m bg-primary text-primary-darker text-body-lg font-semibold active:scale-[0.98] transition-transform"
        >
          Connect Device
        </button>
      </div>
    </div>
  )
}
