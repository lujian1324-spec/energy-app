/**
 * SW-13 — the pending save: latest wins, one device cannot touch another's.
 */
import { describe, it, expect, beforeEach } from 'vitest'

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
}

import {
  MAX_FLUSH_ATTEMPTS,
  clearPendingSmartScheduleSave,
  enqueueSmartScheduleSave,
  getPendingSmartScheduleSave,
  hasPendingSmartScheduleSave,
  recordFlushAttempt,
} from './smartScheduleQueue'
import type { SmartScheduleWindow } from '../api/smartScheduleControl'

const A = '491513787113766912'
const B = '491513787113766913'

const win = (over: Partial<SmartScheduleWindow> = {}): SmartScheduleWindow => ({
  enabled: true,
  startTime: '01:00',
  endTime: '05:00',
  chargePowerW: 600,
  model: 'Sierro 1000',
  ...over,
})

beforeEach(() => { store.clear() })

describe('the pending Smart Schedule save', () => {
  it('keeps the whole window, so a flush is the same call a live save makes', () => {
    enqueueSmartScheduleSave(A, win(), 1000)
    expect(getPendingSmartScheduleSave(A)).toEqual({
      window: win(),
      queuedAt: 1000,
      attempts: 0,
    })
  })

  it('has nothing for a device that never queued one', () => {
    expect(getPendingSmartScheduleSave(A)).toBeNull()
    expect(hasPendingSmartScheduleSave(A)).toBe(false)
  })

  it('the newest save replaces the older one outright (AC-13-7)', () => {
    enqueueSmartScheduleSave(A, win({ chargePowerW: 300 }), 1000)
    enqueueSmartScheduleSave(A, win({ chargePowerW: 900, endTime: '07:00' }), 2000)
    const p = getPendingSmartScheduleSave(A)!
    expect(p.window.chargePowerW).toBe(900)
    expect(p.window.endTime).toBe('07:00')
    expect(p.queuedAt).toBe(2000)
  })

  it('a re-save resets the attempt ladder — it is a new intent, not a retry', () => {
    enqueueSmartScheduleSave(A, win(), 1000)
    recordFlushAttempt(A)
    expect(getPendingSmartScheduleSave(A)!.attempts).toBe(1)
    enqueueSmartScheduleSave(A, win({ chargePowerW: 200 }), 2000)
    expect(getPendingSmartScheduleSave(A)!.attempts).toBe(0)
  })

  it('an offline disable is queued as readily as an enable (AC-13-3)', () => {
    enqueueSmartScheduleSave(A, win({ enabled: false }), 1000)
    expect(getPendingSmartScheduleSave(A)!.window.enabled).toBe(false)
  })

  it('two devices queue and clear independently (AC-13-10)', () => {
    enqueueSmartScheduleSave(A, win({ chargePowerW: 300 }), 1000)
    enqueueSmartScheduleSave(B, win({ chargePowerW: 800 }), 1100)
    clearPendingSmartScheduleSave(A)
    expect(getPendingSmartScheduleSave(A)).toBeNull()
    expect(getPendingSmartScheduleSave(B)!.window.chargePowerW).toBe(800)
  })

  it('clearing against a queuedAt spares a save made during the flush', () => {
    enqueueSmartScheduleSave(A, win({ chargePowerW: 300 }), 1000)
    // the user saved again while the 1000 entry was in flight
    enqueueSmartScheduleSave(A, win({ chargePowerW: 900 }), 2000)
    clearPendingSmartScheduleSave(A, 1000)
    expect(getPendingSmartScheduleSave(A)!.window.chargePowerW).toBe(900)
    clearPendingSmartScheduleSave(A, 2000)
    expect(getPendingSmartScheduleSave(A)).toBeNull()
  })

  it('drops a save the device has refused MAX_FLUSH_ATTEMPTS times', () => {
    enqueueSmartScheduleSave(A, win(), 1000)
    for (let i = 1; i < MAX_FLUSH_ATTEMPTS; i++) {
      expect(recordFlushAttempt(A)).toEqual({ attempts: i, gaveUp: false })
    }
    expect(recordFlushAttempt(A)).toEqual({ attempts: MAX_FLUSH_ATTEMPTS, gaveUp: true })
    expect(getPendingSmartScheduleSave(A)).toBeNull()
    // …and counting against nothing is harmless.
    expect(recordFlushAttempt(A)).toEqual({ attempts: 0, gaveUp: false })
  })

  it('refuses to replay a malformed entry rather than writing an invented window', () => {
    store.set(`sierro-smart-pending-${A}`, 'not json')
    expect(getPendingSmartScheduleSave(A)).toBeNull()
    store.set(`sierro-smart-pending-${A}`, JSON.stringify({ queuedAt: 1 }))
    expect(getPendingSmartScheduleSave(A)).toBeNull()
    store.set(`sierro-smart-pending-${A}`, JSON.stringify({
      window: { enabled: true, startTime: '01:00' }, queuedAt: 1,
    }))
    expect(getPendingSmartScheduleSave(A)).toBeNull()
  })

  it('takes an id as a number the same as a string', () => {
    enqueueSmartScheduleSave(10001, win(), 1000)
    expect(hasPendingSmartScheduleSave('10001')).toBe(true)
  })
})
