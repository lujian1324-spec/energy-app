import { readFileSync } from 'node:fs'
import { validateSchedule } from '../../server/scheduleValidation.js'
import { getUserIdentity } from '../../server/iotClient.js'

const db = JSON.parse(readFileSync(process.argv[2] || '/opt/sierro-relay/server/tokens.json', 'utf8'))
const counts = { users: 0, enabled: 0, invalid: 0, withSession: 0, verifiedIdentity: 0, unavailableIdentity: 0 }
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
}
console.log(JSON.stringify(counts))
