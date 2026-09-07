/**
 * 原生壳 UX 引导：状态栏样式、Android 返回键、键盘行为。
 * 仅在 Capacitor 原生环境生效；PWA/浏览器下全部为 no-op。
 */
import { Capacitor } from '@capacitor/core'

const isNative = () => Capacitor.isNativePlatform()

/**
 * Android draws the WebView edge-to-edge and reports `env(safe-area-inset-top)` as 0,
 * so MainActivity injects `--safe-area-inset-top` from the real window insets. If that
 * injection ever fails to land — it runs against about:blank first and the full-bleed
 * WebView never resizes when insets change, so there is nothing to retry on — the header
 * ends up under the status bar. Publish a floor the CSS folds into the same `max()` so
 * the worst case is a slightly generous gap rather than an overlap.
 *
 * Native Android only: iOS gets a real `env()`, and on the web the browser already
 * reserves the status bar.
 */
const ANDROID_MIN_TOP_INSET_PX = 24

export function applyAndroidTopInsetFloor(): void {
  if (!isNative() || Capacitor.getPlatform() !== 'android') return
  document.documentElement.style.setProperty(
    '--safe-area-inset-top-min',
    `${ANDROID_MIN_TOP_INSET_PX}px`,
  )
}

/** 状态栏：深色主题 → 浅色图标，底色与 App 背景一致（Android） */
export async function setupStatusBar(): Promise<void> {
  if (!isNative()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })  // Dark 背景 → 浅色内容
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#0b0b0b' })
      // Match MainActivity EdgeToEdge: WebView is full-bleed; CSS vars inset the UI.
      // overlay:false fights that model and often no-ops on API 35+.
      await StatusBar.setOverlaysWebView({ overlay: true })
    }
  } catch { /* plugin unavailable */ }
}

/**
 * Android 系统返回键接管：
 *  - 非根路由 → 与页内返回一致，回设备列表（HashRouter 下交给 history）
 *  - 根路由（/devices 等底部导航页）→ 最小化 App（不退出进程）
 */
export async function setupBackButton(): Promise<void> {
  if (!isNative()) return
  try {
    const { App } = await import('@capacitor/app')
    await App.addListener('backButton', ({ canGoBack }) => {
      const hash = window.location.hash.replace(/^#/, '') || '/'
      const isRootRoute = ['/', '/devices', '/insights', '/setting', '/login'].includes(hash)
      if (isRootRoute || !canGoBack) {
        App.minimizeApp()
      } else {
        window.history.back()
      }
    })
  } catch { /* plugin unavailable */ }
}

/** 键盘：弹出时缩放 WebView 主体，避免盖住输入框（配合 capacitor.config Keyboard.resize） */
export async function setupKeyboard(): Promise<void> {
  if (!isNative()) return
  try {
    const { Keyboard } = await import('@capacitor/keyboard')
    // 键盘弹出时把聚焦的输入框滚进可视区
    await Keyboard.addListener('keyboardDidShow', () => {
      const el = document.activeElement
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
  } catch { /* plugin unavailable */ }
}

export async function setupNativeUx(): Promise<void> {
  applyAndroidTopInsetFloor()
  await Promise.all([setupStatusBar(), setupBackButton(), setupKeyboard()])
}
