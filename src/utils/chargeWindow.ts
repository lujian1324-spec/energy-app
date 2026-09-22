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

/** Sleep Mode: quiet power inside the window, normal power outside and on exit. */
export function sleepPowers(model: string): ChargePowers {
  const { sleepW, wakeW } = getPowers(model)
  return { inWindowW: sleepW, outWindowW: wakeW, restoreW: wakeW }
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
