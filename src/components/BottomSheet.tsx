import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import Icon from './Icon'
import { useKeyboardInset } from '../utils/useKeyboardInset'

/**
 * Bottom sheet chrome from the handoff — `B_1.2.2`, `B_1.2.5`, `D_1.3.1` and
 * `D_2.8.1` all draw the same head, measured off the 4x exports relative to the
 * sheet's own top edge:
 *
 *   sheet    ink-10, radius 12 on the top corners, over a scrim
 *   handle   36x4 ink-8 pill, centred, 8 down
 *   close    30px ink-9 disc, 16 in from the right, 16 down
 *   title    title_large, centred, its line box 63 down
 *
 * The close button sits *above* the title rather than beside it, which is what
 * separates this from a dialog header.
 */
export default function BottomSheet({
  title,
  ariaLabel,
  onClose,
  children,
  labelledBy = 'sheet-title',
  titleAlign = 'center',
}: {
  /** Omit for a sheet the handoff draws without one (B_1.2.6 -v Open info); pass
      `ariaLabel` instead so the dialog still has a name. */
  title?: string
  ariaLabel?: string
  onClose: () => void
  children: ReactNode
  labelledBy?: string
  /** D_1.3.1 and D_2.8.1 set their title left; B_1.2.2 and B_1.2.5 centre it. */
  titleAlign?: 'center' | 'left'
}) {
  // D_2.8.1's field sits at the bottom of the screen, so the keyboard opens right
  // over it. Padding the fixed wrapper lifts the sheet clear of it.
  const keyboardInset = useKeyboardInset()

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ paddingBottom: keyboardInset }}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelledBy : undefined}
        aria-label={title ? undefined : ariaLabel}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        className="relative rounded-t-l bg-ink-10 pt-2 max-h-full overflow-y-auto"
        style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px)) + 3px)' }}
      >
        <div className="mx-auto w-9 h-1 rounded-pill bg-ink-8" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 w-[30px] h-[30px] rounded-full bg-ink-9 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Icon name="close" size={16} />
        </button>
        {title && (
          <h2
            id={labelledBy}
            className={`mt-[51px] text-title-lg font-semibold text-white ${
              titleAlign === 'left' ? 'px-6' : 'text-center'
            }`}
          >
            {title}
          </h2>
        )}
        {children}
      </motion.div>
    </div>
  )
}
