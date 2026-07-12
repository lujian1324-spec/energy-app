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
npx cap sync ios          # ios/App/ already exists in this repo — just sync it
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

## Done
- Real native BLE lives in `src/protocols/bleProvision.ts` (`WebBleProvisionManager` +
  `NativeBleProvisionManager`, picked by `Capacitor.isNativePlatform()` via
  `getProvisionManager()`) — used for Wi-Fi provisioning (CIDs 30001-30050) and, since
  v3.36.0, for Bluetooth Direct Mode's UART/Modbus passthrough (`uartPassthrough()`,
  CID 30024/30025, in `src/protocols/bleDirect.ts`). Same GATT service (`FEE7`) /
  characteristics (write `FED5`, indicate `FED6`) on both backends.
  **Correction to an earlier version of this doc**: `src/protocols/bleManager.ts`
  (a separate `BLE_UUIDS`/`FFE0-FFE5` GATT profile) is **dead code, never imported
  anywhere** — it was an earlier attempt that used placeholder UUIDs and didn't match
  the real device protocol. Don't build on it; `bleProvision.ts` is the real thing.
- Native push token wiring is done in `src/utils/nativePush.ts`:
  `initNativePush()` requests permission, then only calls `register()` if
  `NATIVE_PUSH_READY` (`src/config/webPush.ts`, default `false`) is true — calling
  `PushNotifications.register()` without a configured Firebase project throws
  (`FirebaseApp` never initialized) and was crashing the app on Android (fixed in
  v3.35.8 by adding this guard, not by fixing the Firebase config — that's still the
  actual remaining TODO below). Once `google-services.json`/APNs credentials are
  real, flip `VITE_NATIVE_PUSH_READY=true` at build time.
- Android release build now has R8 (`minifyEnabled true` + `shrinkResources`) and
  `ndk.debugSymbolLevel='SYMBOL_TABLE'` (v3.35.7) — resolves the Play Console
  "no deobfuscation file" / "native debug symbols not uploaded" warnings and shrinks
  the AAB. No action needed here; mentioned so nobody re-disables it thinking it's
  unfinished.

## Still TODO for full native parity (needs native build/test)
- QR scanning (`useQRScanner.ts`) uses `getUserMedia`; works in the WebView once
  CAMERA is granted, but a native scanner plugin gives better UX.
- FCM: add `google-services.json` + Gradle plugin; APNs: key/cert in Xcode. This is
  the actual blocker for native push — see `NATIVE_PUSH_READY` above.
- Validate Bluetooth Direct Mode (v3.36.0) on a real Sierro device — the UART
  passthrough parity-bit setting (`'None'`) wasn't independently confirmed against
  firmware; a wrong value fails safely (CRC-rejected response) but hasn't been tested.
- iOS: `ios/App/` project already exists and is synced in CI; the remaining gap is
  signing/TestFlight (needs a Mac + Apple developer account — see `RELEASE_SIGNING.md`),
  not project setup.
