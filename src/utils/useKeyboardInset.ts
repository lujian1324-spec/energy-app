import { useEffect, useState } from 'react'
import { currentFixedKeyboardInset, subscribeFixedKeyboardInset } from './keyboardInset'

/**
 * How many pixels the soft keyboard still covers at the bottom of a
 * `position: fixed` layer.
 *
 * A fixed element is laid out against the viewport, which neither the Keyboard
 * plugin's body resize nor anything else shortens, so a bottom-anchored sheet
 * stays put and the keyboard opens straight over it — on every platform.
 *
 * The measuring lives in keyboardInset.ts, which resolves the platform's raw
 * keyboard height against what has actually moved. This is just the subscription.
 * Returns 0 whenever no keyboard is up, so callers can add it unconditionally.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(currentFixedKeyboardInset)

  useEffect(() => subscribeFixedKeyboardInset(setInset), [])

  return inset
}
