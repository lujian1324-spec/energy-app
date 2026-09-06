import type { ReactNode } from 'react'
import Icon from './Icon'

/**
 * Handoff `Page Header` (measured on the 402x874 exports):
 *   height 80 = spacing-xl (20) padding above a 40px toolbar row, px 16
 *   toolbar buttons 40x40 circles on ink-9 (#454545) with 24px glyphs, 12px apart
 *   primary variant  — Anton 32 title on the left, actions on the right
 *   secondary variant — 40px back button left, 20px semibold title centred
 *
 * `filled` paints the status-bar + header block ink-10 (#262626). The design only
 * does that on the data-bearing screens (Home with cards, Insights, Device Detail);
 * empty states and the secondary pages sit on the plain base.
 */
export function PageHeaderShell({
  filled = false,
  className = '',
  children,
}: {
  filled?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`px-4 pb-5 safe-area-top-header ${filled ? 'bg-ink-10' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function HeaderIconButton({
  icon,
  label,
  onClick,
  disabled,
  className = '',
  children,
}: {
  icon?: string
  label: string
  onClick?: () => void
  disabled?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`relative w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center text-white hover:bg-ink-8 transition-colors active:scale-95 disabled:opacity-50 ${className}`}
    >
      {icon && <Icon name={icon} size={24} />}
      {children}
    </button>
  )
}

/** Back button + centred title (+ optional right slot). */
export function SecondaryHeader({
  title,
  onBack,
  right,
  filled = false,
}: {
  title: ReactNode
  onBack: () => void
  right?: ReactNode
  filled?: boolean
}) {
  return (
    <PageHeaderShell filled={filled} className="grid grid-cols-[40px_1fr_auto] items-center gap-3">
      <HeaderIconButton
        icon="chevron-left"
        label="Back"
        onClick={onBack}
        className="before:absolute before:content-[''] before:-inset-1.5"
      />
      <div className="text-center min-w-0">
        {typeof title === 'string'
          ? <h2 className="text-title-lg font-semibold text-ink-1 truncate">{title}</h2>
          : title}
      </div>
      <div className="min-w-[40px] flex justify-end items-center">{right}</div>
    </PageHeaderShell>
  )
}
