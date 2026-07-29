// Server-side poller: the missing third piece that lets alerts reach a CLOSED app.
// Every POLL_INTERVAL it walks every subscribed user, refreshes their access
// token, reads each device's latest state, runs the detection rules (gated by the
// user's push prefs), and calls sendToUser() for anything newly firing.
//
// Scaling (T0): users are polled through a BOUNDED-CONCURRENCY pool (POLL_CONCURRENCY)
// instead of one-at-a-time, so a tick finishes inside its window even with many
// users, and instantaneous load on the upstream backend is capped. ADAPTIVE polling
// backs off idle work: online devices are read every tick, but offline devices — and
// users whose devices were all offline (and who have no active schedule) — are read
// only every IDLE_POLL_MS, cutting the bulk of upstream calls for idle fleets.
// (The token store is a single in-memory object persisted per mutation, so concurrent
// per-user tasks touch distinct keys safely; batching those writes is a later step.)
//
// sendToUser is injected (from index.js) so this module stays decoupled and the
// smoke script can pass a dry-run collector instead of really pushing.
import {
  getAllUsers, updateUserTokens, noteUserFailure, removeUserAuth,
  getNotifyTs, setNotifyTs, getSchedulePhase, setSchedulePhase,
} from './store.js'
import { refreshAccessToken, listDevices, getLatestState, writeDeviceConfig } from './iotClient.js'
import { detectOutage, detectLowBattery, detectSolar } from './detect.js'
import { phaseFor, chargePowerForPhase } from './sleepSchedule.js'

// Device config attribute that sets AC charge power (W). See API_REFERENCE.md §40.
const CHARGE_POWER_KEY = 'ratedACChargingPower'

/**
 * Server-side Sleep Mode: apply the device's charge power for the current phase,
 * but only on a phase CHANGE (edge). Runs inside the per-device tick (token +
 * deviceId already in hand). On write failure (e.g. device offline) we do NOT
 * advance the stored phase, so the next tick retries until it lands.
 * @returns a log entry if it wrote, else null.
 */
async function enforceSchedule(userId, deviceId, schedule, token, now, dryRun) {
  if (!schedule || !schedule.enabled) return null
  const phase = phaseFor(schedule, now)
  if (phase === getSchedulePhase(userId, deviceId)) return null // already applied
  const watts = chargePowerForPhase(schedule.model, phase)
  if (!dryRun) {
    await writeDeviceConfig(token, deviceId, CHARGE_POWER_KEY, watts) // throws on failure → retried next tick
    setSchedulePhase(userId, deviceId, phase)
  }
  return { userId, deviceId, phase, watts }
}

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 60_000
const RENOTIFY_THROTTLE_MS = Number(process.env.RENOTIFY_THROTTLE_MS) || 30 * 60_000
const MAX_REFRESH_FAILS = 5
const ACCESS_SKEW_MS = 60_000 // refresh a minute before expiry
const MAX_PLAUSIBLE_TTL_MS = 12 * 60 * 60_000 // reject a bogus far-future accessExpiresAt (access tokens ~2h)

// T0 scaling knobs:
const POLL_CONCURRENCY = Math.max(1, Number(process.env.POLL_CONCURRENCY) || 25) // users polled in parallel
const IDLE_POLL_MS = Number(process.env.IDLE_POLL_MS) || 5 * 60_000               // cadence for offline/idle work

// In-memory edge state (survives across ticks within one process):
//   prevCond: `${userId}|${deviceId}|${type}` -> boolean  (was-in-condition, for level alarms)
//   solarPrev: same key -> last generationPower (for the 0-crossing edge)
const prevCond = new Map()
const solarPrev = new Map()

// Adaptive-poll bookkeeping (survives across ticks):
//   deviceSeen: `${userId}|${deviceId}` -> { online, lastStatePoll }
//   userSeen:   userId -> { anyOnline, lastList }
const deviceSeen = new Map()
const userSeen = new Map()

/** Run async `fn` over `items` with at most `limit` in flight; preserves order. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
  })
  await Promise.all(workers)
  return out
}

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
 * Poll ONE user: refresh token if needed, list devices, and (for devices due this
 * tick) read state + run detection + enforce the sleep schedule. Returns the
 * notifications that fired (or, in dryRun, that WOULD fire) plus any schedule writes.
 * Never throws — upstream errors are logged and skipped so one user can't stall others.
 */
