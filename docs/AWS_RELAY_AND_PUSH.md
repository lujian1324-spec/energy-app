# AWS Relay & Push Notifications

How Sierro Energy App delivers **background** notifications and **closed‑app Sleep‑Mode
scheduling** through a self‑hosted relay deployed on AWS.

> **Why a relay at all?** The official backend (`solar.siseli.com`) has **no push API**,
> and its timed device‑automation service (`/instruction/*`) is **manufacturer‑disabled**
> for Sierro (returns `70247 "manufacturer have been close instructionOpen"`). So a small
> self‑hosted service (`server/`) polls each user's devices and fans alerts out over
> Web Push / FCM / APNs — and, on the same schedule, writes Sleep‑Mode charge power.

---

## 1. Architecture at a glance

```
 App (PWA / Android / iOS)                         AWS
 ─────────────────────────                ───────────────────────────────
  Settings push toggles                    CloudFront (HTTPS, *.cloudfront.net)
  register token + poller session  ──────▶   d1qw91oh1yc80u.cloudfront.net
  (VITE_RELAY_URL)                             │  (origin: HTTP :8787, locked to
                                               │   CloudFront prefix list only)
                                               ▼
                                          EC2 t3.micro (Amazon Linux 2023)
                                          systemd: sierro-relay  ── node server/index.js
                                               │
                                   ┌───────────┼─────────────────────────┐
                                   ▼           ▼                         ▼
                             poller (60s)   token store            push fan‑out
                             detect.js      tokens.json            sendToUser()
                             per user       AES‑256‑GCM             ├─ Web Push (VAPID)
                             reads device   (TOKEN_ENC_KEY)         ├─ FCM  → Android
                             state, rules                          └─ APNs → iOS
                                   │                                     │
                                   ▼                                     ▼
                        official backend                         Google / Apple
                        /remote/device/state/latest              → user's phone
```

