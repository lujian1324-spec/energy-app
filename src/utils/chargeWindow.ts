/**
 * Charge-window primitives — the one engine behind Sleep Mode and Smart Schedule.
 *
 * Both features are the same physical control: a wall-clock window during which
 * the device's AC charge power is held at one value, and outside of which it is
 * held at another. Sleep Mode calls the window "quiet hours"; Smart Schedule
 * calls it "off-peak charging". Nothing else differs, so the phase maths, the
 * power triple and the model defaults live here and are shared.
 *
 * Kept free of React and of API imports on purpose: `useSleepModeScheduler`
 * (client-side enforcement) and `api/smartScheduleControl` (the three device
 * writes) both build on it, and the relay mirrors it in
 * `server/sleepSchedule.js`.
 */

/** 'sleep' = inside the window, 'wake' = outside it. Named for the original Sleep Mode. */
export type ChargePhase = 'sleep' | 'wake'

/**
 * The three AC charge-power values a window needs (W, register 0x0085):
 * - `inWindowW`  — held while the clock is inside [from, to)
 * - `outWindowW` — held while it is outside
 * - `restoreW`   — written once when the feature is switched off, so the device
 *                  is never left pinned at a reduced (or zero) charge rate.
 */
export interface ChargePowers {
  inWindowW: number
  outWindowW: number
  restoreW: number
}

/** Per-model Sleep Mode AC charge power (W). Mirrored in `server/sleepSchedule.js`. */
export function getPowers(model: string): { sleepW: number; wakeW: number } {
  if (String(model || '').includes('2000')) return { sleepW: 300, wakeW: 800 }
  return { sleepW: 150, wakeW: 400 } // default = Sierro 1000
}

/** Sleep Mode's power sliders move in 50W steps. */
export const SLEEP_POWER_STEP_W = 50

/** Highest charge power (W) a Sleep Mode slider offers: 400W Sierro 1000, 800W Sierro 2000. */
export function sleepPowerMaxW(model: string): number {
  return String(model || '').includes('2000') ? 800 : 400
}

/** A slider value clamped to 0…max for the model and snapped to the 50W grid. */
export function snapSleepPower(model: string, watts: unknown, fallback: number): number {
  const w = typeof watts === 'number' && Number.isFinite(watts) ? watts : fallback
  const max = sleepPowerMaxW(model)
  return Math.max(0, Math.min(max, Math.round(w / SLEEP_POWER_STEP_W) * SLEEP_POWER_STEP_W))
}

/** The user's Sleep Mode powers (either may be absent → the model default). */
export interface SleepPowerChoice {
  sleepW?: number
  wakeW?: number
}

/**
 * Sleep Mode's two powers for a model: what the user picked on the sliders
 * (v4.18.0), else the model defaults — both snapped to the model's 50W grid.
 */
export function sleepWatts(model: string, choice?: SleepPowerChoice): { sleepW: number; wakeW: number } {
  const d = getPowers(model)
  return {
    sleepW: snapSleepPower(model, choice?.sleepW, d.sleepW),
    wakeW: snapSleepPower(model, choice?.wakeW, d.wakeW),
  }
}

/**
 * Sleep Mode: the sleep power inside the window, the non-sleep power outside it.
 * Switching Sleep Mode off restores the model's normal charge power, not the
 * non-sleep slider, so a device is never left at a reduced rate by a feature
 * that is off.
 */
export function sleepPowers(model: string, choice?: SleepPowerChoice): ChargePowers {
  const { sleepW, wakeW } = sleepWatts(model, choice)
  return { inWindowW: sleepW, outWindowW: wakeW, restoreW: getPowers(model).wakeW }
}

/** Upper bound for a hand-entered charge power (W) — the largest rated charge rate we ship. */
export const MAX_MANUAL_CHARGE_W = 1000

/**
 * Smart Schedule: charge at the rate the user typed during the off-peak window,
 * and do not draw from the grid at all outside it — 0W is what makes the battery,
 * not the grid, carry the load through the peak period. Switching the feature
 * off restores the model's normal charge power, exactly as Sleep Mode does.
 */
export function smartSchedulePowers(model: string, chargePowerW: number): ChargePowers {
  const { wakeW } = getPowers(model)
  const w = Number.isFinite(chargePowerW) ? Math.round(chargePowerW) : wakeW
  return {
    inWindowW: Math.max(0, Math.min(MAX_MANUAL_CHARGE_W, w)),
    outWindowW: 0,
    restoreW: wakeW,
  }
}

/** "HH:MM" → minutes since midnight (0 on malformed input). */
export function timeToMin(hhMM: string): number {
  const [h, m] = String(hhMM || '').split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

/** Is `nowMin` inside [fromMin, toMin)? Handles the midnight wrap (e.g. 22:00→09:00). */
export function isInWindow(nowMin: number, fromMin: number, toMin: number): boolean {
  if (fromMin === toMin) return false // empty window → never inside
  if (fromMin < toMin) return nowMin >= fromMin && nowMin < toMin
  return nowMin >= fromMin || nowMin < toMin // crosses midnight
}

/** Phase for a window at the given wall-clock instant (local time). */
export function phaseFor(from: string, to: string, now: Date = new Date()): ChargePhase {
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return isInWindow(nowMin, timeToMin(from), timeToMin(to)) ? 'sleep' : 'wake'
}

/** AC charge power (W) to write for a phase, given the window's power triple. */
export function powerForPhase(powers: ChargePowers, phase: ChargePhase): number {
  return phase === 'sleep' ? powers.inWindowW : powers.outWindowW
}
