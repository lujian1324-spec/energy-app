/**
 * Sierro push relay (reference implementation).
 *
 * Implements the endpoints the app calls (see src/config/webPush.ts):
 *   POST /notification/webpush/subscribe      { endpoint, p256dh, auth, userId }
 *   POST /notification/webpush/unsubscribe    { endpoint, userId }
 *   POST /notification/nativepush/register    { token, platform, userId }
 *   POST /notification/nativepush/unregister  { token, userId }
 *
 * Plus an internal trigger the device backend (or a cron watching alarms) calls:
 *   POST /notify   { userId, title, body, data? }   (header: X-Internal-Key)
 *
 * Channels: Web Push (VAPID), FCM (Android), APNs (iOS). Each is optional —
 * only the channels you configure via env are used.
 *
 * A built-in poller (poller.js, gated by POLLER_ENABLED) runs in THIS process:
 * it watches every subscribed user's devices and calls sendToUser() directly, so
 * alerts reach a closed app even though the official backend has no push API.
 */
import express from 'express'
import cors from 'cors'
import webpush from 'web-push'
import {
  addWebPush, removeWebPush, addNative, removeNative, getWebPush, getNative,
  setUserAuth,
} from './store.js'
import { startPoller } from './poller.js'

const app = express()
app.use(cors())
app.use(express.json())

const ok = (res, data = {}) => res.json({ code: 0, message: 'ok', data })

// ── Web Push (VAPID) ─────────────────────────────────────────────────────────
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@sierro.app', VAPID_PUBLIC, VAPID_PRIVATE)
}

// ── FCM (Android) — lazy init ────────────────────────────────────────────────
let fcm = null
async function getFcm() {
  if (fcm !== null) return fcm
  try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) { fcm = false; return fcm }
    const admin = (await import('firebase-admin')).default
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault() })
    fcm = admin.messaging()
  } catch (e) { console.warn('[FCM] init failed:', e.message); fcm = false }
  return fcm
}

// ── APNs (iOS) — lazy init ───────────────────────────────────────────────────
let apnProvider = null
async function getApn() {
  if (apnProvider !== null) return apnProvider
  try {
    if (!process.env.APNS_KEY_PATH) { apnProvider = false; return apnProvider }
    const apn = (await import('@parse/node-apn')).default
    apnProvider = new apn.Provider({
      token: {
        key: process.env.APNS_KEY_PATH,
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID,
      },
      production: process.env.APNS_PRODUCTION === 'true',
    })
  } catch (e) { console.warn('[APNs] init failed:', e.message); apnProvider = false }
  return apnProvider
}

// ── Subscription endpoints (called by the app) ───────────────────────────────
app.post('/notification/webpush/subscribe', (req, res) => {
  const { endpoint, p256dh, auth, userId, refreshToken, accessToken, accessExpiresAt, prefs } = req.body || {}
  if (!endpoint) return res.status(400).json({ code: 1, message: 'endpoint required' })
  addWebPush(userId, { endpoint, keys: { p256dh, auth } })
  // Store the dedicated poller session (access + refresh pair) + push prefs so the
  // poller can watch this user's devices while the app is closed. Refresh token is
  // encrypted at rest (store.js). accessToken lets the poller work ~2h before it
  // needs to refresh (which requires the pair).
  if (refreshToken || accessToken || prefs) setUserAuth(userId, { refreshToken, accessToken, accessExpiresAt, prefs })
  ok(res)
})
app.post('/notification/webpush/unsubscribe', (req, res) => {
  removeWebPush(req.body?.userId, req.body?.endpoint)
  ok(res)
})
app.post('/notification/nativepush/register', (req, res) => {
  const { token, platform, userId } = req.body || {}
  if (!token) return res.status(400).json({ code: 1, message: 'token required' })
  addNative(userId, token, platform === 'ios' ? 'ios' : 'android')
  ok(res)
})
app.post('/notification/nativepush/unregister', (req, res) => {
  removeNative(req.body?.userId, req.body?.token)
  ok(res)
})

// ── Fan-out core: push an alert to a user across all their channels ───────────
// Shared by the /notify route and the in-process poller.
export async function sendToUser(userId, { title = 'Sierro', body = '', data = {} } = {}) {
  const results = { webpush: 0, fcm: 0, apns: 0, errors: [] }

  // Web Push
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    const payload = JSON.stringify({ title, body, data })
    for (const sub of getWebPush(userId)) {
      try { await webpush.sendNotification(sub, payload); results.webpush++ }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) removeWebPush(userId, sub.endpoint); else results.errors.push('web:' + e.message) }
    }
  }
  // Native
  const natives = getNative(userId)
  const android = natives.filter(t => t.platform === 'android').map(t => t.token)
  const ios = natives.filter(t => t.platform === 'ios').map(t => t.token)

  if (android.length) {
    const m = await getFcm()
    if (m) {
      try {
        const r = await m.sendEachForMulticast({ tokens: android, notification: { title, body }, data: stringifyData(data) })
        results.fcm = r.successCount
      } catch (e) { results.errors.push('fcm:' + e.message) }
    }
  }
  if (ios.length) {
    const provider = await getApn()
    if (provider) {
      try {
        const apn = (await import('@parse/node-apn')).default
        const note = new apn.Notification()
        note.alert = { title, body }
        note.topic = process.env.APNS_BUNDLE_ID || 'com.sierro.energyapp'
        note.sound = 'default'
        note.payload = data
        const r = await provider.send(note, ios)
        results.apns = r.sent.length
      } catch (e) { results.errors.push('apns:' + e.message) }
    }
  }
  return results
}

// ── Internal trigger: push an alert to a user across all their devices ────────
app.post('/notify', async (req, res) => {
  if (process.env.INTERNAL_KEY && req.get('X-Internal-Key') !== process.env.INTERNAL_KEY) {
    return res.status(401).json({ code: 1, message: 'unauthorized' })
  }
  const { userId, title, body, data } = req.body || {}
  const results = await sendToUser(userId, { title, body, data })
  ok(res, results)
})

function stringifyData(d) {
  const out = {}
  for (const [k, v] of Object.entries(d || {})) out[k] = typeof v === 'string' ? v : JSON.stringify(v)
  return out
}

app.get('/health', (_req, res) => ok(res, { up: true }))

const PORT = process.env.PORT || 8787
app.listen(PORT, () => {
  console.log(`[push] listening on :${PORT}`)
  // Start the in-process poller (closed-app delivery). Off unless POLLER_ENABLED=true.
  if (process.env.POLLER_ENABLED === 'true') startPoller(sendToUser)
  else console.log('[poller] disabled (set POLLER_ENABLED=true to enable)')
})
