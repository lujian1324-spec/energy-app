import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSleepExecutor } from './sleepExecutor.js'
import { validateSchedule, scheduleTarget } from './scheduleValidation.js'
import { createTickVerifier, signTick } from './sleepSignature.js'
import { withUserLock } from './userLock.js'
import lambda from '../infra/sleep-scheduler/handler.cjs'

const base = { enabled: true, sleepFrom: '22:00', sleepTo: '09:00', tz: 'Asia/Taipei', model: 'Sierro 1000' }
const at = value => Date.parse(value)
function fixture(overrides = {}) {
  let time = at('2026-09-23T14:00:00Z'), key = null
  const schedules = { device: { ...base } }, writes = []
  const user = { userId: 'user', schedules }
  const db = { getAllUsers: () => [user], getUser: () => user,
    getSchedulePhase: () => key, setSchedulePhase: (_u, _d, value) => { key = value } }
  const deps = { db, clock: () => time, lock: (_id, work) => work(),
    session: async () => ({ token: 'test', devices: [{ id: 'device', ownerUserId: 'user', isOnline: true }] }),
    write: async (_token, deviceId, frame) => { writes.push({ deviceId, watts: Buffer.from(frame, 'base64').readUInt16BE(4) }) }, ...overrides }
  return { executor: createSleepExecutor(deps), schedules, writes, deps, setTime: value => { time = at(value) } }
}

