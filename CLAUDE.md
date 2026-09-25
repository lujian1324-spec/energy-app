# Sierro Energy App

React 18 + TypeScript + Vite + Tailwind PWA for managing Sierro energy-storage
devices. Routing via React Router (HashRouter), state via Zustand, API layer in
`src/api/` against the Solar of Things Open API.

- Build: `npm run build` · Dev: `npm run dev`
- Entry: `src/main.tsx` → `src/App.tsx` (router) → `src/pages/*`
- Deploy: push to `main` → GitHub Actions → GitHub Pages (`gh-pages` branch).

---

## Design System (LOCKED — Figma Handoff)

These tokens come from the official Figma Design System. **Do not change them
arbitrarily.** When adjusting any page, use these tokens; never invent new
radii, colors, font sizes, or fonts. They are encoded in `tailwind.config.js`.

### Typography
- **Anton** = display / page titles only (`font-display` / `.text-display`).
- **Inter** = all content (default `font-sans`).
- Line height **1.2**, letter spacing **0** everywhere.

| Token | Size | Tailwind |
|-------|------|----------|
| display | 32 (Anton) | `text-display font-display` |
| headline_Xlarge | 42 | `text-headline-xl` |
| headline_large | 28 | `text-headline-lg` |
| headline_medium | 24 | `text-headline-md` |
| title_large | 20 | `text-title-lg` |
| title_medium | 18 | `text-title-md` |
| body_large | 16 | `text-body-lg` |
| body_medium | 14 | `text-body-md` |
| label | 12 | `text-label` |
| caption | 11 | `text-caption` |
| tiny | 10 | `text-tiny` |

Weights: `regular` (400) and `emphasized` (600 / `font-semibold`).

### Color Scheme
- **Primary / Brand / Charge** `#01D6BE` (scale: light `#E8FBF9` → normal `#01D6BE` → dark `#01A18F` → darker `#004B43`) — `text-primary`, `bg-primary`, `bg-primary-light`, etc.
- **Yellow / Membership (Founder Badge)** `#FFD700` — `*-membership`
- **Green / Success** `#34C759` — `*-success`
- **Orange / Warning / Discharge** `#FF9500` — `*-warning`
- **Red / Error** `#FF3B30` — `*-danger`
  - `danger-dot` `#F23E16` is the unread badge on the notification bell only (`A_1.1.1`, `B_1.1` draw it warmer than the error red).
- **Neutral (black-1…13)** `#FFFFFF, #FCFCFC, #F5F5F5, #F0F0F0, #D9D9D9, #BFBFBF, #8C8C8C, #595959, #454545, #262626, #1F1F1F, #141414, #000000` — `*-ink-{1..13}`
  - App background = `ink-12` `#141414`; card background = `ink-10` `#262626`.

### Border Radius
`s` = 4px · `m` = 8px · `l` = 12px · `xl`/pill = 100px
→ Tailwind: `rounded-s`, `rounded-m`, `rounded-l`, `rounded-pill` (or `rounded-full`).
Cards use `l` (12); buttons use `m` (8); tags/pills use `pill`/`full`.
(Legacy `rounded-sm/md/lg/xl` exist for back-compat only — do not use in new code.)

### Border Width
`xs` = 0.5px · `s` = 1px · `m` = 1.3px → `border-xs`, `border-s`, `border-m`.

### Grid (Columns / Gutters / Margins)
| Width | Columns | Gutter | Margin |
|-------|---------|--------|--------|
| 360px | 4 | 16 | 16 |
| 768px | 8 | 16 | 24 |
| ≥1280px | 12 | 16 | 24 |

### Theme
Dark-first, iOS-native feel, rounded-card layout, teal accent on dark bg.

---

## Conventions
- Dark theme only (light mode is future work).
- No long-press text selection (v4.21.1): `body` is `user-select: none` + `-webkit-touch-callout: none`
  (`index.css`); inputs, textareas, `contenteditable` and `.select-text` stay selectable.
- **Cache cleared on every app update (v4.23.0).** `src/utils/appVersionReset.ts` is `main.tsx`'s first import
  (before any persisted store reads localStorage). When `sierro-app-version` (`{version}+{build}`) differs from the
  running build — a first launch counts — it drops the copies of server data: `powerflow-live-passthrough`,
  `sierro-config-missing*`, and `devices`/`deviceTotal`/`devicesListReady` inside `powerflow-device-store`; then sets
  `sierro-cache-reset-pending`. `powerflowDB.getDB()` (one shared open promise) sees the flag and, before handing the
  DB to anyone, clears `device_history`, `history_days`, `power_history` and sets every `rated_params.fetchedAt` to 0
  (model, `modelSource`, `bleId` kept). Kept: session/tokens, settings, programs/schedules, icons, dismissals.
  A new cache that only copies server data must be added to that list.
- All primary interactive elements ≥ 48×48dp; focus ring `#01D6BE` (WCAG).
- Toggle/button micro-interaction: scale 0.95 → 1. Ring color transition 1s ease-in-out.
- Reference the PRD (Sierro Energy App PRD v1.1) for per-page behavior.

---

## Versioning (REQUIRED on every change)
Single source of truth: `src/version.json` (`version`, `build`, `date`, `changelog`),
mirrored in `package.json` `version`. SettingPage renders `Sierro App v{version}`.
**Every app-facing change must bump the version and add a changelog entry.**
- patch (`x.y.Z+1`): bug fix / small tweak
- minor (`x.Y+1.0`): new feature
- major (`X+1.0.0`): large rewrite
Test-only / CI-only changes that don't alter the shipped bundle do NOT bump.

---

## Pages & Routes (`src/pages/`, wired in `App.tsx`)

### Route table
| Route | Component | Bottom nav | Notes |
|---|---|---|---|
| `/login` `/register` `/forgot-password` | `LoginPage` `RegisterPage` `ForgotPasswordPage` | no | Auth — separate `AnimatePresence` branch |
| `/devices` | `DevicePage` | **yes** | Device list (default after login) |
| `/insights` | `StatsPage` | **yes** | Insights (`/stats` redirects here) |
| `/setting` | `SettingPage` | **yes** | Settings (`/settings` redirects here); `ProfileEditPage` is an overlay inside it |
| `/device/:id` | `DeviceMonitorPage` | no | Live monitor |
| `/device/:id/settings` | `DeviceDetailPage` | no | Device Info (live) |
| `/device/:id/passthrough` | `PassthroughPage` | no | Modbus passthrough |
| `/device/:id/debug-params` | `DebugParamsPage` | no | Developer debug view (raw register names — exempt from label canon) |
| `/device/:id/schedule` | `DeviceSchedulePage` (`pages/program/`) | no | Smart Schedule (v4.22.0): AC Output / Charging tasks |
| `/device/:id/charging` | `ChargingSettingsPage` | no | AC charging power + Silent Mode row (v4.22.0) |
| `/device/:id/charging/silent` | `SilentModePage` | no | Silent Mode switch + schedule — replaces Sleep Mode (v4.22.0) |
| `/device/:id/limits` | `ChargeLimitsPage` | no | Only when `CHARGE_LIMITS_ENABLED` (no firmware register yet) |
| `/smart-schedule` | `SmartSchedulePage` | no | Old peak-shaving UI — paused (SW-14), no entry point |
| `/notifications` | `NotificationsPage` | no | Alarm center |
| `/onboarding` `/ble-debug` `/data-export` | `OnboardingPage` `BleDebugPage` `DataExportPage` | no | |
| `/firmware-update` | `FirmwareUpdatePage` | no | Only when `FIRMWARE_UPDATE_ENABLED` (not in consumer builds yet) |

