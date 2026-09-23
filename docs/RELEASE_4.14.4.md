# Release 4.14.4 (build 2905)

## Integrated Changes

- Includes the merged SW-12 schedule phase retry and active-mode controls.
- Integrates PR #116: replaces the QA workbook containing plaintext credentials with a sanitized checklist. Historical credentials still require owner-assisted rotation.
- Integrates PR #110: outage ownership checks and invalid unsigned power filtering. Retains main's stricter user validation and credential pruning.
- BLE operations are serialized and fenced by connection generation. Disconnect/timeout rejects pending work; response CIDs are validated; MTU 23 uses at most 20 ATT value bytes.
- Provisioning prevents overlapping selection, late callbacks after close, and unconnected QR verification. QR entry remains disabled as in SW-10.
- Open Wi-Fi no longer requires a password. Cloud create/bind POSTs have no automatic network replay; failed account/station lookups do not invent ownership or create duplicate stations.
- Sleep and Smart Schedule share a serialized control service and only commit settings after a successful power response. Sleep edits remain drafts until Save.
- Missing-attribute fallback requires explicit wording in the current response. Historical per-model flags cannot bypass authentication, permission, offline, or timeout errors.
- A stale Off action cannot disable the other active schedule. Mode ownership changes before the shared relay slot is updated.
- Background scheduling failures are visible warnings, not only console messages; relay requests have a bounded timeout.
- Relay rejects schedules without a poller session, and resets the applied phase when a window/rate changes.
- The Android workflow name reflects its configured Play track. Relay and first-launch permission tests now run in CI; permission assertions use the current email sign-in screen.

## Validation

Automated checks cover protocol packets, disconnect races, CID correlation, Wi-Fi password rules, bind retry behavior, mode ownership, failure classification, queue ordering, schedule retries, relay sessions, and power sentinels.

Run before release:

```sh
npm run test:unit
npm run test:server
npm run build
E2E_LOCAL=1 E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test --project="Mobile Chrome (iPhone 16)" --grep-invert "jason1324"
```

Successful automated tests do not establish hardware acceptance. Do not label the following checks complete without recording the phone, OS, app/native build, firmware, and observed result.

## Hardware Acceptance (Pending)

- Samsung and Pixel: fresh permissions, Bluetooth off/on, weak signals, late advertisements, repeated scans, and closing setup mid-connection.
- Sierro 1000/2000: discovery, select, verification, secured/open Wi-Fi, cloud binding, relaunch, and device list persistence.
- Schedule: enable/disable with missing sleepMode attribute; Sleep/Smart switching; midnight boundaries; offline recovery; relay unavailable; app closed across a boundary.
- Battery Priority: read back both registers for Savings 60% and Backup 100%; verify partial-write failure feedback.
- Confirm unavailable power readings never display 65534/65535 W or a misleading one-minute battery estimate.

## Deployment Controls

- Publish the tested integration through a PR, then verify CI and each platform upload separately.
- Relay deployment must preserve its untracked package lock, token store/backups, service environment, FCM/APNs credentials, and encryption key. Never replace them with repository defaults.
- Record the previous relay commit, create a private on-server token-store backup, test the candidate under the installed Node version, restart, then check localhost and CloudFront health. Restore the previous code if health fails; do not restore a stale token backup over live rotating credentials.
- TestFlight/Play upload success is not proof of review completion or availability to every customer.
- Historical password rotation requires the account administrator to reset or disable the legacy credential through an authorized management flow. The current OTP-only app removed its password-reset screen. No new password belongs in this repository or in release logs.
