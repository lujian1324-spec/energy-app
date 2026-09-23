import { getUser, updateUserTokens } from './store.js'
import { refreshAccessToken, listAllDevices, getUserIdentity } from './iotClient.js'

// Caller owns withUserLock. Only the relay owns the independent refresh pair;
// neither Lambda nor the phone receives the rotated server credentials.
export async function scheduleSession(userId, { deadline = Infinity } = {}) {
  const check = () => { if (Date.now() >= deadline) throw new Error('TICK_DEADLINE') }
  check()
  let u = getUser(userId)
  if (!u?.accessToken) throw new Error('BACKGROUND_SESSION_REQUIRED')
  let refreshed = false
  const refresh = async () => {
    check()
    if (!u.refreshToken) throw new Error('BACKGROUND_SESSION_REQUIRED')
    const pair = await refreshAccessToken(u)
    updateUserTokens(userId, pair)
    u = getUser(userId)
    refreshed = true
  }
  const exp = Number(u.accessExpiresAt)
  if (!Number.isFinite(exp) || exp < Date.now() + 60000 || exp > Date.now() + 12 * 3600000) await refresh()
  let identity
  try { check(); identity = await getUserIdentity(u.accessToken) }
  catch (e) {
    if (refreshed) throw e
    await refresh()
    identity = await getUserIdentity(u.accessToken)
  }
  if (identity !== String(userId)) throw new Error('BACKGROUND_IDENTITY_MISMATCH')
  check()
  return { token: u.accessToken, devices: await listAllDevices(u.accessToken, { deadline }) }
}
