/**
 * 原生壳 UX 引导：状态栏样式、Android 返回键、键盘行为。
 * 仅在 Capacitor 原生环境生效；PWA/浏览器下全部为 no-op。
 */
import { Capacitor } from '@capacitor/core'

const isNative = () => Capacitor.isNativePlatform()

/** 状态栏：深色主题 → 浅色图标，底色与 App 背景一致（Android） */
export async function setupStatusBar(): Promise<void> {
  if (!isNative()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })  // Dark 背景 → 浅色内容
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#141414' })
      await StatusBar.setOverlaysWebView({ overlay: false })
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
  await Promise.all([setupStatusBar(), setupBackButton(), setupKeyboard()])
}
