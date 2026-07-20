// Read-only client for the official Solar-of-Things IoT Open API.
// Ports the IOT-Open-* request signing from scripts/diagnose-chart.mjs, but uses
// Node's built-in crypto (no crypto-js dependency). The poller uses this to
// refresh each user's access token and read their device state — it never writes.
import { createHash, createHmac, randomBytes } from 'node:crypto'

const BASE = process.env.API_BASE || 'https://solar.siseli.com/apis'
const APP_ID = process.env.IOT_APP_ID || 'rYGQpmYU5k'
const APP_SECRET = process.env.IOT_APP_SECRET || 'GhJXQYEHphHlyiqYnBGE'

const md5Hex = (buf) => createHash('md5').update(buf).digest('hex').toLowerCase()
const sha256Hex = (s) => createHash('sha256').update(s ?? '', 'utf8').digest('hex').toLowerCase()
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')
const nonce = () => randomBytes(16).toString('hex')
export const md5Password = (s) => md5Hex(Buffer.from(String(s), 'utf8'))

function calcSign(method, urlParams, body) {
  const isGet = method.toUpperCase() === 'GET'
  const bodyHash = isGet ? '' : sha256Hex(body || '')
  const n = nonce()
  const all = { ...urlParams, 'IOT-Open-AppID': APP_ID, 'IOT-Open-Nonce': n, 'IOT-Open-Body-Hash': bodyHash }
  const plain = Object.entries(all).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')
  // sign = md5( HMAC-SHA256( base64(plain), secret ) as raw bytes )  — matches CryptoJS pipeline
  const hmac = createHmac('sha256', APP_SECRET).update(b64(plain), 'utf8').digest()
  const sign = md5Hex(hmac)
  return { 'IOT-Open-AppID': APP_ID, 'IOT-Open-Nonce': n, 'IOT-Open-Body-Hash': bodyHash, 'IOT-Open-Sign': sign }
}

function parseQuery(path) {
  const i = path.indexOf('?')
  if (i === -1) return {}
  const out = {}
  for (const p of path.slice(i + 1).split('&')) { const j = p.indexOf('='); if (j > -1) out[p.slice(0, j)] = decodeURIComponent(p.slice(j + 1)) }
  return out
}

async function call(method, path, { data, token } = {}) {
  const body = data !== undefined ? JSON.stringify(data) : undefined
  const headers = {
    Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8',
    Origin: 'https://solar.siseli.com', Referer: 'https://solar.siseli.com/',
    ...calcSign(method, parseQuery(path), body),
  }
  if (token) headers['IOT-Token'] = token
  const res = await fetch(`${BASE}${path}`, { method, headers, body })
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = { _raw: text.slice(0, 200) } }
  return { http: res.status, json }
}

const ok = (code) => code === 0 || code === '0'

const DEFAULT_ACCESS_TTL_MS = 2 * 60 * 60 * 1000 // fallback if the API omits the field (~2h)
const withExpiry = (data) => ({
  accessToken: data.accessToken,
  refreshToken: data.refreshToken,
  accessExpiresAt: Date.now() + (Number(data.accessTokenWillExpiredInMillis) || DEFAULT_ACCESS_TTL_MS),
})

/** Login with account + md5(password). Returns { accessToken, refreshToken, accessExpiresAt } or throws. */
export async function login(account, password) {
  const r = await call('POST', '/login/account', { data: { account, password: md5Password(password) } })
  if (!ok(r.json.code) || !r.json.data?.accessToken) {
    throw new Error(`login failed: http=${r.http} code=${r.json.code} msg=${r.json.message || r.json.msg}`)
  }
  return withExpiry(r.json.data)
}

/**
 * Refresh access token. The API requires BOTH the current access + refresh token
 * as a pair (a lone refresh token is rejected as "illegal argument"), and rotates
 * the whole pair on success. Returns { accessToken, refreshToken, accessExpiresAt }.
 */
export async function refreshAccessToken({ accessToken, refreshToken }) {
  const r = await call('POST', '/login/refresh/access/token', { data: { accessToken, refreshToken } })
  if (!ok(r.json.code) || !r.json.data?.accessToken) {
    throw new Error(`refresh failed: http=${r.http} code=${r.json.code} msg=${r.json.message || r.json.msg}`)
  }
  return withExpiry(r.json.data)
}

/** List the user's devices. Returns an array (may be empty). */
export async function listDevices(token, { page = 1, count = 50 } = {}) {
  const r = await call('POST', '/device/list', { data: { page, count }, token })
  if (!ok(r.json.code)) throw new Error(`device/list failed: code=${r.json.code} msg=${r.json.message || r.json.msg}`)
  return r.json.data?.list ?? []
}

/** Latest device state → the raw `fields` map ({ [key]: { value, ... } }); {} if none. */
export async function getLatestState(token, deviceId) {
  const r = await call('GET', `/remote/device/state/latest?deviceId=${deviceId}`, { token })
  if (!ok(r.json.code)) return { fields: {}, error: r.json.message || r.json.msg, code: r.json.code }
  return { fields: r.json.data?.fields || {} }
}

export { BASE, APP_ID }
