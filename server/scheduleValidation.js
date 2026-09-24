import { phaseFor, minutesInTz, timeToMin, chargePowerForPhase } from './sleepSchedule.js'

const hhmm = /^(?:[01]\d|2[0-3]):[0-5]\d$/
export function validateSchedule(value) {
  if (!value || typeof value.enabled !== 'boolean') throw new Error('enabled must be a boolean')
  if (!hhmm.test(value.sleepFrom) || !hhmm.test(value.sleepTo)) throw new Error('Use HH:MM times')
  if (value.enabled && value.sleepFrom === value.sleepTo) throw new Error('Window must not be empty')
  if (typeof value.tz !== 'string' || !value.tz) throw new Error('IANA timezone required')
  new Intl.DateTimeFormat('en', { timeZone: value.tz }).format()
  if (typeof value.model !== 'string' || value.model.length > 80) throw new Error('Device model required')
  const clean = { enabled: value.enabled, sleepFrom: value.sleepFrom, sleepTo: value.sleepTo, tz: value.tz, model: value.model }
  // SW-14: which feature owns this window, so the tick can pause Smart Schedule
  // without pausing Sleep Mode. Optional — an upload from a client older than
  // this carries no tag and is executed as before (see smartSchedulePause.js).
  if (value.mode !== undefined) {
    if (value.mode !== 'sleep' && value.mode !== 'smart') throw new Error('Mode must be sleep or smart')
    clean.mode = value.mode
  }
  for (const key of ['sleepW', 'wakeW']) {
    if (value[key] !== undefined) {
      if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 1000) throw new Error('Power must be 0-1000 whole watts')
      clean[key] = value[key]
    }
  }
  return clean
}

// Include the wall-clock date of the most recent boundary. Unlike just 'sleep',
// this catches up after an outage that spans an entire daily cycle, without an
// extra write at midnight or a duplicate during the repeated DST hour.
export function scheduleTarget(schedule, now = Date.now()) {
  const phase = phaseFor(schedule, now)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: schedule.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = type => Number(parts.find(p => p.type === type).value)
  const date = new Date(Date.UTC(part('year'), part('month') - 1, part('day')))
  const boundary = phase === 'sleep' ? schedule.sleepFrom : schedule.sleepTo
  if (minutesInTz(now, schedule.tz) < timeToMin(boundary)) date.setUTCDate(date.getUTCDate() - 1)
  const watts = chargePowerForPhase(schedule.model, phase, schedule)
  return { phase, watts, key: `${date.toISOString().slice(0, 10)}|${phase}|${watts}` }
}
