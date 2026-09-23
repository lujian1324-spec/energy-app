/**
 * QR provisioning entry-point visibility (SW-10).
 *
 * The QR add-device path is hidden from users: nothing in the shipped UI offers
 * "Scan QR" / "Scan QR Code", and nothing opens the camera for provisioning.
 * Devices are added over the BLE search flow only.
 *
 * The QR code itself is deliberately kept — `QrScanScreen`,
 * `DeviceQrScanOverlay`, jsQR and the `qr` / `scanned` branches of
 * `ProvisioningPage` are all still wired. Flipping this one flag back to `true`
 * is the whole of bringing the path back, so the screens cannot rot apart from
 * the flow in the meantime.
 *
 * Typed `boolean` rather than the literal `false` so the guarded branches keep
 * being type-checked instead of being narrowed away.
 */
export const QR_ENTRY_ENABLED: boolean = false
