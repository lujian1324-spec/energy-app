import AddDeviceHeader from './AddDeviceHeader'

/**
 * The device is already bound to someone else's account.
 *
 * Its own screen rather than another red line on the generic failure panel: the
 * user has to go and do something in a different place before any retry can
 * work, and the diagram is what explains that faster than the sentence does.
 *
 * Laid out like the rest of the A_1.3.1 family — headline at 76 under the header
 * box, subtitle 7 under that, artwork 47 under the subtitle, one filled action —
 * so this screen and the Bluetooth ones it sits beside are the same picture.
 */
export default function DeviceLinkedScreen({
  onBack,
  onScanQr,
  onRetry,
}: {
  onBack: () => void
  onScanQr?: () => void
  onRetry: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      <AddDeviceHeader onBack={onBack} onScanQr={onScanQr} />

      <div className="flex-1 min-h-0 flex flex-col items-center px-4 text-center safe-area-bottom">
        <h2 className="mt-[76px] text-title-lg font-semibold text-ink-3">
          Device already linked
        </h2>
        <p className="mt-[7px] text-label text-ink-5 max-w-[336px]">
          This Sierro is linked to another account. Remove it from the previous account under
          Device Settings → Delete Device, then try again.
        </p>

        {/* Trimmed to its own content box, so the width below is the drawing and
            not the transparent margin the export carried. */}
        <img
          src={`${import.meta.env.BASE_URL}ds-device-linked.png`}
          alt=""
          width={153}
          height={178}
          className="mt-[47px] w-[153px] max-w-full h-auto select-none"
          draggable={false}
        />

        <button
          onClick={onRetry}
          className="mt-[48px] w-full h-12 rounded-l bg-primary text-primary-darker
            text-body-lg font-semibold active:scale-[0.98] transition-transform"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
