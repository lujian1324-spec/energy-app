import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSleepExecutor } from './sleepExecutor.js'
import { validateSchedule } from './scheduleValidation.js'
import { isSmartSchedulePaused, isPausedSmartSchedule } from './smartSchedulePause.js'

const base = { enabled: true, sleepFrom: '22:00', sleepTo: '09:00', tz: 'Asia/Taipei', model: 'Sierro 1000' }
const at = value => Date.parse(value)

/* One user with a Sleep window and a Smart Schedule window, both due a write. */
function fixture(schedules) {
  let time = at('2026-09-23T14:00:00Z')
  const writes = []
  const user = { userId: 'user', schedules }
  const db = { getAllUsers: () => [user], getUser: () => user,
    getSchedulePhase: () => null, setSchedulePhase: () => {} }
  const devices = Object.keys(schedules).map(id => ({ id, ownerUserId: 'user', isOnline: true }))
  return {
    writes,
    executor: createSleepExecutor({ db, clock: () => time, lock: (_id, work) => work(),
      session: async () => ({ token: 'test', devices }),
      write: async (_token, deviceId) => { writes.push(deviceId) } }),
  }
}

test('pause defaults to on and only an explicit off resumes the service', () => {
  assert.equal(isSmartSchedulePaused({}), true)
  assert.equal(isSmartSchedulePaused({ SMART_SCHEDULE_PAUSED: '' }), true)
  assert.equal(isSmartSchedulePaused({ SMART_SCHEDULE_PAUSED: 'true' }), true)
  assert.equal(isSmartSchedulePaused({ SMART_SCHEDULE_PAUSED: 'anything' }), true)
  for (const off of ['false', 'FALSE', '0', 'no', 'off', ' false ']) {
    assert.equal(isSmartSchedulePaused({ SMART_SCHEDULE_PAUSED: off }), false, off)
  }
})

test('only schedules tagged smart are paused — untagged and sleep keep running', () => {
  const paused = { SMART_SCHEDULE_PAUSED: 'true' }
  assert.equal(isPausedSmartSchedule({ ...base, mode: 'smart' }, paused), true)
  assert.equal(isPausedSmartSchedule({ ...base, mode: 'sleep' }, paused), false)
  assert.equal(isPausedSmartSchedule({ ...base }, paused), false)
  assert.equal(isPausedSmartSchedule(undefined, paused), false)
  // Resumed: the same smart window is dispatched again.
  assert.equal(isPausedSmartSchedule({ ...base, mode: 'smart' }, { SMART_SCHEDULE_PAUSED: 'false' }), false)
})

test('validateSchedule carries the mode through and rejects anything else', () => {
  assert.equal(validateSchedule({ ...base, mode: 'smart' }).mode, 'smart')
  assert.equal(validateSchedule({ ...base, mode: 'sleep' }).mode, 'sleep')
  // Untagged stays untagged rather than being defaulted — the executor reads
  // "no tag" as "not Smart Schedule's", and inventing one would hide that.
  assert.equal('mode' in validateSchedule(base), false)
  for (const bad of ['SMART', 'peak', '', 1, null]) {
    assert.throws(() => validateSchedule({ ...base, mode: bad }))
  }
})

test('the tick skips smart windows and still writes the sleep ones', async () => {
  const f = fixture({
    sleepDevice: { ...base, mode: 'sleep' },
    smartDevice: { ...base, mode: 'smart', sleepW: 0, wakeW: 400 },
    legacyDevice: { ...base },
  })
  const result = await f.executor.tick()
  assert.deepEqual(f.writes.sort(), ['legacyDevice', 'sleepDevice'])
  assert.equal(result.paused, 1)
  assert.equal(result.applied, 2)
  // A paused window is not counted as examined-and-unapplied, and above all it
  // is not a failure: the tick must stay green so Sleep Mode keeps ticking.
  assert.equal(result.checked, 2)
  assert.equal(result.failed, 0)
})

test('a device left with only a smart window makes the tick a clean no-op', async () => {
  const f = fixture({ smartDevice: { ...base, mode: 'smart' } })
  const result = await f.executor.tick()
  assert.deepEqual(f.writes, [])
  assert.equal(result.paused, 1)
  assert.equal(result.failed, 0)
  assert.equal(result.deferred, 0)
})
