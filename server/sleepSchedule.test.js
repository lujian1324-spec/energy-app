import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getPowers, timeToMin, isInSleepWindow, minutesInTz, phaseFor, chargePowerForPhase,
} from './sleepSchedule.js'

test('getPowers: per-model sleep/wake watts', () => {
  assert.deepEqual(getPowers('Sierro 1000'), { sleepW: 150, wakeW: 400 })
  assert.deepEqual(getPowers('Sierro 2000'), { sleepW: 300, wakeW: 800 })
  assert.deepEqual(getPowers('anything else'), { sleepW: 150, wakeW: 400 }) // default = 1000
  assert.deepEqual(getPowers(undefined), { sleepW: 150, wakeW: 400 })
})

test('timeToMin', () => {
  assert.equal(timeToMin('00:00'), 0)
  assert.equal(timeToMin('09:30'), 570)
  assert.equal(timeToMin('22:00'), 1320)
  assert.equal(timeToMin('garbage'), 0)
})

test('isInSleepWindow: same-day window', () => {
  const from = timeToMin('01:00'), to = timeToMin('06:00')
  assert.equal(isInSleepWindow(timeToMin('00:30'), from, to), false)
  assert.equal(isInSleepWindow(timeToMin('01:00'), from, to), true)  // inclusive start
  assert.equal(isInSleepWindow(timeToMin('05:59'), from, to), true)
  assert.equal(isInSleepWindow(timeToMin('06:00'), from, to), false) // exclusive end
})

test('isInSleepWindow: midnight-wrap window (22:00→09:00)', () => {
  const from = timeToMin('22:00'), to = timeToMin('09:00')
  assert.equal(isInSleepWindow(timeToMin('23:30'), from, to), true)
  assert.equal(isInSleepWindow(timeToMin('02:00'), from, to), true)
  assert.equal(isInSleepWindow(timeToMin('08:59'), from, to), true)
  assert.equal(isInSleepWindow(timeToMin('09:00'), from, to), false)
  assert.equal(isInSleepWindow(timeToMin('12:00'), from, to), false)
})

test('isInSleepWindow: empty window never sleeps', () => {
  assert.equal(isInSleepWindow(timeToMin('05:00'), timeToMin('05:00'), timeToMin('05:00')), false)
})

test('minutesInTz: computes wall-clock minutes in a fixed offset zone', () => {
  // 2026-01-01T00:00:00Z → in Asia/Taipei (UTC+8) that is 08:00 = 480 min.
  const utcMidnight = Date.UTC(2026, 0, 1, 0, 0, 0)
  assert.equal(minutesInTz(utcMidnight, 'Asia/Taipei'), 480)
  // Same instant in UTC = 00:00 = 0 min.
  assert.equal(minutesInTz(utcMidnight, 'UTC'), 0)
})

test('phaseFor: uses the schedule tz', () => {
  const utcMidnight = Date.UTC(2026, 0, 1, 0, 0, 0) // 08:00 in Taipei
  // Window 22:00→09:00: 08:00 Taipei is inside → sleep.
  assert.equal(phaseFor({ sleepFrom: '22:00', sleepTo: '09:00', tz: 'Asia/Taipei' }, utcMidnight), 'sleep')
  // Same instant is 00:00 UTC, also inside 22:00→09:00 → sleep.
  assert.equal(phaseFor({ sleepFrom: '22:00', sleepTo: '09:00', tz: 'UTC' }, utcMidnight), 'sleep')
  // Window 01:00→06:00: 08:00 Taipei is outside → wake.
  assert.equal(phaseFor({ sleepFrom: '01:00', sleepTo: '06:00', tz: 'Asia/Taipei' }, utcMidnight), 'wake')
})

test('chargePowerForPhase', () => {
  assert.equal(chargePowerForPhase('Sierro 1000', 'sleep'), 150)
  assert.equal(chargePowerForPhase('Sierro 1000', 'wake'), 400)
  assert.equal(chargePowerForPhase('Sierro 2000', 'sleep'), 300)
  assert.equal(chargePowerForPhase('Sierro 2000', 'wake'), 800)
})
