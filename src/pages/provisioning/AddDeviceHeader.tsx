import Icon from '../../components/Icon'

/**
 * The Add Device header, shared by every screen in the flow so they cannot
 * drift apart.
 *
 * The title is centred on the SCREEN, not in the space the two side controls
 * leave behind — a grid column put it 17px off centre, which the handoff does
 * not draw. Absolute centring gets that right, but on its own it lets the title
 * grow symmetrically under both controls once the string is longer (another
 * language) or the type is scaled up, so it also carries a width budget: the
 * wider of the two sides reserved on BOTH sides, keeping the centre true, and
 * `truncate` rather than an overlap if it still does not fit.
 */
export default function AddDeviceHeader({
  onBack,
  onScanQr,
  title = 'Add Device',
}: {
  onBack: () => void
  onScanQr?: () => void
  title?: string
}) {
  return (
    <div className="relative px-4 pb-4 flex items-center safe-area-top-header">
      <button
        onClick={onBack}
        aria-label="Back"
        className="relative w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0 before:absolute before:content-[''] before:-inset-1"
      >
        <Icon name="chevron-left" size={24} />
      </button>
      <h1
        className="absolute left-1/2 -translate-x-1/2 text-title-md font-semibold text-white
          max-w-[calc(100%-9rem)] truncate"
      >
        {title}
      </h1>
      {onScanQr ? (
        <button
          onClick={onScanQr}
          className="ml-auto text-body-lg font-normal text-primary active:opacity-70 px-1 flex-shrink-0"
        >
          Scan QR
        </button>
      ) : (
        // Keeps the row the same height as the branches that do have it.
        <span className="ml-auto w-10" aria-hidden="true" />
      )}
    </div>
  )
}
