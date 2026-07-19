/**
 * poller 干跑(dry-run)—— 不真发推送,只打印「本轮会给谁推什么」。
 *
 * 在你自己的联网机器上运行:
 *   E2E_USER=<账号> E2E_PASS=<密码> node scripts/poller-smoke.mjs
 * 可选:
 *   SMOKE_LOW_THRESHOLD=100   把低电量阈值设为 100%,让在线设备必定命中,验证链路
 *
 * 流程:登录拿 refreshToken → 播种到一个【临时】store → 跑 poller 的一个 tick(dryRun)
 *      → 打印检测结果。用临时 STORE_FILE,绝不碰真实 tokens.json。凭据只读 env。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const USER = process.env.E2E_USER
const PASS = process.env.E2E_PASS
if (!USER || !PASS) {
  console.error('✗ 需要 E2E_USER 和 E2E_PASS。示例:\n  E2E_USER=账号 E2E_PASS=密码 node scripts/poller-smoke.mjs')
  process.exit(2)
}

// 关键:在 import store.js 之前指向临时 STORE_FILE(store 在模块加载时读取该路径)
process.env.STORE_FILE = join(mkdtempSync(join(tmpdir(), 'poller-smoke-')), 'tokens.json')
// 关掉静态加密告警噪音无所谓;不设 TOKEN_ENC_KEY 时会以 plain 存(临时文件,随即丢弃)

const { login } = await import('../server/iotClient.js')
const { setUserAuth } = await import('../server/store.js')
const { runTick } = await import('../server/poller.js')

const threshold = Number(process.env.SMOKE_LOW_THRESHOLD) || 30

try {
  const { accessToken, refreshToken, accessExpiresAt } = await login(USER, PASS)
  if (!accessToken || !refreshToken) throw new Error('登录未返回成对令牌 —— 无法播种 poller')
  console.log('✓ 登录成功,播种临时 store(access+refresh 成对,模拟专用 poller 会话)')

  setUserAuth('smoke-user', {
    accessToken, refreshToken, accessExpiresAt,
    prefs: { pushNotifications: true, pushLowBattery: true, lowBatteryThreshold: threshold, pushSolarStatus: true },
  })
  console.log(`  prefs: outage+lowBattery(<${threshold}%)+solar 全开\n`)

  const fired = await runTick(async () => {}, { dryRun: true })

  console.log('\n──── 结论 ────')
  if (!fired.length) {
    console.log('本轮没有需要推送的告警(设备正常/离线/无数据)。')
    console.log(`提示:想验证链路是否通,可设 SMOKE_LOW_THRESHOLD=100 让在线设备的低电量必定命中。`)
  } else {
    console.log(`本轮【会】推送 ${fired.length} 条:`)
    for (const f of fired) console.log(`  • device ${f.deviceId}  [${f.type}]  ${f.title} — ${f.body}`)
  }
} catch (e) {
  console.error('✗ 干跑失败:', e.message)
  process.exit(1)
}
