/**
 * SW-13 — which devices a wake signal actually flushes.
 *
 * The hook itself is effects and listeners; the decision it makes is this
 * predicate, and it is the one that has to be right: a device the cloud has not
 * reported up is not a reconnect, and each device is judged on its own row so a
 * reconnect on one never drains another's queue (AC-13-4 / AC-13-10).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../utils/apiClient', () => ({
  api: {},
  tokenStore: { get: () => 'ACCESS', set: () => {}, setRefresh: () => {}, getRefresh: () => '', clear: () => {} },
  isApiSuccess: (c: unknown) => c === 0 || c === '0',
}))

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
}

import { MIN_FLUSH_GAP_MS, shouldFlushDevice } from './useSmartScheduleFlush'

const due = { hasPending: true, inFlight: false, msSinceLastAttempt: MIN_FLUSH_GAP_MS }

describe('shouldFlushDevice', () => {
  it('flushes an online device that is owed a save', () => {
    expect(shouldFlushDevice({ id: '1', isOnline: true }, due)).toBe(true)
  })

  it('leaves an offline device alone — that is what the queue is for', () => {
    expect(shouldFlushDevice({ id: '1', isOnline: false }, due)).toBe(false)
  })

  it('treats an unknown online flag as "not a reconnect"', () => {
    expect(shouldFlushDevice({ id: '1' }, due)).toBe(false)
    expect(shouldFlushDevice({ id: '1', isOnline: undefined }, due)).toBe(false)
  })

  it('skips a device with nothing owed', () => {
    expect(shouldFlushDevice({ id: '1', isOnline: true }, { ...due, hasPending: false })).toBe(false)
  })

  it('never starts a second flush for a device already flushing', () => {
    expect(shouldFlushDevice({ id: '1', isOnline: true }, { ...due, inFlight: true })).toBe(false)
  })

  it('holds a flapping device to one attempt per gap', () => {
    expect(shouldFlushDevice({ id: '1', isOnline: true },
      { ...due, msSinceLastAttempt: MIN_FLUSH_GAP_MS - 1 })).toBe(false)
    expect(shouldFlushDevice({ id: '1', isOnline: true },
      { ...due, msSinceLastAttempt: 0 })).toBe(false)
  })

  it('ignores a row with no id rather than flushing under an empty key', () => {
    expect(shouldFlushDevice({ id: '' }, due)).toBe(false)
    expect(shouldFlushDevice({ id: undefined as unknown as string, isOnline: true }, due)).toBe(false)
  })

  it('judges each device on its own row, so one reconnect drains only its own queue', () => {
    const list = [
      { id: 'a', isOnline: true },
      { id: 'b', isOnline: false },
      { id: 'c', isOnline: true },
    ]
    // only 'a' is owed a save
    const flushed = list.filter(d => shouldFlushDevice(d, { ...due, hasPending: d.id === 'a' }))
    expect(flushed.map(d => d.id)).toEqual(['a'])
  })
})
