import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EVERY_DAY, acTarget, chargePowerOptions, chargeState, chargeTarget, crossesMidnight, defaultProgram,
  effectiveChargeW, findClash, lastOccurrence, nextOccurrence, nextSilentChange, silentCapW, silentState, validateProgram,
  zonedParts, zonedToEpoch,
} from './deviceProgram.js'

const LA = 'America/Los_Angeles'
const at = (iso) => Date.parse(iso)
const prog = (over = {}) => ({ ...defaultProgram('Sierro 1000', LA), savedAt: 1, ...over })
const task = (over) => ({ id: 't1', kind: 'charge', action: 'stop', time: '07:00', days: [...EVERY_DAY], enabled: true, updatedAt: 0, ...over })

test('per-model power choices and Silent Mode limit (Sierro 2000 doubles)', () => {
  assert.deepEqual(chargePowerOptions('Sierro 1000'), [50, 100, 150, 200, 300, 400])
  assert.deepEqual(chargePowerOptions('Sierro 2000'), [100, 200, 300, 400, 600, 800])
  assert.equal(silentCapW('Sierro 1000'), 150)
  assert.equal(silentCapW('Sierro 2000'), 300)
  assert.equal(defaultProgram('Sierro 2000', LA).chargePowerW, 800)
})

test('time zone conversion, DST included', () => {
  // 2026-03-08 is the spring-forward day in Los Angeles (02:00 → 03:00).
  assert.equal(zonedToEpoch(2026, 3, 7, 23, 0, LA), at('2026-03-08T07:00:00Z'))
  assert.equal(zonedToEpoch(2026, 3, 8, 23, 0, LA), at('2026-03-09T06:00:00Z'))
  assert.deepEqual(zonedParts(at('2026-09-24T22:00:00Z'), LA), { y: 2026, m: 9, d: 24, h: 15, min: 0, s: 0 })
  // The same wall time in another zone.
  assert.equal(zonedToEpoch(2026, 9, 24, 7, 0, 'Asia/Shanghai'), at('2026-09-23T23:00:00Z'))
})

test('occurrences honour repeat days in the program time zone', () => {
  const now = at('2026-09-24T22:00:00Z') // Thu 15:00 in LA
  assert.equal(lastOccurrence('07:00', EVERY_DAY, LA, now), at('2026-09-24T14:00:00Z'))
  assert.equal(nextOccurrence('07:00', EVERY_DAY, LA, now), at('2026-09-25T14:00:00Z'))
  // Weekends only: the last one was Sunday Sep 20, the next Saturday Sep 26.
  assert.equal(lastOccurrence('07:00', [0, 6], LA, now), at('2026-09-20T14:00:00Z'))
  assert.equal(nextOccurrence('07:00', [0, 6], LA, now), at('2026-09-26T14:00:00Z'))
})

test('charging: the latest start/stop event after the task was saved decides', () => {
  const now = at('2026-09-24T22:00:00Z') // 15:00 LA
  // No charge tasks → charging.
  assert.equal(chargeState(prog(), now).charging, true)
  // Stop 07:00 + Start 23:00: at 15:00 the 07:00 stop is in effect.
  const both = prog({ tasks: [task({ id: 'stop' }), task({ id: 'start', action: 'start', time: '23:00' })] })
  assert.deepEqual(chargeState(both, now), { charging: false, at: at('2026-09-24T14:00:00Z'), taskId: 'stop' })
  // At 23:30 the start (crossing into the evening) is.
  assert.equal(chargeState(both, at('2026-09-25T06:30:00Z')).charging, true)
  // A stop created at 10:00 does not act on today's 07:00 — only from tomorrow.
  const fresh = prog({ tasks: [task({ updatedAt: at('2026-09-24T17:00:00Z') })] })
  assert.equal(chargeState(fresh, now).charging, true)
  assert.equal(chargeState(fresh, at('2026-09-25T14:30:00Z')).charging, false)
  // A disabled task does nothing.
  assert.equal(chargeState(prog({ tasks: [task({ enabled: false })] }), now).charging, true)
})

