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
 * 改名已定案（2026-09-08 对线上实测）：字段名是 **name**，不是 nickname。
 *   {name}                                  → code 0 Success
 *   {nickname} / {userName} / {realName}    → 20101 Iillegal argument
 *   {nickname, userId:数字 / 字符串}          → 20101（userId 从来不是原因）
 * /user/select/iotUserInfo 返回里也只有 name，没有 nickname。
 * 改邮箱仍未定案，见文件末尾那一轮。
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


// ── 4) 改邮箱：仍是 20101，逐个试字段名 ───────────────────────────────────────
// 改名已经定案（2026-09-08 实测）：{name} → code 0，
// {nickname} / {userName} / {realName} 以及各种 userId 写法全部 20101。
// 改邮箱三种写法也都是 20101，说明同样是字段名对不上，而不是验证码的问题
// ——验证码不对应该报「验证码错误」，不会报 illegal argument。
// 一律用当前邮箱 + 必然无效的验证码：改不动，也不发信。
const currentEmail = u.email ?? loginData.email ?? ''
const BAD = 'PROBE_INVALID'
console.log(`\n/user/update/iotUserEmail — 当前邮箱 ${JSON.stringify(currentEmail)}，验证码故意无效，不改动也不发信`)

const emailShapes = [
  ['{} 空体，看它说缺什么', {}],
  ['{email, captchaId, verifyCode}  ← app 现在发的', { email: currentEmail, captchaId: BAD, verifyCode: '000000' }],
  ['{email, verifyCode}', { email: currentEmail, verifyCode: '000000' }],
  ['{email, captcha, verifyCode}', { email: currentEmail, captcha: BAD, verifyCode: '000000' }],
  ['{email, captchaId, code}', { email: currentEmail, captchaId: BAD, code: '000000' }],
  ['{email, iotCaptchaId, verifyCode}', { email: currentEmail, iotCaptchaId: BAD, verifyCode: '000000' }],
  ['{address, captchaId, verifyCode}', { address: currentEmail, captchaId: BAD, verifyCode: '000000' }],
  ['{newEmail, captchaId, verifyCode}', { newEmail: currentEmail, captchaId: BAD, verifyCode: '000000' }],
  ['{email, captchaId, verifyCode, id}', { email: currentEmail, captchaId: BAD, verifyCode: '000000', id: u.id }],
  ['{email, captchaId, verifyCode, uid}', { email: currentEmail, captchaId: BAD, verifyCode: '000000', uid: u.uid }],
]
for (const [label, payload] of emailShapes) {
  const r = await call('POST', '/user/update/iotUserEmail', { data: payload, token })
  console.log(`  · ${label.padEnd(46)} ${say(r.json)}`)
}

console.log('')
console.log('读法：')
console.log('  报「验证码错误 / 失效 / captcha」= 字段名对了，只差一个真验证码。')
console.log('  仍报「illegal argument / 20101」= 字段名或类型还是不对。')
console.log('  如果十种全一样，就得找后端要 UserUpdateByEmailDtio 的字段定义。')
