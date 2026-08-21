import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Animates a numeric value from its previous value to the new one on change.
 * Uses requestAnimationFrame for 60fps smoothness.
 *
 * @param target   the value to animate toward
 * @param duration animation length in ms (default 400)
 * @param decimals decimal places to preserve (default 0 → integers). Needed for
 *                 fractional metrics (e.g. CO₂ Kg) so the final value isn't rounded.
 *
 * Respects the OS "Reduce Motion" setting — when enabled it snaps straight to the
 * target with no animation.
 */
export function useCountUp(target: number, duration = 400, decimals = 0): number {
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)
  const raf = useRef<number | null>(null)
  const factor = Math.pow(10, decimals)

  useEffect(() => {
    const start = displayRef.current
    const diff = target - start
    if (diff === 0) return

    // 尊重系统「减少动态」：直接跳到目标值，不做逐帧动画
    if (prefersReducedMotion()) {
      displayRef.current = target
      setDisplay(target)
      return
    }

    if (raf.current !== null) cancelAnimationFrame(raf.current)

    let startTime: number | null = null

    const tick = (now: number) => {
      if (startTime === null) startTime = now
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = Math.round((start + diff * eased) * factor) / factor
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
  }, [target, duration, factor])

  return display
}
