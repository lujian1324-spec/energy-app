import Icon from './Icon'

/**
 * The dismissible failure banner `A_1.3.1_Add Device with QR Code -v Fail` and
 * `A_1.3.2_Add Device Main Page -v Connect Fail` both draw: a 370x52 card in
 * danger-darker at the bottom of the screen, a 20px glyph 14 in, body_medium in
 * white, and a close glyph at the right edge.
 */
export default function ErrorToast({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  return (
    <div
      role="alert"
      className="rounded-l bg-danger-darker min-h-[52px] pl-[14px] pr-3 py-2 flex items-center gap-2.5"
    >
      <Icon name="alert-filled" size={20} />
      <p className="flex-1 text-body-md text-white">{message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 w-6 h-6 flex items-center justify-center active:scale-90 transition-transform"
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  )
}
