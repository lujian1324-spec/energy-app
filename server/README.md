# Sierro Push Relay (reference backend)

> The Sierro app's main data API is a **third-party server** (`solar.siseli.com`)
> that this repo does not control. This `server/` is a **standalone, deployable
> reference** for the *push* part only: it stores the device tokens the app
> uploads and fan-outs alerts over Web Push / FCM / APNs. Deploy it yourself and
> point the app's push endpoints at it (they already match the paths below).

## Endpoints (already called by the app — see `src/config/webPush.ts`)
| Method | Path | Body |
|---|---|---|
| POST | `/notification/webpush/subscribe` | `{ endpoint, p256dh, auth, userId, refreshToken?, prefs? }` |
| POST | `/notification/webpush/unsubscribe` | `{ endpoint, userId }` |
| POST | `/notification/nativepush/register` | `{ token, platform, userId }` |
| POST | `/notification/nativepush/unregister` | `{ token, userId }` |
| POST | `/schedule` | `{ userId, deviceId, schedule, refreshToken?, accessToken?, accessExpiresAt? }` |
| POST | `/notify` *(internal)* | `{ userId, title, body, data? }` + header `X-Internal-Key` |
| GET  | `/health` | — |

All success responses use `{ code: 0 }` (matches the app's `isApiSuccess`).

`refreshToken` + `prefs` on subscribe are what the built-in **poller** needs (see
below). They're optional — without them the relay is a pure fan-out and something
else must call `/notify`.

## Built-in poller (closed-app delivery)
The official `solar.siseli.com` backend has **no push API** and stops nothing when
the app is killed, so this relay ships an in-process **poller** (`poller.js`) that
makes closed-app alerts actually work:

- On subscribe, the app uploads each user's IoT **refreshToken** + push **prefs**
  (`pushNotifications` / `pushLowBattery` / `lowBatteryThreshold` / `pushSolarStatus`).
  The refresh token is **encrypted at rest** (AES-256-GCM, `TOKEN_ENC_KEY`).
- Every `POLL_INTERVAL_MS` the poller, per user: refreshes an access token
  (`/login/refresh/access/token`, persisting any rotation), lists devices, reads
  `/remote/device/state/latest`, and runs the same detection rules as the app
  (`detect.js`: outage / low battery / solar edge). New firings are pushed via
  `sendToUser()` (the same fan-out as `/notify`), with a 30-min per-device throttle.
- **Scaling:** users are polled through a bounded-concurrency pool (`POLL_CONCURRENCY`,
  default 25) so a tick finishes inside its window and upstream load stays capped.
  Polling is **adaptive** — online devices are read every tick, but offline devices,
  and all-offline users with no active schedule, drop to the `IDLE_POLL_MS` cadence
  (default 5 min), cutting the bulk of upstream calls for idle fleets. Sleep-schedule
  enforcement still runs every tick (it only calls the backend on a phase edge).
- Enable with `POLLER_ENABLED=true`. A user with no remaining subscriptions has
  their stored credentials pruned automatically.

> **Privacy:** enabling the poller means storing users' IoT refresh tokens
> server-side. Always set `TOKEN_ENC_KEY`, deploy over **HTTPS**, and keep
> `tokens.json` off any public path. Tokens are never logged.

## Server-side Sleep Mode scheduling (closed-app charge-power switching)
The official timed auto-instruction service (`/instruction/*`) is **manufacturer-disabled**
for Sierro (returns code 70247), so this relay does the scheduling itself — reusing the
same poller loop, session, and encrypted store:

- On saving Sleep Mode, the app `POST /schedule`s that device's window
  `{ enabled, sleepFrom, sleepTo, model, tz }` (IANA `tz`), optionally carrying the
  one-time poller-session bootstrap (same as subscribe). Client: `src/api/scheduleApi.ts`,
  enabled by `VITE_RELAY_URL`.
- Each poller tick, for every device with an enabled schedule, `sleepSchedule.js` computes
  the current phase (`sleep`/`wake`) **in the device's tz**; on a phase change it calls
  `/remote/device/config/write` with `ratedACChargingPower` = per-model watts
  (Sierro 1000 150/400, Sierro 2000 300/800). Edge-only (no repeat writes); a failed write
  (device offline) is retried next tick.
- Only works for **password-login** users (they have a hostable session). A user is kept
  from pruning while any schedule is enabled. This sets the **rated/persistent** AC charge
  power (≈Modbus `0x0024`), not the realtime `0x0085` the client scheduler uses.

Unit tests: `node --test server/detect.test.js server/sleepSchedule.test.js`.

## Run
```bash
cd server
npm install
cp .env.example .env      # fill in the channels you use
npm run keys:vapid        # → put public key in frontend VITE_VAPID_PUBLIC_KEY
npm start                 # listens on :8787
```

## Wiring
1. **Frontend** already POSTs subscriptions/tokens to these paths via
   `src/api/webPushApi.ts`. If this relay is not on the same origin as the
   main API, change the paths/base in `src/config/webPush.ts` accordingly, and
   set `VITE_VAPID_PUBLIC_KEY` at build time.
2. **Triggering alerts**: whatever watches device alarms (the siseli backend,
   or a small poller you run) calls `POST /notify` with the affected `userId`
   and message. This relay then delivers to every registered browser + phone.

## Channels (each optional — configure only what you need)
- **Web Push**: set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`.
- **FCM (Android)**: set `GOOGLE_APPLICATION_CREDENTIALS` to a Firebase
  service-account JSON; add `google-services.json` to the Android app.
- **APNs (iOS)**: set `APNS_KEY_PATH/KEY_ID/TEAM_ID/BUNDLE_ID`.

Dead tokens (HTTP 404/410 on Web Push) are auto-pruned. The token store is a
JSON file by default (`STORE_FILE`); replace `store.js` with a real DB for
production.
```
device alarm ──▶ POST /notify ──▶ ├─ web-push ─▶ browsers/PWA (sw-push.js)
                                  ├─ FCM ───────▶ Android app
                                  └─ APNs ──────▶ iOS app
```
