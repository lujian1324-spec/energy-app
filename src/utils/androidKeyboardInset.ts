import { Capacitor } from '@capacitor/core'

/**
 * Android: turns the IME height MainActivity reports into the two different
 * numbers the UI actually needs.
 *
 * The app used to publish one variable — `--keyboard-inset-bottom`, straight
 * off `WindowInsets.ime()` — and both flow content and fixed overlays added it
 * as padding. That is only correct when nothing else has moved for the
 * keyboard, and on Android something else always has: capacitor.config sets
 * `Keyboard.resize = Body`, so the plugin already shortens `document.body`, and
 * some devices shorten the window on top of that. Every lift then landed twice
 * and the screen ran off the top — the Feedback sheet losing its title and the
 * onboarding step putting Continue over its own headline. iOS was right the
 * whole time only because the variable is never set there.
 *
 * So measure rather than assume. Let `base` be the layout viewport with no
 * keyboard up. The keyboard's top edge, in current viewport coordinates, is
 * `base - ime` no matter what else resized. From there:
 *
 *   flow content   its bottom edge is `document.body`'s, so what the keyboard
 *                  still covers is `bodyBottom - keyboardTop`
 *   fixed overlay  its bottom edge is the viewport's, so what the keyboard
 *                  still covers is `innerHeight - keyboardTop`
 *
 * Both fall to 0 when something else has already lifted the content clear, and
 * both rise to the full IME height when nothing has — which is the whole point.
 */

/** What `document.body`'s box still has under the keyboard. Drives CSS. */
let flowInset = 0
/** What a `position: fixed` layer still has under the keyboard. Drives the hook. */
let fixedInset = 0
/** The layout viewport with no keyboard up. Re-measured every time one closes. */
let baseViewport = 0
/** The IME height MainActivity last reported, in CSS px. */
let imeHeight = 0
let started = false

const listeners = new Set<(inset: number) => void>()

/** The layout viewport — not `visualViewport`, which pinch-zoom also moves. */
function viewportHeight(): number {
  return window.innerHeight || document.documentElement.clientHeight || 0
}

function readImeHeight(detail: unknown): number {
  if (typeof detail === 'number' && Number.isFinite(detail)) return Math.max(0, detail)
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset-raw')
  const px = parseFloat(raw)
  return Number.isFinite(px) && px > 0 ? px : 0
}

/**
 * The arithmetic on its own, so it can be exercised without a DOM.
 *
 * `baseViewport` is the layout viewport with no keyboard up, which fixes the
 * keyboard's top edge at `baseViewport - ime` in viewport coordinates however
 * the page has since been resized. What each kind of box still has underneath
 * is then just the distance from its own bottom edge down to that line.
 */
export function resolveKeyboardInsets(m: {
  /** IME height in CSS px, from WindowInsets.ime(). */
  ime: number
  /** Layout viewport now. */
  viewport: number
  /** Layout viewport with no keyboard up. */
  baseViewport: number
  /** `document.body`'s bottom edge, in viewport coordinates. */
  bodyBottom: number
}): { flow: number; fixed: number } {
  if (m.ime <= 1) return { flow: 0, fixed: 0 }
  const keyboardTop = m.baseViewport - m.ime
  return {
    flow: Math.max(0, Math.round(m.bodyBottom - keyboardTop)),
    fixed: Math.max(0, Math.round(m.viewport - keyboardTop)),
  }
}

function recompute(): void {
  const viewport = viewportHeight()

  // No keyboard: this is the only moment the untouched viewport can be read, and
  // it has to be re-read each time, because rotation and split screen change it.
  if (imeHeight <= 1) {
    baseViewport = viewport
    publish(0, 0)
    return
  }
  if (baseViewport <= 0) baseViewport = viewport + imeHeight

  const { flow, fixed } = resolveKeyboardInsets({
    ime: imeHeight,
    viewport,
    baseViewport,
    // getBoundingClientRect, not clientHeight: it follows the plugin's own
    // `body { height: … }` and is already in viewport coordinates.
    bodyBottom: document.body.getBoundingClientRect().bottom,
  })
  publish(flow, fixed)
}

function publish(flow: number, fixed: number): void {
  if (flow !== flowInset) {
    flowInset = flow
    document.documentElement.style.setProperty('--keyboard-inset-bottom', `${flow}px`)
  }
  if (fixed !== fixedInset) {
    fixedInset = fixed
    listeners.forEach((fn) => { fn(fixed) })
  }
}

/**
 * Starts listening. Safe to call more than once, and a no-op off Android — every
 * other platform leaves `--keyboard-inset-bottom` unset, which is the 0 the CSS
 * already falls back to.
 */
export function startAndroidKeyboardInset(): void {
  if (started || Capacitor.getPlatform() !== 'android') return
  started = true

  const onInset = (e: Event) => {
    imeHeight = readImeHeight((e as CustomEvent<unknown>).detail)
    recompute()
    // The plugin resizes the body from its own listener, so the first read can
    // still see the old box. Look again once layout has settled.
    requestAnimationFrame(recompute)
  }

  window.addEventListener('sierro:keyboardinset', onInset)
  window.addEventListener('resize', recompute)
  window.addEventListener('orientationchange', recompute)
  recompute()
}

/** Subscribes to the fixed-overlay inset. Returns an unsubscribe. */
export function subscribeFixedKeyboardInset(fn: (inset: number) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The fixed-overlay inset right now, for a subscriber's initial state. */
export function currentFixedKeyboardInset(): number {
  return fixedInset
}
