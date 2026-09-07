/**
 * 诊断 /user/update/iotUserInfo 与 /user/update/iotUserEmail 的字段约定。
 *
 * 用法（在你自己的联网机器上跑，凭据只从环境变量读，脚本不落盘、不打印密码）:
 *   E2E_USER=<账号> E2E_PASS=<密码> node scripts/api-probe-profile.mjs
 * 可选:
 *   IOT_APP_ID / IOT_APP_SECRET  覆盖签名凭据
 *   API_BASE                     覆盖后端地址
 *
 * 这个脚本不会改动你的账号：
 *   - 改名的每种候选写法都带上「当前的名字」，写成功也是原值。故意不发空体、
 *     也不发只有 userId 的请求：万一后端是整体覆盖而不是增量更新，那种请求会
 *     把名字清空；
 *   - 只读接口 /user/select/iotUserInfo 只打印字段名和名字类字段的值；
 *   - 改邮箱只用一个必然无效的 captchaId/verifyCode，验证码这关一定过不去，
 *     目的只是看后端先报「字段绑定失败」还是先报「验证码错误」；
 *   - 不调用 /user/send/email/captcha，不会真的发验证码邮件。
 *
 * 背景：改名一直返回 "illegal argument"。历史上试过
 *   {nickname}            → 失败（b29d5b4 时期）
 *   {nickname, userId:字符串} → 失败（5c437ed）
 *   {nickname}            → 失败（cb5e72e 至今，等于回到第一种）
 * 从没试过的是「userId 用数字发」。Java 端若把 userId 绑成基本类型 long，
 * 传 null 同样会抛 IllegalArgumentException，所以这是首要怀疑对象。
 */
import CryptoJS from 'crypto-js'
import { randomBytes } from 'node:crypto'

const BASE = process.env.API_BASE || 'https://solar.siseli.com/apis'
const APP_ID = process.env.IOT_APP_ID || 'rYGQpmYU5k'
const APP_SECRET = process.env.IOT_APP_SECRET || 'GhJXQYEHphHlyiqYnBGE'
const USER = process.env.E2E_USER
const PASS = process.env.E2E_PASS

if (!USER || !PASS) {
  console.error('✗ 需要环境变量 E2E_USER 和 E2E_PASS。示例:\n  E2E_USER=账号 E2E_PASS=密码 node scripts/api-probe-profile.mjs')
  process.exit(2)
}

const md5 = (s) => CryptoJS.MD5(s).toString(CryptoJS.enc.Hex).toLowerCase()
const sha256Hex = (s) => CryptoJS.SHA256(CryptoJS.enc.Utf8.parse(s)).toString(CryptoJS.enc.Hex).toLowerCase()
const b64 = (s) => CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(s))
const nonce = () => randomBytes(16).toString('hex')

function calcSign(method, urlParams, body) {
  const bodyHash = method.toUpperCase() === 'GET' ? '' : sha256Hex(body || '')
  const n = nonce()
  const all = { ...urlParams, 'IOT-Open-AppID': APP_ID, 'IOT-Open-Nonce': n, 'IOT-Open-Body-Hash': bodyHash }
  const plain = Object.entries(all).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')
  return {
    'IOT-Open-AppID': APP_ID,
    'IOT-Open-Nonce': n,
    'IOT-Open-Body-Hash': bodyHash,
    'IOT-Open-Sign': md5(CryptoJS.HmacSHA256(b64(plain), APP_SECRET)),
  }
}

async function call(method, path, { data, token } = {}) {
  const body = data !== undefined ? JSON.stringify(data) : undefined
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    Origin: 'https://solar.siseli.com',
    Referer: 'https://solar.siseli.com/',
    ...calcSign(method, {}, body),
  }
  if (token) headers['IOT-Token'] = token
  const res = await fetch(`${BASE}${path}`, { method, headers, body })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text.slice(0, 300) } }
  return { http: res.status, json }
}

