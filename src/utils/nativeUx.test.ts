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

describe('applyAndroidTopInsetFloor', () => {
  it('publishes a floor so a missed native inject cannot hide the header', async () => {
    // The suite runs on node; stand up only the surface the helper touches.
    const props = new Map<string, string>()
    ;(globalThis as unknown as { document: unknown }).document = {
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => props.set(k, v),
          getPropertyValue: (k: string) => props.get(k) ?? '',
        },
      },
    }
    const { applyAndroidTopInsetFloor } = await import('./nativeUx')
    applyAndroidTopInsetFloor()
    expect(props.get('--safe-area-inset-top-min')).toBe('24px')
  })
})
