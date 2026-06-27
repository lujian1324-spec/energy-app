// Minimal file-backed token store (swap for a real DB in production).
// Shape: { webpush: { [userId]: Subscription[] }, native: { [userId]: {token, platform}[] } }
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const FILE = process.env.STORE_FILE || './tokens.json'

function load() {
  if (!existsSync(FILE)) return { webpush: {}, native: {} }
  try { return JSON.parse(readFileSync(FILE, 'utf8')) } catch { return { webpush: {}, native: {} } }
}
function save(db) { writeFileSync(FILE, JSON.stringify(db, null, 2)) }

const db = load()
const uid = (u) => String(u ?? 'anon')

export function addWebPush(userId, sub) {
  const k = uid(userId)
  db.webpush[k] = (db.webpush[k] || []).filter(s => s.endpoint !== sub.endpoint)
  db.webpush[k].push(sub)
  save(db)
}
export function removeWebPush(userId, endpoint) {
  const k = uid(userId)
  db.webpush[k] = (db.webpush[k] || []).filter(s => s.endpoint !== endpoint)
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
  save(db)
}
export function getWebPush(userId) { return db.webpush[uid(userId)] || [] }
export function getNative(userId) { return db.native[uid(userId)] || [] }