const say = (json) => `code=${json.code} msg=${json.message ?? json.msg ?? ''}`

console.log(`profile API probe @ ${BASE}\n`)

// ── 1) 登录 ─────────────────────────────────────────────────────────────────
const login = await call('POST', '/login/account', { data: { account: USER, password: md5(PASS) } })
const token = login.json.data?.accessToken
if (!token) {
  console.log(`✗ 登录失败 — ${say(login.json)}`)
  process.exit(1)
}
console.log('✓ 登录成功')
const loginData = login.json.data ?? {}
console.log(`  登录响应字段: ${Object.keys(loginData).join(', ')}`)
console.log(`  userId=${loginData.userId} (typeof ${typeof loginData.userId})  account=${loginData.account}  email=${loginData.email ?? '(无)'}`)

// ── 2) 当前用户信息：后端到底把「名字」叫什么 ────────────────────────────────
const me = await call('POST', '/user/select/iotUserInfo', { data: {}, token })
const u = me.json.data ?? {}
console.log(`\n/user/select/iotUserInfo — ${say(me.json)}`)
console.log(`  返回字段: ${Object.keys(u).join(', ')}`)
for (const k of ['userId', 'account', 'nickname', 'name', 'userName', 'realName', 'email', 'cellphone']) {
  if (k in u) console.log(`    ${k} = ${JSON.stringify(u[k])} (typeof ${typeof u[k]})`)
}
if (!('nickname' in u)) {
  console.log('  ⚠ 返回里没有 nickname —— app 正是往这个字段写名字的')
}

// ── 3) 改名：逐个候选写法，值一律用当前名字，写成功也是原值 ──────────────────
const currentName = u.nickname ?? u.name ?? u.userName ?? u.account ?? String(USER)
const numericUserId = Number(loginData.userId ?? u.userId)
console.log(`\n/user/update/iotUserInfo — 用当前名字 ${JSON.stringify(currentName)} 逐个试，成功也不会改动账号`)

const candidates = [
  ['{nickname}  ← app 现在发的', { nickname: currentName }],
  ['{nickname, userId:数字}  ← 从没试过', { nickname: currentName, userId: numericUserId }],
  ['{nickname, userId:字符串}', { nickname: currentName, userId: String(numericUserId) }],
  ['{name}', { name: currentName }],
  ['{userName}', { userName: currentName }],
  ['{realName}', { realName: currentName }],
]
for (const [label, payload] of candidates) {
  const r = await call('POST', '/user/update/iotUserInfo', { data: payload, token })
  const good = r.json.code === 0 || r.json.code === '0'
  console.log(`  ${good ? '✓' : '✗'} ${label.padEnd(34)} ${say(r.json)}`)
}

// ── 4) 改邮箱：用必然无效的验证码，只看错误是「字段绑定」还是「验证码」 ───────
const currentEmail = u.email ?? loginData.email ?? ''
console.log(`\n/user/update/iotUserEmail — 故意用无效验证码，不会改动邮箱，也不发信`)
const emailShapes = [
  ['{email, captchaId, verifyCode}  ← app 现在发的', { email: currentEmail, captchaId: 'PROBE_INVALID', verifyCode: '000000' }],
  ['{address, captchaId, verifyCode}', { address: currentEmail, captchaId: 'PROBE_INVALID', verifyCode: '000000' }],
  ['{email, iotCaptchaId, verifyCode}', { email: currentEmail, iotCaptchaId: 'PROBE_INVALID', verifyCode: '000000' }],
]
for (const [label, payload] of emailShapes) {
  const r = await call('POST', '/user/update/iotUserEmail', { data: payload, token })
  console.log(`  · ${label.padEnd(44)} ${say(r.json)}`)
}
console.log('\n读法：报「验证码错误/失效」= 字段名对了，流程走得通；')
console.log('      报「illegal argument / 参数错误 / 缺少参数」= 字段名或类型不对。')
