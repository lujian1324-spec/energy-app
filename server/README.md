# Sierro Push Relay (reference backend)

> The Sierro app's main data API is a **third-party server** (`solar.siseli.com`)
> that this repo does not control. This `server/` is a **standalone, deployable
> reference** for the *push* part only: it stores the device tokens the app
> uploads and fan-outs alerts over Web Push / FCM / APNs. Deploy it yourself and
> point the app's push endpoints at it (they already match the paths below).

## Endpoints (already called by the app — see `src/config/webPush.ts`)
| Method | Path | Body |
|---|---|---|
| POST | `/notification/webpush/subscribe` | `{ endpoint, p256dh, auth, userId }` |
| POST | `/notification/webpush/unsubscribe` | `{ endpoint, userId }` |
| POST | `/notification/nativepush/register` | `{ token, platform, userId }` |
| POST | `/notification/nativepush/unregister` | `{ token, userId }` |
| POST | `/notify` *(internal)* | `{ userId, title, body, data? }` + header `X-Internal-Key` |
| GET  | `/health` | — |

All success responses use `{ code: 0 }` (matches the app's `isApiSuccess`).

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
