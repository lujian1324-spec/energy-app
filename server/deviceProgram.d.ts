// Types for deviceProgram.js, so the app (TypeScript) imports the very same
// implementation the relay runs. Keep in step with the JSDoc there.

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface ScheduleTask {
  id: string
  kind: 'ac' | 'charge'
  /** ac: 'on' | 'off'; charge: 'start' | 'stop' */
  action: 'on' | 'off' | 'start' | 'stop'
  /** "HH:MM", 24 h, in the program's time zone */
  time: string
  days: number[]
  enabled: boolean
  /** When the task was last saved (ms). It acts only at occurrences after this. */
  updatedAt: number
}

export interface SilentSettings {
  /** The Silent Mode switch. */
  enabled: boolean
  /** "Scheduled Silent Mode": limit only inside From–To. */
  scheduled: boolean
  from: string
  to: string
  /** The days a window starts on (0 = Sunday). */
  days: number[]
  updatedAt: number
}

export interface ChargeLimits {
  chargeMax: number
  dischargeMin: number
}

export interface DeviceProgram {
  version: number
  model: string
  tz: string
  chargePowerW: number
  silent: SilentSettings
  tasks: ScheduleTask[]
  limits: ChargeLimits
  savedAt: number
}

export const PROGRAM_VERSION: number
export const MAX_TASKS: number
export const AC_EVENT_GRACE_MS: number
export const EVERY_DAY: number[]
export const CHARGE_LIMIT_OPTIONS: number[]
export const DISCHARGE_LIMIT_OPTIONS: number[]

export function isSierro2000(model: string | null | undefined): boolean
export function chargePowerOptions(model: string | null | undefined): number[]
export function silentCapW(model: string | null | undefined): number
export function defaultChargePowerW(model: string | null | undefined): number
export function defaultProgram(model: string | null | undefined, tz: string | null | undefined): DeviceProgram
export function validateProgram(value: unknown): DeviceProgram
export function findClash(tasks: ScheduleTask[]): string | null

export function zonedParts(ms: number, tz: string): { y: number; m: number; d: number; h: number; min: number; s: number }
export function zonedToEpoch(y: number, m: number, d: number, h: number, min: number, tz: string): number
export function lastOccurrence(time: string, days: number[], tz: string, now: number): number | null
export function nextOccurrence(time: string, days: number[], tz: string, now: number): number | null
export function minutesOf(time: string): number
export function crossesMidnight(from: string, to: string): boolean
export function windowEndDays(silent: SilentSettings): number[]

export function silentState(program: DeviceProgram, now: number): { on: boolean; at: number; source: 'off' | 'always' | 'window' }
export function nextSilentChange(program: DeviceProgram, now: number): { on: boolean; at: number | null } | null
export function chargeState(program: DeviceProgram, now: number): { charging: boolean; at: number; taskId: string | null }
export function effectiveChargeW(program: DeviceProgram, now: number): number
export function chargeTarget(program: DeviceProgram, now: number): { watts: number; key: string }
export function acTarget(program: DeviceProgram, now: number, graceMs?: number): { on: boolean; at: number; key: string } | null
export function programNeedsTick(program: DeviceProgram | null | undefined): boolean
