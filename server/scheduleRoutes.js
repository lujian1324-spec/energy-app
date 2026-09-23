import { readFileSync } from 'node:fs'
import * as db from './store.js'
import { getUserIdentity, listAllDevices, writePassthrough } from './iotClient.js'
import { withUserLock } from './userLock.js'
import { deviceBoundToUser } from './deviceBind.js'
import { validateSchedule } from './scheduleValidation.js'
import { getPowers } from './sleepSchedule.js'
import { acChargePowerBase64 } from './modbus.js'
import { createSleepExecutor } from './sleepExecutor.js'
import { createTickVerifier, TICK_PATH } from './sleepSignature.js'

export function installScheduleRoutes(app, dependencies = {}) {
  const { identity = getUserIdentity, devicesFor = listAllDevices, write = writePassthrough,
    store = db, lock = withUserLock } = dependencies
  const executor = createSleepExecutor()
  const secret = process.env.SLEEP_SCHEDULER_SECRET_FILE
    ? readFileSync(process.env.SLEEP_SCHEDULER_SECRET_FILE, 'utf8').trim() : ''
  if (process.env.SLEEP_SCHEDULER_EXTERNAL === 'true' && secret.length < 32) throw new Error('Sleep scheduler secret required')
  const verify = createTickVerifier(secret)
  app.post(TICK_PATH, async (req, res) => {
    if (!verify(req.headers, req.rawBody || '')) return res.status(401).json({ code: 1 })
    if (process.env.SLEEP_SCHEDULER_EXTERNAL !== 'true') return res.status(503).json({ code: 1 })
    try {
      const data = await executor.tick({ dryRun: req.body?.dryRun === true })
      console.log('[sleep-scheduler]', JSON.stringify(data))
      res.status(data.failed || data.deferred ? 503 : 200).json({ code: data.failed || data.deferred ? 1 : 0, data })
    } catch { res.status(503).json({ code: 1, message: 'Scheduler busy; retry next minute' }) }
  })
  app.post('/schedule', async (req, res) => {
    const { userId, deviceId, schedule, accessToken, refreshToken, accessExpiresAt } = req.body || {}
    let clean, id
    try {
      id = store.requireUserId(userId)
      if (typeof deviceId !== 'string' || !/^[\w-]{1,128}$/.test(deviceId) || ['__proto__', 'constructor', 'prototype'].includes(deviceId)) throw new Error('Invalid device ID')
      clean = validateSchedule(schedule)
    } catch { return res.status(400).json({ code: 1, message: 'Invalid device, timezone, window or power' }) }
    const token = req.get('IOT-Token') || accessToken // permits legacy one-time bootstrap
    if (!token) return res.status(401).json({ code: 1, message: 'Sign in again and update the app' })
    try {
      // Authenticate on EVERY save, including cancellation. Never trust body.userId.
      if (await identity(token) !== id) return res.status(403).json({ code: 1 })
      const devices = await devicesFor(token)
      const device = devices.find(d => String(d.id) === deviceId)
      if (!device || !deviceBoundToUser(device, id)) return res.status(403).json({ code: 1 })
      await lock(id, async () => {
        if (accessToken || refreshToken) {
          if (!accessToken || !refreshToken || await identity(accessToken) !== id) throw new Error('Invalid background session')
          store.setUserAuth(id, { accessToken, refreshToken, accessExpiresAt })
        }
        const previous = store.getUser(id)?.schedules?.[deviceId]
        if (!store.setUserSchedule(id, deviceId, clean)) {
          res.status(409).json({ code: 1, reason: 'POLLER_SESSION_REQUIRED', message: 'Background session required. Sign in again.' })
          return
        }
        // After any in-flight scheduled write, restore once more under the same
        // lock. Cancellation stays persisted even if this immediate write fails.
        if (!clean.enabled && previous?.enabled) {
          try { await write(token, deviceId, acChargePowerBase64(getPowers(clean.model).wakeW)) }
          catch { res.status(502).json({ code: 1, message: 'Schedule cancelled; power restore needs retry' }); return }
        }
        res.json({ code: 0, data: { executor: process.env.SLEEP_SCHEDULER_EXTERNAL === 'true' ? 'aws-scheduler' : 'relay' } })
      })
    } catch { if (!res.headersSent) res.status(503).json({ code: 1, message: 'Could not verify or save schedule. Retry Save.' }) }
  })
  return executor
}
