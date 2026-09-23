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
export function requireUserId(u) {
  const s = u == null ? '' : String(u).trim()
  if (!s || s === 'anon' || s === 'undefined' || s === 'null') {
    const err = new Error('userId required')
    err.code = 'USER_ID_REQUIRED'
    throw err
  }
  return s
}

// ── Web Push / Native token subscriptions ────────────────────────────────────
export function addWebPush(userId, sub) {
  const k = requireUserId(userId)
  // A shared phone/browser belongs only to the most recently registered account.
  for (const owner of Object.keys(db.webpush)) {
    const previousCount = db.webpush[owner].length
    db.webpush[owner] = db.webpush[owner].filter(entry => entry.endpoint !== sub.endpoint)
    if (owner !== k && db.webpush[owner].length < previousCount) pruneUserIfNoSubs(owner)
  }
  db.webpush[k] ||= []
  db.webpush[k].push(sub)
  save(db)
}
export function removeWebPush(userId, endpoint) {
  const k = requireUserId(userId)
  db.webpush[k] = (db.webpush[k] || []).filter(s => s.endpoint !== endpoint)
  pruneUserIfNoSubs(k)
  save(db)
}
export function addNative(userId, token, platform) {
  const k = requireUserId(userId)
  // A shared phone/browser belongs only to the most recently registered account.
  for (const owner of Object.keys(db.native)) {
    const previousCount = db.native[owner].length
    db.native[owner] = db.native[owner].filter(entry => entry.token !== token)
    if (owner !== k && db.native[owner].length < previousCount) pruneUserIfNoSubs(owner)
  }
  db.native[k] ||= []
  db.native[k].push({ token, platform })
  save(db)
}
export function removeNative(userId, token) {
  const k = requireUserId(userId)
  db.native[k] = (db.native[k] || []).filter(t => t.token !== token)
  pruneUserIfNoSubs(k)
  save(db)
}
export function getWebPush(userId) { return db.webpush[requireUserId(userId)] || [] }
export function getNative(userId) { return db.native[requireUserId(userId)] || [] }

// ── Poller auth (users) ──────────────────────────────────────────────────────
/** Store/refresh a user's IoT credentials + push prefs (called on subscribe). */
export function setUserAuth(userId, { refreshToken, accessToken, accessExpiresAt, prefs }) {
  const k = requireUserId(userId)
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
  const k = requireUserId(userId)
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
  const k = requireUserId(userId)
  const u = db.users[k]
  if (!u) return 0
  u.failCount = (u.failCount || 0) + 1
  save(db)
  return u.failCount
}
/** Drop a user's stored credentials (e.g. refresh permanently failing). */
export function removeUserAuth(userId) {
  delete db.users[requireUserId(userId)]
  save(db)
}
/** All users with stored auth, refreshToken decrypted for immediate use. */
export function getAllUsers() {
  // Legacy anonymous credentials must never be polled, even before ops cleanup.
  return Object.entries(db.users).filter(([userId]) => {
    try { requireUserId(userId); return true } catch { return false }
  }).map(([userId, u]) => ({
    userId,
    refreshToken: decryptToken(u.refreshTokenEnc),
    accessToken: u.accessToken,
    accessExpiresAt: u.accessExpiresAt,
    prefs: u.prefs || {},
    schedules: u.schedules || {},
    failCount: u.failCount || 0,
  }))
}

// ── Per-device Sleep schedules (drives the server-side schedule executor) ─────
/** Store/replace one device's sleep schedule for a user (merged per device). */
export function setUserSchedule(userId, deviceId, schedule) {
  const k = requireUserId(userId)
  const u = db.users[k]
  // No schedule to cancel: acknowledge a no-op without minting/retaining auth.
  // Do not report success for an existing enabled schedule without a session.
  if (schedule?.enabled === false && !u?.schedules?.[String(deviceId)]?.enabled) return true
  if (!u || (!u.accessToken && !u.refreshTokenEnc)) return false
  u.schedules ||= {}
  u.schedules[String(deviceId)] = schedule // { enabled, sleepFrom, sleepTo, model, tz, sleepW?, wakeW? }
  // An edited window/rate must be re-applied even if the phase name is unchanged.
  if (u.phaseState) delete u.phaseState[String(deviceId)]
  u.updatedAt = Date.now()
  save(db)
  return true
}
/** Last charge-power phase we actually applied for a (user,device): 'sleep' | 'wake'. */
export function getSchedulePhase(userId, deviceId) {
  return db.users[requireUserId(userId)]?.phaseState?.[String(deviceId)] ?? null
}
export function setSchedulePhase(userId, deviceId, phase) {
  const u = db.users[requireUserId(userId)]
  if (!u) return
  u.phaseState ||= {}
  u.phaseState[String(deviceId)] = phase
  save(db)
}
export function getUser(userId) {
  const u = db.users[requireUserId(userId)]
  if (!u) return null
  return { userId: requireUserId(userId), refreshToken: decryptToken(u.refreshTokenEnc), accessToken: u.accessToken, prefs: u.prefs || {} }
}

// ── Per-(device,type) notify throttle state (mirrors client 30-min throttle) ──
export function getNotifyTs(userId, deviceId, type) {
  const u = db.users[requireUserId(userId)]
  return u?.notifyState?.[`${deviceId}|${type}`] ?? 0
}
export function setNotifyTs(userId, deviceId, type, ts) {
  const k = requireUserId(userId)
  const u = db.users[k]
  if (!u) return
  u.notifyState ||= {}
  u.notifyState[`${deviceId}|${type}`] = ts
  save(db)
}

// Drop stored credentials once a user has no push subscriptions AND no active
// sleep schedule left, so we never retain a refresh token for someone who has
// nothing running server-side. (A user may keep only a sleep schedule with no push.)
function pruneUserIfNoSubs(k) {
  const noWeb = !(db.webpush[k] && db.webpush[k].length)
  const noNative = !(db.native[k] && db.native[k].length)
  const schedules = db.users[k]?.schedules || {}
  const noSchedule = !Object.values(schedules).some((s) => s && s.enabled)
  if (noWeb && noNative && noSchedule) delete db.users[k]
}
