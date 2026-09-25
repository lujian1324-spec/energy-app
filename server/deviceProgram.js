// A device's schedule program (v4.22.0): Smart Schedule tasks, Charging Settings
// (AC charge power + Silent Mode) and the Charge & Discharge Limits.
//
// ONE implementation, used by both sides: the relay's background tick imports it
// directly, and the app imports the same file (through deviceProgram.d.ts), so
// "what should the device be doing now" can never be answered differently by the
// phone and by the server. Pure: no I/O, no clock of its own — `now` is passed in.
//
// Semantics
//  - Smart Schedule tasks are POINT events: "Start Charging 11:00 PM, every day",
//    "Turn Off AC Output 7:00 AM, Mon–Fri". A task fires at its time on each of its
//    days, in the program's IANA time zone. A task only acts at occurrences AFTER it
//    was last saved (`updatedAt`): creating "Stop Charging 7:00 AM" at 10:00 does
//    not stop charging until tomorrow at 7:00.
//  - Charging is paused/resumed by the latest charge event. With no charge event in
//    effect (none yet, or every charge task deleted/disabled) charging runs.
//  - AC output events are applied once, at their time. One the relay missed for
//    longer than AC_EVENT_GRACE_MS (device offline, outage) is dropped, not
//    replayed hours later over whatever the user did since.
//  - Silent Mode: the switch (`enabled`) turns the feature on. With "Scheduled
//    Silent Mode" off it limits the charge power all the time; with it on, only
//    inside the From–To window. The window crosses midnight when `to` <= `from`
//    ("9:00 AM next day"); `days` are the days a window STARTS on. Switching it on
//    inside a window applies at once. The limit is a cap: a power the user picks
//    at or under it (also during a window) is their setting and stays after the
//    window ends — the window never overrides it.
//  - AC charge power written to register 0x0085: 0 while charging is paused;
//    otherwise the saved power, capped at the Silent Mode limit while Silent Mode is
//    on. Changing the power never resumes a paused charge.

export const PROGRAM_VERSION = 1
export const MAX_TASKS = 20
/** An AC output event later than this is dropped rather than replayed. */
export const AC_EVENT_GRACE_MS = 30 * 60_000
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const TASK_ID = /^[A-Za-z0-9_-]{1,40}$/

export function isSierro2000(model) {
  return String(model || '').includes('2000')
}

/** AC Charging Power choices (W). Sierro 2000 doubles the Sierro 1000 range. */
export function chargePowerOptions(model) {
  return isSierro2000(model) ? [100, 200, 300, 400, 600, 800] : [50, 100, 150, 200, 300, 400]
}

/** Silent Mode's AC charging limit (W). */
export function silentCapW(model) {
  return isSierro2000(model) ? 300 : 150
}

/** The model's normal AC charge power (W) — the largest choice. */
export function defaultChargePowerW(model) {
  const opts = chargePowerOptions(model)
  return opts[opts.length - 1]
}

/** Charge Limit / Discharge Limit choices (%). Firmware support pending. */
export const CHARGE_LIMIT_OPTIONS = [100, 80, 60]
export const DISCHARGE_LIMIT_OPTIONS = [0, 10, 20]

export function defaultProgram(model, tz) {
  return {
    version: PROGRAM_VERSION,
    model: String(model || 'Sierro 1000'),
    tz: String(tz || 'UTC'),
    chargePowerW: defaultChargePowerW(model),
    silent: { enabled: false, scheduled: false, from: '20:00', to: '09:00', days: [...EVERY_DAY], updatedAt: 0 },
    tasks: [],
    limits: { chargeMax: 100, dischargeMin: 0 },
    savedAt: 0,
  }
}

// ── Validation (the relay stores only what passes) ────────────────────────────

function cleanDays(days, what) {
  if (!Array.isArray(days)) throw new Error(`${what}: days must be a list`)
  const set = [...new Set(days)]
  if (!set.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) throw new Error(`${what}: days are 0 (Sun) to 6 (Sat)`)
  return set.sort((a, b) => a - b)
}

function cleanTime(value, what) {
  if (!HHMM.test(value)) throw new Error(`${what}: use HH:MM`)
  return value
}

