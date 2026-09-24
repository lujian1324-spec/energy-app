/**
 * SW-14 — the offline queue is frozen, not drained and not dropped.
 *
 * A save made while a device was unreachable is the user's settings. Pausing
 * the service must stop it being replayed without spending a retry attempt
 * against it or deleting it, so that resuming the service finds the queue
 * exactly as the user left it (AC-14-7 / AC-14-8).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../config/smartSchedule', () => ({ SMART_SCHEDULE_PAUSED: true }))

vi.mock('../utils/apiClient', () => ({
  api: { get: vi.fn(), post: vi.fn(), postSkipAuth: vi.fn(), getAuthed: vi.fn(), postAuthed: vi.fn() },
  tokenStore: { get: () => 'ACCESS', set: () => {}, setRefresh: () => {}, getRefresh: () => 'REFRESH', clear: () => {} },
  isApiSuccess: (c: unknown) => c === 0 || c === '0',
}))

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
}

import { flushPendingSmartSchedule } from './smartScheduleSave'
import type { SmartScheduleWindow } from './smartScheduleControl'
import { enqueueSmartScheduleSave, getPendingSmartScheduleSave } from '../utils/smartScheduleQueue'

const A = '5001'
const ONLINE = { clientOnline: true, hasSession: true, deviceOnline: true }
const WINDOW: SmartScheduleWindow = {
  enabled: true, startTime: '01:00', endTime: '05:00', chargePowerW: 400, model: 'Sierro 2000',
}

beforeEach(() => {
  store.clear()
  localStorage.setItem('iot_user_id', '491513787113766912')
})

describe('AC-14-7 — a reconnect does not flush while paused', () => {
  it('reports paused and makes no apply call for a device that is right there', async () => {
    enqueueSmartScheduleSave(A, WINDOW, 1000)
    const apply = vi.fn()
    const r = await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply: apply as never })
    expect(r.status).toBe('paused')
    expect(apply).not.toHaveBeenCalled()
  })

  it('leaves the queued save and its attempt count untouched', async () => {
    enqueueSmartScheduleSave(A, WINDOW, 1000)
    const before = getPendingSmartScheduleSave(A)
    await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply: vi.fn() as never })
    await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply: vi.fn() as never })
    const after = getPendingSmartScheduleSave(A)
    expect(after).toEqual(before)
    expect(after?.attempts).toBe(0)
  })

  it('is decided before the queue is read, so an empty queue is paused too', async () => {
    // `none` would claim "nothing is owed here", which is a different fact and
    // not one this call checked.
    expect((await flushPendingSmartSchedule(A, { connectivity: ONLINE })).status).toBe('paused')
  })
})
