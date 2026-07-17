import { describe, it, expect, vi, afterEach } from 'vitest'
import { openAppSettings } from './openAppSettings'

// v4.4.3 PWA fix: on the web there is no OS app-settings screen. The old code did
// window.open('app-settings:') which just produced a browser "address error" tab.
// openAppSettings() must now do nothing on web and return false so callers show a toast.
describe('openAppSettings on web', () => {
  afterEach(() => {
    // @ts-expect-error clean up the window stub
    delete globalThis.window
  })

  it('returns false and never opens the broken app-settings: scheme', async () => {
    const openSpy = vi.fn()
    // @ts-expect-error minimal window stub — Capacitor.isNativePlatform() is false in node
    globalThis.window = { open: openSpy }

    const result = await openAppSettings()

    expect(result).toBe(false)
    expect(openSpy).not.toHaveBeenCalled()
  })
})
