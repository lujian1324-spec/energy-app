import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

/**
 * How many pixels the soft keyboard covers at the bottom of a `position: fixed`
 * layer.
 *
 * A fixed element is laid out against the *layout* viewport, which iOS does not
 * shrink for the keyboard, so a bottom-anchored sheet stays put and the keyboard
 * opens straight over it.
 *
 * On a native shell the number comes from the Keyboard plugin, which reports the
 * height the OS itself is using. The `visualViewport` arithmetic below looked
 * right in a simulated viewport but under-reports on real iOS: the keyboard also
 * scrolls the page, `offsetTop` goes positive, and subtracting it takes exactly
 * that much off the lift — so the sheet came up short and the keyboard still
 * covered part of it. The plugin has no such ambiguity.
 *
 * `visualViewport` remains the path on the web, where there is no plugin. Returns
 * 0 wherever neither is available, and whenever no keyboard is up, so callers can
 * add it unconditionally.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    let cancelled = false

    // ── iOS: ask the OS, via @capacitor/keyboard ──────────────────────────────
    // Only iOS. Android's manifest sets adjustResize, so the WebView itself
    // shrinks and window.innerHeight shrinks with it — the arithmetic below then
    // correctly reports 0, and padding by the keyboard height on top of that
    // would lift the sheet twice as far as the keyboard is tall.
    if (Capacitor.getPlatform() === 'ios') {
      const handles: { remove: () => void }[] = []
      void (async () => {
        try {
          const { Keyboard } = await import('@capacitor/keyboard')
          const show = await Keyboard.addListener('keyboardWillShow', (info) => {
            if (!cancelled) setInset(Math.max(0, Math.round(info.keyboardHeight)))
          })
          const hide = await Keyboard.addListener('keyboardWillHide', () => {
            if (!cancelled) setInset(0)
          })
          if (cancelled) { void show.remove(); void hide.remove(); return }
          handles.push(show, hide)
        } catch { /* plugin unavailable — leave the inset at 0 */ }
      })()
      return () => {
        cancelled = true
        handles.forEach((h) => { void h.remove() })
      }
    }

    // ── Web: the visible slice of the layout viewport ──────────────────────────
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
