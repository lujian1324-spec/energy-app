/**
 * SW-14 — while the Smart Schedule service is paused, `smart` never executes.
 *
 * This is the gate both the shared scheduler's `requestPhase` and its send path
 * go through, so a `false` here is the whole of "no Smart Schedule charge-power
 * write is made" (AC-14-6). Sleep Mode goes through the same function and must
 * be judged exactly as it was before — including on a device Smart Schedule had
 * claimed, which is the case that would otherwise leave a device with no
 * executor at all.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../config/smartSchedule', () => ({ SMART_SCHEDULE_PAUSED: true }))

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
}

import {
  canExecuteScheduleMode,
  setActiveScheduleMode,
  getActiveScheduleMode,
} from './activeScheduleMode'

const DEVICE = '9001'

beforeEach(() => { store.clear() })

describe('AC-14-6 — no Smart Schedule dispatch while paused', () => {
  it('refuses smart on an unclaimed device', () => {
    expect(getActiveScheduleMode(DEVICE)).toBeNull()
    expect(canExecuteScheduleMode(DEVICE, 'smart')).toBe(false)
  })

  it('refuses smart even on a device Smart Schedule still owns', () => {
    setActiveScheduleMode(DEVICE, 'smart')
    expect(getActiveScheduleMode(DEVICE)).toBe('smart')
    expect(canExecuteScheduleMode(DEVICE, 'smart')).toBe(false)
  })
})

describe('AC-14-10 — Sleep Mode is untouched by the pause', () => {
  it('runs on an unclaimed device', () => {
    expect(canExecuteScheduleMode(DEVICE, 'sleep')).toBe(true)
  })

  it('runs on a device it has claimed', () => {
    setActiveScheduleMode(DEVICE, 'sleep')
    expect(canExecuteScheduleMode(DEVICE, 'sleep')).toBe(true)
  })

  it('still yields to a live Smart Schedule claim rather than silently taking over', () => {
    // The pause stops Smart Schedule writing; it does not hand its devices to
    // Sleep Mode. Releasing the claim is a user action, not a flag flip.
    setActiveScheduleMode(DEVICE, 'smart')
    expect(canExecuteScheduleMode(DEVICE, 'sleep')).toBe(false)
  })
})
