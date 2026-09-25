import * as store from './store.js'
import { withUserLock } from './userLock.js'
import { scheduleSession } from './scheduleSession.js'
import { writePassthrough } from './iotClient.js'
import { deviceBoundToUser } from './deviceBind.js'
import { acChargePowerBase64 } from './modbus.js'
import { validateSchedule, scheduleTarget } from './scheduleValidation.js'
import { isPausedSmartSchedule } from './smartSchedulePause.js'

export function createSleepExecutor({ db = store, lock = withUserLock, session = scheduleSession,
  write = writePassthrough, clock = Date.now } = {}) {
  let running = false
  let lastTickAt = null
  let lastResult = null
  async function tick({ dryRun = false } = {}) {
    if (running) throw new Error('TICK_IN_PROGRESS')
    running = true
    const deadline = clock() + 30000
    const result = { dryRun, checked: 0, applied: 0, unchanged: 0, failed: 0, deferred: 0, paused: 0, failureReasons: {} }
    const failure = reason => {
      result.failed++
      result.failureReasons[reason] = (result.failureReasons[reason] || 0) + 1
    }
    try {
      const users = db.getAllUsers().filter(u => Object.values(u.schedules).some(s => s?.enabled))
      let cursor = 0
      const workers = Array.from({ length: Math.min(5, users.length) }, async () => {
        while (cursor < users.length) {
          const userId = users[cursor++].userId
          if (clock() >= deadline) { result.deferred++; continue }
          await lock(userId, async () => {
            // Re-read after the lock: queued saves/cancellations always win.
            const schedules = db.getUser(userId)?.schedules || {}
            let auth
            for (const [deviceId, raw] of Object.entries(schedules)) {
              if (!raw?.enabled) continue
              // SW-14: the Smart Schedule service is paused, so its windows are
              // not dispatched. Counted rather than dropped, and checked before
              // `checked++` so a paused window is not reported as examined and
              // left unapplied. Sleep Mode's windows — tagged `sleep`, or
              // untagged from a client older than the tag — fall through and
              // run exactly as before.
              if (isPausedSmartSchedule(raw)) { result.paused++; continue }
              if (clock() >= deadline) { result.deferred++; continue }
              result.checked++
              let stage = 'invalidSchedule'
              try {
                const schedule = validateSchedule(raw)
                let target = scheduleTarget(schedule, clock())
                if (db.getSchedulePhase(userId, deviceId) === target.key) { result.unchanged++; continue }
                // Dry runs are genuinely read-only: no token refresh, no writes.
                if (dryRun) continue
                stage = 'backgroundSession'
                auth ||= await session(userId, { deadline })
                stage = 'deviceOwnership'
                const device = auth.devices.find(d => String(d.id) === deviceId)
                if (!device || !deviceBoundToUser(device, userId)) throw new Error('DEVICE_NOT_OWNED')
                stage = 'deviceOffline'
                if (!(device.isOnline === true || device.isOnline === 1 || device.isOnline === 'true')) throw new Error('DEVICE_OFFLINE')
                // A unit taking a firmware update gets no register writes; the phase
                // stays owed, so the next tick after the update applies it.
                stage = 'deviceUpgrading'
                if (device.isUpgrading === true || device.isUpgrading === 'true' || device.isUpgrading === 1) throw new Error('DEVICE_UPGRADING')
                if (clock() >= deadline) { result.deferred++; continue }
                // A slow login/list may straddle a boundary. Never replay old watts.
                target = scheduleTarget(schedule, clock())
                stage = 'passthrough'
                await write(auth.token, deviceId, acChargePowerBase64(target.watts))
                stage = 'persistence'
                db.setSchedulePhase(userId, deviceId, target.key)
                result.applied++
              } catch (error) {
                if (stage === 'passthrough') {
                  if (error.name === 'TimeoutError' || error.name === 'AbortError') stage = 'passthroughTimeout'
                  else if (/^\d{1,6}$/.test(String(error.upstreamCode))) stage = `passthroughCode${error.upstreamCode}`
                }
                failure(stage)
              }
            }
          }, { deadline: deadline + 9000 }).catch(() => { failure('lockDeadline') })
        }
      })
      await Promise.all(workers)
      if (!dryRun) { lastTickAt = clock(); lastResult = result }
      return result
    } finally { running = false }
  }
  return { tick, status: () => ({ external: process.env.SLEEP_SCHEDULER_EXTERNAL === 'true', lastTickAt, lastResult }) }
}
