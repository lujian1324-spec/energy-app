/**
 * Pieces shared by the Smart Schedule / Charging Settings / Silent Mode / Limits
 * screens (v4.22.0), drawn to the reference design: dark cards (ink-10, radius l),
 * teal selection, a teal "Save" in the header that stays dim until something changed.
 */
import type { ReactNode } from 'react'
import Icon from '../../components/Icon'
import { DAY_LETTERS, WEEK_ORDER } from '../../utils/deviceProgram'

export function SaveButton({ dirty, saving, onSave }: { dirty: boolean; saving: boolean; onSave: () => void }) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={!dirty || saving}
      className={`h-10 px-1 text-body-lg font-semibold transition-colors ${dirty && !saving ? 'text-primary' : 'text-primary/30 cursor-not-allowed'}`}
    >
      {saving ? 'Saving…' : 'Save'}
    </button>
  )
}

/** A grid of choices; the chosen one is filled teal. */
export function OptionGrid<T extends string | number>({ options, value, onChange, format, disabled, columns = 3, labelledBy }: {
  options: T[]
  value: T | null
  onChange: (v: T) => void
  format: (v: T) => string
  disabled?: (v: T) => boolean
  columns?: number
  labelledBy?: string
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map(o => {
        const selected = o === value
        const off = disabled?.(o) ?? false
        return (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={off}
            onClick={() => onChange(o)}
            className={`h-14 rounded-m text-body-lg transition-colors active:scale-95 ${
              selected
                ? 'bg-primary text-primary-darker font-semibold'
                : off
                  ? 'border-s border-ink-9 text-ink-8 cursor-not-allowed'
                  : 'border-s border-ink-7 text-white'
            }`}
          >
            {format(o)}
          </button>
        )
      })}
    </div>
  )
}

/** Seven day circles, Monday first. At least one day stays selected. */
export function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  const toggle = (d: number) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d]
    if (next.length) onChange(next.sort((a, b) => a - b))
  }
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        {WEEK_ORDER.map(d => {
          const on = days.includes(d)
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={names[d]}
              onClick={() => toggle(d)}
              className={`w-10 h-10 rounded-full text-body-md font-semibold transition-colors ${on ? 'bg-primary text-primary-darker' : 'bg-ink-9 text-ink-5'}`}
            >
              {DAY_LETTERS[d]}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        {([['Every day', [0, 1, 2, 3, 4, 5, 6]], ['Weekdays', [1, 2, 3, 4, 5]], ['Weekends', [0, 6]]] as const).map(([label, set]) => {
          const on = days.length === set.length && set.every(d => days.includes(d))
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange([...set])}
              className={`h-8 px-3 rounded-pill text-label font-semibold ${on ? 'bg-primary/15 text-primary' : 'bg-ink-9 text-ink-5'}`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A tappable row: label on the left, value + chevron on the right. */
export function ChevronRow({ label, value, sub, onPress, ariaLabel }: {
  label: ReactNode
  value?: ReactNode
  sub?: ReactNode
  onPress: () => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={ariaLabel}
      className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 text-left active:bg-white/5"
    >
      <span className="text-body-lg text-white">{label}</span>
      <span className="flex items-center gap-2 text-right">
        <span className="flex flex-col items-end">
          {value !== undefined && <span className="text-body-lg text-white tnum">{value}</span>}
          {sub && <span className="text-label text-ink-6">{sub}</span>}
        </span>
        <Icon name="chevron-right" size={20} className="text-ink-5 flex-shrink-0" />
      </span>
    </button>
  )
}

/** The reply to a save, as the toast shows it. */
export function saveToast(result: { ok: boolean; detail?: string }, what: string): { kind: 'success' | 'warning' | 'error'; title: string; body?: string } {
  if (!result.ok) return { kind: 'error', title: `Couldn't save ${what}`, body: result.detail }
  if (result.detail) return { kind: 'warning', title: `${what} saved`, body: result.detail }
  return { kind: 'success', title: `${what} saved` }
}
