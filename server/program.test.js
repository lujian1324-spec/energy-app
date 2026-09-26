import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installProgramRoutes } from './programRoutes.js'
import { createSleepExecutor } from './sleepExecutor.js'
import { defaultProgram, EVERY_DAY } from './deviceProgram.js'

const at = value => Date.parse(value)
const LA = 'America/Los_Angeles'
const program = (over = {}) => ({ ...defaultProgram('Sierro 1000', LA), savedAt: 1, ...over })
const stopAt7 = { id: 'stop', kind: 'charge', action: 'stop', time: '07:00', days: [...EVERY_DAY], enabled: true, updatedAt: 0 }
const startAt23 = { ...stopAt7, id: 'start', action: 'start', time: '23:00' }
const acOffAt8 = { id: 'acoff', kind: 'ac', action: 'off', time: '08:00', days: [...EVERY_DAY], enabled: true, updatedAt: 0 }

// ── Routes ────────────────────────────────────────────────────────────────────

function routesFixture(overrides = {}) {
  const routes = {}, events = [], saved = {}
  const store = {
    requireUserId: id => { if (!id) throw new Error('userId required'); return String(id) },
    setUserAuth: () => events.push('auth'),
    setUserProgram: (_u, d, p, { needsSession }) => { events.push(`save:${needsSession}`); saved[d] = p; return overrides.saveOk === undefined ? true : overrides.saveOk },
    getUserProgram: (_u, d) => saved[d] ?? null,
  }
  installProgramRoutes({ post: (p, h) => { routes[`POST ${p}`] = h }, get: (p, h) => { routes[`GET ${p}`] = h } }, {
    identity: async () => 'user', devicesFor: async () => [{ id: 'device', ownerUserId: 'user' }], store,
    lock: async (_u, work) => { events.push('lock'); return work() }, ...overrides,
  })
  const respond = () => ({ statusCode: 200, headersSent: false, status(c) { this.statusCode = c; return this },
    json(v) { this.body = v; this.headersSent = true; return this } })
  return {
    events, saved,
    post: async (body = {}, token = 'live') => {
      const res = respond()
      await routes['POST /program']({ body: { userId: 'user', deviceId: 'device', program: program(), ...body }, get: () => token }, res)
      return res
    },
    get: async (query = {}, token = 'live') => {
      const res = respond()
      await routes['GET /program']({ query: { userId: 'user', deviceId: 'device', ...query }, get: () => token }, res)
      return res
    },
  }
}

test('program save checks the caller and the device before storing', async () => {
  for (const options of [{ identity: async () => 'other' }, { devicesFor: async () => [] }]) {
    const f = routesFixture(options)
    assert.equal((await f.post()).statusCode, 403)
    assert.deepEqual(f.events, [])
  }
  const f = routesFixture()
  assert.equal((await f.post({}, null)).statusCode, 401)
  assert.equal((await f.post({ program: { ...program(), chargePowerW: 'x' } })).statusCode, 400)
  assert.deepEqual(f.events, [])
})

test('a timed program needs the background session; an untimed one is stored without', async () => {
  const f = routesFixture()
  assert.equal((await f.post({ program: program({ tasks: [stopAt7] }) })).statusCode, 200)
  assert.equal((await f.post({ program: program() })).statusCode, 200)
  assert.deepEqual(f.events.slice(0, 4), ['lock', 'save:true', 'lock', 'save:false'])
  assert.equal((await f.post({ program: program() })).body.data.stored, true)
  // An untimed program for a user the relay has no record of: accepted, not stored.
  const unknown = routesFixture({ saveOk: null })
  assert.equal((await unknown.post({ program: program() })).body.data.stored, false)
  const refused = routesFixture({ saveOk: false })
  const res = await refused.post({ program: program({ tasks: [stopAt7] }) })
  assert.equal(res.statusCode, 409)
  assert.equal(res.body.reason, 'POLLER_SESSION_REQUIRED')
})

test('the stored program is read back only by its owner', async () => {
  const f = routesFixture()
  await f.post({ program: program({ chargePowerW: 200 }) })
  const res = await f.get()
  assert.equal(res.body.data.program.chargePowerW, 200)
  const other = routesFixture({ identity: async () => 'other' })
  assert.equal((await other.get()).statusCode, 403)
})