`/device/:id/passthrough`, `/device/:id/debug-params`, and `/ble-debug` are gated by
`DEV_TOOLS_ENABLED` (`src/config/devTools.ts`) — only registered in Vite dev mode or when
`VITE_ENABLE_DEV_TOOLS=true` is set at build time; absent entirely from consumer release builds.

Also present but not routed standalone: `ProvisioningPage` (inside DevicePage add-flow).
- **QR provisioning is hidden from users (v4.14.1, SW-10), not deleted.** `QR_ENTRY_ENABLED`
  (`src/config/qrEntry.ts`, `false`) gates every entry point: the `Scan QR` action in
  `AddDeviceHeader` (so `ScanDevicesScreen` and `DeviceLinkedScreen` lose it too), the
  `Scan QR Code` link on a failed search, and the QR step + button in `ScanTroubleshooting`.
  Nothing replaces them — no substitute CTA or "use Bluetooth instead" copy — so a device is
  added over the BLE search flow only. `ProvisioningPage`'s `setUiScreen` folds `'qr'`/`'scanned'`
  back to `'scan'` and the render normalises them as well, so the camera is never mounted, and
  `DevicePage`'s legacy `showQrScan` overlay closes itself without starting the camera.
  `QrScanScreen`, `DeviceQrScanOverlay`, `useQRScanner` and jsQR all stay wired: flipping the one
  flag to `true` brings the path back.
- **Search screen resume (v4.16.2, APP-002).** Capacitor fires `appStateChange {isActive:true}` on
  every Android `onResume` — a permission prompt or any system dialog closing counts — but
  `{isActive:false}` only on `onStop`. `ProvisioningPage` routes each resume through
  `resumeAction()` (`src/pages/provisioning/resumePolicy.ts`): re-check + search only when the
  screen was blocked (permission / Bluetooth off) or the app really went to the background, and
  never restart a search that is still running. The provision store is reset before the first
  frame of every visit, and the Bluetooth check draws as the search layout (radar moving), not a
  full-screen overlay.
- **No "pairing mode" copy (v4.17.3, after-sales R08).** The search failure text, the troubleshooting
  steps, `RESTART_HELP_COPY` and `DISCONNECT_COPY` no longer ask for a pairing mode / pairing light: the
  app never said how to enter one (Trenton). Only steps a user can do are listed.
- **No Restart Device on a failed add (v4.18.0).** The "Couldn't add device" result offers the one retry
  button only. `handleRestart` stays wired (the already-bound screen still uses it).
- **Model from the device (v4.18.0).** After `/device/add/single` succeeds, rated params are saved with the
  scan-name guess (`modelSource: 'default'`) and `detectAndSaveModel()` (`src/api/ratedModelRead.ts`) reads
  register **0x000A** (额定交流逆变输出功率, Uint16, 1 W/unit, via `FRAMES.READ_ALL_PARAMS` over passthrough,
  3 tries 2 s apart) in the background: **1000 W → Sierro 2000**, any other reading → Sierro 1000, no
  reading → the default stays. `deviceStore.fetchAndCacheRatedParams` applies the same rule on list loads
  (`withDetectedModel`, `src/utils/ratedModel.ts`), never over a model the user picked in Device Info
  (`modelSource: 'user'`).
- **Android in-app updates (v4.19.0).** `startAppUpdates()` (`src/utils/appUpdate.ts`, started in
  `App.tsx`, signed in or not) asks Google Play (`@capawesome/capacitor-app-update`, the Play In-App
  Updates API) at launch and on each return to the foreground, at most every 6 h. A newer build →
  **flexible** update (Play asks once, downloads in the background); a finished download is installed
  when the app goes to the background (Play installs silently then) or straight away at the next launch.
  Priority ≥ 4 (release input `update_priority` / repo variable `PLAY_IN_APP_UPDATE_PRIORITY` in
  `android-release.yml`) or 14+ days ignored → **immediate** (full-screen) update; one the user left
  half-way is resumed. A declined prompt waits 3 days. The decision is `decideUpdateAction()`. Android
  native only; iOS, web and sideloaded builds do nothing, and every failure is swallowed.
- **BLE drop after Wi-Fi (v4.16.3, 0923-001).** Once `handleConfig` gets RC=0 the device leaves
  Bluetooth for Wi-Fi. `useProvisionScan`'s `onDisconnected` returns early when
  `wifiConfiguredRef` is set (marks `bleGoneRef` only): no reconnect loop, no
  `failKind: 'disconnect'`. Naming, icon and the cloud bind never need the link, and the step
  still reads `'configuring'` through them, which is what used to fail a successful add.
- **Guest mode is hidden from users (v4.17.0), not deleted.** `GUEST_ENTRY_ENABLED`
  (`src/config/guestEntry.ts`) gates the sign-in screen's "Continue as Guest"; it is `true` only in a
  build made with `VITE_ENABLE_GUEST=true`, which only the E2E workflow sets (its `[Guest]` specs).
  Consumer, QA, APK and iOS builds have no way in. `setGuestMode`, the demo devices and the simulator
  stay wired.
- **Hidden account + password sign-in (v4.17.4).** Ten quick taps on the landing screen's SIERRO
  wordmark (each within 1.5 s of the last — `registerTap()` in `src/utils/secretTaps.ts`; a longer
  pause starts over, nothing reacts before the tenth) open `LoginPage`'s `'password'` step: Username +
  Password → `loginByAccount()` (`/login/account`, MD5 via `md5Password`) → the same `finishSignIn` as
  the email code, so account settings, the roster check and onboarding behave identically. Not offered
  to users: no hint, no role on the wordmark, and the changelog (which ships in the bundle) does not
  describe the gesture. The real-account E2E group (`E2E_USER`/`E2E_PASS`) signs in through it.
- Terms of Use / Privacy Policy (v4.1.2) are no longer in-app routes/local text — every link
  (`LoginPage`, `RegisterPage`, `SettingPage`, `DataExportPage`) opens the marketing site directly
  (`src/config/legalLinks.ts`: `TERMS_URL`/`PRIVACY_URL` → `sierro.us/pages/{terms,policy}`,
  `target="_blank"`/`window.open`). `TermsPage.tsx`/`PrivacyPage.tsx` were deleted.
- Back navigation on `DeviceMonitorPage` must go to `/devices` via
  `navigate('/devices',{replace:true})` (plus popstate interceptor) — never `navigate(-1)` — to
  avoid history flicker. (Horizontal swipe-to-back was removed to prevent accidental navigation.)
  Other secondary pages (`DeviceDetailPage`, `PassthroughPage`, `DebugParamsPage`,
  `SmartSchedulePage`, `NotificationsPage`, `DataExportPage`, `BleDebugPage`) use plain `navigate(-1)`.
- All non-auth routes share ONE `AnimatePresence`/`Routes` in `App.tsx` (with `initial={false}`).

### Cards & parameters per page (user-facing label → source field)
Use the label canon below; same metric = same label everywhere except DebugParamsPage.

