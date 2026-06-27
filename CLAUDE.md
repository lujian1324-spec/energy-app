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
- **Red / Error** `#FF3530` — `*-danger`
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
| `/login` `/register` `/forgot-password` `/terms` `/privacy` | `LoginPage` `RegisterPage` `ForgotPasswordPage` `TermsPage` `PrivacyPage` | no | Auth — separate `AnimatePresence` branch |
| `/devices` | `DevicePage` | **yes** | Device list (default after login) |
| `/insights` | `StatsPage` | **yes** | Insights (`/stats` redirects here) |
| `/setting` | `SettingPage` | **yes** | Settings (`/settings` redirects here); `ProfileEditPage` is an overlay inside it |
| `/device/:id` | `DeviceMonitorPage` | no | Live monitor |
| `/device/:id/dashboard` | `OverviewPage` | no | Overview dashboard |
| `/device/:id/settings` | `DeviceDetailPage` | no | Device Info (live) |
| `/device/:id/passthrough` | `PassthroughPage` | no | Modbus passthrough |
| `/device/:id/debug-params` | `DebugParamsPage` | no | Developer debug view (raw register names — exempt from label canon) |
| `/smart-schedule` | `SmartSchedulePage` | no | Peak-shaving UI |
| `/notifications` | `NotificationsPage` | no | Alarm center |
| `/onboarding` `/ble-debug` `/data-export` | `OnboardingPage` `BleDebugPage` `DataExportPage` | no | |

Also present but not routed standalone: `ProvisioningPage` (inside DevicePage add-flow).
- Back navigation on secondary device pages must go to `/devices` via `navigate('/devices',{replace:true})`
  (plus popstate interceptor) — never `navigate(-1)` — to avoid history flicker. (Horizontal
  swipe-to-back was removed to prevent accidental navigation.)
- All non-auth routes share ONE `AnimatePresence`/`Routes` in `App.tsx` (with `initial={false}`).

### Cards & parameters per page (user-facing label → source field)
Use the label canon below; same metric = same label everywhere except DebugParamsPage.

**DevicePage** (`/devices`)
- *Device card* (per device): name, model (`gatherProtocolName`/`model`), **Battery** % (`remainingBatteryCapacity`), charging dot (`batteryPower>0`), online badge (`isOnline`), power toggle.
- *Low Battery banner*: name, `Battery below {lowBatteryThreshold}%`, remaining time (`batteryTimeLabel`).
- *Device params modal*: **Battery** % (`remainingBatteryCapacity`), **Battery Power** W (`batteryPower`), **AC** W (`acPower`), **Solar** W (`solarPower`), **Output** W (`outputPower`), **Temperature** °F (`batteryTemp`); port states (`acOut1/2Enable`,`usbOut1Enable`,`sleepMode`,`workMode`).

**OverviewPage** (`/device/:id/dashboard`)
- *Battery Hero*: ring **Battery** % (`remainingBatteryCapacity`), time to full/remaining (`batteryTimeLabel`); Input block **AC** W (`acPower`)+**Solar** W (`solarPower`), Output block **Output** W (`outputPower`); **Temperature** °F (`batteryTemp`).
- *Quick Controls*: Sleep Mode (`sleepMode`), Backup/Saving (`workMode`).
- *Ports*: AC Output 1/2 (`acOut1/2Enable`), USB (`usbOut1Enable`).
- *Energy Management*: Smart Schedule link.
- *Real-Time Power chart*: top-right badge = realtime value of selected tab (`battery/ac/solar/output` from 30s-polled `selectedDeviceState`); curve = **today's** API history via `useHistoryFetcher` (`batteryPower/exchangeChargingPower/generationPower/outputPower`), real-time X-axis (12am/4am/8am/12pm/4pm/8pm/12am), pinch/wheel zoom (min 1h) + pan.
- *Alerts panel*: firing alarms (`firingAlarms`) + history alarms.