test('changing the power never resumes a paused charge', () => {
  const now = at('2026-09-24T22:00:00Z')
  const paused = prog({ tasks: [task()], chargePowerW: 300 })
  assert.equal(effectiveChargeW(paused, now), 0)
  assert.equal(effectiveChargeW({ ...paused, chargePowerW: 100 }, now), 0)
})

test('Silent Mode window crosses midnight and caps the power', () => {
  const silent = { enabled: true, scheduled: true, from: '20:00', to: '09:00', days: [...EVERY_DAY], updatedAt: 0 }
  const p = prog({ silent, chargePowerW: 400 })
  assert.equal(crossesMidnight('20:00', '09:00'), true)
  assert.equal(silentState(p, at('2026-09-25T04:00:00Z')).on, true)   // 21:00
  assert.equal(silentState(p, at('2026-09-25T15:00:00Z')).on, true)   // 08:00 next day
  assert.equal(silentState(p, at('2026-09-25T16:30:00Z')).on, false)  // 09:30
  assert.equal(effectiveChargeW(p, at('2026-09-25T04:00:00Z')), 150)
  assert.equal(effectiveChargeW(p, at('2026-09-25T16:30:00Z')), 400)
  // A power the user picked at or under the cap is theirs, inside the window and after it.
  assert.equal(effectiveChargeW({ ...p, chargePowerW: 100 }, at('2026-09-25T04:00:00Z')), 100)
  assert.equal(effectiveChargeW({ ...p, chargePowerW: 100 }, at('2026-09-25T16:30:00Z')), 100)
  assert.deepEqual(nextSilentChange(p, at('2026-09-25T04:00:00Z')), { on: false, at: at('2026-09-25T16:00:00Z') })
})

test('Silent Mode window on selected days only: a Friday-night window ends Saturday morning', () => {
  const silent = { enabled: true, scheduled: true, from: '22:00', to: '06:00', days: [5], updatedAt: 0 }
  const p = prog({ silent })
  assert.equal(silentState(p, at('2026-09-26T07:00:00Z')).on, true)  // Sat 00:00 (window from Fri)
  assert.equal(silentState(p, at('2026-09-26T14:00:00Z')).on, false) // Sat 07:00
  assert.equal(silentState(p, at('2026-09-25T07:00:00Z')).on, false) // Fri 00:00 (Thu not listed)
})

test('the Silent Mode switch: off never limits, on without a schedule always does', () => {
  const now = at('2026-09-24T22:00:00Z')
  const base = { enabled: false, scheduled: true, from: '20:00', to: '09:00', days: [...EVERY_DAY], updatedAt: 0 }
  assert.equal(silentState(prog({ silent: base }), at('2026-09-25T04:00:00Z')).on, false)
  assert.equal(silentState(prog({ silent: { ...base, enabled: true, scheduled: false } }), now).on, true)
  assert.equal(effectiveChargeW(prog({ silent: { ...base, enabled: true, scheduled: false } }), now), 150)
  // Switched on inside a window: limited at once.
  assert.equal(silentState(prog({ silent: { ...base, enabled: true } }), at('2026-09-25T04:00:00Z')).on, true)
})

test('chargeTarget key changes exactly when the decision does', () => {
  const p = prog({ tasks: [task({ id: 'stop' }), task({ id: 'start', action: 'start', time: '23:00' })] })
  const a = chargeTarget(p, at('2026-09-24T18:00:00Z'))
  const b = chargeTarget(p, at('2026-09-24T22:00:00Z'))
  assert.equal(a.key, b.key)
  assert.equal(a.watts, 0)
  const c = chargeTarget(p, at('2026-09-25T06:05:00Z'))
  assert.notEqual(c.key, b.key)
  assert.equal(c.watts, 400)
  // The same event on the next day is a new decision (re-asserted after a reboot).
  assert.notEqual(chargeTarget(p, at('2026-09-25T14:05:00Z')).key, b.key)
})

test('AC output events apply once, within the grace period only', () => {
  const p = prog({ tasks: [task({ id: 'off', kind: 'ac', action: 'off', time: '07:00' })] })
  const t = acTarget(p, at('2026-09-24T14:10:00Z'))
  assert.deepEqual(t, { on: false, at: at('2026-09-24T14:00:00Z'), key: `off@${at('2026-09-24T14:00:00Z')}` })
  assert.equal(acTarget(p, at('2026-09-24T14:45:00Z')), null)
  assert.equal(acTarget(prog(), at('2026-09-24T14:10:00Z')), null)
})

