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
| `/smart-schedule` | `SmartSchedulePage` | no | Peak-shaving UI |
| `/notifications` | `NotificationsPage` | no | Alarm center |
| `/onboarding` `/ble-debug` `/data-export` | `OnboardingPage` `BleDebugPage` `DataExportPage` | no | |

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
- **Today's history (v4.17.0).** `useHistoryFetcher(id, dayStart, dayEnd, { live: true })` reads
  `POST /deviceState/attribute/record/list` the way the Siseli client's `doGetDeviceHistory` does
  (`deviceId`, `fromTime`/`toTime` as local ISO **with offset** via `toIsoTz` in
  `src/utils/historyPoints.ts`, `orderByTimeAsc: true`, `count: 80`, every page until a short one).
  Tabs → fields: Battery `remainingBatteryCapacity`, AC (input) `exchangeChargingPower`, Solar
  `generationPower`, Output (AC output) `outputPower`. A missing field is `null` and a silence longer
  than `maxGapMs()` (3× cadence, 15–60 min) breaks the line — never 0 W, never a bridge. The tail is
  re-read every 60 s while visible; the day rolls over at midnight. The old formatter dropped the `-`
  west of UTC (`…T00:00:0007:00`), so every US user got 20101 and an empty chart.
  **Cache:** IndexedDB `device_history` (DB v5), keyed `[deviceId, timestamp]`, paints first only —
  the full day is re-read from the server on every visit and replaces it. It used to end the fetch
  (curve frozen at the first visit) and to read guest-simulator rows with no `deviceId` as every
  device's; v5 clears that legacy `power_history`. `deviceStore.exitDemoMode` (sign-in and
  sign-out) clears the cache.

**DeviceDetailPage** (`/device/:id/settings` — Device Info)
- *Name edit*, *icon picker*.
- *Device Info*: model, **Serial Number** (`serialNumber`), **Rated Capacity** (`acInvOutputPower×2`, Wh→kWh), **Rated Output Power** W (`ratedPower`), **Rated Voltage** 120V (fixed), **Cycles** (`numberOfBatteryUsageCycles`), **Temperature** °F (`batteryTemp`), Wi-Fi (`isOnline`), firmware (`softwareVersion`).
- *Sleep Mode editor* (`sleepFrom`/`sleepTo` + scheduler), *Battery Priority sheet* (Backup 100% / Savings 60%), *delete dialog*.
  Saving Sleep Mode claims the device for `sleep` (SW-12 — see Smart Schedule below), which disarms
  Smart Schedule's window, and reports a relay that refused the upload instead of dropping it.
- **Battery Priority control path (v4.14.0, SW-09): Modbus passthrough only, no `workMode` write.**
  Save goes through `applyBatteryPriority()` (`src/api/batteryPriorityControl.ts`) and makes exactly two
  `POST /remote/device/passthrough` writes, in order: **0x0086** (`PV_BATT_PRIORITY`) then **0x0054**
  (`PV_BATT_PRIORITY_MIN_SOC`, a **percent**) —
  Savings → `0x01AA` + `60`, Backup → `0xAA01` + `100` (not 1000).
  Both count: a refused 0x0054 leaves the old reserve in place, so it is reported as a failure, the row
  rolls back and the sheet stays open. `setWorkMode()` in `deviceApi.ts` is untouched and simply no
  longer called from this sheet, so the cloud `workMode` field keeps whatever the backend already holds;
  there is therefore no cloud echo to poll, and after a successful save the row shows what was written
  to 0x0086/0x0054 for the rest of the visit. (On re-entry `resolveBatteryPriority` still lets a
  device-reported `workMode` of 1/2 win — SW-04's rule, deliberately left alone here.)
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
  series, tap/drag to read a bucket (the reading stays). Built by `buildInsightsFrame()`
  (`src/utils/insightsFrame.ts`): per-bucket **energy in Wh**, integrating each sample's power until the next
  (held at most `sampleHoldCapMs` = 3× the device's typical gap, 15–60 min, so silence is not credited);
  **input = Solar (`generationPower`) + AC (`exchangeChargingPower`)** — AC used to be ignored — and the
  tooltip lists Solar / AC only for a bucket where that source delivered. Buckets with no samples (and
  future ones) are `null` → gaps, never 0. CO₂ counts **solar only**. Insight: "Highest daily output this
  week/month: {date}". History is paged until a short page (cap 200 × 300); a failed later page or the cap
  shows "Some history … couldn't be loaded" instead of silently short totals (APP-20260923-006/007/008/009).
- (Battery Health card removed.)

**SettingPage** (`/setting`)
- *Profile card*: avatar, name, account action, Founding Member tag. The tag and the matching
  pill on `ProfileEditPage` are **not tappable** — membership comes from the VIP roster at
  sign-up, so there is nothing to open. The Founder Badge modal and the Redeem Founder Badge
  sheet were removed with `activateFounderBadge()`: it generated the number from the clock,
  could hand two people the same badge, and redeeming as a real member would overwrite their
  roster number with a made-up one. `applyFoundingMember()` is now the only writer.
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

**SmartSchedulePage** (`/smart-schedule`)
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
  Dismissals are synced only for devices this refresh heard from; if reads failed and nothing is listed,
  the page shows "Something went wrong" + Retry, never "all caught up".

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
| Device serial | **Serial Number** | — |

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
| `docs/TEST_PLAN.md` | The one canonical manual+automated test matrix (supersedes the deleted `TEST_CHECKLIST.md`). |
| `API_REFERENCE.md` | Full backend API surface (all 41 groups/227 endpoints Sierro's own backend exposes), not just what this app calls — a superset reference. |
| `docs/NATIVE_SETUP.md` | Capacitor native plugin/permission setup for Android/iOS builds. |
| `docs/RELEASE_SIGNING.md` / `docs/PLAY_SUBMISSION.md` | Store submission mechanics (signing, Play Console form answers). |
| `server/README.md` | A separate, optional reference push-relay backend in `server/` — not the main API. |
| `docs/AWS_RELAY_AND_PUSH.md` | How the self-hosted relay is deployed on AWS (EC2 + CloudFront) and how background push (Outage/Low Battery/Solar over Web Push/FCM/APNs) + closed-app Sleep scheduling work end-to-end, incl. the SSM ops runbook and credential model. |
