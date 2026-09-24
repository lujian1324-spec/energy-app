# SW-01 discovery follow-up: Pixel + Samsung

Run on physical Pixel and Samsung phones; record model, Android version, permission state, and BLE scan logs. These checks remain pending until hardware testing.

- Cold start with an existing bound device: confirm the home device list loads before opening Add Device and remains intact after leaving it.
- Fresh install / slow permission grant: confirm scanning lasts 30 seconds after native scan startup (permission prompt time is excluded).
- Confirm SSL_ names, later scan-response names, and FEE7-only advertisements appear, deduplicate, and remain selectable even with weak RSSI.
- With no matched devices and only valid RSSI at or below -85 dBm, expect “Move Closer and Try Again.” Move closer and retry. This is a heuristic about observed Bluetooth signals, not proof that the target device was detected; nearby strong unrelated signals suppress this hint.
- With no advertisements, unavailable RSSI, or stronger unrelated signals, expect the ordinary empty-scan guidance.
- Fail twice consecutively: confirm a scrollable troubleshooting panel offers power cycling, Bluetooth / Nearby devices permission, Location on older Android, and moving closer. Verify Search Again works. Since SW-10 the panel ends there: no QR step and no Scan QR Code button. Since v4.17.3 (after-sales R08) no step mentions a pairing mode or pairing light.
- Find a device, then retry with no devices: troubleshooting should stay hidden after this first new failure. Closing and reopening setup also resets the count.
- Cancel a scan by selecting a device or leaving setup: late callbacks must not add devices, errors, or failures.
- Disable Bluetooth / deny permissions across retries: preserve the specific recovery screen and show troubleshooting after two failures.
- Android 11 or older: Location off must produce Location guidance. Android 12+: Location off must not block scanning.

RSSI varies by phone, radio environment, and firmware. Validate the -85 dBm hint on both brands; this threshold never filters devices from the list. Web Bluetooth exposes no advertisement RSSI, so its failures retain existing error copy and gain the repeated-failure troubleshooting panel.