**DevicePage** (`/devices`)
- *Device card* (per device): name, model (`gatherProtocolName`/`model`), **Battery** % (`remainingBatteryCapacity`), charging dot (`batteryPower>0`) plus a **Charging** label under the battery tag, online badge (`isOnline`), AC switch labelled **AC Output** (v4.15.8, APP-20260922-004: accessible name "AC Output", described by `AC_OUTPUT_HELP` — it switches the outlets, not the unit).
- **AC switch (v4.15.1): shows what the device reports, never `isOnline`.** `resolveAcOutput()`
  (`src/utils/acOutputState.ts`) picks the newest of: the live read (Modbus run-state **0x0126 bit 2**,
  decoded as `LiveStatus.acOutput` from the passthrough/BLE `READ_ALL_STATUS`) and the cloud
  **`acOutputs`** field (sample time from `/state/latest` `time`). Not `inversionState`/`acOut1Enable` —
  that is the inverter, which idles while AC input feeds the outlets through bypass. An offline device,
  or one with no report, shows **off**. A flip is held as a command until the device reports a sample
  taken after it, so a stale cloud sample cannot bounce it back. `setAcOutput()`
  (`src/api/acOutputControl.ts`) writes 0x0080 **without** `noOutput`, then reads 0x0126 back (3 tries,
  1.5 s apart, intermediate reads not shown); still the old state after all three →
  "The device didn't switch its AC output." and the switch shows the device's state. Cloud state is
  re-read on return to the foreground; the live layer already does.
- *Bell dot*: `unreadAlarmCount()` over **every** device, from `firingAlarmsStore` (see NotificationsPage).
- *Banners under the header* (v4.17.4): the offline banner and the error banner ("Failed to switch power",
  "The device didn't switch its AC output…") each carry a 16px top gap inside the wrapper that animates
  their height (`OfflineBanner`'s `className` is that wrapper). They used to sit flush on the header.
- **Fast device switches (v4.17.1).** `loadDeviceDetails` drops a reply that is not the newest or not
  for the selected device. `selectedDeviceState` is the last state loaded (the first-add BLE capture
  relies on that), so pages read it through `stateForDevice(state, routeId)` — DeviceMonitorPage,
  DeviceDetailPage and DebugParamsPage — and a background read's push notification uses that device's
  own name/online flag, not the selected device's.
- **Phone offline (v4.15.4, APP-20260923-002).** `useOnline()` (`src/hooks/useOnline.ts`, online/offline
  events) drives `OfflineBanner` ("No internet connection. Check your network and try again.") on this page
  and DeviceMonitorPage, locks the card's AC switch (`controlsLocked`) and makes the monitor header say
  "No internet" instead of "Connected". It never marks the **device** offline — the phone's network says
  nothing about the device. The network coming back re-reads the list, cloud state and live layer.
- *Low Battery banner*: name, `Battery below {lowBatteryThreshold}%`, remaining time (`batteryTimeLabel`).
- *Device params modal*: **Battery** % (`remainingBatteryCapacity`), **Battery Power** W (`batteryPower`), **AC** W (`acPower`), **Solar** W (`solarPower`), **Output** W (`outputPower`), **Temperature** °F (`batteryTemp`); port states (`acOut1/2Enable`,`usbOut1Enable`,`sleepMode`,`workMode`).

(OverviewPage / `/device/:id/dashboard` was removed in v4.4.7 — it had become an
unreachable, unused route. The BLE-direct / passthrough plumbing it used
(`bleDirect.ts`, `modbusProtocol.ts`, `useLiveDeviceStatus`, `decodePassthroughBase64`)
lives on independently and is still referenced elsewhere.)

**DeviceMonitorPage** (`/device/:id`)
- *SoC card*: ring **Battery** % (`remainingBatteryCapacity`), **AC** W, **Solar** W, **Output** W.
- *Real-Time Power chart*: badge + area chart, tabs battery/ac/solar/output, 12am–12am axis.
  The **Battery** tab shows **Battery** SOC % (`remainingBatteryCapacity`) on a fixed 0–100% y-axis
  (badge in %, curve from `HistoryPoint.soc`); AC/Solar/Output tabs show power (W), auto-scaled.
  Driven by `RealTimePowerChart`'s `batteryAsSoc`/`batterySoc` props (the shared chart still defaults
  to the power view for the Battery tab).
  **Scrub (v4.18.0):** one finger (or a held mouse) on the plot shows a guide line, the point and a label
  with the sample's own time **to the second** (`clockLabelSeconds`, "3:47:23pm" — v4.21.1) and the tab's
  name + value (`scrubValueLabel`: whole W, SOC to 0.1 %, e.g. "Solar 180W"); the reading stays after release and follows
  tab switches. `readingAt()` takes the nearest sample within half a gap, so over a gap it says "No data".
  Two fingers pinch-zoom and pan (one-finger pan was dropped for the scrub); the wheel still zooms.
- **Newest sample wins (v4.21.1).** `resolveLiveValues(cloud, ble, pass, { cloudAt, bleAt })`
  (`livePassthroughStore`): a passthrough sample older than `LIVE_SAMPLE_FRESH_MS` (2 min — its reads have
  been failing) gives way to a cloud sample (`/state/latest` `time`, `parseDeviceStateTime`) taken after
  it; before, it sat on top for up to 15 min and the screen froze under "Connected". A BLE sample older
  than `LIVE_SAMPLE_MAX_AGE_MS` is ignored. DevicePage passes the same times. The monitor also re-reads
  the cloud state on a return to the foreground, and its header says `Last update 2:15pm` instead of
  "Connected" once the newest reading on screen is over `STALE_DATA_MS` (10 min) old
  (`connectedLabel`, `src/utils/dataFreshness.ts`).
- *Header* (v4.18.0): the device name is centred with `max-w-[calc(100%-232px)]` and truncates with an
  ellipsis; the switcher chevron never shrinks, so a long name cannot push it under the settings button.
  `index.css` sets `.truncate { text-wrap: nowrap }` after the titles' `text-wrap: balance`, which had
  been resetting `.truncate`'s nowrap on every title.
- **Today's history (v4.17.0; source v4.17.2).** `useHistoryFetcher(id, dayStart, dayEnd, { live: true })`
  reads the day the way the Solar of Things console does (`docs/siseli-api.md`):
  `POST /deviceState/simple/attribute/keys/history/v1` with `keys` = the four fields below, `count: 1500`,
  `orderByTimeAsc: true`, `fromTime`/`toTime` as local ISO **with offset** (`toIsoTz` in
  `src/utils/historyPoints.ts`) and an `IOT-Time-Zone` header on this call only. The reply is columnar
  (`payload.timeSeries` + one aligned array per key, `null` = absent) → `columnarToPoints()`; a frame with
  none of the four keys is dropped; pages end on a short page or `page >= total`. If page 1 is refused
  (not a success, or no columnar payload) the session falls back to `POST /deviceState/attribute/record/list`
  (Siseli app `doGetDeviceHistory`, `count: 80`) — never a blank chart over it. v4.23.1: one refusal only falls back for
  that read; `KEYS_V1_STRIKES` (2) in a row pause keys/history/v1 for `KEYS_V1_RETRY_MS` (10 min), then it is tried
  again (a busy server used to switch the whole session to record/list).
  Tabs → fields: Battery `remainingBatteryCapacity`, AC (input) `exchangeChargingPower`, Solar
  `generationPower`, Output (AC output) `outputPower`. A missing field is `null` and a silence longer
  than `maxGapMs()` (3× cadence, 15–60 min) breaks the line — never 0 W, never a bridge. The tail is
  re-read every 60 s while visible — until the whole day has come back once (a page failed, the read threw) that
  minute read covers the whole day, so a gap in the middle fills in (v4.23.1) — and the day rolls over at midnight. The old formatter dropped the `-`
  west of UTC (`…T00:00:0007:00`), so every US user got 20101 and an empty chart.
  **Cache:** IndexedDB `device_history` (DB v5; v6 adds `history_days`), keyed `[deviceId, timestamp]`, paints first only —
  the full day is re-read from the server on every visit and replaces it. It used to end the fetch
  (curve frozen at the first visit) and to read guest-simulator rows with no `deviceId` as every
  device's; v5 clears that legacy `power_history`. `deviceStore.exitDemoMode` (sign-in and
  sign-out) clears the cache. A complete read of the whole day also records that day in `history_days`
  (`markHistoryDay`), so the Insights background cache does not read it again (v4.21.0).

