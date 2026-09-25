// Background execution of device programs (v4.22.0) — see deviceProgram.js.
//
// On every tick, for each stored program, the relay works out what the device
// should be doing now (AC charge power on 0x0085; any AC output event owed on
// 0x0080) and compares it with what it last applied. Only a difference costs
// anything: then — and only then — it opens the background session, checks the
// device is still this user's, online and not mid firmware update, and writes.
// A failed write leaves the state unchanged, so the next tick tries again.
import { chargeTarget, acTarget } from './deviceProgram.js'
import { acChargePowerBase64, acOutputBase64 } from './modbus.js'
import { deviceBoundToUser } from './deviceBind.js'

const truthy = v => v === true || v === 1 || v === 'true'

/**
 * Run every program of one user (the caller holds the user lock).
 * @returns nothing; counts go into `result`
 */
export async function runUserPrograms({ userId, programs, db, session, write, clock, deadline, dryRun, result, failure }) {
  let auth
  for (const [deviceId, program] of Object.entries(programs || {})) {
    if (!program) continue
    if (clock() >= deadline) { result.deferred++; continue }
    result.checked++
    let stage = 'invalidProgram'
    try {
      const state = db.getProgramState(userId, deviceId) || {}
      const now = clock()
      const charge = chargeTarget(program, now)
      const ac = acTarget(program, now)
      const chargeDue = state.chargeKey !== charge.key
      const acDue = !!ac && state.acKey !== ac.key
      if (!chargeDue && !acDue) { result.unchanged++; continue }
      if (dryRun) continue
      stage = 'backgroundSession'
      auth ||= await session(userId, { deadline })
      stage = 'deviceOwnership'
      const device = auth.devices.find(d => String(d.id) === deviceId)
      if (!device || !deviceBoundToUser(device, userId)) throw new Error('DEVICE_NOT_OWNED')
      stage = 'deviceOffline'
      if (!truthy(device.isOnline)) throw new Error('DEVICE_OFFLINE')
      stage = 'deviceUpgrading'
      if (truthy(device.isUpgrading)) throw new Error('DEVICE_UPGRADING')
      if (clock() >= deadline) { result.deferred++; continue }
      // A slow login may straddle a boundary: decide again with the time now.
      const later = clock()
      if (acDue) {
        const acNow = acTarget(program, later)
        if (acNow && acNow.key !== state.acKey) {
          stage = 'passthrough'
          await write(auth.token, deviceId, acOutputBase64(acNow.on))
          stage = 'persistence'
          db.setProgramState(userId, deviceId, { acKey: acNow.key })
        }
      }
      if (chargeDue) {
        const target = chargeTarget(program, later)
        stage = 'passthrough'
        await write(auth.token, deviceId, acChargePowerBase64(target.watts))
        stage = 'persistence'
        db.setProgramState(userId, deviceId, { chargeKey: target.key })
      }
      result.applied++
    } catch (error) {
      if (stage === 'passthrough') {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') stage = 'passthroughTimeout'
        else if (/^\d{1,6}$/.test(String(error.upstreamCode))) stage = `passthroughCode${error.upstreamCode}`
      }
      failure(`program:${stage}`)
    }
  }
}
