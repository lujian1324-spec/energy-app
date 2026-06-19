/**
 * Button — Sierro Design System (Figma "Button" sheet)
 *
 * Axes:
 *  - type:  'filled' | 'stroked'
 *  - size:  'large' | 'medium' | 'small' | 'xsmall'
 *  - usage: 'default' (brand/teal) | 'error' (red) | 'neutral' (white/ink)
 *  - state: default / focus / active / disabled — handled via native
 *           :focus-visible, :active and the `disabled` attribute.
 *
 * Radius = m (8px, buttons). Focus ring = primary #01D6BE (WCAG).
 * Micro-interaction: scale 0.95 → 1 on press.
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react'

export type ButtonType = 'filled' | 'stroked'
export type ButtonSize = 'large' | 'medium' | 'small' | 'xsmall'
export type ButtonUsage = 'default' | 'error' | 'neutral'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonType
  size?: ButtonSize
  usage?: ButtonUsage
  fullWidth?: boolean
}

// ── Size → height / padding / type token (≥48dp hot-zone honored on Large) ──
const SIZE: Record<ButtonSize, string> = {
  large:  'h-12 px-6 text-body-lg',
  medium: 'h-11 px-5 text-body-md',
  small:  'h-9 px-4 text-body-md',
  xsmall: 'h-8 px-3 text-label',
}

// ── Usage × type → color classes (Default / Active via :active / Disabled) ──
const FILLED: Record<ButtonUsage, string> = {
  default: 'bg-primary text-ink-13 active:bg-primary-active disabled:bg-primary-dark disabled:text-ink-13/40',
  error:   'bg-danger text-ink-1 active:bg-danger-active disabled:bg-danger/40 disabled:text-ink-1/60',
  neutral: 'bg-ink-3 text-ink-13 active:bg-ink-5 disabled:bg-ink-8 disabled:text-ink-6',
}

const STROKED: Record<ButtonUsage, string> = {
  default: 'border-s border-primary text-primary bg-transparent active:bg-primary-light/10 disabled:border-primary-dark disabled:text-primary-dark',
  error:   'border-s border-danger text-danger bg-transparent active:bg-danger-light/10 disabled:border-danger/40 disabled:text-danger/40',
  neutral: 'border-s border-ink-5 text-ink-1 bg-transparent active:bg-ink-10 disabled:border-ink-8 disabled:text-ink-7',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'filled', size = 'large', usage = 'default', fullWidth, className = '', children, ...rest },
  ref,
) {
  const color = variant === 'filled' ? FILLED[usage] : STROKED[usage]

  return (
    <button
      ref={ref}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-m font-semibold',
        'transition-all duration-200 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ink-12',
        'disabled:cursor-not-allowed disabled:active:scale-100',
        SIZE[size],
        color,
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
})

export default Button
