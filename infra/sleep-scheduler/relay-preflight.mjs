import { readFileSync } from 'node:fs'
import { validateSchedule } from '../../server/scheduleValidation.js'
import { getUserIdentity, listAllDevices } from '../../server/iotClient.js'
import { deviceBoundToUser } from '../../server/deviceBind.js'

const db = JSON.parse(readFileSync(process.argv[2] || '/opt/sierro-relay/server/tokens.json', 'utf8'))
const counts = { users: 0, enabled: 0, invalid: 0, withSession: 0, verifiedIdentity: 0, unavailableIdentity: 0,
  activeWithoutSession: 0, scheduledOwned: 0, scheduledOffline: 0, scheduledNotOwned: 0, scheduledDeviceLookupFailed: 0 }
for (const [userId, user] of Object.entries(db.users || {})) {
  counts.users++
  if (user.accessToken && user.refreshTokenEnc) counts.withSession++
  for (const value of Object.values(user.schedules || {})) {
    if (!value?.enabled) continue
    counts.enabled++
    try { validateSchedule(value) } catch { counts.invalid++ }
  }
  if (user.accessToken) {
    try {
      if (await getUserIdentity(user.accessToken) === userId) counts.verifiedIdentity++
      else counts.unavailableIdentity++
    } catch { counts.unavailableIdentity++ }
  }
  const active = Object.entries(user.schedules || {}).filter(([, s]) => s?.enabled)
  if (active.length) {
    if (!user.accessToken) { counts.activeWithoutSession += active.length; continue }
    try {
      const devices = await listAllDevices(user.accessToken)
      for (const [deviceId] of active) {
        const device = devices.find(d => String(d.id) === deviceId)
        if (!device || !deviceBoundToUser(device, userId)) { counts.scheduledNotOwned++; continue }
        counts.scheduledOwned++
        if (!(device.isOnline === true || device.isOnline === 1 || device.isOnline === 'true')) counts.scheduledOffline++
      }
    } catch { counts.scheduledDeviceLookupFailed += active.length }
  }
}
console.log(JSON.stringify(counts))
