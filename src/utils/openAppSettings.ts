/**
 * Open the OS app-settings screen so the user can grant Bluetooth / Location /
 * Camera permissions.
 *
 * On Capacitor (native) we use the capacitor-native-settings plugin to deep-link
 * into the app's settings page.
 *
 * On the web there is NO reliable way to open OS/app settings: the legacy
 * `app-settings:` scheme does nothing in Android/desktop Chrome and merely opens
 * a blank tab that shows a browser "address error" — which is exactly what made
 * the "Open Settings" button look broken. So on the web we do nothing here and
 * return false; callers must surface a text instruction (toast) instead of relying
 * on a settings deep-link. Browser site-permissions live in the browser UI, not an
 * OS app-settings screen, so a text hint is the only correct affordance.
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

  // Web: no OS app-settings screen exists — never open the broken `app-settings:`
  // scheme (it just yields a browser address-error tab). Signal failure so the
  // caller shows a text instruction instead.
  return false
}
