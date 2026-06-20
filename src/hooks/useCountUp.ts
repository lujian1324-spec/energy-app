import { useEffect, useRef, useState } from 'react'

/**
 * Animates a numeric value from its previous value to the new one.
 * Uses requestAnimationFrame for 60fps smoothness.
 */
export function useCountUp(target: number, duration = 400): number {
  const [display, setDisplay] = useState(target)
  const from = useRef(target)
  const startTime = useRef<number | null>(null)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const start = from.current
    const diff = target - start
    if (diff === 0) return

    startTime.current = null

    const tick = (now: number) => {
      if (startTime.current === null) startTime.current = now
      const elapsed = now - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(start + diff * eased))
      if (progress < 1) {
        raf.current = requestAnimationFrame(tick)
      } else {
        from.current = target
      }
    }

    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current !== null) cancelAnimationFrame(raf.current) }
  }, [target, duration])

  return display
}