test('a save based on an older program is refused with the stored one (v4.23.1)', async () => {
  const f = routesFixture()
  // First save: nothing stored yet, based on none.
  assert.equal((await f.post({ program: program({ savedAt: 10 }), baseSavedAt: null })).statusCode, 200)
  // Another phone saves on top of it.
  assert.equal((await f.post({ program: program({ savedAt: 20, chargePowerW: 200 }), baseSavedAt: 10 })).statusCode, 200)
  // This phone still edits from savedAt 10: refused, told what is stored, nothing written.
  const events = f.events.length
  const stale = await f.post({ program: program({ savedAt: 30, chargePowerW: 300 }), baseSavedAt: 10 })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.body.reason, 'PROGRAM_CHANGED')
  assert.equal(stale.body.data.program.chargePowerW, 200)
  assert.equal(f.saved.device.savedAt, 20)
  assert.deepEqual(f.events.slice(events), ['lock'])
  // Re-based on 20 it goes through; an app without baseSavedAt is not checked.
  assert.equal((await f.post({ program: program({ savedAt: 30 }), baseSavedAt: 20 })).statusCode, 200)
  assert.equal((await f.post({ program: program({ savedAt: 40 }) })).statusCode, 200)
})

// ── Tick ──────────────────────────────────────────────────────────────────────

function tickFixture(p, overrides = {}) {
  let time = at('2026-09-24T13:00:00Z') // 06:00 LA
  let state = {}
  const writes = []
  const user = { userId: 'user', schedules: {}, programs: { device: p } }
  const db = {
    getAllUsers: () => [user], getUser: () => user,
    getSchedulePhase: () => null, setSchedulePhase: () => {},
    getProgramState: () => state, setProgramState: (_u, _d, patch) => { state = { ...state, ...patch } },
  }
  let sessions = 0
  const executor = createSleepExecutor({
    db, clock: () => time, lock: (_id, work) => work(),
    session: async () => { sessions++; return { token: 't', devices: [{ id: 'device', ownerUserId: 'user', isOnline: true }] } },
    write: async (_t, deviceId, frame) => {
      const b = Buffer.from(frame, 'base64')
      writes.push({ reg: b.readUInt16BE(2), value: b.readUInt16BE(4) })
    },
    ...overrides,
  })
  return { executor, writes, setTime: v => { time = at(v) }, sessions: () => sessions }
}

test('the tick pauses and resumes charging at the task times, once each', async () => {
  const f = tickFixture(program({ tasks: [stopAt7, startAt23] }))
  // 06:00: the 23:00 start from last night is in effect → full power.
  assert.equal((await f.executor.tick()).applied, 1)
  // Nothing changed a minute later: no session, no write.
  f.setTime('2026-09-24T13:01:00Z')
  assert.equal((await f.executor.tick()).unchanged, 1)
  assert.equal(f.sessions(), 1)
  f.setTime('2026-09-24T14:00:30Z') // 07:00:30
  await f.executor.tick()
  f.setTime('2026-09-25T06:00:30Z') // 23:00:30
  await f.executor.tick()
  assert.deepEqual(f.writes, [{ reg: 0x85, value: 400 }, { reg: 0x85, value: 0 }, { reg: 0x85, value: 400 }])
})

test('AC output events are written at their time on 0x0080, and not replayed late', async () => {
  const f = tickFixture(program({ tasks: [acOffAt8] }))
  f.setTime('2026-09-24T15:00:20Z') // 08:00:20
  await f.executor.tick()
  assert.deepEqual(f.writes.filter(w => w.reg === 0x80), [{ reg: 0x80, value: 0xaa01 }])
  // Next day the relay was down until 09:00 — an hour late is past the grace: no AC write.
  f.setTime('2026-09-25T16:00:00Z')
  await f.executor.tick()
  assert.equal(f.writes.filter(w => w.reg === 0x80).length, 1)
})