test('strict schedule validation rejects unsafe power, time and timezone', () => {
  for (const patch of [{ sleepW: -1 }, { sleepW: 1001 }, { wakeW: 1.5 }, { sleepW: '300' },
    { enabled: 'true' }, { sleepFrom: '24:00' }, { tz: 'invalid/zone' }, { sleepTo: '22:00' }]) {
    assert.throws(() => validateSchedule({ ...base, ...patch }))
  }
  assert.equal(validateSchedule({ ...base, sleepW: 0 }).sleepW, 0)
})
test('cross-midnight occurrence is stable at midnight and changes next day', () => {
  const before = scheduleTarget(base, at('2026-09-23T15:59:00Z'))
  assert.equal(scheduleTarget(base, at('2026-09-23T16:00:00Z')).key, before.key)
  assert.notEqual(scheduleTarget(base, at('2026-09-24T14:00:00Z')).key, before.key)
})
test('DST repeated hour does not repeat the same phase occurrence', () => {
  const schedule = { ...base, tz: 'America/New_York', sleepFrom: '01:00', sleepTo: '03:00' }
  assert.equal(scheduleTarget(schedule, at('2026-11-01T05:30:00Z')).key,
    scheduleTarget(schedule, at('2026-11-01T06:30:00Z')).key)
})
test('executes sleep, deduplicates retries, then restores wake watts', async () => {
  const f = fixture()
  assert.equal((await f.executor.tick()).applied, 1)
  assert.equal((await f.executor.tick()).unchanged, 1)
  f.setTime('2026-09-24T01:00:00Z')
  assert.equal((await f.executor.tick()).applied, 1)
  assert.deepEqual(f.writes.map(w => w.watts), [150, 400])
})
test('Smart Schedule explicit watts including 0 use the same exclusive slot', async () => {
  const f = fixture()
  Object.assign(f.schedules.device, { sleepW: 650, wakeW: 0 })
  await f.executor.tick()
  f.setTime('2026-09-24T01:00:00Z')
  await f.executor.tick()
  assert.deepEqual(f.writes.map(w => w.watts), [650, 0])
})
test('failed writes retry, without advancing phase', async () => {
  let calls = 0
  const f = fixture({ write: async () => { if (++calls === 1) throw new Error('offline') } })
  assert.equal((await f.executor.tick()).failed, 1)
  assert.equal((await f.executor.tick()).applied, 1)
})
test('late retry computes CURRENT watts, never replays missed sleep command', async () => {
  const f = fixture({ session: async () => {
    f.setTime('2026-09-24T01:00:00Z')
    return { token: 'test', devices: [{ id: 'device', isOnline: true }] }
  } })
  // Budget exceeded: defer instead of writing a stale command.
  assert.equal((await f.executor.tick()).deferred, 1)
  assert.equal(f.writes.length, 0)
  await f.executor.tick()
  assert.equal(f.writes[0].watts, 400)
})
test('dry run never obtains sessions, rotates credentials, or controls devices', async () => {
  const f = fixture({ session: () => { throw new Error('must not run') } })
  assert.equal((await f.executor.tick({ dryRun: true })).failed, 0)
  assert.equal(f.writes.length, 0)
  assert.equal(f.executor.status().lastTickAt, null)
})
test('offline, unbound, invalid schedules never write', async () => {
  for (const devices of [[], [{ id: 'device', isOnline: false }], [{ id: 'device', isOnline: true, ownerUserId: 'other' }]]) {
    const f = fixture({ session: async () => ({ token: 'test', devices }) })
    assert.equal((await f.executor.tick()).failed, 1)
    assert.equal(f.writes.length, 0)
  }
})
test('cancellation queued before executor acquires lock wins', async () => {
  const f = fixture({ lock: async (_id, work) => { f.schedules.device.enabled = false; return work() } })
  await f.executor.tick()
  assert.equal(f.writes.length, 0)
})
test('per-user lock serializes writes and survives a rejected predecessor', async () => {
  const order = []
  const a = withUserLock('lock-test', async () => { order.push(1); await new Promise(r => setTimeout(r, 5)); throw new Error('fail') })
  const b = withUserLock('lock-test', () => order.push(2))
  await Promise.allSettled([a, b])
  assert.deepEqual(order, [1, 2])
})
test('expired queued lock never runs work later', async () => {
  let release, ran = false
  const first = withUserLock('lock-deadline', () => new Promise(r => { release = r }))
  await Promise.resolve()
  const second = withUserLock('lock-deadline', () => { ran = true }, { deadline: Date.now() + 10 })
  await assert.rejects(second, /DEADLINE/)
  release()
  await first
  await new Promise(r => setTimeout(r, 5))
  assert.equal(ran, false)
})
test('HMAC rejects tampering, stale timestamps, replay and missing configuration', () => {
  const time = Date.now(), secret = 'x'.repeat(64), nonce = 'a'.repeat(32), body = '{"dryRun":true}'
  const headers = { 'x-sleep-timestamp': String(time), 'x-sleep-nonce': nonce,
    'x-sleep-signature': signTick(secret, String(time), nonce, body) }
  const verify = createTickVerifier(secret, () => time)
  assert.equal(verify(headers, '{}'), false)
  assert.equal(verify(headers, body), true)
  assert.equal(verify(headers, body), false)
  assert.equal(createTickVerifier(secret, () => time + 120001)(headers, body), false)
  assert.equal(createTickVerifier('')(headers, body), false)
})
test('Lambda signs only configured URL, validates business result, and preserves dry-run', async () => {
  const secret = 'x'.repeat(64), time = Date.now()
  const handler = lambda.createHandler({ relayUrl: 'https://relay.example.test', clock: () => time,
    nonce: () => 'a'.repeat(32), readSecret: async () => secret, request: async (url, options) => {
      assert.equal(String(url), 'https://relay.example.test/internal/sleep/tick')
      assert.equal(JSON.parse(options.body).dryRun, true)
      const headers = Object.fromEntries(Object.entries(options.headers).map(([k, v]) => [k.toLowerCase(), v]))
      assert.equal(createTickVerifier(secret, () => time)(headers, options.body), true)
      return new Response(JSON.stringify({ code: 0, data: { checked: 1 } }))
    } })
  assert.equal((await handler({ dryRun: true, relayUrl: 'https://evil.test' })).ok, true)
  const failing = lambda.createHandler({ relayUrl: 'https://relay.example.test', readSecret: async () => secret,
    request: async () => new Response(JSON.stringify({ code: 1 })) })
  await assert.rejects(failing(), /not acknowledged/)
})
