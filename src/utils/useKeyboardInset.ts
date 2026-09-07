import { useEffect, useState } from 'react'

/**
 * How many pixels the soft keyboard covers at the bottom of the layout viewport.
 *
 * A `position: fixed` element is laid out against the *layout* viewport, which the
 * keyboard does not shrink on iOS — so a bottom-anchored sheet stays put and the
 * keyboard opens straight over it. `visualViewport` is the part still visible, so
 * the difference between the two is what the keyboard is covering.
 *
 * Returns 0 wherever `visualViewport` is unavailable, and whenever no keyboard is
 * up, so callers can add it unconditionally.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop
      // Round down and ignore the sub-pixel jitter browsers report while scrolling.
      setInset(covered > 1 ? Math.floor(covered) : 0)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
