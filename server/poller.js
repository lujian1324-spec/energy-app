// Server-side poller: the missing third piece that lets alerts reach a CLOSED app.
// Every POLL_INTERVAL it walks every subscribed user, refreshes their access
// token, reads each device's latest state, runs the detection rules (gated by the
// user's push prefs), and calls sendToUser() for anything newly firing.
//
// sendToUser is injected (from index.js) so this module stays decoupled and the
// smoke script can pass a dry-run collector instead of really pushing.
import {
  getAllUsers, updateUserTokens, noteUserFailure, removeUserAuth,
  getNotifyTs, setNotifyTs,
} from './store.js'
import { refreshAccessToken, listDevices, getLatestState } from './iotClient.js'
import { detectOutage, detectLowBattery, detectSolar } from './detect.js'

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 60_000
const RENOTIFY_THROTTLE_MS = Number(process.env.RENOTIFY_THROTTLE_MS) || 30 * 60_000
const MAX_REFRESH_FAILS = 5

// In-memory edge state (survives across ticks within one process):
//   prevCond: `${userId}|${deviceId}|${type}` -> boolean  (was-in-condition, for level alarms)
//   solarPrev: same key -> last generationPower (for the 0-crossing edge)
const prevCond = new Map()
const solarPrev = new Map()

const online = (d) => d.isOnline === true || d.isOnline === 1 || d.isOnline === 'true'

/** Build the list of notifications a single device should fire this tick. */
function evaluateDevice({ deviceId, name, isOnline, fields, prefs }) {
  const notes = []
  const soc = Number(fields?.remainingBatteryCapacity?.value)

  // Power Outage — gated by `pushNotifications`, only for online devices (matches client).
  if (prefs.pushNotifications && isOnline) {
    const { outage } = detectOutage(fields)
    notes.push({ type: 'outage', cond: outage, title: '⚡ Power Outage Detected',
      body: `${name}: AC grid power lost. Running on battery.`, data: { deviceId, kind: 'outage' } })
  }

  // Low Battery — gated by `pushLowBattery` + threshold.
  if (prefs.pushLowBattery) {
    const threshold = prefs.lowBatteryThreshold ?? 30
    const { low } = detectLowBattery(fields, threshold)
    notes.push({ type: 'lowBattery', cond: low, title: '🔋 Low Battery',
      body: `${name}: Battery ${Math.round(soc)}% (below ${threshold}%)`, data: { deviceId, kind: 'lowBattery' } })
  }

  // Solar Status — edge on generationPower crossing 0, gated by `pushSolarStatus`.
  if (prefs.pushSolarStatus) {
    const key = `${deviceId}`
    const { event, genW } = detectSolar(solarPrev.get(key), fields)
    solarPrev.set(key, genW)
    if (event === 'started') notes.push({ type: 'solarStart', cond: true, title: 'Solar charging started ☀️',
      body: `${name}: Solar input detected.`, data: { deviceId, kind: 'solarStart' } })
    else if (event === 'stopped') notes.push({ type: 'solarStop', cond: true, title: 'Solar charging stopped',
      body: `${name}: Solar input ended.`, data: { deviceId, kind: 'solarStop' } })
  }

  return notes
}

/** Decide whether a note should fire now: edge (false→true) AND 30-min throttle. */
function shouldFire(userId, deviceId, note, now) {
  const key = `${userId}|${deviceId}|${note.type}`
  const isEvent = note.type === 'solarStart' || note.type === 'solarStop' // already edge-shaped
  const was = prevCond.get(key) === true
  if (!isEvent) prevCond.set(key, note.cond)
  if (!note.cond) return false
  if (!isEvent && was) return false // still in the same condition — don't re-fire
  const last = getNotifyTs(userId, deviceId, note.type)
  return now - last >= RENOTIFY_THROTTLE_MS
}

/**
 * Run one poll cycle. Returns the list of notifications that fired (or, in
 * dryRun, that WOULD fire) — useful for the smoke test and logging.
 */
export async function runTick(sendToUser, { dryRun = false } = {}) {
  const now = Date.now()
  const ACCESS_SKEW_MS = 60_000 // refresh a minute before expiry
  const fired = []
  for (const u of getAllUsers()) {
    try {
      if (!u.refreshToken && !u.accessToken) continue
      // Use the stored access token while it's still valid (~2h); only refresh when
      // it's missing or near expiry. Refresh needs the access+refresh PAIR and
      // rotates it — persist the rotation so we own the dedicated poller session.
      let token = u.accessToken
      const needRefresh = !token || !u.accessExpiresAt || now >= u.accessExpiresAt - ACCESS_SKEW_MS
      if (needRefresh) {
        try {
          const tokens = await refreshAccessToken({ accessToken: u.accessToken, refreshToken: u.refreshToken })
          if (!dryRun) updateUserTokens(u.userId, tokens)
          token = tokens.accessToken
        } catch (e) {
          const fails = noteUserFailure(u.userId)
          console.warn(`[poller] refresh failed for user ${u.userId} (${fails}/${MAX_REFRESH_FAILS}): ${e.message}`)
          if (fails >= MAX_REFRESH_FAILS) { removeUserAuth(u.userId); console.warn(`[poller] dropped stale auth for user ${u.userId}`) }
          continue
        }
      }

      const devices = await listDevices(token)
      for (const d of devices) {
        const deviceId = String(d.id)
        try {
          const { fields } = await getLatestState(token, deviceId)
          const notes = evaluateDevice({ deviceId, name: d.name || deviceId, isOnline: online(d), fields, prefs: u.prefs })
          for (const note of notes) {
            if (!shouldFire(u.userId, deviceId, note, now)) continue
            fired.push({ userId: u.userId, deviceId, type: note.type, title: note.title, body: note.body })
            if (!dryRun) {
              setNotifyTs(u.userId, deviceId, note.type, now)
              await sendToUser(u.userId, { title: note.title, body: note.body, data: note.data })
            }
          }
        } catch (e) { console.warn(`[poller] device ${deviceId} error: ${e.message}`) }
      }
    } catch (e) {
      console.warn(`[poller] user ${u.userId} tick error: ${e.message}`)
    }
  }
  if (fired.length) console.log(`[poller] ${dryRun ? '[dry-run] would fire' : 'fired'} ${fired.length}: ` +
    fired.map(f => `${f.userId}/${f.deviceId}:${f.type}`).join(', '))
  return fired
}

let timer = null
/** Start the recurring poll loop (no-op if already running). */
export function startPoller(sendToUser) {
  if (timer) return
  console.log(`[poller] starting — every ${POLL_INTERVAL_MS}ms, renotify throttle ${RENOTIFY_THROTTLE_MS}ms`)
  const tick = () => runTick(sendToUser).catch(e => console.warn('[poller] tick failed:', e.message))
  tick() // run once at startup
  timer = setInterval(tick, POLL_INTERVAL_MS)
  if (timer.unref) timer.unref()
}
export function stopPoller() { if (timer) { clearInterval(timer); timer = null } }
