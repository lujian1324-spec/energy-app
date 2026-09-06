import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import Icon from './Icon'

/**
 * Shared empty state — handoff `A_1.1.1 -v Empty State`, `C_1.1 -v Empty State`,
 * `A_1.2 -v Empty State`. Every number below was measured off the 402x874 design
 * frames, so the three screens stop drifting apart (they used to sit -43 / -71 / +65
 * from the design):
 *
 *   art            200 x 200
 *   art -> title   32
 *   title          Inter SemiBold 20 / lh 1.2 / #F5F5F5 (ink-3), centered
 *   title -> sub   8
 *   subtitle       Inter Regular 12 / lh 1.2 / #D9D9D5 (ink-5), centered, full width
 *   sub -> button  24
 *   button         h 44, px 16, gap 8, border-m primary, radius m, 18px glyph, 16 semibold
 *   side padding   24
 *
 * `topOffset` is the gap from the page header's bottom edge to the top of the art:
 * 123 on Home/Insights, 157 on Notifications (the design places the block at a fixed
 * offset rather than centring it).
 */
export interface EmptyStateAction {
  label: string
  /** Icon name from `public/icon_*.svg`. */
  icon?: string
  onClick: () => void
}

export default function EmptyState({
  art,
  title,
  subtitle,
  action,
  topOffset = 123,
  children,
}: {
  art: string
  title: string
  subtitle: ReactNode
  action?: EmptyStateAction
  topOffset?: number
  children?: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center px-6 text-center"
      style={{ paddingTop: topOffset }}
    >
      <img
        src={art}
        alt=""
        aria-hidden
        className="ds-illustration w-[200px] h-[200px] object-contain select-none pointer-events-none"
        draggable={false}
      />
      <h2 className="mt-8 text-title-lg font-semibold text-ink-3">{title}</h2>
      <p className="mt-2 text-label text-ink-5 w-full">{subtitle}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 h-[44px] px-4 rounded-m border-m border-primary text-primary text-body-lg font-semibold flex items-center gap-2 active:scale-95 transition-transform"
        >
          {action.icon && <Icon name={action.icon} size={18} />}
          {action.label}
        </button>
      )}
      {children}
    </motion.div>
  )
}