function cleanStamp(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

export function validateProgram(value) {
  if (!value || typeof value !== 'object') throw new Error('Program required')
  if (typeof value.model !== 'string' || !value.model || value.model.length > 80) throw new Error('Device model required')
  if (typeof value.tz !== 'string' || !value.tz) throw new Error('IANA timezone required')
  new Intl.DateTimeFormat('en', { timeZone: value.tz }).format()
  const options = chargePowerOptions(value.model)
  if (!options.includes(value.chargePowerW)) throw new Error(`Charge power must be one of ${options.join(', ')} W`)

  const s = value.silent || {}
  if (typeof s.enabled !== 'boolean' || typeof s.scheduled !== 'boolean') throw new Error('Silent Mode: enabled and scheduled must be booleans')
  const silent = {
    enabled: s.enabled,
    scheduled: s.scheduled,
    from: cleanTime(s.from, 'Silent Mode from'),
    to: cleanTime(s.to, 'Silent Mode to'),
    days: cleanDays(s.days, 'Silent Mode'),
    updatedAt: cleanStamp(s.updatedAt),
  }
  if (silent.enabled && silent.scheduled && silent.from === silent.to) throw new Error('Silent Mode: From and To must differ')
  if (silent.enabled && silent.scheduled && silent.days.length === 0) throw new Error('Silent Mode: pick at least one day')

  if (!Array.isArray(value.tasks) || value.tasks.length > MAX_TASKS) throw new Error(`At most ${MAX_TASKS} schedules`)
  const ids = new Set()
  const tasks = value.tasks.map((t, i) => {
    const what = `Schedule ${i + 1}`
    if (!t || !TASK_ID.test(t.id) || ids.has(t.id)) throw new Error(`${what}: bad id`)
    ids.add(t.id)
    if (t.kind !== 'ac' && t.kind !== 'charge') throw new Error(`${what}: kind is ac or charge`)
    const actions = t.kind === 'ac' ? ['on', 'off'] : ['start', 'stop']
    if (!actions.includes(t.action)) throw new Error(`${what}: action is ${actions.join(' or ')}`)
    if (typeof t.enabled !== 'boolean') throw new Error(`${what}: enabled must be a boolean`)
    const days = cleanDays(t.days, what)
    if (days.length === 0) throw new Error(`${what}: pick at least one day`)
    return { id: t.id, kind: t.kind, action: t.action, time: cleanTime(t.time, what), days, enabled: t.enabled, updatedAt: cleanStamp(t.updatedAt) }
  })
  const clash = findClash(tasks)
  if (clash) throw new Error(clash)

  const l = value.limits || {}
  const limits = {
    chargeMax: CHARGE_LIMIT_OPTIONS.includes(l.chargeMax) ? l.chargeMax : 100,
    dischargeMin: DISCHARGE_LIMIT_OPTIONS.includes(l.dischargeMin) ? l.dischargeMin : 0,
  }
  return {
    version: PROGRAM_VERSION, model: value.model, tz: value.tz, chargePowerW: value.chargePowerW,
    silent, tasks, limits, savedAt: cleanStamp(value.savedAt),
  }
}

/**
 * Two enabled tasks of the same kind at the same time on a shared day would fight
 * (start and stop at once). Returns the message to show, or null.
 */
export function findClash(tasks) {
  const on = tasks.filter(t => t.enabled)
  for (let i = 0; i < on.length; i++) {
    for (let j = i + 1; j < on.length; j++) {
      const a = on[i], b = on[j]
      if (a.kind === b.kind && a.time === b.time && a.days.some(d => b.days.includes(d))) {
        return `Two ${a.kind === 'ac' ? 'AC Output' : 'Charging'} schedules run at ${a.time} on the same day`
      }
    }
  }
  return null
}

// ── Time zones ────────────────────────────────────────────────────────────────

const fmtCache = new Map()
function formatter(tz) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    })
    fmtCache.set(tz, f)
  }
  return f
}

/** Wall-clock parts of instant `ms` in `tz`. */
export function zonedParts(ms, tz) {
  const parts = formatter(tz).formatToParts(new Date(ms))
  const get = type => Number(parts.find(p => p.type === type)?.value)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute'), s: get('second') }
}

function offsetMs(ms, tz) {
  const p = zonedParts(ms, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000
}

/** The instant a wall-clock time happens in `tz` (a time skipped by DST lands just after the gap). */
export function zonedToEpoch(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m - 1, d, h, min)
  const off1 = offsetMs(guess, tz)
  let t = guess - off1
  const off2 = offsetMs(t, tz)
  if (off2 !== off1) t = guess - off2
  return t
}

function hm(time) {
  const [h, m] = time.split(':').map(Number)
  return { h, m }
}

/** Occurrence of `time` on the local calendar day `k` days from the day of `now` (negative = back). */
function occurrenceOnDay(now, k, time, tz) {
  const today = zonedParts(now, tz)
  const day = new Date(Date.UTC(today.y, today.m - 1, today.d + k))
  const { h, m } = hm(time)
  return {
    at: zonedToEpoch(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, m, tz),
    weekday: day.getUTCDay(),
  }
}

