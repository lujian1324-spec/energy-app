// Device program endpoints (v4.22.0): Smart Schedule tasks, Charging Settings
// (AC charge power, Silent Mode) and the Charge & Discharge Limits, per device.
//
//   POST /program   { userId, deviceId, program, baseSavedAt?, accessToken?, refreshToken?, accessExpiresAt? }
//   GET  /program?userId=&deviceId=
//
// `baseSavedAt` (v4.23.1) is the `savedAt` of the stored program the app's edit
// started from (null: it started from none). When the stored program is a
// different one — another phone saved in between — the save is refused with
// 409 PROGRAM_CHANGED and the stored program, so the app can re-apply its own
// change on top of it instead of silently replacing the other phone's. An app
// that sends no `baseSavedAt` (before v4.23.1) is not checked.
//
// Both authenticate the caller's own IOT-Token on every call, check that the
// device is bound to that account, and only then read or write. The background
// session (refresh pair) is taken on POST exactly as /schedule takes it.
import * as db from './store.js'
import { getUserIdentity, listAllDevices } from './iotClient.js'
import { withUserLock } from './userLock.js'
import { deviceBoundToUser } from './deviceBind.js'
import { validateProgram, programNeedsTick } from './deviceProgram.js'

const DEVICE_ID = /^[\w-]{1,128}$/
const RESERVED = ['__proto__', 'constructor', 'prototype']

export function installProgramRoutes(app, dependencies = {}) {
  const { identity = getUserIdentity, devicesFor = listAllDevices, store = db, lock = withUserLock } = dependencies

  async function authorize(req, res, userId, deviceId) {
    let id
    try {
      id = store.requireUserId(userId)
      if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId) || RESERVED.includes(deviceId)) throw new Error('Invalid device ID')
    } catch { res.status(400).json({ code: 1, message: 'Invalid user or device' }); return null }
    const token = req.get('IOT-Token')
    if (!token) { res.status(401).json({ code: 1, message: 'Sign in again' }); return null }
    if (await identity(token) !== id) { res.status(403).json({ code: 1 }); return null }
    const devices = await devicesFor(token)
    const device = devices.find(d => String(d.id) === deviceId)
    if (!device || !deviceBoundToUser(device, id)) { res.status(403).json({ code: 1 }); return null }
    return id
  }

  app.post('/program', async (req, res) => {
    const { userId, deviceId, program, accessToken, refreshToken, accessExpiresAt } = req.body || {}
    let clean
    try { clean = validateProgram(program) } catch (e) {
      return res.status(400).json({ code: 1, message: String(e.message || 'Invalid program').slice(0, 200) })
    }
    try {
      const id = await authorize(req, res, userId, deviceId)
      if (!id) return
      await lock(id, async () => {
        if (req.body && 'baseSavedAt' in req.body) {
          const current = store.getUserProgram(id, deviceId)
          if (current && (current.savedAt ?? null) !== (req.body.baseSavedAt ?? null)) {
            res.status(409).json({ code: 1, reason: 'PROGRAM_CHANGED', message: 'Changed on another phone.', data: { program: current } })
            return
          }
        }
        if (accessToken || refreshToken) {
          if (!accessToken || !refreshToken || await identity(accessToken) !== id) throw new Error('Invalid background session')
          store.setUserAuth(id, { accessToken, refreshToken, accessExpiresAt })
        }
        // A program with nothing timed still gets stored when the relay knows the
        // user (so its power is applied once the device is back online); one that
        // needs the tick requires the background session.
        if (!store.setUserProgram(id, deviceId, clean, { needsSession: programNeedsTick(clean) })) {
          res.status(409).json({ code: 1, reason: 'POLLER_SESSION_REQUIRED', message: 'Background session required. Sign in again.' })
          return
        }
        res.json({ code: 0, data: { executor: process.env.SLEEP_SCHEDULER_EXTERNAL === 'true' ? 'aws-scheduler' : 'relay' } })
      })
    } catch { if (!res.headersSent) res.status(503).json({ code: 1, message: 'Could not verify or save the schedule. Retry Save.' }) }
  })

  app.get('/program', async (req, res) => {
    try {
      const id = await authorize(req, res, req.query?.userId, req.query?.deviceId)
      if (!id) return
      res.json({ code: 0, data: { program: store.getUserProgram(id, req.query.deviceId) } })
    } catch { if (!res.headersSent) res.status(503).json({ code: 1, message: 'Could not load the schedule' }) }
  })
}
