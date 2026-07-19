/**
 * refresh 轮换探针 —— 决定前端 re-subscribe 策略(见计划 A 节风险)。
 *
 * 在你自己的联网机器上运行:
 *   E2E_USER=<账号> E2E_PASS=<密码> node scripts/refresh-probe.mjs
 *
 * 它登录拿到 refreshToken,然后连续刷新两次,打印:
 *   - 第二次刷新是否仍成功(判断旧 refreshToken 是否被第一次刷新作废);
 *   - 每次返回的 refreshToken 是否变化(判断后端是否轮换 refresh token)。
 * 结论:
 *   ✔ 两次都成功 + refreshToken 不变 → 不轮换,App 与 poller 可共用,最省心。
 *   ⚠ 第二次失败 / refreshToken 每次变 → 轮换,需按计划做「刷新后 re-subscribe」缓解。
 * 凭据只从环境变量读,绝不写死,不改动任何数据。
 */
import { login, refreshAccessToken } from '../server/iotClient.js'

const USER = process.env.E2E_USER
const PASS = process.env.E2E_PASS
if (!USER || !PASS) {
  console.error('✗ 需要 E2E_USER 和 E2E_PASS。示例:\n  E2E_USER=账号 E2E_PASS=密码 node scripts/refresh-probe.mjs')
  process.exit(2)
}

const tail = (t) => (t ? `…${String(t).slice(-8)}` : '(none)')

try {
  const a = await login(USER, PASS)
  console.log(`✓ 登录成功  accessToken=${tail(a.accessToken)}  refreshToken=${tail(a.refreshToken)}`)

  const r1 = await refreshAccessToken(a)
  console.log(`① 刷新成功  accessToken=${tail(r1.accessToken)}  refreshToken=${tail(r1.refreshToken)}`)

  // 第二次用「第一次返回的 refreshToken(若有轮换)或原 refreshToken(若无)」再刷
  const secondInput = { accessToken: r1.accessToken, refreshToken: r1.refreshToken ?? a.refreshToken }
  let r2, secondOk = true, err
  try { r2 = await refreshAccessToken(secondInput) } catch (e) { secondOk = false; err = e.message }

  console.log('\n──── 结论 ────')
  if (!secondOk) {
    console.log(`⚠ 第二次刷新失败(${err}) → 后端很可能【轮换】refresh token,旧的被作废。`)
    console.log('   需按计划:App 每次刷新后 re-subscribe 覆盖 relay 副本;poller 刷新后写回新 token。')
  } else {
    const rotated = (r1.refreshToken && r1.refreshToken !== a.refreshToken) || (r2.refreshToken && r2.refreshToken !== r1.refreshToken)
    console.log(`② 第二次刷新成功  refreshToken=${tail(r2.refreshToken)}`)
    if (rotated) console.log('⚠ refreshToken 每次都变 → 【轮换】,但旧 token 至少短时可用;仍建议刷新后 re-subscribe。')
    else console.log('✔ refreshToken 保持不变 → 【不轮换】,App 与 poller 可共用同一 refreshToken,最省心。')
  }
} catch (e) {
  console.error('✗ 探针失败:', e.message)
  process.exit(1)
}
