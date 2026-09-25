/**
 * Device program (v4.22.0) — Smart Schedule, Charging Settings, Silent Mode and the
 * Charge & Discharge Limits of one device.
 *
 * The rules themselves live in `server/deviceProgram.js` and are imported here
 * unchanged: the relay's background tick runs the same file, so the app and the
 * server can never disagree about what the device should be doing. This module
 * adds only what the screens need (labels, ids, a legacy Sleep Mode migration).
 */
export * from '../../server/deviceProgram.js'
export type { DeviceProgram, ScheduleTask, SilentSettings, ChargeLimits } from '../../server/deviceProgram.js'
import {
  EVERY_DAY, chargePowerOptions, chargeState, crossesMidnight, defaultProgram, nextOccurrence,
  type DeviceProgram, type ScheduleTask,
} from '../../server/deviceProgram.js'

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon … Sun, as the pickers show them
export const DAY_LETTERS: Record<number, string> = { 0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S' }

/** "Every day" / "Weekdays" / "Weekends" / "Mon, Wed, Fri". */
export function repeatLabel(days: number[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b)
  if (set.length === 7) return 'Every day'
  if (set.join() === '1,2,3,4,5') return 'Weekdays'
  if (set.join() === '0,6') return 'Weekends'
  if (set.length === 0) return 'Never'
  return WEEK_ORDER.filter(d => set.includes(d)).map(d => DAY_SHORT[d]).join(', ')
}

/** "23:00" → "11:00 PM". */
export function time12(t: string): string {
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return t
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function taskTitle(task: Pick<ScheduleTask, 'kind' | 'action'>): string {
  if (task.kind === 'ac') return task.action === 'on' ? 'Turn On AC Output' : 'Turn Off AC Output'
  return task.action === 'start' ? 'Start Charging' : 'Stop Charging'
}

/** Silent Mode's "To" row: the time, plus "Next day" when the window crosses midnight. */
export function silentToLabel(from: string, to: string): { time: string; nextDay: boolean } {
  return { time: time12(to), nextDay: crossesMidnight(from, to) }
}

export function newTaskId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function newTask(kind: 'ac' | 'charge'): ScheduleTask {
  return {
    id: newTaskId(),
    kind,
    action: kind === 'ac' ? 'on' : 'start',
    time: kind === 'ac' ? '07:00' : '23:00',
    days: [...EVERY_DAY],
    enabled: true,
    updatedAt: 0,
  }
}

/** The nearest AC Charging Power choice at or under `watts` (the smallest choice if none). */
export function snapChargePower(model: string, watts: number | null | undefined): number {
  const opts = chargePowerOptions(model)
  if (typeof watts !== 'number' || !Number.isFinite(watts)) return opts[opts.length - 1]
  const under = opts.filter(o => o <= watts)
  return under.length ? under[under.length - 1] : opts[0]
}

/** The phone's IANA zone — the zone every time in a program is read in. */
export function phoneTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

/**
 * A program for a device that has none yet. A Sleep Mode window saved before
 * v4.22.0 becomes the Silent Mode schedule (every day), and its outside-sleep
 * power the AC Charging Power — Silent Mode replaces Sleep Mode.
 */
export function initialProgram(
  model: string,
  legacySleep?: { enabled?: boolean; sleepFrom?: string; sleepTo?: string; wakeW?: number } | null,
): DeviceProgram {
  const p = defaultProgram(model, phoneTimeZone())
  if (legacySleep?.enabled && legacySleep.sleepFrom && legacySleep.sleepTo && legacySleep.sleepFrom !== legacySleep.sleepTo) {
    p.silent = { ...p.silent, enabled: true, scheduled: true, from: legacySleep.sleepFrom, to: legacySleep.sleepTo, days: [...EVERY_DAY] }
    if (typeof legacySleep.wakeW === 'number') p.chargePowerW = snapChargePower(model, legacySleep.wakeW)
  }
  return p
}

/** A stored program read on a phone whose model or zone may differ: keep it valid for this device. */
export function adaptProgram(program: DeviceProgram, model: string): DeviceProgram {
  const opts = chargePowerOptions(model)
  return {
    ...program,
    model,
    chargePowerW: opts.includes(program.chargePowerW) ? program.chargePowerW : snapChargePower(model, program.chargePowerW),
  }
}

/** When a task next runs, for its row ("Next: Tomorrow 7:00 AM" is left to the caller). */
export function nextRun(program: DeviceProgram, task: ScheduleTask, now = Date.now()): number | null {
  if (!task.enabled || task.days.length === 0) return null
  return nextOccurrence(task.time, task.days, program.tz, now)
}

/** The same task apart from its stamp: what counts as "edited" when saving or merging. */
export const sameTask = (a: ScheduleTask, b: ScheduleTask) =>
  a.kind === b.kind && a.action === b.action && a.time === b.time && a.enabled === b.enabled
  && a.days.length === b.days.length && a.days.every((d, i) => d === b.days[i])

/**
 * Stamp what changed since the last saved program: a new or edited task gets
 * `updatedAt = now` (so it acts from its next occurrence, never retroactively),
 * and so does an edited Silent Mode schedule.
 */
export function stampChanges(prev: DeviceProgram | null, next: DeviceProgram, now: number): DeviceProgram {
  const before = new Map((prev?.tasks ?? []).map(t => [t.id, t]))
  const tasks = next.tasks.map(t => {
    const old = before.get(t.id)
    return old && sameTask(old, t) ? { ...t, updatedAt: old.updatedAt } : { ...t, updatedAt: now }
  })
  const ps = prev?.silent
  const s = next.silent
  const silentChanged = !ps || ps.enabled !== s.enabled || ps.scheduled !== s.scheduled || ps.from !== s.from || ps.to !== s.to
    || ps.days.join() !== s.days.join()
  return {
    ...next,
    tasks,
    silent: { ...s, updatedAt: silentChanged ? now : ps!.updatedAt },
    savedAt: now,
    // Charging as the replaced program had it now: the state until a charge task of
    // this one fires (v4.23.2) — a save never resumes or pauses a charge by itself.
    chargeBaseline: prev ? chargeState(prev, now).charging : true,
  }
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Another phone saved this device's program while this one was editing (v4.23.1):
 * re-apply this phone's own changes — `mine` compared with the `base` it was edited
 * from — on top of the program now stored (`current`). What this phone did not
 * touch keeps the other phone's value.
 *  - Tasks, by id: added here → added; deleted here → deleted; edited here → this
 *    phone's version (added back if the other phone had deleted it).
 *  - Charging power, Silent Mode, limits: this phone's value where it changed it.
 */
export function rebaseProgram(base: DeviceProgram, mine: DeviceProgram, current: DeviceProgram): DeviceProgram {
  const before = new Map(base.tasks.map(t => [t.id, t]))
  const edited = new Map(mine.tasks.map(t => [t.id, t]))
  const tasks = current.tasks.filter(t => !(before.has(t.id) && !edited.has(t.id)))
  for (const t of mine.tasks) {
    const was = before.get(t.id)
    if (was && sameTask(was, t)) continue
    const i = tasks.findIndex(x => x.id === t.id)
    if (i >= 0) tasks[i] = t
    else tasks.push(t)
  }
  const pick = <K extends 'chargePowerW' | 'silent' | 'limits'>(k: K): DeviceProgram[K] =>
    sameValue(mine[k], base[k]) ? current[k] : mine[k]
  return {
    ...current,
    model: mine.model,
    tz: mine.tz,
    chargePowerW: pick('chargePowerW'),
    silent: pick('silent'),
    limits: pick('limits'),
    tasks,
  }
}
