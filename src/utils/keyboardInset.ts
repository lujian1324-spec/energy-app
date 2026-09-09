import { Capacitor } from '@capacitor/core'

/**
 * How much of the soft keyboard still covers the bottom of the screen — resolved
 * into the two different numbers the UI needs, on every platform.
 *
 * Three mechanisms can move the page for the keyboard, and which of them fire
 * depends on the platform and the device:
 *
 *   - `Keyboard.resize = Body` (capacitor.config) shortens `document.body`
 *   - the window itself can shrink (Android adjustResize, some OEMs)
 *   - nothing at all, and the keyboard simply draws over the page
 *
 * Adding a lift on top of one that already happened pushes the screen off the
 * top; adding none where nothing happened leaves the action bar under the
 * keyboard. Both have shipped: 4.9.20 fixed the first on Android, and the second
 * was still live on iOS, where `--keyboard-inset-bottom` was never set at all —
 * so every bar reading it (BottomAction, `.safe-area-bottom`, ProfileEditPage)
 * sat under the keyboard on the sign-in screen and everywhere else.
 *
 * So measure rather than assume, and do it the same way everywhere. Let `base`
 * be the layout viewport with no keyboard up. The keyboard's top edge is then at
 * `base - ime` in current viewport coordinates whatever has resized since, and
 * what each kind of box still has underneath is the distance from its own bottom
 * edge down to that line:
 *
 *   flow content   `document.body`'s bottom edge  →  --keyboard-inset-bottom
 *   fixed overlay  the viewport's bottom edge     →  useKeyboardInset()
 *
 * Both fall to 0 when something else already lifted the content clear, and both
 * rise to the full keyboard height when nothing did.
 *
 * The raw height comes from whichever source that platform can be trusted for:
 * MainActivity's `WindowInsets.ime()` on Android, @capacitor/keyboard on iOS,
 * and `visualViewport` on the web.
 */

/** What `document.body`'s box still has under the keyboard. Drives CSS. */
let flowInset = 0
/** What a `position: fixed` layer still has under the keyboard. Drives the hook. */
let fixedInset = 0
/** The layout viewport with no keyboard up. Re-measured every time one closes. */
let baseViewport = 0
/** The keyboard height last reported, in CSS px. */
let imeHeight = 0
let started = false

const listeners = new Set<(inset: number) => void>()

/** The layout viewport — not `visualViewport`, which pinch-zoom also moves. */
function viewportHeight(): number {
  return window.innerHeight || document.documentElement.clientHeight || 0
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
  /** Keyboard height in CSS px. */
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

/** Records a new keyboard height and republishes. */
function setImeHeight(px: number): void {
  imeHeight = Number.isFinite(px) && px > 0 ? px : 0
  recompute()
  // A plugin that resizes the body does it from its own listener, so the first
  // read can still see the old box. Look again once layout has settled.
  requestAnimationFrame(recompute)
}

function readAndroidRaw(detail: unknown): number {
  if (typeof detail === 'number' && Number.isFinite(detail)) return Math.max(0, detail)
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset-raw')
  const px = parseFloat(raw)
  return Number.isFinite(px) && px > 0 ? px : 0
}

/**
 * Starts listening. Safe to call more than once.
 *
 * Each platform reports the keyboard differently, and only one source per
 * platform is trustworthy:
 *
 *   Android  MainActivity publishes WindowInsets.ime(); adjustResize stopped
 *            resizing the window once the app went edge-to-edge, so neither
 *            innerHeight nor visualViewport moves and the web side cannot infer
 *            it at all.
 *   iOS      @capacitor/keyboard reports the height the OS is using. The
 *            visualViewport arithmetic below under-reports here, because the
 *            keyboard also scrolls the page and offsetTop goes positive.
 *   web      visualViewport is all there is, and it is accurate.
 */
export function startKeyboardInset(): void {
  if (started) return
  started = true

  window.addEventListener('resize', recompute)
  window.addEventListener('orientationchange', recompute)

  const platform = Capacitor.getPlatform()

  if (platform === 'android') {
    window.addEventListener('sierro:keyboardinset', (e: Event) => {
      setImeHeight(readAndroidRaw((e as CustomEvent<unknown>).detail))
    })
    setImeHeight(readAndroidRaw(undefined))
    return
  }

  if (platform === 'ios') {
    void (async () => {
      try {
        const { Keyboard } = await import('@capacitor/keyboard')
        await Keyboard.addListener('keyboardWillShow', (info) => {
          setImeHeight(Math.round(info.keyboardHeight))
        })
        await Keyboard.addListener('keyboardWillHide', () => { setImeHeight(0) })
      } catch { /* plugin unavailable — leave the inset at 0 */ }
    })()
    recompute()
    return
  }

  const vv = window.visualViewport
  if (!vv) { recompute(); return }
  const update = () => { setImeHeight(window.innerHeight - vv.height - vv.offsetTop) }
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  update()
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