**DeviceDetailPage** (`/device/:id/settings` — Device Info)
- *Name edit*, *icon picker*.
- *Device Info*: model, **no Serial Number row** (removed v4.18.0; `deviceSerialNumber()` stays in `src/utils/deviceSerial.ts`), **Bluetooth ID** (its own row: `dtuDtuid`, else `RatedParams.bleId` saved at add time, else `--`; `deviceBluetoothId()`, both in `src/utils/deviceSerial.ts` — Marc: the module id is not the product SN and must not be labelled as one), **Rated Capacity** (the model's: 1 kWh Sierro 1000 / 2 kWh Sierro 2000, `ratedCapacityWh()` in `src/data/deviceModels.ts` — v4.19.0; it was `acInvOutputPower×2`, but 0x000A is the inverter output power, so a unit reading 300 W showed 0.6 kWh and every battery-time estimate was off; the ring, the low-battery banner and DebugParams use the same helper), **Rated Output Power** W (`ratedPower`), **Rated Voltage** 120V (fixed), **Cycles** (`numberOfBatteryUsageCycles`), **Temperature** °F (`batteryTemp`), Wi-Fi (`isOnline`). **No firmware version row** yet (`softwareVersion` is typed but not rendered — see `docs/siseli-firmware-api.md`).
- **Rows (v4.22.0):** Device Name, Display Icon, Device Info, **Smart Schedule** (On/Off), **Charging Settings**
  (`{power} W`), **Charge & Discharge Limits** (only when `CHARGE_LIMITS_ENABLED`), Delete Device. **Sleep Mode is
  replaced by Silent Mode** (`LEGACY_SLEEP_MODE_ENABLED = false`, `src/config/sleepMode.ts`): its row, editor and
  client scheduler stay in the code but do not render or run; its E2E specs are skipped until the flag flips. The
  row values come from `useDeviceProgram` — this phone's copy first, then the relay's (v4.23.1; `peekProgram` alone
  showed defaults on a second phone) — and Charging Settings shows the Silent-capped power. See **Device program** below.
- *Sleep Mode editor* (legacy, hidden) (`sleepFrom`/`sleepTo` + scheduler), *Battery Priority sheet* (Backup 100% / Savings 60%), *delete dialog*.
  Saving Sleep Mode claims the device for `sleep` (SW-12 — see Smart Schedule below), which disarms
  Smart Schedule's window, and reports a relay that refused the upload instead of dropping it.
- **Sleep Mode powers + offline set (v4.18.0).** Two sliders — *During sleep* / *Outside sleep* — set the
  0x0085 AC charge power, **50 W steps, 0–400 W on a Sierro 1000, 0–800 W on a Sierro 2000**
  (`sleepPowerMaxW`/`snapSleepPower`/`sleepWatts` in `src/utils/chargeWindow.ts`; defaults 150/400 and
  300/800). They are stored with the window (`sierro-sleep-{id}`: `sleepW`/`wakeW`; the scheduler hook
  merges rather than overwrites), passed to `applySleepSchedule`, the client scheduler and the relay
  upload. Switching Sleep Mode off restores the model power, not the non-sleep slider.
  A device the cloud reports **offline** (`offlineReason(...) === 'device-offline'`, connection state only)
  is still set: `applySleepSchedule({ deviceOffline: true })` skips A/B and uploads to the relay alone;
  `ok` only if the relay accepted (then `queued: true`, "Sleep Mode saved — will switch when back online").
  The relay tick skips an offline device and writes 0x0085 once it is online again
  (`server/sleepExecutor.test.js`). The relay's `GET /debug/user/:userId` (X-Internal-Key) lists each
  device's stored window, watts and `lastAppliedPhase` (`date|sleep|250`) to check both hops on AWS.
- **Battery Priority is hidden (v4.18.0), not deleted.** `BATTERY_PRIORITY_ENABLED`
  (`src/config/batteryPriority.ts`, `false`) gates the row and the sheet; the path below stays wired, and
  the R11 E2E specs run again when the flag is flipped.
- **Battery Priority control path (v4.14.0, SW-09): Modbus passthrough only, no `workMode` write.**
  Save goes through `applyBatteryPriority()` (`src/api/batteryPriorityControl.ts`) and makes exactly two
  `POST /remote/device/passthrough` writes, in order: **0x0086** (`PV_BATT_PRIORITY`) then **0x0054**
  (`PV_BATT_PRIORITY_MIN_SOC`, a **percent**) —
  Savings → `0x01AA` + `60`, Backup → `0xAA01` + `100` (not 1000).
  Both count: a refused 0x0054 leaves the old reserve in place, so it is reported as a failure, the row
  rolls back and the sheet stays open. `setWorkMode()` in `deviceApi.ts` is untouched and simply no
  longer called from this sheet, so the cloud `workMode` field keeps whatever the backend already holds;
  there is therefore no cloud echo to poll, and after a successful save the row shows what was written
  to 0x0086/0x0054 for the rest of the visit. **Re-entry (v4.17.3, after-sales R11):** the last value
  this app wrote to the registers (`loadConfirmedPriority`) wins over the cloud `workMode`, which this
  path never updates — letting the stale field win was "set Savings, come back, it says Backup". The
  cloud value is only a first guess on a phone that never saved one, and is never stored as confirmed.
  A refused save toasts "Could not change Battery Priority. Check the device is online and try again."
  — the platform's own text ("illegal argument") goes to the log only.
- **Fan Speed — NOT RELEASED (hidden since v4.15.3).** Rendered only when `FAN_CONTROL_ENABLED`
  (`src/config/fanControl.ts`) is true, which is `DEV_TOOLS_ENABLED`: Vite dev and QA builds made
  with `VITE_ENABLE_DEV_TOOLS=true` (`deploy-qa.yml`). Consumer builds (Pages root, APK, iOS, release
  AAB) have no card, and the build-time constant drops it from their bundle. It stays wired so
  releasing it is that one line — only after hardware verification (0 % behaviour, firmware handback).
  Implementation (v4.15.0): one Modbus write, slider 0–100 %. `FanSpeedCard`
  (`src/pages/device/FanSpeedCard.tsx`) → `applyFanSpeed()` (`src/api/fanControl.ts`) sends one FC16
  passthrough to **0x0081** (`FAN_CTRL`) with value `0x01SS`: high byte `0x01` = fan enabled, low
  byte = the percentage in hex (`0x00`–`0x64`), e.g. 23 % → `01 10 00 81 00 01 02 01 17 F9 DF`. The
  enable byte stays `0x01` at 0 %. The write goes out when the slider is released, not on every
  step; writes are serialised (newest queued value wins); a refusal snaps the slider back to the last
  accepted speed. 0x0081 is volatile and never read back — the slider reopens at the last speed this
  app set for the device (`localStorage['sierro-fan-speed-{deviceId}']`). Disabled while offline.

**StatsPage** (`/insights`)
- *Header*: days-in-service (from `installedAt`).
- *Period selector* (Day/Week/Month/Range) + *date navigator*.
- *CO₂ card*: CO₂ reduced Kg + eco insight + formula.
- *Input vs. Output chart* (v4.16.0): one line chart for every period (Week was bars), shared scale for both
  series, tap/drag to read a bucket (the reading stays). **v4.21.1:** drawn 1:1 at the box's measured width
  (ResizeObserver, `chartW`) instead of a fixed 340-wide letterboxed viewBox; a tap picks the nearest
  drawn point (`bucketAtX`), and the axis labels (`axisLabelIndexes`, about six) sit under their own
  points (the selected one lit) — they were spread with `justify-between`, a bucket or more off. Built by `buildInsightsFrame()`
  (`src/utils/insightsFrame.ts`): per-bucket **energy in Wh**, integrating each sample's power until the next
  (held at most `sampleHoldCapMs` = 3× the device's typical gap, 15–60 min, so silence is not credited);
  **input = Solar (`generationPower`) + AC (`exchangeChargingPower`)** — AC used to be ignored — and the
  tooltip lists Solar / AC only for a bucket where that source delivered. Buckets with no samples (and
  future ones) are `null` → gaps, never 0. CO₂ counts **solar only**. Insight: "Highest daily output this
  week/month: {date}". History is paged until a short page (cap 200 × 300); a failed later page or the cap
  shows "Some history … couldn't be loaded" instead of silently short totals (APP-20260923-006/007/008/009).
- (Battery Health card removed.)
- **History cache (v4.21.0).** Insights reads its device's history from the phone
  (`src/utils/insightsCache.ts`), one **local day** at a time: `fetchDay()` reads a day with the Real-Time
  Power call (`fetchWindow`: keys/history/v1, falling back to record/list), and only a day that came back
  whole is stored — `saveHistoryDay()` replaces that day's `device_history` rows and writes its
  `history_days` row (`[deviceId, dayStart]`, powerflowDB **v6**) in one transaction. A day read ≥ 2 h
  (`SETTLE_MS`) after it ended is **final** and never read again; today is never final.
  - *Every app open* (`startInsightsPrefetch()`, `src/utils/insightsPrefetch.ts`, started in `App.tsx`):
    3 s after the device list is in, and again on a return to the foreground ≥ 30 min after the last
    finished run, `prefetchInsightsHistory()` caches the Insights device (oldest, `insightsDeviceId`) from
    30 days back (or the 1st of the month if earlier) to today, **newest day first, one request at a time**,
    waiting for `requestIdleCallback` + 300 ms before each day. It skips final days and a day read in the last
    2 min (`FRESH_MS` — the chart just read today), touches no React state, and stops when the app is hidden,
    offline, signed out, a guest/demo, or under the firmware lock (`isActive`), or after two failed days; the
    next open resumes. Days older than 62 days are pruned at the end. `MAX_DEVICE_HISTORY` is 150,000 rows; a
    trim also drops the `history_days` rows of days it cut into.
  - *The page*: `loadInsightsRange()` paints straight from the cache when every day of the period (up to
    today) has a `history_days` row, then re-reads only the days that are not final (3 at a time) and
    replaces the chart; an uncached period is read the same way, with the skeleton. A day that did not come
    back whole still shows the "Some history … couldn't be loaded" note; nothing at all → the error state.
    StatsPage stays mounted behind the other tabs, so it **reads only while `/insights` is on screen**. While it is,
    the period is re-read quietly every 5 min and on each return to the foreground (v4.23.1: no skeleton, a failure
    keeps the chart); only days that are not final reach the server.
  - Page and background share one request per device-day (`fetchDay` in-flight map; a thrown request is a
    failed day). A `FIRMWARE_UPDATING` reply never switches the session from keys/history/v1 to record/list.
    A re-read that fails part-way only adds its points to the cached day; only a whole read replaces it (v4.23.2).
    `resetInsightsCache()` (from `deviceStore.exitDemoMode`, sign-in/out) drops requests in flight so none
    writes into the next account's cache; `clearDeviceHistory()` clears `history_days` too.

**SettingPage** (`/setting`)
- *Profile card*: avatar, name, account action, Founding Member tag. The tag and the matching
  pill on `ProfileEditPage` are **not tappable** — membership comes from the VIP roster at
  sign-up, so there is nothing to open. The Founder Badge modal and the Redeem Founder Badge
  sheet were removed with `activateFounderBadge()`: it generated the number from the clock,
  could hand two people the same badge, and redeeming as a real member would overwrite their
  roster number with a made-up one. `applyFoundingMember()` is now the only writer.
- **Settings follow the account (v4.17.1).** `settings` / `peakShavingSettings` in `powerflow-storage`
  carry a `settingsOwner` (userId). `switchSettingsAccount()` (powerStationStore) puts the outgoing
  account's set under `sierro-account-settings-{userId}` and loads the incoming one's (defaults when
  none); `src/utils/accountSettings.ts` calls it on every sign-in (`LoginPage.finishSignIn`,
  `authStore.login`), sign-out, failed restore and `auth:expired`, and re-reads the roster for the
  Founding Member tag at sign-in (`syncFoundingMember`: on for a member, cleared otherwise). A restored
  session adopts an unowned set from before this; a fresh sign-in never does. SettingPage stays mounted,
  so its local toggle/threshold copies follow the store. Before this, B signing in after A saw A's tag,
  number, push toggles and threshold.
- *Push Notifications*: Power Outage (`pushNotifications`), Low Battery (`pushLowBattery`)+threshold slider (`lowBatteryThreshold`), Solar Status (`pushSolarStatus`). Toggles drive Web Push enable/disable. (The `pushDeviceAlarms` "Device Alarms" toggle was removed from the UI in v4.7.7 — the setting field and relay/notification plumbing remain, but it no longer surfaces so it stays at its default `false`; the Notifications alarm center still lists every alarm type regardless.)
  Section visibility is gated by `PUSH_ENABLED` (`src/config/webPush.ts`) — `true` in every production
  build since v3.35.5 (requests the OS notification permission; safe on its own). A **separate** flag,
  `NATIVE_PUSH_READY` (same file, default `false`), gates whether native `PushNotifications.register()`
  actually runs — it stays off until `google-services.json`/APNs credentials are real, because calling
  `register()` without them crashes on Android (fixed in v3.35.8 by adding this second gate).
- *Delete Account* (also on `ProfileEditPage`): goes through `deleteAccountAndContents()`
  (`src/utils/deleteAccountFlow.ts`) — **devices, then stations, then `/user/logout/account`**.
  The account endpoint refuses an account that still owns a station, and a device is bound INTO
  a station, so that order is the only one the backend accepts. A failure stops the run before
  the account is touched and is shown to the user; never sign out on a failed delete, which is
  what made a refused deletion look successful. The confirmation copy must say devices and
  stations go too.
- **Firmware Update — NOT RELEASED (v4.20.0).** A row under Feedback → `/firmware-update`, both only when
  `FIRMWARE_UPDATE_ENABLED` (`src/config/firmwareUpdate.ts`: dev, QA `VITE_ENABLE_DEV_TOOLS=true`, and
  `VITE_ENABLE_FIRMWARE_UPDATE=true` — the E2E build). Consumer builds have neither: `/device/upgrade/create`'s
  body is a best reading of `DeviceUpgradeCreateDtio` (`{ deviceId, deviceFirmwareId }`) until it is captured on
  a test unit (`docs/siseli-firmware-api.md` §4), and a wrong flash can leave a unit unusable.
  Flow (`src/stores/firmwareUpdateStore.ts`, rules in `src/utils/firmwareUpdate.ts`, calls in
  `src/api/firmwareApi.ts`): `upgrade/permission/get` + `device/details` (version, `isFirmwareUpgradeEnabled`,
  `isOnline`) + `firmware/list/fromManufacturer` → newest enabled file → **update offered only when its version
  differs** from the device's `softwareVersion` (and it is not the file this phone already installed there) →
  sheet with the release notes (firmware `description`: what is new / fixed) → confirm → `upgrade/create`
  (never retried) → poll `upgrade/details` + `device/details` every 5 s → success / failed / "status unknown".
  **Lock (`src/utils/firmwareLock.ts`):** taken *before* `create`, persisted (a restart resumes it via
  `App.tsx`), released on success, failure or after 45 min. While held, `apiClient.request()` answers every
  call that is not firmware, `/device/details` or session upkeep with code `FIRMWARE_UPDATING` (no network),
  BLE reads/writes in `bleDirect.ts` do nothing, and no schedule is uploaded to the relay; `FirmwareLockBanner`
  on the device list and monitor says so. The relay likewise skips `isUpgrading` devices
  (`server/sleepExecutor.js`, `poller.js` — needs a relay redeploy).
- *Feedback modal* (EmailJS), legal links + version. (The inline "Export My Data" button was removed in v4.7.7; full export lives on `/data-export`.) `ProfileEditPage`'s "Link Accounts" (Google/Apple placeholder rows) was also removed in v4.7.7.

**OnboardingPage** (`/onboarding`) — runs once after a first sign-up
- *Name step* (A_2.2.1): "What should we call you?" → writes the profile cache and `/user/update/iotUserInfo`.
- *Founding Member step* (A_2.2.1b): shown **only** when the account's registered address is on the
  VIP roster. Prints the member's real number, awards the badge (`applyFoundingMember` →
  `settings.founderBadge`/`founderBadgeNumber`, which is what SettingPage's gold ring and tag read),
  then Continue → the device step. Everyone else skips straight past it.
  **The roster stores SHA-256 hashes, never addresses** — it ships inside the app, and a readable
  list would hand anyone who unpacks the bundle every VIP customer's email. `foundingMembers.ts`
  hashes the signed-in address and looks it up (async — WebCrypto); `foundingMemberRoster.ts` is
  **generated, never hand-edited**. To change the list, edit the VIP workbook and re-run
  `python scripts/build_founding_roster.py <workbook.xlsx>` (reads its "Email Lookup" sheet).
  Team accounts that are not on the sheet live in the script's `EXTRA` map with numbers outside
  the sheet's 1..N range, so regenerating never drops them and they can never take a real
  member's place in the order.
  `normalizeEmail()` must stay identical to the script's `normalise()`, or every member silently
  stops matching. There is no endpoint for this yet; `foundingMemberNumber()` is the single place
  that answers the question, so an endpoint later replaces only that function.
- *Device step* (A_2.2.2): add the first device, or skip.

**Device program (v4.22.0)** — Smart Schedule (`/device/:id/schedule`), Charging Settings (`/device/:id/charging`),
Silent Mode (`/device/:id/charging/silent`), Charge & Discharge Limits (`/device/:id/limits`, hidden). Full spec and
backend/firmware handoff: **`docs/DEVICE_PROGRAM.md`**.
- **One rulebook for app and relay:** `server/deviceProgram.js` (typed by `server/deviceProgram.d.ts`, re-exported with
  UI helpers from `src/utils/deviceProgram.ts`). Program per device: `model`, `tz` (phone's IANA zone at save),
  `chargePowerW`, `silent {enabled, scheduled, from, to, days, updatedAt}`, `tasks[] {id, kind 'ac'|'charge',
  action on/off|start/stop, time HH:MM, days 0–6, enabled, updatedAt}` (≤ 20), `limits {chargeMax 100|80|60,
  dischargeMin 0|10|20}`. Power choices: Sierro 1000 50/100/150/200/300/400 W, Sierro 2000 100/200/300/400/600/800 W;
  Silent limit 150 / 300 W.
- **Rules:** tasks are point events, acting only at occurrences after their `updatedAt` (never retroactively); charging
  follows the latest charge event (none → charging); an AC event missed by more than 30 min is dropped; Silent Mode
  is off / always / inside the window (crosses midnight when `to <= from`; `days` = start days) and is a **cap** —
  a power picked at or under it stays after the window; 0x0085 = 0 while paused, so changing the power never starts
  a charge. Two enabled tasks of one kind at the same time on a shared day are refused (`findClash`).
  **A save never changes what already happened (v4.23.2):** `chargeBaseline` (set by `stampChanges` = charging under the
  replaced program at save time) is the charging state until a charge task of the new program fires after `savedAt`;
  AC events before `savedAt` are not owed. Editing a Stop task, or a save from a phone in another zone, used to resume
  a paused charge at once, and a save replayed an AC event from the last 30 min. A program without `chargeBaseline`
  (saved before v4.23.2) keeps the old rule.
- **Saving** (`saveProgram`, `src/api/programApi.ts`; screens via `useDeviceProgram`, each saving only its own part
  merged onto the latest saved copy): stamp changes (`stampChanges`) → validate → relay `POST /program` (a refusal
  is a failed save; nothing written) → local copy `sierro-program-{id}` → disarm the old `sierro-sleep-{id}` window →
  write the current 0x0085 value when the device is online (offline: the relay does it when it is back). Loading:
  relay `GET /program`, else local copy, else `initialProgram()` which turns a saved Sleep Mode window into the Silent
  schedule. The Header Save stays dim until something changed.
- **Two phones (v4.23.1).** The upload carries `baseSavedAt` (the `savedAt` of the program the edit started from).
  The relay refuses a save whose base is not the stored program with **409 `PROGRAM_CHANGED`** + the stored program;
  `saveProgram` then re-applies only this phone's changes on top of it (`rebaseProgram`: tasks by id — added, deleted,
  edited here win; power / Silent / limits only where changed here) and sends once more ("Saved together with changes
  made on another phone."). A second refusal is a failed save that shows the stored program. An app without
  `baseSavedAt` is not checked. The local copy carries `owner` (userId) and is ignored for another account (an unowned
  pre-v4.23.1 copy is still read); the session memo `sessionPrograms` is cleared by `deviceStore.exitDemoMode`.
- **Relay:** `server/programRoutes.js` (auth + device ownership on every call; saving a program deletes that device's
  legacy `/schedule` window), `server/programExecutor.js` run inside the minute tick (`sleepExecutor.tick`, also
  in-process when `SLEEP_SCHEDULER_EXTERNAL` ≠ true): compares `chargeTarget`/`acTarget` keys with what it last
  applied, and only on a difference opens the session, checks owned + online + not upgrading, writes 0x0080 / 0x0085.
  **Needs a relay redeploy**; an old relay answers 404 and the app reports the save as failed. A device whose write
  failed waits 2 → 4 → … → 30 min before the next try (per device, in memory; a new save retries at once — v4.23.2).
  A relay with no record of the user (no background session ever sent) accepts an untimed program without keeping it
  and says `stored: false`; the app then relies on its own copy (`loadProgram` falls back to it when the relay has
  none). **Known gap:** the relay's own session is minted by `provisionPollerSession` (password sign-in, and email-code
  sign-in for accounts this app registered, via `defaultPasswordForAccount`); an account created elsewhere or with a
  changed password has none, so its timed programs are refused with `POLLER_SESSION_REQUIRED`. Never hand the relay
  the app's own token pair — refresh tokens are single-use. See `docs/DEVICE_PROGRAM.md` §6.
- **Charge & Discharge Limits are hidden** (`CHARGE_LIMITS_ENABLED`: dev, QA, `VITE_ENABLE_CHARGE_LIMITS=true` — the E2E
  build): no firmware register exists yet; values are saved and uploaded but not applied.
- **Sizes as drawn (v4.23.0):** task/Silent switches are `ToggleSwitch size="lg"` (56×32); Smart Schedule tabs 40 tall,
  task time `text-headline-md`, Add Schedule 40 tall; `OptionGrid` md = 48 tall (charge power), sm = 40 tall bold
  (limits); Silent Mode's From/To/Repeat are `ChevronRow compact` (44). Keep these when editing the pages.
- The wheel time picker is shared (`src/components/TimeWheel.tsx`); since v4.22.0 its own scrolls (line-up, a tap) and a
  settle timer outliving the picker no longer change the value.

**SmartSchedulePage** (`/smart-schedule`) — old peak-shaving page, paused since SW-14 (no entry point)
- *Enable toggle*, *24h clock donut* (charge/discharge/idle arcs).
- *Peak/Off-peak cards*, *periods list* (`startTime–endTime`,`type`).
- *Prices*: peak/off-peak/part-peak $/kWh. *Params*: max charge/discharge W, min/max SOC %. *Estimated savings* daily/monthly/yearly.
- **Control path (v4.13.0, SW-08): Smart Schedule rides Sleep Mode's path, not `peakValley`.**
  Every save/enable goes through `applySmartSchedule()` (`src/api/smartScheduleControl.ts`) and makes
  exactly Sleep Mode's three writes, in order: `POST /remote/device/config/write` (`sleepMode`) →
  `POST /remote/device/passthrough` writing Modbus **0x0085** (`AC_CHARGE_POWER_RT`) →
  relay `POST /schedule` via `uploadSleepSchedule`. **No `/peakValley/*` request is issued from this
  page** — the backend accepts that surface and the hardware has no peak-valley engine, so a schedule
  saved there changed nothing at the plug. The `peakValley` functions in `deviceApi.ts`/`deviceStore`
  (SW-05) are left intact but are no longer called by the app.
  - The device sees **one** window: the enabled **Charge** period. Inside it the AC charge power is the
    user's **Max Charge** value; outside it is **0W**, which is what makes the battery rather than the
    grid carry the peak. Turning Smart Schedule off restores the model's normal charge power
    (`getPowers`) so a device is never left parked at 0W.
  - Window/phase/power maths is shared with Sleep Mode in `src/utils/chargeWindow.ts`, and enforcement
    while the screen is open reuses `useSleepModeScheduler` (with `powers` + its own
    `storagePrefix: 'sierro-smart'`, so the two features never overwrite each other's saved window).
  - Because both features drive the same register and the relay's single per-device schedule slot,
    saving Smart Schedule supersedes that device's Sleep Mode window and vice versa. One device has
    one charge-power schedule; that is inherent to sharing the control path.
  - The relay honours the uploaded `sleepW`/`wakeW` (`server/sleepSchedule.js`); a Sleep Mode upload
    omits them and still gets the per-model defaults. A relay older than this change falls back to
    Sleep Mode's rates for Smart Schedule windows until it is redeployed.
  - **SW-11 (v4.14.2):** if step A comes back "config attribute not exist" — the product model has no
    `sleepMode` key at all — A is **soft-failed**, not surfaced: the run continues to B and C, and the
    result carries `configSkipped`/`configSkippedDetail` so `ok` is never read as "all three landed"
    (`isMissingConfigAttribute()` is the matcher). Any other A failure still stops the run as before.
    v4.14.4 classifies only the current response with explicit missing-attribute wording.
    It does not use a per-model memo: an earlier missing key must never hide a later
    authentication, permission, timeout, or offline failure.
  - **SW-12 (v4.14.3): one device has one active mode, and `ok` is not the whole story.**
    - *Active mode* — enabling Smart Schedule claims the device in `src/utils/activeScheduleMode.ts`
      and disarms Sleep Mode's saved window; enabling Sleep Mode does the reverse. Turning either off
      releases the claim, scoped to the owner. `useSleepModeScheduler` takes a `mode` and writes
      0x0085 only while that mode owns the device, so the two never fight over the register or the
      relay's single per-device slot. An unclaimed device stays open to either mode, so installs from
      before this keep working.
    - *Phase / retry* — the shared scheduler's writes live in `src/utils/chargePhaseWriter.ts`. A
      phase is recorded (in memory and in `${prefix}-phase-${deviceId}`) only after the passthrough
      returns a **business** success; a refused or thrown write stays pending on a bounded backoff
      ladder (10s/30s/60s/120s), wake events (online / focus / the 60s tick) restart it at most once
      per 30s, exactly one write is in flight at a time, and a reply for a device the user has left
      is dropped. Before this the phase was recorded before the request resolved and failures were
      swallowed, so every later re-check said "already applied" and a missed window stayed missed.
    - *Honest relay* — `ok` is the **instant power** result (A/B) only. C is carried separately as
      `relayConfigured`/`relayAccepted`/`relayDetail` (`uploadSleepScheduleResult`), and both pages
      raise a warning toast from `backgroundScheduleNotice()` when the device took the write but the
      relay did not take the window — including the disable path, where the old background schedule
      may still fire.
  - **SW-13 (v4.14.4): an offline device is not a refused save.**
    Save goes through `saveSmartSchedule()` (`src/api/smartScheduleSave.ts`), which wraps
    `applySmartSchedule` in one decision. **Offline is read from client connection state only** —
    `navigator.onLine`, whether a token exists, and the device's cloud `isOnline`
    (`src/utils/deviceConnectivity.ts`); never from a reply's wording, because `can not set charge
    power` is exactly what a *true* firmware reject says and matching it would turn every reject
    into a silent "queued". An unknown `isOnline` counts as connected, so a failure stays a failure.
    - *Offline* → nothing is written, the window is stored as that device's **latest** pending save
      (`src/utils/smartScheduleQueue.ts`, `sierro-smart-pending-{account}-{deviceId}`, newest
      overwrites older). A warning distinguishes local persistence from device application;
      storage failure is a failed save. It claims `activeScheduleMode`; a later Sleep claim
      cancels the pending Smart intent. Disables queue with the same owner checks.
    - *Reconnect* → `useSmartScheduleFlush` (mounted on `SmartSchedulePage` and `DevicePage`, so a
      device coming back is caught with either screen open) replays the latest pending via
      `flushPendingSmartSchedule()`: the same A→B→C run, SW-11 soft-fail and SW-12 relay split
      intact, cleared against its own `queuedAt` so a save made mid-flush survives. One flush in
      flight per account/device, at least 30s apart with a periodic wake. Refusals stop after
      `MAX_FLUSH_ATTEMPTS`; the rejected intent stays parked until an explicit new Save so the
      phase-only writer cannot bypass it. Account/revision guards also cover each write stage.
      Device refusals and relay failures are visible on either screen.
    - This queue is **not** `ChargePhaseWriter`'s pending write and must not be merged with it: that
      one owes a single register value for the current phase and dies with the screen, this owes a
      whole save and outlives the process. They share only the online/focus trigger.

**NotificationsPage** (`/notifications`)
- *Active Now*: firing alarms (`alarmMessage`, severity, time). *History*: title, severity, device/station, dismiss (`isProcessed`), load-more.
- **One source with the bell (v4.15.1).** Every device's firing alarms live in `firingAlarmsStore`
  (`src/stores/firingAlarmsStore.ts`), fed by each `/state/latest` read (`deviceStore.loadDeviceState`,
  DevicePage's poll) and refreshed for all devices on entering this page (`refreshFiringAlarms`). The
  list renders `visibleAlarmEntries()` and the Device page bell counts `unreadAlarmCount()` over the same
  entries, so a lit dot always has a row, each row names its device, and opening the list marks them all
  seen. It used to list only the selected device, which left the dot lit over "You're all caught up".
  Dismissals are synced only for devices this refresh heard from. A failed read shows the normal page
  (v4.18.0: no "Something went wrong" / Retry screen); the next refresh fills it.

**DataExportPage** (`/data-export`)
- *Privacy notice*, *JSON/CSV export*, *recycle bin*, *analytics toggle*, legal links.

**PassthroughPage** (`/device/:id/passthrough`)
- *Preset groups* (Read Data / Switch Control / Parameter Settings), *charge-power settings*, *custom hex frame*, *parsed params groups*, *TX/RX log*.

**DebugParamsPage** (`/device/:id/debug-params`) — raw register names (exempt from canon)
- Device meta; 7 param groups (Charge/Capacity, Power, Voltage/Freq, Temperature, Energy Stats, Switch State, Mode/Version); UI-derived rows (netChargeW, capacity Wh, remaining Wh, **Battery Time** via `batteryTimeLabel`); history stats; raw API field dump.

## UI metric label conventions (user-facing display text)
Same metric → same label across all rendered pages (DebugParamsPage is exempt — it intentionally
shows raw register names):
| Metric | Canonical label | Unit |
|---|---|---|
| Battery state of charge | **Battery** | % |
| Battery charge/discharge power | **Battery Power** | W |
| AC/grid input power | **AC** | W |
| Solar/PV input power | **Solar** | W |
| Load/output power | **Output** | W |
| Battery temperature | **Temperature** (via `formatTemp(c,'F')`) | °F |
| Nameplate capacity | **Rated Capacity** | kWh |
| Nameplate output power | **Rated Output Power** | W |
| Nameplate voltage | **Rated Voltage** | V |
| Battery usage cycles | **Cycles** | — |
| Device serial | **Serial Number** (no row rendered since v4.18.0) | — |
| Bluetooth module id | **Bluetooth ID** | — |

## Backend API parameter conventions (`src/api/`)
Canonical names/types for request payloads & query params. Keep these consistent:
- **Device id**: field name `deviceId` in queries, `id` in device CRUD payloads. ALWAYS send as
  `String(...)` (Java `Long`, exceeds JS safe-int). Responses return ids as strings already.
- **Station id**: `stationId` (String). **DTU id**: `dtuId` (String).
- **User id**: `userId`, a **string** big-integer (e.g. `"491513787113766912"`) — it exceeds
  JS safe-int, so never coerce it to `number`. Stored in `localStorage['iot_user_id']`; source of
  truth is the login response `LoginData.userId`. Send it as a **string everywhere**, `/login/logout`
  included — a real id is 18 digits and `Number()` rounds it to a different account.
- **Display name**: the field is **`name`**, not `nickname`. `/user/select/iotUserInfo` returns
  `name` and has no `nickname`; `/user/update/iotUserInfo` takes `{ id?, iconResid?, name }` and
  answers 20101 "illegal argument" for anything else. Renaming was sent as `nickname` from the first
  wiring and failed for months; two attempted fixes moved `userId` around, which was never the cause.
- **`/user/select/iotUserInfo`** also returns `createdAt` and `lastLoginTime`, which is how
  `isFirstRunAccount` decides whether onboarding should run — comparing the two to each other, not to
  the clock, because the backend sends them without a zone.
- **Token**: only via `tokenStore` (`iot_access_token` / `iot_refresh_token`); header is `IOT-Token`
  (not `Authorization`). Login endpoints use `api.postSkipAuth`.
- **Password**: always `md5Password()` before send. Fields: `password` (login/register),
  `oldPassword`/`newPassword` (change password).
- **Captcha**: response field is `iotCaptchaId`; request field is `captchaId` (pass the received
  `iotCaptchaId` value as `captchaId`). The code field is `verifyCode` on login/register/reset,
  but the **update** endpoints prefix it with the channel: `/user/update/iotUserEmail` takes
  `emailVerifyCode`, `/user/update/iotUserCellphone` and `/user/update/cellphoneVerify` take
  `smsVerifyCode`. Sending the plain `verifyCode` is what made every email change answer 20101.
- **Captcha intent**: use the `CaptchaIntent` enum (`'1'`=register `'2'`=reset `'6'`=email login `'5'`=SMS login `'4'`=update email). Do **not** use `'3'` for login.
  The sign-in screen has no session, so it cannot pre-check whether an address is registered —
  it asks for a LOGIN code and lets the refusal correct it (`src/utils/captchaIntent.ts`). Every
  "no such account" phrasing the backend uses must live in that file's `NOT_REGISTERED`, and both
  callers go through `saysNoSuchAccount()` — they were two regexes once, disagreed about
  **`account error`**, and new sign-ups died on the one that did not know it. Never match a bare
  `账号`: it also appears in `账号已注册`, and flipping a registered address to REGISTER mails them
  a sign-up code, because that send SUCCEEDS.
- **Email captcha quirk**: `/user/send/email/captcha` expects field **`address`**, not `email`.
- **Country code**: always `normalizeCountryCode()` (strip leading `+`) before send.
- **Pagination**: `page` (1-based) + `count` per page across all list endpoints.
- **Success check**: backend `code` may be number `0` or string `'0'` — use `isApiSuccess(code)`
  from `apiClient.ts`; do not hand-roll `code === 0 || code === '0'` in new code.

---

## Documentation map
This file is the always-current source of truth for architecture/routes/conventions. Other docs go
deeper on a specific concern — keep each one scoped to its purpose instead of letting facts drift
into duplicates (v4.0.0 deleted three docs — `API_STATUS.md`, `QA_TEST_REPORT.md`,
`TEST_CHECKLIST.md` — whose entire content had quietly become "already fixed" without being updated;
don't let it happen again):

| File | Purpose |
|---|---|
| `docs/PRODUCT_SPEC.md` | Deep implementation reference (store shapes, per-page `useState`/`useEffect`, IndexedDB schema) — CLAUDE.md wins on routes/pages if they ever disagree. |
| `docs/RELEASE_PLAN.md` | P0–P4 issue tracker: what's fixed (✅ + version tag), what's still debt/pending. Update in place, don't leave stale "still TODO" claims once something ships. |
| `docs/siseli-api.md` | Captured Solar of Things console call for a device's attribute history (`keys/history/v1`, columnar reply) — what Real-Time Power reads. |
| `docs/siseli-firmware-api.md` | Captured firmware / upgrade endpoints (firmware list & details, upgrade tasks, logs, batch upgrades, permission, the console's upgrade wizard) and what is still needed before the app's Firmware Update (v4.20.0, flag-gated) can be released. |
| `docs/DEVICE_PROGRAM.md` | Smart Schedule / Charging Settings / Silent Mode / Limits (v4.22.0): data model, rules, relay API and tick, and what still needs the firmware team. |
| `docs/TEST_PLAN.md` | The one canonical manual+automated test matrix (supersedes the deleted `TEST_CHECKLIST.md`). |
| `API_REFERENCE.md` | Full backend API surface (all 41 groups/227 endpoints Sierro's own backend exposes), not just what this app calls — a superset reference. |
| `docs/NATIVE_SETUP.md` | Capacitor native plugin/permission setup for Android/iOS builds. |
| `docs/RELEASE_SIGNING.md` / `docs/PLAY_SUBMISSION.md` | Store submission mechanics (signing, Play Console form answers). |
| `server/README.md` | A separate, optional reference push-relay backend in `server/` — not the main API. |
| `docs/AWS_RELAY_AND_PUSH.md` | How the self-hosted relay is deployed on AWS (EC2 + CloudFront) and how background push (Outage/Low Battery/Solar over Web Push/FCM/APNs) + closed-app Sleep scheduling work end-to-end, incl. the SSM ops runbook and credential model. |
