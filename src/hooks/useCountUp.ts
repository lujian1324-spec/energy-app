import { useEffect, useRef, useState } from 'react'

/**
 * Animates a numeric value from its previous value to the new one.
 * Uses requestAnimationFrame for 60fps smoothness.
 */
export function useCountUp(target: number, duration = 400): number {
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const start = displayRef.current
    const diff = target - start
    if (diff === 0) return

    if (raf.current !== null) cancelAnimationFrame(raf.current)

    let startTime: number | null = null

    const tick = (now: number) => {
      if (startTime === null) startTime = now
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = Math.round(start + diff * eased)
      displayRef.current = value
      setDisplay(value)
      if (progress < 1) {
        raf.current = requestAnimationFrame(tick)
      } else {
        raf.current = null
      }
    }

    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null } }
  }, [target, duration])

  return display
}
