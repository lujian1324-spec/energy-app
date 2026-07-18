import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Native branch of openAppSettings(): on Capacitor it deep-links into the app's
 * OS settings via capacitor-native-settings (Android ApplicationDetails / iOS App),
 * returning true; a plugin failure returns false so callers fall back to a toast.
 * (The web branch — returns false, never opens app-settings: — is covered in
 * openAppSettings.test.ts.)
 */

const h = vi.hoisted(() => ({
  platform: 'android' as 'android' | 'ios',
  openAndroid: vi.fn(),
  openIOS: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => h.platform },
}))
vi.mock('capacitor-native-settings', () => ({
  NativeSettings: { openAndroid: h.openAndroid, openIOS: h.openIOS },
  AndroidSettings: { ApplicationDetails: 'application_details' },
  IOSSettings: { App: 'app' },
}))

async function load() {
  vi.resetModules()
  return import('./openAppSettings')
}

beforeEach(() => {
  vi.clearAllMocks()
  h.openAndroid.mockResolvedValue(undefined)
  h.openIOS.mockResolvedValue(undefined)
})

describe('openAppSettings (native)', () => {
  it('opens the Android application-details screen and returns true', async () => {
    h.platform = 'android'
    const { openAppSettings } = await load()
    expect(await openAppSettings()).toBe(true)
    expect(h.openAndroid).toHaveBeenCalledWith({ option: 'application_details' })
    expect(h.openIOS).not.toHaveBeenCalled()
  })

  it('opens the iOS app-settings screen and returns true', async () => {
    h.platform = 'ios'
    const { openAppSettings } = await load()
    expect(await openAppSettings()).toBe(true)
    expect(h.openIOS).toHaveBeenCalledWith({ option: 'app' })
    expect(h.openAndroid).not.toHaveBeenCalled()
  })

  it('returns false when the native plugin throws', async () => {
    h.platform = 'android'
    h.openAndroid.mockRejectedValue(new Error('no activity'))
    const { openAppSettings } = await load()
    expect(await openAppSettings()).toBe(false)
  })
})