/** The most recent instant <= now that `time` happened on one of `days`, or null. */
export function lastOccurrence(time, days, tz, now) {
  for (let k = 0; k >= -8; k--) {
    const o = occurrenceOnDay(now, k, time, tz)
    if (days.includes(o.weekday) && o.at <= now) return o.at
  }
  return null
}

/** The next instant > now that `time` happens on one of `days`, or null. */
export function nextOccurrence(time, days, tz, now) {
  for (let k = 0; k <= 8; k++) {
    const o = occurrenceOnDay(now, k, time, tz)
    if (days.includes(o.weekday) && o.at > now) return o.at
  }
  return null
}

/** Minutes of "HH:MM". */
export function minutesOf(time) {
  const { h, m } = hm(time)
  return h * 60 + m
}

/** Does the Silent Mode window end on the next day? */
export function crossesMidnight(from, to) {
  return minutesOf(to) <= minutesOf(from)
}

/** The days a window ends on (the day after each start day when it crosses midnight). */
export function windowEndDays(silent) {
  return crossesMidnight(silent.from, silent.to) ? silent.days.map(d => (d + 1) % 7) : [...silent.days]
}

// ── State at an instant ──────────────────────────────────────────────────────

/**
 * Silent Mode at `now`: { on, at, source }.
 *  - switched off → off (source 'off');
 *  - on, not scheduled → on all the time (source 'always');
 *  - on and scheduled → on inside the window: the latest window start is later
 *    than the latest window end (source 'window', `at` = that boundary).
 */
export function silentState(program, now) {
  const s = program.silent
  if (!s?.enabled) return { on: false, at: s?.updatedAt || 0, source: 'off' }
  if (!s.scheduled) return { on: true, at: s.updatedAt || 0, source: 'always' }
  const start = lastOccurrence(s.from, s.days, program.tz, now)
  const end = lastOccurrence(s.to, windowEndDays(s), program.tz, now)
  if (start == null) return { on: false, at: end ?? 0, source: 'window' }
  if (end == null || start > end) return { on: true, at: start, source: 'window' }
  return { on: false, at: end, source: 'window' }
}

/** When the current Silent Mode window ends / the next one starts (for the screens). */
export function nextSilentChange(program, now) {
  const s = program.silent
  if (!s?.enabled || !s.scheduled || !s.days.length) return null
  const st = silentState(program, now)
  return st.on
    ? { on: false, at: nextOccurrence(s.to, windowEndDays(s), program.tz, now) }
    : { on: true, at: nextOccurrence(s.from, s.days, program.tz, now) }
}

/** The latest occurrence <= now, after the task was saved, of each enabled task of `kind`. */
function latestTaskEvent(program, kind, now) {
  let best = null
  for (const t of program.tasks) {
    if (!t.enabled || t.kind !== kind) continue
    const at = lastOccurrence(t.time, t.days, program.tz, now)
    if (at == null || at < (t.updatedAt || 0)) continue
    if (!best || at > best.at) best = { task: t, at }
  }
  return best
}

/** Charging at `now`: { charging, at, taskId } — paused only by a Stop Charging event in effect. */
export function chargeState(program, now) {
  const e = latestTaskEvent(program, 'charge', now)
  if (!e) return { charging: true, at: 0, taskId: null }
  return { charging: e.task.action === 'start', at: e.at, taskId: e.task.id }
}

/** The AC charge power (W) the device should run at `now` (register 0x0085). */
export function effectiveChargeW(program, now) {
  if (!chargeState(program, now).charging) return 0
  const cap = silentCapW(program.model)
  return silentState(program, now).on ? Math.min(program.chargePowerW, cap) : program.chargePowerW
}

/**
 * What the relay writes to 0x0085, and a key that changes exactly when that
 * decision does (a new charge event, a Silent boundary, a new power).
 */
export function chargeTarget(program, now) {
  const c = chargeState(program, now)
  const s = silentState(program, now)
  const watts = effectiveChargeW(program, now)
  return { watts, key: `${c.taskId ?? '-'}@${c.at}|${s.source}${s.on ? '+' : '-'}@${s.at}|${watts}` }
}

/**
 * The AC output event the relay still owes at `now`: the latest enabled AC task
 * occurrence (after its save) no older than AC_EVENT_GRACE_MS, or null.
 */
export function acTarget(program, now, graceMs = AC_EVENT_GRACE_MS) {
  const e = latestTaskEvent(program, 'ac', now)
  if (!e || now - e.at > graceMs) return null
  return { on: e.task.action === 'on', at: e.at, key: `${e.task.id}@${e.at}` }
}

/** Does this program need the background tick at all? */
export function programNeedsTick(program) {
  if (!program) return false
  return (program.silent?.enabled === true && program.silent?.scheduled === true) || (program.tasks || []).some(t => t.enabled)
}
