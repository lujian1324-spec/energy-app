/**
 * Open the OS app-settings screen so the user can grant Bluetooth / Location /
 * Camera permissions. The legacy `app-settings:` URL scheme only works on iOS
 * Safari and does nothing in Android WebView or desktop browsers, which made
 * the "Open Settings" button appear broken.
 *
 * On Capacitor (native) we use the capacitor-native-settings plugin to deep-link
 * into the app's settings page. On the web we fall back to the iOS scheme and
 * otherwise surface a clear instruction.
 */
import { Capacitor } from '@capacitor/core'

export async function openAppSettings(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { NativeSettings, AndroidSettings, IOSSettings } = await import('capacitor-native-settings')
      if (Capacitor.getPlatform() === 'android') {
        await NativeSettings.openAndroid({ option: AndroidSettings.ApplicationDetails })
      } else {
        await NativeSettings.openIOS({ option: IOSSettings.App })
      }
      return true
    } catch {
      return false
    }
  }

  // Web fallback — iOS Safari understands this scheme; nothing else does.
  try {
    window.open('app-settings:', '_blank')
  } catch {
    /* ignore */
  }
  return false
}