**Two features share this one relay and one poller:**
1. **Push notifications** — Power Outage / Low Battery / Solar Status (this doc's focus).
2. **Sleep‑Mode scheduling** — writes AC charge power at sleep/wake times even when the
   app is closed. See §8 and `docs/` changelog; the code lives in `server/sleepSchedule.js`
   + `server/poller.js`.

---

## 2. AWS deployment inventory

| Resource | Value / ID | Notes |
|---|---|---|
| Account / region | `515966500322` / `us-east-1` | Root login; auth via `aws login` (Agent Toolkit, 12h session) |
| EC2 instance | `i-052a1b0ad347ceb16` | `t3.micro`, Amazon Linux 2023, Node **v18.20.8** |
| Elastic IP | `52.86.70.136` | Origin; **:8787 reachable only from CloudFront** |
| Security group | `sg-08a45f660755b9758` | Ingress `tcp/8787` restricted to CloudFront prefix list `pl-3b927c52` |
| CloudFront | `E2NR4H895T17T4` → **`https://d1qw91oh1yc80u.cloudfront.net`** | Free HTTPS on the default `*.cloudfront.net` cert |
| IAM role / profile | `sierro-relay-role` / `sierro-relay-profile` | Enables **SSM** (no SSH; all admin via Run Command) |
| App directory | `/opt/sierro-relay` | Full repo checkout; service runs from `/opt/sierro-relay/server` |
| systemd unit | `sierro-relay.service` | `ExecStart=/usr/bin/node index.js`, `Restart=always` |

**Why EC2 + CloudFront (not App Runner):** AWS App Runner stopped accepting new customers
on 2026‑04‑30. CloudFront gives free HTTPS on a `*.cloudfront.net` hostname without owning
a domain; the EC2 origin stays HTTP‑only on `:8787` and is firewalled to CloudFront so it
can't be hit directly.

> **Secrets are never in this repo or in these IDs.** The only things that grant access
> (AES key, APNs `.p8`, Firebase service‑account, users' refresh tokens) live **only on the
> instance** (see §5). Knowing an instance/EIP is useless: SSH is off and the port is
> CloudFront‑locked.

---

## 3. The relay service (`server/`)

Node + Express, file‑backed store, no database. Started by systemd; poller runs in‑process.

### HTTP endpoints (`server/index.js`)
| Method + path | Purpose |
|---|---|
| `GET  /health` | Liveness — `{code:0, message:"ok", data:{up:true}}` |
| `POST /notification/webpush/subscribe` | Web Push subscription `{endpoint, p256dh, auth, userId}` + poller session + prefs |
| `POST /notification/webpush/unsubscribe` | Remove a Web Push subscription |
| `POST /notification/nativepush/register` | **Native token** `{token, platform:'ios'\|'android', userId, refreshToken, accessToken, accessExpiresAt, prefs}` — stores token **and** seeds the poller session + prefs |
| `POST /notification/nativepush/unregister` | Remove a native token |
| `POST /schedule` | Sleep‑Mode window `{deviceId, enabled, sleepFrom, sleepTo, model, tz}` |
| `POST /notify` | Internal fan‑out entry used by the poller / manual tests |

### Poller (`server/poller.js`)
- Runs every `POLL_INTERVAL_MS` (**60 s**). For each subscribed user it refreshes the
  access token, reads every device's `/remote/device/state/latest`, and applies the
  detection rules.
- **Edge + throttle:** a notification fires only on a `false → true` transition **and** at
  most once per **30 min** per device/type (`RENOTIFY_THROTTLE_MS`).
- Also enforces Sleep‑Mode schedules on the same tick.

### Detection rules (`server/detect.js`) — the three alarms
| Alarm | Rule | Pref gate |
|---|---|---|
| **Power Outage** | any field in `POWER_OUTAGE_KEYS` is "on" (exact key match; device must be `isOnline`) | `pushNotifications` |
| **Low Battery** | `remainingBatteryCapacity` (SOC) `< threshold` (default 30) | `pushLowBattery` + `lowBatteryThreshold` |
| **Solar Status** | `generationPower` crosses 0 (edge) | `pushSolarStatus` |
| *(other cloud alarms)* | any firing alarm not covered above | `pushDeviceAlarms` |

### Fan‑out (`server/index.js` `sendToUser()`)
Three optional channels, each auto‑disabled if its credential is absent:
| Channel | Enabled when… | Target |
|---|---|---|
| **Web Push** | `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` set | Browser / installed PWA |
| **FCM** (`firebase-admin`) | `GOOGLE_APPLICATION_CREDENTIALS` set | **Android** |
| **APNs** (`@parse/node-apn`) | `APNS_KEY_PATH` set | **iOS** |

### Token store & encryption (`server/store.js`, `server/crypto.js`)
- Subscriptions/tokens/sessions persist in `tokens.json`.
- Each user's **refresh token is encrypted at rest with AES‑256‑GCM** using `TOKEN_ENC_KEY`.
- Users with no remaining subscription/schedule are pruned.

---

## 4. Why "password login only"

Background polling needs a **hostable, independently‑refreshable session**. Backend refresh
tokens are single‑use (rotating one invalidates the app's own session), but one account
supports multiple concurrent sessions — so at **password login** the app mints a *second*
session just for the poller (`authApi.provisionPollerSession`, stored one‑time in
`localStorage['iot_poller_refresh_pending']`) and hands the relay only that token. The relay
then owns and rotates it.

➡️ **Email / SMS‑code logins have no password to mint a second session, so those users get
foreground notifications only.** Same constraint applies to Sleep‑Mode scheduling.

---

## 5. Credentials & secrets (never committed)

| Secret | Where it lives | Set via |
|---|---|---|
| `TOKEN_ENC_KEY` (AES‑256) | systemd unit env on the instance | Set at provisioning |
| **APNs** `.p8` + `APNS_KEY_ID` / `APNS_TEAM_ID` | `.p8` at `/opt/sierro-relay/AuthKey_<KeyID>.p8` (600); IDs in systemd drop‑in | SSM upload |
| **FCM** service‑account JSON | `/opt/sierro-relay/firebase-service-account.json` (600) | SSM upload |
| Users' refresh tokens | `tokens.json` (AES‑encrypted) | Runtime |
| `google-services.json` (Firebase **client** config — not secret, but kept out of git) | `android/app/google-services.json` | CI secret `GOOGLE_SERVICES_JSON_BASE64` or dropped locally |

`.gitignore` blocks `*.p8`, `firebase-service-account.json`, `android/app/google-services.json`,
and all keystores/certs. **Never** print these values or commit them.

### systemd environment (current)
```ini
# /etc/systemd/system/sierro-relay.service
Environment=POLLER_ENABLED=true
Environment=PORT=8787
Environment=POLL_INTERVAL_MS=60000
Environment=TOKEN_ENC_KEY=<secret>

# /etc/systemd/system/sierro-relay.service.d/override.conf   (drop-in)
[Service]
Environment=GOOGLE_APPLICATION_CREDENTIALS=/opt/sierro-relay/firebase-service-account.json
# APNs (pending) — add when the .p8 is provided:
# Environment=APNS_KEY_PATH=/opt/sierro-relay/AuthKey_<KeyID>.p8
# Environment=APNS_KEY_ID=<10-char key id>
# Environment=APNS_TEAM_ID=<10-char team id>
# Environment=APNS_BUNDLE_ID=com.sierro.energyapp
# Environment=APNS_PRODUCTION=false        # sandbox for Xcode dev builds
```

---

## 6. Client wiring

| Build flag | Set in | Effect |
|---|---|---|
| `VITE_RELAY_URL` | deploy / android / android‑release / ios workflows = `https://d1qw91oh1yc80u.cloudfront.net` | Where native/web push + `/schedule` are sent (`src/config/scheduling.ts`) |
| `VITE_PUSH_ENABLED` | all production builds = `true` | Shows the Settings push section; requests OS notification permission |
| `VITE_NATIVE_PUSH_READY` | **iOS**: `true` (`ios.yml`). **Android**: only `true` when the `GOOGLE_SERVICES_JSON_BASE64` secret is present | Gates `PushNotifications.register()` — off without native config so it can't crash |

- Native tokens are sent **to the relay** (not the official API) and tagged per platform by
  `registerNativePushToken()` (`Capacitor.getPlatform()` → `'ios'` / `'android'`).
- Flipping a push toggle or the low‑battery threshold **re‑uploads prefs** on native
  (`nativePush.reuploadNativePushPrefs()` + `SettingPage`).
- **Android CI injection:** `android.yml` / `android-release.yml` decode
  `GOOGLE_SERVICES_JSON_BASE64` into `android/app/google-services.json` at build time and set
  the flag on. Without the secret, Android native push stays **off** (safe default).
- The Gradle project already applies the google‑services plugin *conditionally* when
  `google-services.json` exists (`android/app/build.gradle`), with the
  `com.google.gms:google-services` classpath in `android/build.gradle`.

---

## 7. Operations runbook (all via SSM Run Command — no SSH)

All commands target `--instance-ids i-052a1b0ad347ceb16 --region us-east-1` using
`AWS-RunShellScript`. First: `aws login` (session expires ~12h).

**Deploy latest relay code**
```bash
cd /opt/sierro-relay
git fetch origin <branch>:refs/remotes/origin/<branch>   # relay is a single-branch clone
git checkout -B <branch> origin/<branch>
npm install --omit=dev                                    # in server/ if adding deps
systemctl restart sierro-relay
```

**Health & logs**
```bash
curl -s http://127.0.0.1:8787/health          # {"code":0,...}
systemctl is-active sierro-relay
journalctl -u sierro-relay -n 50 --no-pager
```

**Add a credential (FCM example)**
```bash
umask 077
echo '<base64 of service-account.json>' | base64 -d > /opt/sierro-relay/firebase-service-account.json
chmod 600 /opt/sierro-relay/firebase-service-account.json
mkdir -p /etc/systemd/system/sierro-relay.service.d
printf '[Service]\nEnvironment=GOOGLE_APPLICATION_CREDENTIALS=/opt/sierro-relay/firebase-service-account.json\n' \
  > /etc/systemd/system/sierro-relay.service.d/override.conf
systemctl daemon-reload && systemctl restart sierro-relay
```
> Upload secrets via the SSM command **parameters**, never echoed to logs; keep files `600`.

**Verify a push credential without a real device** (proves auth reaches Apple/Google)
```bash
# FCM  → expect messaging/invalid-argument (credential OK; only the fake token is bad)
cd /opt/sierro-relay/server
GOOGLE_APPLICATION_CREDENTIALS=/opt/sierro-relay/firebase-service-account.json \
node -e "const a=require('firebase-admin');a.initializeApp({credential:a.credential.applicationDefault()});a.messaging().send({token:'FAKE'}).catch(e=>console.log((e.errorInfo&&e.errorInfo.code)||e.code))"

# APNs → expect BadDeviceToken (credential OK; only the fake token is bad)
```

---

## 8. Sleep‑Mode scheduling (same relay, shared poller)

On saving Sleep Mode the app POSTs the device window to `/schedule`; each poller tick
computes the current phase in the device's IANA timezone (`server/sleepSchedule.js`) and,
on a phase change, writes charge power (Sierro 1000 = 150 W sleep / 400 W wake; Sierro
2000 = 300 W sleep / 800 W wake). Client scheduler (`useSleepModeScheduler.ts`) stays as
instant feedback + fallback.

> **Known issue (tracked separately):** the relay currently writes via
> `/remote/device/config/write ratedACChargingPower`, which live testing showed is a
> **no‑op** on the device (`Success` returned but value unchanged). The fix is to switch to
> **Modbus passthrough 0x0085** (FC06 + CRC16 → base64 → `/remote/device/passthrough`),
> the same register the client already pokes. Not yet applied.

---

## 9. Current status

| Piece | Status |
|---|---|
| Relay deployed (EC2 + CloudFront), `/health` ok, poller running | ✅ |
| Register endpoint stores poller session + prefs (v4.7.1, `feat/ios-push-relay`) | ✅ |
| **T0 scaling** — bounded poller concurrency (`POLL_CONCURRENCY`) + adaptive idle backoff (`IDLE_POLL_MS`); holds to ~1000 users on t3.micro | ✅ deployed (452afda) |
| **FCM (Android)** credential configured + validated (`messaging/invalid-argument` on fake token) | ✅ |
| Client: Android native‑push flag + CI `google-services.json` injection (v4.7.1) | ✅ committed |
| **APNs (iOS)** credential (`.p8` + Key ID + Team ID) | ⏳ pending user `.p8` |
| Android APK build + on‑device E2E | ⏳ needs `GOOGLE_SERVICES_JSON_BASE64` repo secret + CI run |
| Merge `feat/ios-push-relay` → `main` (go‑live for all users) | ⏳ needs explicit authorization |
| Sleep‑Mode passthrough‑0x0085 write fix | ⏳ separate task |

---

## 10. Limitations

- **Password‑login users only** for background delivery (see §4).
- **iOS = sandbox APNs** (`aps-environment=development`, Xcode dev signing). TestFlight /
  App Store need `aps-environment=production` + `APNS_PRODUCTION=true` + full signing.
- Device must be **online and reporting** (outage additionally requires `isOnline`).
- Single relay instance / file store (`tokens.json`) — with **T0 scaling** applied
  (bounded concurrency + adaptive polling) a t3.micro tick stays inside its 60 s window
  up to ~1000 users; beyond that, **T1** (SQLite/Redis store + multi-instance HA) is
  the next step (deferred for now).

---

*See also:* `server/README.md` (relay reference), `docs/NATIVE_SETUP.md` (Capacitor native
setup), `API_REFERENCE.md` §40 (retired `/instruction/*` findings), and `src/version.json`
changelog for the push/scheduling history.
