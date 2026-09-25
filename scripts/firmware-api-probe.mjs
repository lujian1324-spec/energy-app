/**
 * Solar of Things firmware / remote-upgrade API probe (docs/siseli-firmware-api.md).
 *
 * Runs against the real backend (the sandbox cannot reach it — run it locally or through
 * .github/workflows/firmware-api-probe.yml). Credentials come from the environment only.
 *
 *   E2E_USER=<account> E2E_PASS=<password> node scripts/firmware-api-probe.mjs
 *
 * Optional:
 *   DEVICE_ID      probe only this device (default: every device on the account, up to 10)
 *   API_BASE / IOT_APP_ID / IOT_APP_SECRET   same overrides as scripts/api-smoke.mjs
 *
 * READ-ONLY by default. It signs in, then for each device reads its record, the upgrade
 * protocols bound to its gather protocol, the firmware published for it, each file's
 * details, the upgrade script info, and any upgrade task the platform already has. It
 * prints every reply's code/message and field names (secrets, contact details and URL
 * queries redacted) so the app's readers (src/api/firmwareApi.ts) can be checked against
 * the real shapes, and ends with what the app would decide for each device.
 *
 * START AN UPGRADE (flashes the device — only on a unit you mean to upgrade, with
 * firmware confirmed for its board):
 *   FW_CREATE=1 DEVICE_ID=<id> FIRMWARE_ID=<id> CONFIRM="UPGRADE <deviceId> <firmwareId>" …
 * Refuses unless the device is online, not already upgrading, allowed to upgrade, and the
 * file is an enabled one the platform lists for that device. Sends /device/upgrade/create
 * exactly once (the app's body), then polls the task every 5 s for up to 45 min.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto'

const BASE = process.env.API_BASE || 'https://solar.siseli.com/apis'
const APP_ID = process.env.IOT_APP_ID || 'rYGQpmYU5k'
const APP_SECRET = process.env.IOT_APP_SECRET || 'GhJXQYEHphHlyiqYnBGE'
const USER = process.env.E2E_USER
const PASS = process.env.E2E_PASS
const ONLY_DEVICE = (process.env.DEVICE_ID || '').trim()
const CREATE = process.env.FW_CREATE === '1'
const FIRMWARE_ID = (process.env.FIRMWARE_ID || '').trim()
const CONFIRM = (process.env.CONFIRM || '').trim()

if (!USER || !PASS) {
  console.error('✗ E2E_USER and E2E_PASS are required.')
  process.exit(2)
}

// ── Signed request (same algorithm as src/utils/iotSign.ts / server/iotClient.js) ──
const md5Hex = (buf) => createHash('md5').update(buf).digest('hex').toLowerCase()
const sha256Hex = (s) => createHash('sha256').update(s ?? '', 'utf8').digest('hex').toLowerCase()
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')

function calcSign(method, urlParams, body) {
  const bodyHash = method === 'GET' ? '' : sha256Hex(body || '')
  const nonce = randomBytes(16).toString('hex')
  const all = { ...urlParams, 'IOT-Open-AppID': APP_ID, 'IOT-Open-Nonce': nonce, 'IOT-Open-Body-Hash': bodyHash }
  const plain = Object.entries(all).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')
  const sign = md5Hex(createHmac('sha256', APP_SECRET).update(b64(plain), 'utf8').digest())
  return { 'IOT-Open-AppID': APP_ID, 'IOT-Open-Nonce': nonce, 'IOT-Open-Body-Hash': bodyHash, 'IOT-Open-Sign': sign }
}

function parseQuery(path) {
  const i = path.indexOf('?')
  if (i === -1) return {}
  const out = {}
  for (const p of path.slice(i + 1).split('&')) {
    const j = p.indexOf('=')
    if (j > -1) out[p.slice(0, j)] = decodeURIComponent(p.slice(j + 1))
  }
  return out
}

// Snowflake ids exceed Number's safe range: quote long integers before parsing.
const parseLossless = (text) => JSON.parse(text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"'))

let token = null
async function call(method, path, data) {
  const body = data !== undefined ? JSON.stringify(data) : undefined
  const headers = {
    Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8',
    Origin: 'https://solar.siseli.com', Referer: 'https://solar.siseli.com/',
    ...calcSign(method, parseQuery(path), body),
  }
  if (token) headers['IOT-Token'] = token
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, body, signal: AbortSignal.timeout(15000) })
    const text = await res.text()
    let json
    try { json = parseLossless(text) } catch { json = { _raw: text.slice(0, 200) } }
    return { http: res.status, json }
  } catch (e) {
    return { http: 0, json: { code: 'NETWORK', message: String(e?.message || e) } }
  }
}

const ok = (code) => code === 0 || code === '0'
const msgOf = (r) => r.json.message || r.json.msg || r.json.localMessage || ''

// ── Redacted printing ──
const SECRET_KEY = /token|password|secret|sign|captcha|cookie|credential/i
const CONTACT_KEY = /email|mail|phone|cellphone|mobile|address|contact|account$|username/i
function redact(v, key = '') {
  if (v == null) return v
  if (SECRET_KEY.test(key)) return '<redacted>'
  if (CONTACT_KEY.test(key) && typeof v !== 'object') return '<redacted>'
  if (typeof v === 'string' && /^https?:\/\//.test(v)) return v.replace(/\?.*$/, '?<query redacted>')
  if (Array.isArray(v)) return v.slice(0, 3).map((x) => redact(x, key)).concat(v.length > 3 ? [`…(+${v.length - 3})`] : [])
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x, k)]))
  if (typeof v === 'string' && v.length > 300) return `${v.slice(0, 300)}…(${v.length} chars)`
  return v
}

let pass = 0, fail = 0
function report(label, r, { show = true } = {}) {
  const good = r.http === 200 && ok(r.json.code)
  good ? pass++ : fail++
  console.log(`\n${good ? '✓' : '✗'} ${label}  http=${r.http} code=${r.json.code}${msgOf(r) ? ` msg=${msgOf(r)}` : ''}`)
  if (show && r.json.data !== undefined) {
    const d = r.json.data
    const shape = Array.isArray(d) ? `array[${d.length}]`
      : d && typeof d === 'object' ? `keys: ${Object.keys(d).join(', ')}` : typeof d
    console.log(`  data ${shape}`)
    console.log(JSON.stringify(redact(d), null, 2).split('\n').map((l) => `  ${l}`).join('\n'))
  }
  return good
}

function listOf(d) {
  if (Array.isArray(d)) return d
  if (d && typeof d === 'object') for (const k of ['list', 'records', 'rows', 'items']) if (Array.isArray(d[k])) return d[k]
  return []
}

// Mirrors normalizeFirmware() in src/api/firmwareApi.ts — shows what the app would read.
const str = (v) => (v == null ? '' : String(v).trim())
function appFirmware(r) {
  const id = str(r.id ?? r.firmwareId ?? r.deviceFirmwareId)
  const name = str(r.name ?? r.firmwareName ?? r.fileName ?? r.originalFileName)
  const statusText = str(r.status ?? r.statusDict ?? r.state).toLowerCase()
  return {
    id, name,
    version: str(r.version ?? r.firmwareVersion ?? r.versionName ?? r.versionNumber) || name,
    notes: str(r.description ?? r.remark ?? r.releaseNotes ?? r.upgradeContent),
    createdAt: r.createdAt ?? r.createTime ?? r.creationTime ?? r.gmtCreate,
    disabled: r.isEnabled === false || r.enabled === false || r.isDisabled === true || /disabl|停用|禁用/.test(statusText),
  }
}
const normVersion = (v) => str(v).toLowerCase().replace(/\.hex$/, '').replace(/^v(?=\d)/, '')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 1. Session ──
console.log(`Firmware API probe @ ${BASE}${CREATE ? '  [START-UPGRADE MODE]' : '  [read-only]'}`)
const login = await call('POST', '/login/account', { account: USER, password: md5Hex(Buffer.from(PASS, 'utf8')) })
if (!report('POST /login/account', login, { show: false }) || !login.json.data?.accessToken) {
  console.log(`\nSign-in failed; nothing else was tried.`)
  process.exit(1)
}
token = login.json.data.accessToken

// ── 2. Account-wide ──
const perm = await call('GET', '/device/upgrade/permission/get')
report('GET /device/upgrade/permission/get', perm)
report('GET /device/upgrade/protocol/names', await call('GET', '/device/upgrade/protocol/names'))
report('GET /device/upgrade/firmware/names', await call('GET', '/device/upgrade/firmware/names'))
report('POST /device/firmware/list {page:1,count:20}', await call('POST', '/device/firmware/list', { page: 1, count: 20 }))
report('POST /device/upgrade/list {page:1,count:20}', await call('POST', '/device/upgrade/list', { page: 1, count: 20 }))
report('POST /device/batch/upgrade/list {page:1,count:20}', await call('POST', '/device/batch/upgrade/list', { page: 1, count: 20 }))

// ── 3. Devices ──
const listR = await call('POST', '/device/list', { page: 1, count: 50 })
report('POST /device/list', listR, { show: false })
let devices = listOf(listR.json.data).map((d) => ({ id: String(d.id), name: d.name }))
if (ONLY_DEVICE) devices = devices.filter((d) => d.id === ONLY_DEVICE)
console.log(`\n→ ${devices.length} device(s)${ONLY_DEVICE ? ` (DEVICE_ID=${ONLY_DEVICE})` : ''}`)
devices = devices.slice(0, 10)

const summary = []
const known = {}
for (const dev of devices) {
  console.log(`\n══════ Device ${dev.id} ${dev.name ?? ''} ══════`)
  const det = await call('GET', `/device/details?deviceId=${dev.id}`)
  report('GET /device/details', det, { show: false })
  const d = det.json.data || {}
  const picked = Object.fromEntries(['name', 'model', 'isOnline', 'softwareVersion', 'hardwareVersion', 'isUpgrading',
    'isFirmwareUpgradeEnabled', 'deviceUpgradeId', 'dtuDtuid', 'gatherProtocolId', 'gatherProtocolNumber',
    'gatherProtocolNameDisplay', 'gatherProtocolVersionCode', 'serialNumber', 'deviceSn', 'sn']
    .filter((k) => k in d).map((k) => [k, d[k]]))
  console.log(`  record: ${JSON.stringify(redact(picked))}`)
  console.log(`  firmware/upgrade-looking keys: ${Object.keys(d).filter((k) => /version|upgrad|firmware|ota/i.test(k)).join(', ') || '(none)'}`)

  let protocols = []
  if (d.gatherProtocolId) {
    const pr = await call('GET', `/gather/protocol/manufacturerDeviceUpgradeProtocol/overviews?gatherProtocolId=${d.gatherProtocolId}`)
    report('GET /gather/protocol/manufacturerDeviceUpgradeProtocol/overviews', pr)
    protocols = listOf(pr.json.data)
  }

  const q = new URLSearchParams({ deviceId: dev.id })
  if (d.dtuDtuid) q.set('certificateDtuID', String(d.dtuDtuid))
  const fwR = await call('POST', `/device/firmware/list/fromManufacturer?${q}`, { page: 1, count: 50 })
  report('POST /device/firmware/list/fromManufacturer', fwR)
  const files = listOf(fwR.json.data)
  for (const f of files.slice(0, 5)) {
    const id = str(f.id ?? f.firmwareId ?? f.deviceFirmwareId)
    if (id) report(`GET /device/firmware/details?id=${id}`, await call('GET', `/device/firmware/details?id=${encodeURIComponent(id)}`))
  }

  for (const p of protocols.slice(0, 3)) {
    const pid = str(p.id ?? p.protocolId ?? p.upgradeProtocolId)
    if (!pid) continue
    const sq = new URLSearchParams({ protocolId: pid, deviceId: dev.id })
    if (d.dtuDtuid) sq.set('certificateDtuID', String(d.dtuDtuid))
    report(`GET /device/upgrade/script/file/info (protocol ${pid})`, await call('GET', `/device/upgrade/script/file/info?${sq}`))
  }

  report('POST /device/upgrade/list {deviceId}', await call('POST', '/device/upgrade/list', { page: 1, count: 10, deviceId: dev.id }))
  if (d.deviceUpgradeId) {
    report('GET /device/upgrade/details', await call('GET', `/device/upgrade/details?id=${d.deviceUpgradeId}`))
    report('GET /device/upgrade/logs', await call('GET', `/device/upgrade/logs?deviceUpgradeId=${d.deviceUpgradeId}`))
  }

  // What the app would decide (src/utils/firmwareUpdate.ts, stores/firmwareUpdateStore.ts).
  const enabled = files.map(appFirmware).filter((f) => f.id && !f.disabled)
  const latest = enabled.sort((a, b) => (Date.parse(String(b.createdAt).replace(' ', 'T')) || 0) - (Date.parse(String(a.createdAt).replace(' ', 'T')) || 0))[0]
  const state = !ok(det.json.code) ? 'error'
    : d.isFirmwareUpgradeEnabled === false ? 'not-allowed'
    : d.isOnline === false ? 'offline'
    : !latest ? 'unavailable'
    : normVersion(d.softwareVersion) && normVersion(d.softwareVersion) === normVersion(latest.version) ? 'up-to-date'
    : 'update-available'
  summary.push({ device: dev.id, name: d.name, online: d.isOnline, current: d.softwareVersion ?? null, files: files.length, latest: latest ? `${latest.id} ${latest.version}` : null, app: state })
  known[dev.id] = { d, files: files.map(appFirmware) }
}

console.log('\n══════ What the app would show ══════')
console.table(summary)
console.log(`permission/get data: ${JSON.stringify(perm.json.data)}`)

// ── 4. Start an upgrade (opt-in, guarded) ──
if (CREATE) {
  const stop = (why) => { console.log(`\n✗ Upgrade NOT started: ${why}`); process.exit(1) }
  if (!ONLY_DEVICE || !FIRMWARE_ID) stop('DEVICE_ID and FIRMWARE_ID are both required.')
  if (CONFIRM !== `UPGRADE ${ONLY_DEVICE} ${FIRMWARE_ID}`) stop(`CONFIRM must be exactly "UPGRADE ${ONLY_DEVICE} ${FIRMWARE_ID}".`)
  const k = known[ONLY_DEVICE]
  if (!k) stop('the device is not on this account.')
  if (k.d.isOnline !== true) stop('the device is not online.')
  if (k.d.isUpgrading === true) stop('the device is already upgrading.')
  if (k.d.isFirmwareUpgradeEnabled === false) stop('the platform disables upgrades for this device.')
  const f = k.files.find((x) => x.id === FIRMWARE_ID)
  if (!f) stop('that firmware is not one the platform lists for this device.')
  if (f.disabled) stop('that firmware is disabled.')

  console.log(`\n══════ Starting upgrade: device ${ONLY_DEVICE} → ${f.name} (${f.id}) ══════`)
  const body = { deviceId: ONLY_DEVICE, deviceFirmwareId: FIRMWARE_ID }
  console.log(`  body: ${JSON.stringify(body)}`)
  const cr = await call('POST', '/device/upgrade/create', body)
  if (!report('POST /device/upgrade/create', cr)) process.exit(1)
  const cd = cr.json.data
  let upgradeId = typeof cd === 'string' || typeof cd === 'number' ? String(cd)
    : cd && typeof cd === 'object' ? str(cd.id ?? cd.deviceUpgradeId) : ''

  const deadline = Date.now() + 45 * 60 * 1000
  let last = ''
  while (Date.now() < deadline) {
    await sleep(5000)
    const dr = await call('GET', `/device/details?deviceId=${ONLY_DEVICE}`)
    const dd = dr.json.data || {}
    if (!upgradeId && dd.deviceUpgradeId) upgradeId = String(dd.deviceUpgradeId)
    const tr = upgradeId ? await call('GET', `/device/upgrade/details?id=${upgradeId}`) : null
    const t = tr?.json.data || {}
    const line = JSON.stringify({ isUpgrading: dd.isUpgrading, softwareVersion: dd.softwareVersion, deviceUpgradeId: upgradeId || null,
      task: Object.fromEntries(Object.entries(t).filter(([key]) => /status|state|progress|percent|result|fail|reason|message|time/i.test(key))) })
    if (line !== last) { console.log(`  ${new Date().toISOString()} ${line}`); last = line }
    // Only status-like values decide — key names such as failReason must not end the wait.
    const verdict = Object.entries(t).filter(([key, v]) => /status|state|result/i.test(key) && v != null)
      .map(([, v]) => String(v).toLowerCase()).join(' ')
    if (/success|succeed|成功|完成|fail|timeout|超时|失败/.test(verdict)) break
    if (dd.isUpgrading === false && dd.softwareVersion && normVersion(dd.softwareVersion) !== normVersion(k.d.softwareVersion)) break
  }
  if (upgradeId) {
    report('GET /device/upgrade/details (final)', await call('GET', `/device/upgrade/details?id=${upgradeId}`))
    report('GET /device/upgrade/logs (final)', await call('GET', `/device/upgrade/logs?deviceUpgradeId=${upgradeId}`))
  }
  report('GET /device/details (final)', await call('GET', `/device/details?deviceId=${ONLY_DEVICE}`), { show: false })
}

console.log(`\nDone: ${pass} replied OK, ${fail} refused or failed.`)
