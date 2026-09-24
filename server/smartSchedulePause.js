/**
 * Smart Schedule service pause, relay side (SW-14).
 *
 * The client's `src/config/smartSchedule.ts` stops the app from dispatching a
 * Smart Schedule window; this stops the background tick, which runs whether or
 * not anyone has the app open. Both default to paused.
 *
 * Only schedules the client tagged `mode: 'smart'` are skipped. A schedule with
 * no mode is left running: those predate the tag and are overwhelmingly Sleep
 * Mode windows, and silently dropping them would break the feature this ticket
 * must not touch. Sleep windows (`mode: 'sleep'`, or untagged) always run.
 *
 * Read from the environment at call time rather than captured at import, so an
 * operator can resume the service with `SMART_SCHEDULE_PAUSED=false` and a
 * restart, and so tests can flip it without re-importing the executor.
 */

/** Is the Smart Schedule tick paused? Anything but an explicit off means yes. */
export function isSmartSchedulePaused(env = process.env) {
  const raw = env.SMART_SCHEDULE_PAUSED
  if (raw === undefined || String(raw).trim() === '') return true
  return !/^(false|0|no|off)$/i.test(String(raw).trim())
}

/** Should this stored schedule be skipped by the tick right now? */
export function isPausedSmartSchedule(schedule, env = process.env) {
  return schedule?.mode === 'smart' && isSmartSchedulePaused(env)
}
