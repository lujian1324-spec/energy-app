/**
 * Hour + minute wheel picker (shared since v4.22.0; first built for Sleep Mode in
 * Device Info). Opens inline under its row rather than as the native OS picker,
 * which floated over the rows around it (`ui-fix-doc-20260911/02-sleep-timepicker`).
 *
 * Kept at module level: a component declared during render is a new type on every
 * render, and pages that poll live state would remount it from under the open picker.
 */
import { useEffect, useMemo, useRef } from 'react'

const WHEEL_ITEM = 36 // px — one row in the wheel column

/**
 * One scroll-snap wheel column (hours or minutes). Two spacers half the visible
 * height tall let the first and last value snap to the centred highlight band.
 * A short debounce after scrolling settles on the nearest row and reports it.
 */
export function WheelColumn({ values, selected, onSelect, ariaLabel, format }: {
  values: number[]
  selected: number
  onSelect: (v: number) => void
  ariaLabel: string
  format?: (v: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Scrolls this column makes itself (lining up, a tap) must not be read back as
  // the user scrolling: a settle firing after a tap — or after the picker closed —
  // picked whatever row the half-finished scroll was on (v4.22.0).
  const quietUntil = useRef(0)

  // Line the column up with the current value on open and on external changes.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const idx = values.indexOf(selected)
    if (idx >= 0) {
      quietUntil.current = Date.now() + 400
      el.scrollTop = idx * WHEEL_ITEM
    }
  }, [selected, values])

  // A pending settle never outlives the column.
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current) }, [])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    if (Date.now() < quietUntil.current) return
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / WHEEL_ITEM)))
      el.scrollTo({ top: idx * WHEEL_ITEM, behavior: 'smooth' })
      const v = values[idx]
      if (v !== selected) onSelect(v)
    }, 110)
  }

  return (
    <div className="relative flex-1" style={{ height: WHEEL_ITEM * 5 }}>
      <div
        ref={ref}
        role="listbox"
        aria-label={ariaLabel}
        onScroll={onScroll}
        className="h-full overflow-y-scroll scrollbar-hide snap-y snap-mandatory"
      >
        <div style={{ height: WHEEL_ITEM * 2 }} />
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              if (settle.current) clearTimeout(settle.current)
              quietUntil.current = Date.now() + 400
              onSelect(v)
            }}
            className={`w-full snap-center flex items-center justify-center tnum text-title-md transition-colors ${
              v === selected ? 'text-white font-semibold' : 'text-ink-6'
            }`}
            style={{ height: WHEEL_ITEM }}
          >
            {format ? format(v) : String(v).padStart(2, '0')}
          </button>
        ))}
        <div style={{ height: WHEEL_ITEM * 2 }} />
      </div>
      {/* Centred highlight band over the selected row. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-m border-y border-ink-8"
        style={{ height: WHEEL_ITEM }}
      />
    </div>
  )
}

/** Inline hour + minute wheel picker for a "HH:MM" (24h) value. */
export function InlineTimePicker({ value, onChange, onDone }: {
  value: string
  onChange: (v: string) => void
  onDone: () => void
}) {
  const [h, m] = value.split(':').map(Number)
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), [])
  const hourLabel = (v: number) => `${v % 12 === 0 ? 12 : v % 12} ${v < 12 ? 'AM' : 'PM'}`
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div className="rounded-l bg-ink-10 px-4 py-3">
      <div className="flex items-stretch gap-3">
        <WheelColumn
          values={hours}
          selected={Number.isNaN(h) ? 0 : h}
          onSelect={(nh) => onChange(`${pad(nh)}:${pad(Number.isNaN(m) ? 0 : m)}`)}
          ariaLabel="Hour"
          format={hourLabel}
        />
        <WheelColumn
          values={minutes}
          selected={Number.isNaN(m) ? 0 : m}
          onSelect={(nm) => onChange(`${pad(Number.isNaN(h) ? 0 : h)}:${pad(nm)}`)}
          ariaLabel="Minute"
        />
      </div>
      <button
        type="button"
        onClick={onDone}
        className="mt-2 w-full h-10 rounded-m bg-primary text-primary-darker font-semibold text-body-md active:scale-[0.98] transition-transform"
      >
        Done
      </button>
    </div>
  )
}
