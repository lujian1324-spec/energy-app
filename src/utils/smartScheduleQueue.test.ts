/**
 * SW-13 — the pending save: latest wins, one device cannot touch another's.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

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

beforeEach(() => { vi.restoreAllMocks(); store.clear(); store.set('iot_user_id', 'test-account') })

describe('the pending Smart Schedule save', () => {
  it('isolates pending writes by account and ignores legacy unscoped entries', () => {
    enqueueSmartScheduleSave(A, win(), 1000)
    store.set('iot_user_id', 'other-account')
    store.set(`sierro-smart-pending-${A}`, JSON.stringify({ window: win(), queuedAt: 1000, attempts: 0 }))
    expect(getPendingSmartScheduleSave(A)).toBeNull()
    clearPendingSmartScheduleSave(A)
    store.set('iot_user_id', 'test-account')
    expect(getPendingSmartScheduleSave(A)?.queuedAt).toBe(1000)
  })

  it('does not report persistence when storage is full or the account is absent', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(enqueueSmartScheduleSave(A, win())).toBeNull()
    vi.restoreAllMocks()
    store.delete('iot_user_id')
    expect(enqueueSmartScheduleSave(A, win())).toBeNull()
  })

  it('protects same-millisecond edits from old clears and failure counters', () => {
    const first = enqueueSmartScheduleSave(A, win(), 1000)!
    const next = enqueueSmartScheduleSave(A, win({ chargePowerW: 300 }), 1000)!
    expect(next.queuedAt).toBeGreaterThan(first.queuedAt)
    clearPendingSmartScheduleSave(A, first.queuedAt)
    recordFlushAttempt(A, first.queuedAt)
    expect(getPendingSmartScheduleSave(A)).toEqual(next)
  })

  it('rejects malformed time strings even when the remaining shape is valid', () => {
    store.set(`sierro-smart-pending-test-account-${A}`, JSON.stringify({ window: win({ startTime: '99:99' }), queuedAt: 1, attempts: 0 }))
    expect(getPendingSmartScheduleSave(A)).toBeNull()
  })

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

  it('parks a refused save after MAX_FLUSH_ATTEMPTS without bypassing it', () => {
    enqueueSmartScheduleSave(A, win(), 1000)
    for (let i = 1; i < MAX_FLUSH_ATTEMPTS; i++) {
      expect(recordFlushAttempt(A)).toEqual({ attempts: i, gaveUp: false })
    }
    expect(recordFlushAttempt(A)).toEqual({ attempts: MAX_FLUSH_ATTEMPTS, gaveUp: true })
    expect(getPendingSmartScheduleSave(A)?.attempts).toBe(MAX_FLUSH_ATTEMPTS)
    clearPendingSmartScheduleSave(A)
    expect(recordFlushAttempt(A)).toEqual({ attempts: 0, gaveUp: false })
  })

  it('refuses to replay a malformed entry rather than writing an invented window', () => {
    store.set(`sierro-smart-pending-test-account-${A}`, 'not json')
    expect(getPendingSmartScheduleSave(A)).toBeNull()
    store.set(`sierro-smart-pending-test-account-${A}`, JSON.stringify({ queuedAt: 1 }))
    expect(getPendingSmartScheduleSave(A)).toBeNull()
    store.set(`sierro-smart-pending-test-account-${A}`, JSON.stringify({
      window: { enabled: true, startTime: '01:00' }, queuedAt: 1,
    }))
    expect(getPendingSmartScheduleSave(A)).toBeNull()
  })

  it('takes an id as a number the same as a string', () => {
    enqueueSmartScheduleSave(10001, win(), 1000)
    expect(hasPendingSmartScheduleSave('10001')).toBe(true)
  })
})
