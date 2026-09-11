import { useId, useRef, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import Icon from './Icon'

/**
 * Filled text field from the handoff — `A_2.1.1`, `D_2.5`, `D_2.6`, `D_2.8.1`,
 * `D_1.3.1` all draw the same box, measured off the 402x874 frames:
 *
 *   card       370 wide, radius 12 (`l`), ink-10
 *   value row  44 tall, the value sat against the rule rather than centred,
 *              body_large, ink-1 (placeholder ink-7)
 *   rule       1px ink-8 (#595959) under the value only
 *   padding    12 each side (`ui-fix-doc-20260911/01-textfield`)
 *   below      24, which is where the error line sits (12 with `dense`)
 *   clear      16px ink-6 disc with the glyph knocked out in ink-10, sitting 8px
 *              to the right of where the rule ends — off the rule, not on it
 *              (`ui-fix-doc-20260911/01-textfield`)
 *
 * With `label` the card grows by the 18px caption row above the value (D_2.8.1,
 * D_1.3.1). `rows` turns the value into a Text Area (`ui-fix-doc-20260911/07`):
 * a boxed multi-line field with no rule, 120px min / 210px max height that
 * auto-grows while typing and scrolls past the max. `outlined` swaps the ink-10
 * fill for a hairline, which is what the frames do when the field already sits
 * on an ink-10 sheet. `dense` tightens the below-field padding to 12 (the
 * Feedback email row, `ui-fix-doc-20260911/07`).
 */
const TEXTAREA_MIN = 120
const TEXTAREA_MAX = 210

export default function TextField({
  value,
  onChange,
  placeholder,
  label,
  type = 'text',
  rows,
  error,
  leading,
  onClear,
  autoFocus,
  inputMode,
  maxLength,
  ariaLabel,
  onEnter,
  outlined,
  dense,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  label?: string
  type?: 'text' | 'email'
  rows?: number
  error?: string | null
  leading?: ReactNode
  onClear?: () => void
  autoFocus?: boolean
  inputMode?: 'text' | 'email'
  maxLength?: number
  ariaLabel?: string
  onEnter?: () => void
  /** D_1.3.1 and D_2.8.1 sit on an ink-10 sheet, so their fields are outlined. */
  outlined?: boolean
  /** Tighten the below-field padding from 24 to 12 (Feedback email row). */
  dense?: boolean
}) {
  const id = useId()
  const shared =
    'w-full min-w-0 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary resize-none'
  const isTextArea = rows != null

  // Text Area auto-grow: reset to auto so the box can shrink, then clamp the
  // measured content height to [min, max]. Past the max the textarea scrolls.
  const taRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    if (!isTextArea) return
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, TEXTAREA_MIN), TEXTAREA_MAX)}px`
  }, [value, isTextArea])

  return (
    <div>
      <div className={`px-3 ${dense ? 'pb-3' : 'pb-6'} ${outlined ? 'rounded-m border-s border-ink-9' : 'rounded-l bg-ink-10'}`}>
        {label && (
          <label htmlFor={id} className="block pt-2 text-caption text-ink-6">
            {label}
          </label>
        )}
        {isTextArea ? (
          // Text Area component — boxed, no rule; auto-grows 120→210 then scrolls.
          <textarea
            ref={taRef}
            id={id}
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            aria-label={ariaLabel}
            autoFocus={autoFocus}
            className={`${shared} block mt-2 overflow-y-auto scrollbar-hide`}
            style={{ minHeight: TEXTAREA_MIN, maxHeight: TEXTAREA_MAX }}
          />
        ) : (
          <div className="flex items-center gap-2">
            <div
              className={`flex-1 min-w-0 flex items-end gap-2 border-b border-ink-8 ${
                label ? 'h-[26px] pb-0.5' : 'h-[44px] pb-0.5'
              }`}
            >
              {leading}
              <input
                id={id}
                type={type}
                inputMode={inputMode}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter() }}
                placeholder={placeholder}
                maxLength={maxLength}
                aria-label={ariaLabel}
                autoFocus={autoFocus}
                autoComplete={type === 'email' ? 'email' : 'off'}
                autoCapitalize="none"
                autoCorrect="off"
                className={shared}
              />
            </div>
            {onClear && value && (
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear"
                className="shrink-0 w-4 h-4 rounded-full bg-ink-6 flex items-center justify-center"
              >
                <Icon name="close" size={10} color="#262626" />
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-2 px-3 text-caption text-danger">{error}</p>}
    </div>
  )
}
