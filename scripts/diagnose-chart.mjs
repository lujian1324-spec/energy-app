/**
 * 诊断:为什么某台设备 Device Monitor 的 Real-Time Power 图表「有参数」、另一台「没有」。
 *
 * 在你自己的联网机器上运行(沙箱可能连不上后端):
 *   E2E_USER=<账号> E2E_PASS=<密码> node scripts/diagnose-chart.mjs
 *
 * 它会登录 → 拉设备列表 → 对「每一台」设备同时查两个数据源(图表就靠这两个):
 *   A) 实时徽章 = GET /remote/device/state/latest  → 看 5 个图表字段在不在、值多少
 *   B) 历史曲线 = POST /deviceState/attribute/record/list(今天) → 看今天有几笔记录、字段在不在
 * 并打印每台设备是否在线/型号/协议号,最后给出「这台为什么没图」的判断。
 * 凭据只从环境变量读,绝不写死;不改动任何设备。
 */
import CryptoJS from 'crypto-js'
import { randomBytes } from 'node:crypto'

const BASE = process.env.API_BASE || 'https://solar.siseli.com/apis'
const APP_ID = process.env.IOT_APP_ID || 'rYGQpmYU5k'
const APP_SECRET = process.env.IOT_APP_SECRET || 'GhJXQYEHphHlyiqYnBGE'
const USER = process.env.E2E_USER
const PASS = process.env.E2E_PASS

if (!USER || !PASS) {
  console.error('✗ 需要环境变量 E2E_USER 和 E2E_PASS。示例:\n  E2E_USER=账号 E2E_PASS=密码 node scripts/diagnose-chart.mjs')
  process.exit(2)
}

const md5 = (s) => CryptoJS.MD5(s).toString(CryptoJS.enc.Hex).toLowerCase()
const sha256Hex = (s) => CryptoJS.SHA256(CryptoJS.enc.Utf8.parse(s)).toString(CryptoJS.enc.Hex).toLowerCase()
const b64 = (s) => CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(s))
const nonce = () => randomBytes(16).toString('hex')

function calcSign(method, urlParams, body) {
  const isGet = method.toUpperCase() === 'GET'
  const bodyHash = isGet ? '' : sha256Hex(body || '')
  const n = nonce()
  const all = { ...urlParams, 'IOT-Open-AppID': APP_ID, 'IOT-Open-Nonce': n, 'IOT-Open-Body-Hash': bodyHash }
  const plain = Object.entries(all).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')
  const sign = md5(CryptoJS.HmacSHA256(b64(plain), APP_SECRET))
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

// 今天本地 0 点 ~ 23:59:59,ISO 8601 带时区(与 useHistoryFetcher.toIsoTz 一致)
function isoTz(ms) {
  const d = new Date(ms), off = -d.getTimezoneOffset()
  const tz = (off >= 0 ? '+' : '') + String(Math.floor(Math.abs(off) / 60)).padStart(2, '0') + ':' + String(Math.abs(off) % 60).padStart(2, '0')
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${tz}`
}

// 图表用到的字段(与 mapFieldsToRealtime / useHistoryFetcher 完全一致)
const LIVE_KEYS = ['exchangeChargingPower', 'generationPower', 'outputPower', 'remainingBatteryCapacity', 'batteryPower']
const HIST_KEYS = ['generationPower', 'outputPower', 'remainingBatteryCapacity', 'exchangeChargingPower']

const fieldValLatest = (fields, k) => (fields && fields[k] ? fields[k].value : undefined)
const fieldValRec = (rec, k) => {
  const f = rec.fields?.[k]; if (f == null) return undefined
  return typeof f === 'object' && 'value' in f ? f.value : f
}

console.log(`诊断 @ ${BASE}\n`)

const login = await call('POST', '/login/account', { data: { account: USER, password: md5(PASS) } })
if (!ok(login.json.code) || !login.json.data?.accessToken) {
  console.log(`✗ 登录失败: http=${login.http} code=${login.json.code} msg=${login.json.message || login.json.msg}`)
  process.exit(1)
}
const token = login.json.data.accessToken
console.log('✓ 登录成功\n')

const list = await call('POST', '/device/list', { data: { page: 1, count: 50 }, token })
const devices = list.json.data?.list ?? []
console.log(`共 ${devices.length} 台设备\n${'='.repeat(60)}`)

const now = Date.now()
const from = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime()
const to = new Date(new Date(now).setHours(23, 59, 59, 999)).getTime()

for (const d of devices) {
  const id = String(d.id)
  console.log(`\n设备 ${d.name || ''}  (id=${id})`)
  console.log(`  在线: isOnline=${d.isOnline} state=${d.state} (${d.stateDict})  型号=${d.model || '?'}  协议号=${d.gatherProtocolNumber || '?'}`)

  // A) 实时徽章数据源
  const st = await call('GET', `/remote/device/state/latest?deviceId=${id}`, { token })
  if (!ok(st.json.code)) {
    console.log(`  A) /state/latest  ✗ code=${st.json.code} msg=${st.json.message || st.json.msg}`)
  } else {
    const fields = st.json.data?.fields || {}
    const present = LIVE_KEYS.map(k => `${k}=${fieldValLatest(fields, k) ?? '—缺失—'}`)
    console.log(`  A) /state/latest  字段共 ${Object.keys(fields).length} 个; 图表字段: ${present.join('  ')}`)
  }

  // B) 历史曲线数据源(今天)
  const rec = await call('POST', '/deviceState/attribute/record/list', {
    data: { deviceId: id, fromTime: isoTz(from), toTime: isoTz(to), page: 1, count: 80, orderByTimeAsc: true }, token,
  })
  if (!ok(rec.json.code)) {
    console.log(`  B) record/list    ✗ code=${rec.json.code} msg=${rec.json.message || rec.json.msg}`)
  } else {
    const recs = rec.json.data?.list ?? []
    const keyHits = {}
    for (const k of HIST_KEYS) keyHits[k] = recs.filter(r => fieldValRec(r, k) != null).length
    console.log(`  B) record/list    今天 ${recs.length} 笔记录; 非空计数: ${HIST_KEYS.map(k => `${k}:${keyHits[k]}`).join('  ')}`)
    // 判断
    if (recs.length === 0) console.log('  → 判断: 今天没有历史记录 → 曲线是空的(通常是设备离线/今天没上报)')
    else if (HIST_KEYS.every(k => keyHits[k] === 0)) console.log('  → 判断: 有记录但图表字段全为空 → 很可能是不同型号/协议,字段名不一致')
    else console.log('  → 判断: 有可用的历史数据,图表应能画出曲线')
  }
}

console.log(`\n${'='.repeat(60)}\n完成。对比两台设备的 A/B 两行即可看出差异原因。`)