test('Silent Mode caps the power inside its window and restores it after', async () => {
  const silent = { enabled: true, scheduled: true, from: '20:00', to: '09:00', days: [...EVERY_DAY], updatedAt: 0 }
  const f = tickFixture(program({ silent, chargePowerW: 300 }))
  f.setTime('2026-09-25T04:00:00Z') // 21:00
  await f.executor.tick()
  f.setTime('2026-09-25T16:05:00Z') // 09:05
  await f.executor.tick()
  assert.deepEqual(f.writes.map(w => w.value), [150, 300])
})

test('Scheduled Silent Mode 9 PM–9 AM with Max 400 W: 150 W at 9 PM, 400 W at 9 AM, local time (v4.25.0)', async () => {
  const silent = { enabled: true, scheduled: true, from: '21:00', to: '09:00', days: [...EVERY_DAY], updatedAt: 0 }
  const f = tickFixture(program({ silent, chargePowerW: 400 }))
  f.setTime('2026-09-25T03:59:00Z') // 20:59 Los Angeles
  await f.executor.tick()
  f.setTime('2026-09-25T04:00:00Z') // 21:00
  await f.executor.tick()
  f.setTime('2026-09-25T10:00:00Z') // 03:00: nothing to change
  await f.executor.tick()
  f.setTime('2026-09-25T16:00:00Z') // 09:00
  await f.executor.tick()
  assert.deepEqual(f.writes, [{ reg: 0x85, value: 400 }, { reg: 0x85, value: 150 }, { reg: 0x85, value: 400 }])
})

test('an offline device is retried until it is back, then written', async () => {
  let online = false
  const f = tickFixture(program({ tasks: [stopAt7] }), {
    session: async () => ({ token: 't', devices: [{ id: 'device', ownerUserId: 'user', isOnline: online }] }),
  })
  f.setTime('2026-09-24T14:05:00Z')
  const r = await f.executor.tick()
  assert.equal(r.failed, 1)
  assert.equal(r.failureReasons['program:deviceOffline'], 1)
  online = true
  f.setTime('2026-09-24T15:30:00Z')
  assert.equal((await f.executor.tick()).applied, 1)
  assert.deepEqual(f.writes, [{ reg: 0x85, value: 0 }])
})

test('a failing device waits longer after each failure, and a new save is tried at once (v4.23.2)', async () => {
  const p = program({ tasks: [stopAt7] })
  const f = tickFixture(p, {
    session: async () => ({ token: 't', devices: [{ id: 'device', ownerUserId: 'user', isOnline: false }] }),
  })
  f.setTime('2026-09-24T14:05:00Z')
  assert.equal((await f.executor.tick()).failed, 1)
  // Inside the first pause (2 min): not tried, no session opened.
  f.setTime('2026-09-24T14:06:00Z')
  const waiting = await f.executor.tick()
  assert.equal(waiting.failed, 0)
  assert.equal(waiting.retryWait, 1)
  // After it: tried again, fails, and the next pause is 4 min.
  f.setTime('2026-09-24T14:07:30Z')
  assert.equal((await f.executor.tick()).failed, 1)
  f.setTime('2026-09-24T14:10:00Z')
  assert.equal((await f.executor.tick()).retryWait, 1)
  f.setTime('2026-09-24T14:12:00Z')
  assert.equal((await f.executor.tick()).failed, 1)
  // A new save of the program is tried on the next tick.
  p.savedAt = 2
  f.setTime('2026-09-24T14:13:00Z')
  assert.equal((await f.executor.tick()).failed, 1)
})

test('a device mid firmware update gets no program writes', async () => {
  const f = tickFixture(program({ tasks: [stopAt7] }), {
    session: async () => ({ token: 't', devices: [{ id: 'device', ownerUserId: 'user', isOnline: true, isUpgrading: true }] }),
  })
  f.setTime('2026-09-24T14:05:00Z')
  assert.equal((await f.executor.tick()).failureReasons['program:deviceUpgrading'], 1)
  assert.deepEqual(f.writes, [])
})

test('the in-process tick runs programs without the legacy windows', async () => {
  const f = tickFixture(program({ tasks: [stopAt7] }))
  f.setTime('2026-09-24T14:05:00Z')
  assert.equal((await f.executor.tick({ legacy: false })).applied, 1)
})
