// Pure helpers for server-side Sleep Mode scheduling.
//
// The relay's poller uses these to decide, on each tick, whether a device should
// currently be at "sleep" charge power or "wake" charge power — then writes the
// change only on a phase transition (edge). This mirrors the client-side
// src/hooks/useSleepModeScheduler.ts so behavior is identical whether the app is
// open (client writes) or closed (relay writes).
//
// No side effects here — the poller owns the API calls and the edge state.

// Per-model AC charge-power values (W). Kept in sync with the client's
// getPowers() in src/hooks/useSleepModeScheduler.ts.
export function getPowers(model) {
  if (String(model || '').includes('2000')) return { sleepW: 300, wakeW: 800 }
  return { sleepW: 150, wakeW: 400 } // default = Sierro 1000
}

/** "HH:MM" → minutes since midnight (0 on malformed input). */
export function timeToMin(hhMM) {
  const [h, m] = String(hhMM || '').split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

/** Is `nowMin` inside [fromMin, toMin)? Handles the midnight wrap (e.g. 22:00→09:00). */
export function isInSleepWindow(nowMin, fromMin, toMin) {
  if (fromMin === toMin) return false // empty window → never sleep
  if (fromMin < toMin) return nowMin >= fromMin && nowMin < toMin
  return nowMin >= fromMin || nowMin < toMin // crosses midnight
}

/**
 * Wall-clock minutes-since-midnight at `now` in the given IANA timezone.
 * Falls back to the server's local time if tz is missing/invalid.
 */
export function minutesInTz(now, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || undefined, hour12: false, hour: '2-digit', minute: '2-digit',
    }).formatToParts(now)
    const h = Number(parts.find((p) => p.type === 'hour')?.value)
    const m = Number(parts.find((p) => p.type === 'minute')?.value)
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m
  } catch {
    /* invalid tz → fall through to local */
  }
  const d = new Date(now)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Desired phase for a schedule at instant `now`, evaluated in the schedule's tz.
 * @returns 'sleep' | 'wake'
 */
export function phaseFor(schedule, now = Date.now()) {
  const nowMin = minutesInTz(now, schedule?.tz)
  return isInSleepWindow(nowMin, timeToMin(schedule?.sleepFrom), timeToMin(schedule?.sleepTo))
    ? 'sleep'
    : 'wake'
}

/** AC charge power (W) that a given phase should apply, per model. */
export function chargePowerForPhase(model, phase) {
  const { sleepW, wakeW } = getPowers(model)
  return phase === 'sleep' ? sleepW : wakeW
}
