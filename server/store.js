// Minimal file-backed token store (swap for a real DB in production).
// Shape: {
//   webpush: { [userId]: Subscription[] },
//   native:  { [userId]: {token, platform}[] },
//   users:   { [userId]: { refreshTokenEnc, accessToken?, prefs, notifyState, failCount, updatedAt } }
// }
// `users` powers the server-side poller (multi-tenant): the app uploads each
// user's refreshToken + push prefs on subscribe; the poller refreshes an access
// token per user and polls their devices. refreshToken is encrypted at rest.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { encryptToken, decryptToken } from './crypto.js'

const FILE = process.env.STORE_FILE || './tokens.json'

function load() {
  if (!existsSync(FILE)) return { webpush: {}, native: {}, users: {} }
  try {
    const db = JSON.parse(readFileSync(FILE, 'utf8'))
    db.webpush ||= {}; db.native ||= {}; db.users ||= {}
    return db
  } catch { return { webpush: {}, native: {}, users: {} } }
}
function save(db) { writeFileSync(FILE, JSON.stringify(db, null, 2)) }

const db = load()
const uid = (u) => String(u ?? 'anon')

// ── Web Push / Native token subscriptions ────────────────────────────────────
export function addWebPush(userId, sub) {
  const k = uid(userId)
  db.webpush[k] = (db.webpush[k] || []).filter(s => s.endpoint !== sub.endpoint)
  db.webpush[k].push(sub)
  save(db)
}
export function removeWebPush(userId, endpoint) {
  const k = uid(userId)
  db.webpush[k] = (db.webpush[k] || []).filter(s => s.endpoint !== endpoint)
  pruneUserIfNoSubs(k)
  save(db)
}
export function addNative(userId, token, platform) {
  const k = uid(userId)
  db.native[k] = (db.native[k] || []).filter(t => t.token !== token)
  db.native[k].push({ token, platform })
  save(db)
}
export function removeNative(userId, token) {
  const k = uid(userId)
  db.native[k] = (db.native[k] || []).filter(t => t.token !== token)
  pruneUserIfNoSubs(k)
  save(db)
}
export function getWebPush(userId) { return db.webpush[uid(userId)] || [] }
export function getNative(userId) { return db.native[uid(userId)] || [] }

// ── Poller auth (users) ──────────────────────────────────────────────────────
/** Store/refresh a user's IoT credentials + push prefs (called on subscribe). */
export function setUserAuth(userId, { refreshToken, accessToken, accessExpiresAt, prefs }) {
  const k = uid(userId)
  const prev = db.users[k] || {}
  db.users[k] = {
    ...prev,
    refreshTokenEnc: refreshToken ? encryptToken(refreshToken) : prev.refreshTokenEnc,
    accessToken: accessToken ?? prev.accessToken,
    accessExpiresAt: accessExpiresAt ?? prev.accessExpiresAt,
    prefs: prefs ?? prev.prefs ?? {},
    notifyState: prev.notifyState || {},
    failCount: 0,
    updatedAt: Date.now(),
  }
  save(db)
}
/** Persist rotated tokens after a poller refresh. */
export function updateUserTokens(userId, { refreshToken, accessToken, accessExpiresAt }) {
  const k = uid(userId)
  const u = db.users[k]
  if (!u) return
  if (refreshToken) u.refreshTokenEnc = encryptToken(refreshToken)
  if (accessToken) u.accessToken = accessToken
  if (accessExpiresAt) u.accessExpiresAt = accessExpiresAt
  u.failCount = 0
  u.updatedAt = Date.now()
  save(db)
}
/** Record a failed refresh; returns the running fail count. */
export function noteUserFailure(userId) {
  const k = uid(userId)
  const u = db.users[k]
  if (!u) return 0
  u.failCount = (u.failCount || 0) + 1
  save(db)
  return u.failCount
}
/** Drop a user's stored credentials (e.g. refresh permanently failing). */
export function removeUserAuth(userId) {
  delete db.users[uid(userId)]
  save(db)
}
/** All users with stored auth, refreshToken decrypted for immediate use. */
export function getAllUsers() {
  return Object.entries(db.users).map(([userId, u]) => ({
    userId,
    refreshToken: decryptToken(u.refreshTokenEnc),
    accessToken: u.accessToken,
    accessExpiresAt: u.accessExpiresAt,
    prefs: u.prefs || {},
    failCount: u.failCount || 0,
  }))
}
export function getUser(userId) {
  const u = db.users[uid(userId)]
  if (!u) return null
  return { userId: uid(userId), refreshToken: decryptToken(u.refreshTokenEnc), accessToken: u.accessToken, prefs: u.prefs || {} }
}

// ── Per-(device,type) notify throttle state (mirrors client 30-min throttle) ──
export function getNotifyTs(userId, deviceId, type) {
  const u = db.users[uid(userId)]
  return u?.notifyState?.[`${deviceId}|${type}`] ?? 0
}
export function setNotifyTs(userId, deviceId, type, ts) {
  const k = uid(userId)
  const u = db.users[k]
  if (!u) return
  u.notifyState ||= {}
  u.notifyState[`${deviceId}|${type}`] = ts
  save(db)
}

// Drop stored credentials once a user has no push subscriptions left at all,
// so we never retain a refresh token for someone who unsubscribed everywhere.
function pruneUserIfNoSubs(k) {
  const noWeb = !(db.webpush[k] && db.webpush[k].length)
  const noNative = !(db.native[k] && db.native[k].length)
  if (noWeb && noNative) delete db.users[k]
}
