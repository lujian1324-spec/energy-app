import { Loader2 } from 'lucide-react'

/**
 * The action bar the handoff pins to the bottom of a full-height step:
 * an ink-9 hairline, then a 44px filled button inset 16 from the edges.
 * `A_2.1.1`, `A_2.1.2`, `A_2.2.1` and `A_2.2.2` all draw the same one.
 *
 * The padding carries --keyboard-inset-bottom because Android stopped
 * resizing the window for the IME once the app went edge-to-edge, so a bar
 * pinned to the bottom of the layout viewport sits under the keyboard
 * unless it lifts itself. The variable is unset on iOS and on the web, and on
 * Android it is what the keyboard still covers once the Keyboard plugin's own
 * body resize is accounted for (androidKeyboardInset.ts) — the raw IME height
 * used to go straight into it, which lifted this bar a second time and put it
 * over the headline above.
 */
export default function BottomAction({
  label,
  onPress,
  disabled = false,
  busy = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <div
      className="border-t border-ink-9 px-4 pt-3"
      style={{
        paddingBottom:
          'calc(max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))'
          + ' + var(--keyboard-inset-bottom, 0px) + 16px)',
      }}
    >
      <button
        onClick={onPress}
        disabled={disabled || busy}
        className="w-full h-11 rounded-m bg-primary text-primary-darker text-body-lg font-semibold
          disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]
          transition-[transform,opacity] flex items-center justify-center gap-2"
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        {label}
      </button>
    </div>
  )
}