**DeviceMonitorPage** (`/device/:id`)
- *SoC card*: ring **Battery** % (`remainingBatteryCapacity`), **AC** W, **Solar** W, **Output** W.
- *Real-Time Power chart*: badge + area chart, tabs battery/ac/solar/output, 12am–12am axis.

**DeviceDetailPage** (`/device/:id/settings` — Device Info)
- *Name edit*, *icon picker*.
- *Device Info*: model, **Serial Number** (`serialNumber`), **Rated Capacity** (`acInvOutputPower×2`, Wh→kWh), **Rated Output Power** W (`ratedPower`), **Rated Voltage** 120V (fixed), **Cycles** (`numberOfBatteryUsageCycles`), **Temperature** °F (`batteryTemp`), Wi-Fi (`isOnline`), firmware (`softwareVersion`).
- *Sleep Mode editor* (`sleepFrom`/`sleepTo` + scheduler), *Battery Priority sheet* (Backup 100% / Savings 60%), *delete dialog*.

**StatsPage** (`/insights`)
- *Header*: days-in-service (from `installedAt`).
- *Period selector* (Day/Week/Month/Range) + *date navigator*.
- *CO₂ card*: CO₂ reduced Kg + eco insight + formula.
- *Input vs. Output chart*: insight text; Week=bar pairs, Day/Month/Range=line w/ scrub tooltip (input/output kWh).
- (Battery Health card removed.)

**SettingPage** (`/setting`)
- *Profile card*: avatar, name, account action, founder badge.
- *Push Notifications*: Power Outage (`pushNotifications`), Low Battery (`pushLowBattery`)+threshold slider (`lowBatteryThreshold`), Solar Status (`pushSolarStatus`). Toggles drive Web Push enable/disable.
- *Feedback modal* (EmailJS), *Founder badge modal*, *data export*, legal links + version.

**SmartSchedulePage** (`/smart-schedule`)
- *Enable toggle*, *24h clock donut* (charge/discharge/idle arcs).
- *Peak/Off-peak cards*, *periods list* (`startTime–endTime`,`type`).
- *Prices*: peak/off-peak/part-peak $/kWh. *Params*: max charge/discharge W, min/max SOC %. *Estimated savings* daily/monthly/yearly.

**NotificationsPage** (`/notifications`)
- *Active Now*: firing alarms (`alarmMessage`, severity, time). *History*: title, severity, device/station, dismiss (`isProcessed`), load-more.

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
- **User id**: `userId`. Stored in `localStorage['iot_user_id']` as a string; source of truth is the
  login response `LoginData.userId`. Sent as a number only to `/login/logout`. **Do NOT send `userId`
  to `/user/update/iotUserInfo` or `/user/update/authPassword`** — those identify the user via the
  `IOT-Token` header and reject a body `userId` (binds to Java `Long` → "illegal argument").
- **Token**: only via `tokenStore` (`iot_access_token` / `iot_refresh_token`); header is `IOT-Token`
  (not `Authorization`). Login endpoints use `api.postSkipAuth`.
- **Password**: always `md5Password()` before send. Fields: `password` (login/register),
  `oldPassword`/`newPassword` (change password).
- **Captcha**: response field is `iotCaptchaId`; request field is `captchaId` (pass the received
  `iotCaptchaId` value as `captchaId`). Verification code field is always `verifyCode`.
- **Captcha intent**: use the `CaptchaIntent` enum (`'1'`=register `'2'`=reset `'3'`=login `'4'`=update email).
- **Email captcha quirk**: `/user/send/email/captcha` expects field **`address`**, not `email`.
- **Country code**: always `normalizeCountryCode()` (strip leading `+`) before send.
- **Pagination**: `page` (1-based) + `count` per page across all list endpoints.
- **Success check**: backend `code` may be number `0` or string `'0'` — use `isApiSuccess(code)`
  from `apiClient.ts`; do not hand-roll `code === 0 || code === '0'` in new code.
