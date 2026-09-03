import { beforeEach, describe, expect, it, vi } from 'vitest'

const setStyle = vi.fn()
const setBackgroundColor = vi.fn()
const setOverlaysWebView = vi.fn()

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}))

vi.mock('@capacitor/status-bar', () => ({
  Style: { Dark: 'DARK' },
  StatusBar: {
    setStyle: (...args: unknown[]) => setStyle(...args),
    setBackgroundColor: (...args: unknown[]) => setBackgroundColor(...args),
    setOverlaysWebView: (...args: unknown[]) => setOverlaysWebView(...args),
  },
}))

describe('setupStatusBar Android', () => {
  beforeEach(() => {
    setStyle.mockReset()
    setBackgroundColor.mockReset()
    setOverlaysWebView.mockReset()
  })

  it('overlays the WebView so EdgeToEdge CSS insets can apply', async () => {
    const { setupStatusBar } = await import('./nativeUx')
    await setupStatusBar()
    expect(setOverlaysWebView).toHaveBeenCalledWith({ overlay: true })
    expect(setBackgroundColor).toHaveBeenCalledWith({ color: '#0b0b0b' })
  })
})
