import { describe, it, expect } from 'vitest'
import { resolveKeyboardInsets } from './androidKeyboardInset'

/**
 * The Android keyboard reaches the page through up to three mechanisms at once,
 * and which of them fire depends on the device: the Keyboard plugin's
 * `resize: Body`, the window resizing under adjustResize, or neither. The app
 * used to add the raw IME height on top of whatever had already happened, which
 * on a device where something else did move lifted the UI twice and pushed the
 * top of the screen out of view.
 *
 * A 874pt viewport with a 300pt keyboard throughout.
 */
const BASE = 874
const IME = 300

describe('resolveKeyboardInsets', () => {
  it('lifts by the whole keyboard when nothing else moved', () => {
    // Neither the window nor the body shrank, so both kinds of box still have
    // the full keyboard underneath them.
    expect(resolveKeyboardInsets({
      ime: IME, viewport: BASE, baseViewport: BASE, bodyBottom: BASE,
    })).toEqual({ flow: IME, fixed: IME })
  })

  it('lifts flow content by nothing once the plugin shortened the body', () => {
    // resize: Body — document.body ends exactly at the keyboard, so flow content
    // is already clear. A fixed layer is laid out against the viewport, which the
    // plugin does not touch, so that one still needs the full lift.
    expect(resolveKeyboardInsets({
      ime: IME, viewport: BASE, baseViewport: BASE, bodyBottom: BASE - IME,
    })).toEqual({ flow: 0, fixed: IME })
  })

  it('lifts nothing at all once the window itself shrank', () => {
    // adjustResize did resize: the viewport now ends where the keyboard starts,
    // so the keyboard overlaps neither kind of box. This is the case that was
    // being double-counted.
    expect(resolveKeyboardInsets({
      ime: IME, viewport: BASE - IME, baseViewport: BASE, bodyBottom: BASE - IME,
    })).toEqual({ flow: 0, fixed: 0 })
  })

  it('lifts by the remainder when the body only partly cleared the keyboard', () => {
    expect(resolveKeyboardInsets({
      ime: IME, viewport: BASE, baseViewport: BASE, bodyBottom: BASE - 120,
    })).toEqual({ flow: 180, fixed: IME })
  })

  it('never returns a negative inset', () => {
    // A body shorter than the keyboard's top edge, which nothing should pad for.
    expect(resolveKeyboardInsets({
      ime: IME, viewport: BASE, baseViewport: BASE, bodyBottom: 200,
    }).flow).toBe(0)
  })

  it('is zero whenever no keyboard is up', () => {
    expect(resolveKeyboardInsets({
      ime: 0, viewport: BASE, baseViewport: BASE, bodyBottom: BASE,
    })).toEqual({ flow: 0, fixed: 0 })
    // Sub-pixel noise from the inset listener is not a keyboard.
    expect(resolveKeyboardInsets({
      ime: 1, viewport: BASE, baseViewport: BASE, bodyBottom: BASE,
    })).toEqual({ flow: 0, fixed: 0 })
  })

  it('rounds to whole pixels', () => {
    expect(resolveKeyboardInsets({
      ime: IME, viewport: BASE, baseViewport: BASE, bodyBottom: BASE - 0.4,
    })).toEqual({ flow: 300, fixed: 300 })
  })
})
