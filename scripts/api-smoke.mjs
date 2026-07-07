/**
 * 真实后端 API 冒烟测试（CLI，在你自己的联网机器上运行,沙箱连不上后端）。
 *
 * 用法:
 *   E2E_USER=<账号> E2E_PASS=<密码> node scripts/api-smoke.mjs
 * 可选:
 *   IOT_APP_ID / IOT_APP_SECRET  覆盖签名凭据(默认用内置公开值)
 *   API_BASE                     覆盖后端地址(默认 https://solar.siseli.com/apis)
 *
 * 复刻 src/utils/iotSign.ts 的签名 + src/api 的请求约定,逐步真连:
 *   1) 登录 /login/account   2) 用户信息 /user/select/iotUserInfo
 *   3) 设备列表 /device/list  4) 首台设备实时状态 /remote/device/state/latest
 * 每步打印 PASS/FAIL 与后端 code/message。凭据只从环境变量读,绝不写死。
 */
import CryptoJS from 'crypto-js'
import { randomBytes } from 'node:crypto'

const BASE = process.env.API_BASE || 'https://solar.siseli.com/apis'
const APP_ID = process.env.IOT_APP_ID || 'rYGQpmYU5k'
const APP_SECRET = process.env.IOT_APP_SECRET || 'GhJXQYEHphHlyiqYnBGE'
const USER = process.env.E2E_USER
const PASS = process.env.E2E_PASS

if (!USER || !PASS) {
  console.error('✗ 需要环境变量 E2E_USER 和 E2E_PASS。示例:\n  E2E_USER=账号 E2E_PASS=密码 node scripts/api-smoke.mjs')
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
  for (const p of path.slice(i + 1).split('&')) {
    const j = p.indexOf('=')
    if (j > -1) out[p.slice(0, j)] = decodeURIComponent(p.slice(j + 1))
  }
  return out
}

async function call(method, path, { data, token } = {}) {
  const body = data !== undefined ? JSON.stringify(data) : undefined
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    Origin: 'https://solar.siseli.com',
    Referer: 'https://solar.siseli.com/',
    ...calcSign(method, parseQuery(path), body),
  }
  if (token) headers['IOT-Token'] = token
  const res = await fetch(`${BASE}${path}`, { method, headers, body })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text.slice(0, 200) } }
  return { http: res.status, json }
}

const ok = (code) => code === 0 || code === '0'
let pass = 0, fail = 0
const step = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} — ${detail}`) }
}

console.log(`API smoke @ ${BASE}\n`)

// 1) 登录
const login = await call('POST', '/login/account', { data: { account: USER, password: md5(PASS) } })
step('POST /login/account', ok(login.json.code) && login.json.data?.accessToken,
  `http=${login.http} code=${login.json.code} msg=${login.json.message || login.json.msg}`)
const token = login.json.data?.accessToken
const userId = login.json.data?.userId

if (!token) {
  console.log(`\n登录失败,后续步骤跳过。\nPASS=${pass} FAIL=${fail}`)
  process.exit(1)
}

// 2) 用户信息
const me = await call('POST', '/user/select/iotUserInfo', { data: {}, token })
step('POST /user/select/iotUserInfo', ok(me.json.code), `code=${me.json.code} msg=${me.json.message || me.json.msg}`)

// 3) 设备列表
const list = await call('POST', '/device/list', { data: { page: 1, count: 20 }, token })
const devices = list.json.data?.list ?? []
step('POST /device/list', ok(list.json.code), `code=${list.json.code} msg=${list.json.message || list.json.msg}`)
console.log(`      → ${devices.length} 台设备` + (devices[0] ? `(首台 id=${devices[0].id} ${devices[0].name || ''})` : ''))

// 4) 首台设备实时状态
if (devices[0]) {
  const id = String(devices[0].id)
  const st = await call('GET', `/remote/device/state/latest?deviceId=${id}`, { token })
  step('GET /remote/device/state/latest', ok(st.json.code), `code=${st.json.code} msg=${st.json.message || st.json.msg}`)
}

console.log(`\n结果: PASS=${pass} FAIL=${fail}  (userId=${userId})`)
process.exit(fail ? 1 : 0)
