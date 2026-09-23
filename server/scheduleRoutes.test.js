import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installScheduleRoutes } from './scheduleRoutes.js'

const schedule = { enabled: true, sleepFrom: '22:00', sleepTo: '09:00', tz: 'UTC', model: 'Sierro 1000' }
function fixture(overrides = {}) {
  const routes = {}, events = [], user = { schedules: { device: schedule } }
  const store = { requireUserId: id => String(id), getUser: () => user,
    setUserAuth: () => events.push('auth'), setUserSchedule: (_u, d, s) => { events.push('save'); user.schedules[d] = s; return true } }
  installScheduleRoutes({ post: (path, handler) => { routes[path] = handler } }, {
    identity: async () => 'user', devicesFor: async () => [{ id: 'device', ownerUserId: 'user' }], store,
    write: async () => { events.push('restore') }, lock: async (_u, work) => { events.push('lock'); return work() }, ...overrides,
  })
  return { user, events, call: async (body = {}, token = 'live-token') => {
    const req = { body: { userId: 'user', deviceId: 'device', schedule, ...body }, get: () => token }
    const res = { statusCode: 200, headersSent: false, status(code) { this.statusCode = code; return this },
      json(value) { this.body = value; this.headersSent = true; return this } }
    await routes['/schedule'](req, res)
    return res
  } }
}
test('schedule save authenticates user and device before persisting', async () => {
  for (const options of [{ identity: async () => 'other' }, { devicesFor: async () => [] }]) {
    const f = fixture(options)
    assert.equal((await f.call()).statusCode, 403)
    assert.deepEqual(f.events, [])
  }
  const f = fixture()
  assert.equal((await f.call({}, null)).statusCode, 401)
  assert.deepEqual(f.events, [])
})
test('valid save consumes dedicated credentials, not the app session', async () => {
  const f = fixture()
  assert.equal((await f.call({ accessToken: 'dedicated', refreshToken: 'dedicated-refresh' })).statusCode, 200)
  assert.deepEqual(f.events, ['lock', 'auth', 'save'])
})
test('cross-account bootstrap cannot overwrite stored credentials', async () => {
  const f = fixture({ identity: async token => token === 'wrong-token' ? 'other' : 'user' })
  assert.equal((await f.call({ accessToken: 'wrong-token', refreshToken: 'wrong-refresh' })).statusCode, 503)
  assert.deepEqual(f.events, ['lock'])
})
test('cancellation persists before final restore under lock', async () => {
  const f = fixture()
  assert.equal((await f.call({ schedule: { ...schedule, enabled: false } })).statusCode, 200)
  assert.deepEqual(f.events, ['lock', 'save', 'restore'])
  assert.equal(f.user.schedules.device.enabled, false)
})
test('restore failure never re-enables the cancelled schedule', async () => {
  const f = fixture({ write: async () => { throw new Error('offline') } })
  assert.equal((await f.call({ schedule: { ...schedule, enabled: false } })).statusCode, 502)
  assert.equal(f.user.schedules.device.enabled, false)
})