test('validation keeps only a well-formed program', () => {
  const good = prog({ tasks: [task({ id: 'a' }), task({ id: 'b', action: 'start', time: '23:00', days: [1, 2, 1] })] })
  const clean = validateProgram(good)
  assert.deepEqual(clean.tasks[1].days, [1, 2])
  assert.throws(() => validateProgram({ ...good, chargePowerW: 250 }), /one of/)
  assert.throws(() => validateProgram({ ...good, chargePowerW: 800 }), /one of/)
  assert.doesNotThrow(() => validateProgram({ ...good, model: 'Sierro 2000', chargePowerW: 800 }))
  assert.throws(() => validateProgram({ ...good, tz: 'Not/AZone' }))
  assert.throws(() => validateProgram({ ...good, tasks: [task({ time: '7:00' })] }), /HH:MM/)
  assert.throws(() => validateProgram({ ...good, tasks: [task({ days: [] })] }), /at least one day/)
  assert.throws(() => validateProgram({ ...good, tasks: [task({ kind: 'ac', action: 'stop' })] }), /on or off/)
  assert.throws(() => validateProgram({ ...good, tasks: [task({ id: 'x' }), task({ id: 'x' })] }), /bad id/)
  assert.throws(() => validateProgram({ ...good, silent: { ...good.silent, enabled: true, scheduled: true, from: '08:00', to: '08:00' } }), /must differ/)
  assert.throws(() => validateProgram({ ...good, tasks: Array.from({ length: 21 }, (_, i) => task({ id: `t${i}`, enabled: false })) }), /At most/)
})

test('two enabled tasks of one kind at the same time on a shared day clash', () => {
  assert.match(findClash([task({ id: 'a' }), task({ id: 'b', action: 'start', days: [3] })]), /Charging schedules run at 07:00/)
  assert.equal(findClash([task({ id: 'a', days: [1] }), task({ id: 'b', action: 'start', days: [2] })]), null)
  assert.equal(findClash([task({ id: 'a' }), task({ id: 'b', kind: 'ac', action: 'on' })]), null)
  assert.equal(findClash([task({ id: 'a' }), task({ id: 'b', action: 'start', enabled: false })]), null)
})

test('a save never changes what already happened (v4.23.2)', () => {
  const stop = task({ id: 'stop', action: 'stop', time: '07:00' })
  const start = task({ id: 'start', action: 'start', time: '23:00' })
  const tenAm = at('2026-09-24T17:00:00Z') // 10:00 LA
  const before = prog({ tasks: [stop, start] })
  assert.equal(chargeState(before, tenAm).charging, false)
  // Only the Stop task's days are edited at 10:00: it is restamped, so today's 07:00
  // no longer counts. The baseline carries the pause until the next event.
  const edited = prog({
    tasks: [{ ...stop, days: [1, 2, 3, 4, 5], updatedAt: tenAm }, start],
    savedAt: tenAm, chargeBaseline: chargeState(before, tenAm).charging,
  })
  assert.equal(chargeState(edited, tenAm + 60_000).charging, false)
  assert.equal(effectiveChargeW(edited, tenAm + 60_000), 0)
  // 23:00 Start fires after the save: charging again.
  assert.equal(chargeState(edited, at('2026-09-25T06:30:00Z')).charging, true)

  // Without a baseline (saved before v4.23.2) the old rule stands.
  const legacy = { ...edited }
  delete legacy.chargeBaseline
  assert.equal(chargeState(legacy, tenAm + 60_000).charging, true)

  // An AC event before the save is not owed any more, even inside the grace period.
  const acOff = task({ id: 'ac', kind: 'ac', action: 'off', time: '07:00' })
  const sevenTen = at('2026-09-24T14:10:00Z')
  assert.ok(acTarget(prog({ tasks: [acOff] }), sevenTen))
  assert.equal(acTarget(prog({ tasks: [acOff], savedAt: sevenTen - 60_000 }), sevenTen), null)
  // validateProgram keeps the baseline.
  assert.equal(validateProgram(edited).chargeBaseline, false)
})