async function processUser(u, now, sendToUser, dryRun) {
  const fired = []
  const scheduled = []
  if (!u.refreshToken && !u.accessToken) return { fired, scheduled }

  // Adaptive: a user whose devices were all offline last tick — and who has no active
  // sleep schedule (schedules need tight phase timing) — is polled at the idle cadence.
  const hasSchedule = Object.values(u.schedules || {}).some((s) => s && s.enabled)
  const um = userSeen.get(u.userId)
  const listDue = hasSchedule || !um || um.anyOnline || now - um.lastList >= IDLE_POLL_MS
  if (!listDue) return { fired, scheduled }

  // Use the stored access token while it's still valid (~2h); only refresh when it's
  // missing or near expiry. Refresh needs the access+refresh PAIR and rotates it —
  // persist the rotation so we own the dedicated poller session.
  // Sanitise accessExpiresAt: a bogus value (non-finite, or implausibly far in the
  // future from an old client string-concat bug) must NOT read as "still valid",
  // otherwise we never refresh and every call fails "Token expired" forever.
  let token = u.accessToken
  const exp = Number(u.accessExpiresAt)
  const validExp = Number.isFinite(exp) && exp <= now + MAX_PLAUSIBLE_TTL_MS
  let refreshedThisTick = false
  const doRefresh = async () => {
    const tokens = await refreshAccessToken({ accessToken: u.accessToken, refreshToken: u.refreshToken })
    if (!dryRun) updateUserTokens(u.userId, tokens)
    token = tokens.accessToken
    refreshedThisTick = true
  }

  const needRefresh = !token || !validExp || now >= exp - ACCESS_SKEW_MS
  if (needRefresh) {
    try {
      await doRefresh()
    } catch (e) {
      const fails = noteUserFailure(u.userId)
      console.warn(`[poller] refresh failed for user ${u.userId} (${fails}/${MAX_REFRESH_FAILS}): ${e.message}`)
      if (fails >= MAX_REFRESH_FAILS) { removeUserAuth(u.userId); console.warn(`[poller] dropped stale auth for user ${u.userId}`) }
      return { fired, scheduled }
    }
  }

  let devices
  try {
    devices = await listDevices(token)
  } catch (e) {
    // Defence in depth: if the token is rejected as expired but we didn't already
    // refresh this tick (e.g. our expiry bookkeeping was wrong), refresh once and retry.
    if (!refreshedThisTick && /expired|token|code=9/i.test(e.message || '')) {
      try {
        await doRefresh()
        devices = await listDevices(token)
      } catch (e2) {
        const fails = noteUserFailure(u.userId)
        console.warn(`[poller] user ${u.userId} refresh-on-expired failed (${fails}/${MAX_REFRESH_FAILS}): ${e2.message}`)
        if (fails >= MAX_REFRESH_FAILS) { removeUserAuth(u.userId); console.warn(`[poller] dropped stale auth for user ${u.userId}`) }
        return { fired, scheduled }
      }
    } else {
      console.warn(`[poller] user ${u.userId} listDevices error: ${e.message}`)
      return { fired, scheduled }
    }
  }

  let anyOnline = false
  for (const d of devices) {
    const deviceId = String(d.id)
    const isOnline = online(d)
    if (isOnline) anyOnline = true
    const dkey = `${u.userId}|${deviceId}`
    try {
      // Adaptive: online devices every tick; offline devices only every IDLE_POLL_MS.
      const seen = deviceSeen.get(dkey)
      const stateDue = isOnline || !seen || now - seen.lastStatePoll >= IDLE_POLL_MS
      if (stateDue) {
        const { fields } = await getLatestState(token, deviceId)
        deviceSeen.set(dkey, { online: isOnline, lastStatePoll: now })
        const notes = evaluateDevice({ deviceId, name: d.name || deviceId, isOnline, fields, prefs: u.prefs })
        for (const note of notes) {
          if (!shouldFire(u.userId, deviceId, note, now)) continue
          fired.push({ userId: u.userId, deviceId, type: note.type, title: note.title, body: note.body })
          if (!dryRun) {
            setNotifyTs(u.userId, deviceId, note.type, now)
            await sendToUser(u.userId, { title: note.title, body: note.body, data: note.data })
          }
        }
      } else if (seen) {
        deviceSeen.set(dkey, { online: isOnline, lastStatePoll: seen.lastStatePoll }) // keep the backoff clock
      }
      // Server-side Sleep Mode runs every tick — it only calls the backend on a phase
      // edge (rare), so it's near-free and keeps sleep/wake timing tight.
      try {
        const w = await enforceSchedule(u.userId, deviceId, u.schedules?.[deviceId], token, now, dryRun)
        if (w) { scheduled.push(w); console.log(`[poller] sleep-schedule ${w.userId}/${w.deviceId} → ${w.phase} (${w.watts}W)`) }
      } catch (e) { console.warn(`[poller] schedule ${deviceId} write failed (will retry): ${e.message}`) }
    } catch (e) { console.warn(`[poller] device ${deviceId} error: ${e.message}`) }
  }
  userSeen.set(u.userId, { anyOnline, lastList: now })
  return { fired, scheduled }
}

/**
 * Run one poll cycle over all users through a bounded-concurrency pool. Returns the
 * list of notifications that fired (or, in dryRun, that WOULD fire) — useful for the
 * smoke test and logging.
 */
export async function runTick(sendToUser, { dryRun = false } = {}) {
  const now = Date.now()
  const users = getAllUsers()
  const parts = await mapLimit(users, POLL_CONCURRENCY, (u) =>
    processUser(u, now, sendToUser, dryRun).catch((e) => {
      console.warn(`[poller] user ${u.userId} tick error: ${e.message}`)
      return { fired: [], scheduled: [] }
    }))
  const fired = parts.flatMap((p) => p.fired)
  const scheduled = parts.flatMap((p) => p.scheduled)
  if (fired.length) console.log(`[poller] ${dryRun ? '[dry-run] would fire' : 'fired'} ${fired.length}: ` +
    fired.map(f => `${f.userId}/${f.deviceId}:${f.type}`).join(', '))
  return { fired, scheduled }
}

let timer = null
/** Start the recurring poll loop (no-op if already running). */
export function startPoller(sendToUser) {
  if (timer) return
  console.log(`[poller] starting — every ${POLL_INTERVAL_MS}ms, concurrency ${POLL_CONCURRENCY}, idle backoff ${IDLE_POLL_MS}ms, renotify throttle ${RENOTIFY_THROTTLE_MS}ms`)
  const tick = () => runTick(sendToUser).catch(e => console.warn('[poller] tick failed:', e.message))
  tick() // run once at startup
  timer = setInterval(tick, POLL_INTERVAL_MS)
  if (timer.unref) timer.unref()
}
export function stopPoller() { if (timer) { clearInterval(timer); timer = null } }
