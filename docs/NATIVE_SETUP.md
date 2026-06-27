# Native (Capacitor) permission setup — Android & iOS

The app is PWA-first. For the **native App Store / Play Store builds**, system
permissions are acquired through Capacitor plugins (not Web APIs, which the
WebView does not expose for Notification/Bluetooth). This doc lists everything
the native shells need. Run these in a dev environment with Android Studio /
Xcode — they cannot be built or tested in CI here.

## Installed plugins
- `@capacitor/push-notifications` — remote push (APNs/FCM) + notification permission
- `@capacitor/local-notifications` — show local alerts on native (low battery / outage)
- `@capacitor/camera` — camera permission for QR scanning
- `@capacitor-community/bluetooth-le` — native BLE (Web Bluetooth is unavailable in WebViews)

`src/utils/permissions.ts` branches on `Capacitor.isNativePlatform()` and uses
these plugins' `checkPermissions()` / `requestPermissions()`; on web it keeps the
existing Web-API path. `src/utils/pushNotification.ts` shows notifications via
`LocalNotifications` on native and via the Service Worker on web.

## One-time sync after pulling these changes
```bash
npm install
npx cap sync android      # copies web build + installs native plugin code
npx cap add ios && npx cap sync ios   # iOS project does not exist yet — create it
```

## Android — `android/app/src/main/AndroidManifest.xml`
Already added in this repo:
- `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`
- `POST_NOTIFICATIONS` (Android 13+ runtime prompt)
- `CAMERA` (+ optional `camera` feature)
- `BLUETOOTH_SCAN` (neverForLocation), `BLUETOOTH_CONNECT`, legacy `BLUETOOTH`/`BLUETOOTH_ADMIN` (maxSdk 30), `ACCESS_FINE_LOCATION` (maxSdk 30 for legacy BLE scan)

For FCM push you must also add `google-services.json` to `android/app/` and the
Google services Gradle plugin (per @capacitor/push-notifications docs).

## iOS — `ios/App/App/Info.plist` (add after `npx cap add ios`)
```xml
<key>NSCameraUsageDescription</key>
<string>Sierro uses the camera to scan device QR codes and update your profile photo.</string>
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Sierro connects to your energy device over Bluetooth for setup and control.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>Sierro connects to your energy device over Bluetooth for setup and control.</string>
<key>NSLocalNetworkUsageDescription</key>
<string>Sierro communicates with your device on your local network during Wi-Fi setup.</string>
```
- Enable **Push Notifications** + **Background Modes → Remote notifications** capabilities in Xcode.
- Add the APNs key/cert for remote push.

## Permission × target status after this change
| Permission | PWA | Native Android | Native iOS |
|---|---|---|---|
| Notification | ✅ Web Push (iOS 16.4+ installed) | ✅ Push/Local plugin + POST_NOTIFICATIONS | ✅ Push/Local plugin + APNs |
| Camera | ✅ getUserMedia | ✅ Camera plugin + CAMERA | ✅ Camera plugin + NSCameraUsageDescription |
| Bluetooth | ⚠️ Android Chrome only | ✅ BLE plugin + BLUETOOTH_SCAN/CONNECT | ✅ BLE plugin + NSBluetooth*UsageDescription |
| Wi-Fi/Network | ✅ online probe | ✅ NETWORK/WIFI_STATE | ✅ NSLocalNetworkUsageDescription |
| localStorage | ✅ | ✅ (WebView) | ✅ (WebView) |

## Still TODO for full native parity (not done here — needs native build/test)
- `src/protocols/bleManager.ts` still uses **Web Bluetooth** (`navigator.bluetooth`).
  For native BLE it must branch to `@capacitor-community/bluetooth-le`
  (`BleClient.requestDevice` / `connect` / `startNotifications`). Permission
  acquisition is wired; the data-transfer layer is not yet ported.
- QR scanning (`useQRScanner.ts`) uses `getUserMedia`; for best native UX consider
  a native scanner, though getUserMedia works in the WebView once CAMERA is granted.
- Wire `PushNotifications` token listeners → backend (reuse `webPushApi` contract).
