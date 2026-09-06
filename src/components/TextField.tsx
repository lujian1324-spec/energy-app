import { useId } from 'react'
import type { ReactNode } from 'react'
import Icon from './Icon'

/**
 * Filled text field from the handoff — `A_2.1.1`, `D_2.5`, `D_2.6`, `D_2.8.1`,
 * `D_1.3.1` all draw the same box, measured off the 402x874 frames:
 *
 *   card       370 wide, radius 12 (`l`), ink-10
 *   value row  44 tall, body_large, ink-1 (placeholder ink-7)
 *   rule       1px ink-8 (#595959) across the card inset 8 each side
 *   below      24, which is where the error line sits
 *   clear      16px ink-6 disc with the glyph knocked out in ink-10
 *
 * With `label` the card grows by the 18px caption row above the value (D_2.8.1,
 * D_1.3.1); `rows` turns the value into a textarea that many lines tall. `outlined`
 * swaps the ink-10 fill for a hairline, which is what the frames do when the field
 * already sits on an ink-10 sheet.
 */
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
}) {
  const id = useId()
  const shared =
    'w-full min-w-0 bg-transparent text-body-lg text-ink-1 placeholder:text-ink-7 outline-none caret-primary resize-none'

  return (
    <div>
      <div className={`px-2 pb-6 ${outlined ? 'rounded-m border-s border-ink-9' : 'rounded-l bg-ink-10'}`}>
        {label && (
          <label htmlFor={id} className="block pt-2 text-caption text-ink-6">
            {label}
          </label>
        )}
        <div
          className={`flex items-center gap-2 border-b border-xs border-ink-8 ${
            rows ? 'items-start pb-2' : label ? 'h-[26px]' : 'h-[44px]'
          }`}
        >
          {leading}
          {rows ? (
            <textarea
              id={id}
              rows={rows}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              aria-label={ariaLabel}
              autoFocus={autoFocus}
              className={`${shared} py-2`}
            />
          ) : (
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
          )}
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
      </div>
      {error && <p className="mt-2 px-2 text-caption text-danger">{error}</p>}
    </div>
  )
}
