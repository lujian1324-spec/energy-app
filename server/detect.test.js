// Run with:  node --test server/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectOutage, detectOutageFromAlarms, detectLowBattery, detectSolar } from './detect.js'

const f = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { value: v }]))

test('detectOutage: fires on an exact outage key that is on', () => {
  assert.equal(detectOutage(f({ lineLoss: 1 })).outage, true)
  assert.equal(detectOutage(f({ gridVoltLows: '1' })).outage, true)
  assert.equal(detectOutage(f({ bypassUndervoltageFault: true })).outage, true)
})

test('detectOutage: does not fire on off/absent keys or unrelated fields', () => {
  assert.equal(detectOutage(f({ lineLoss: 0 })).outage, false)
  assert.equal(detectOutage(f({ mainsCharging: 1 })).outage, false) // not an outage key
  assert.equal(detectOutage(f({})).outage, false)
  assert.equal(detectOutage(undefined).outage, false)
})

test('detectLowBattery: below threshold fires, at/above does not', () => {
  assert.equal(detectLowBattery(f({ remainingBatteryCapacity: 25 }), 30).low, true)
  assert.equal(detectLowBattery(f({ remainingBatteryCapacity: 30 }), 30).low, false) // strict <
  assert.equal(detectLowBattery(f({ remainingBatteryCapacity: 55 }), 30).low, false)
})

test('detectLowBattery: ignores non-positive / non-numeric SOC', () => {
  assert.equal(detectLowBattery(f({ remainingBatteryCapacity: 0 }), 30).low, false)
  assert.equal(detectLowBattery(f({}), 30).low, false)
})

test('detectLowBattery: default threshold is 30', () => {
  assert.equal(detectLowBattery(f({ remainingBatteryCapacity: 29 })).low, true)
})

test('detectSolar: 0→positive = started, positive→0 = stopped', () => {
  assert.equal(detectSolar(0, f({ generationPower: 120 })).event, 'started')
  assert.equal(detectSolar(120, f({ generationPower: 0 })).event, 'stopped')
})

test('detectSolar: no edge when staying on the same side of 0', () => {
  assert.equal(detectSolar(100, f({ generationPower: 200 })).event, null)
  assert.equal(detectSolar(0, f({ generationPower: 0 })).event, null)
  // returns the new genW so callers can persist it across ticks
  assert.equal(detectSolar(100, f({ generationPower: 200 })).genW, 200)
})

// The poller read only /state/latest, so an outage the platform records as an
// ALARM was invisible to it — which is how Low Battery could push while Mains
// power failure never did, both being gated on the same fields map.
test('detectOutageFromAlarms: fires on the alarm the platform actually records', () => {
  assert.equal(detectOutageFromAlarms([{ alarmMessage: 'Mains power failure' }]).outage, true)
  assert.equal(detectOutageFromAlarms([{ key: 'lineLoss' }]).outage, true)
  assert.equal(detectOutageFromAlarms([{ name: '市电停电' }]).outage, true)
  assert.equal(detectOutageFromAlarms([{ message: 'AC input fail' }]).outage, true)
})

test('detectOutageFromAlarms: ignores an alarm that is no longer firing', () => {
  assert.equal(detectOutageFromAlarms([{ alarmMessage: 'Mains power failure', isProcessed: true }]).outage, false)
  assert.equal(detectOutageFromAlarms([{ alarmMessage: 'Mains power failure', recoveredAt: '2026-09-10T00:00:00Z' }]).outage, false)
})

test('detectOutageFromAlarms: does not fire on an unrelated alarm', () => {
  assert.equal(detectOutageFromAlarms([{ alarmMessage: 'Cell overvoltage' }]).outage, false)
  assert.equal(detectOutageFromAlarms([{ alarmMessage: 'Battery over temperature' }]).outage, false)
})

test('detectOutageFromAlarms: survives whatever the list turns out to be', () => {
  assert.equal(detectOutageFromAlarms(undefined).outage, false)
  assert.equal(detectOutageFromAlarms([]).outage, false)
  assert.equal(detectOutageFromAlarms([null, {}]).outage, false)
})
