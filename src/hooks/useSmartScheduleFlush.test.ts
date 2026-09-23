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

import { MIN_FLUSH_GAP_MS, flushConnectivity, shouldFlushDevice } from './useSmartScheduleFlush'
import { isSaveOffline } from '../utils/deviceConnectivity'

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

/*
 * SW-13 follow-up — the connectivity a flush is attempted under.
 *
 * It used to be `{ clientOnline: true, hasSession: true, deviceOnline: true }`,
 * so an offline signal that landed while the pass was starting was thrown away
 * and a true unreachable failure was classified as a refusal: an attempt spent
 * and a toast raised, instead of the save being kept quietly (AC-13-0a/0b/6).
 */
describe('flushConnectivity', () => {
  it("carries the device's own online flag, not a hardcoded true", () => {
    expect(flushConnectivity({ id: '1', isOnline: false }, true, true))
      .toEqual({ clientOnline: true, hasSession: true, deviceOnline: false })
    expect(flushConnectivity({ id: '1', isOnline: true }, true, true).deviceOnline).toBe(true)
  })

  it('leaves an unknown flag unknown — connected, so a failure stays a failure', () => {
    expect(flushConnectivity({ id: '1' }, true, true).deviceOnline).toBeUndefined()
    expect(isSaveOffline(flushConnectivity({ id: '1' }, true, true))).toBe(false)
  })

  it('carries the client flags through rather than re-asserting them', () => {
    expect(flushConnectivity({ id: '1', isOnline: true }, false, true))
      .toEqual({ clientOnline: false, hasSession: true, deviceOnline: true })
    expect(flushConnectivity({ id: '1', isOnline: true }, true, false).hasSession).toBe(false)
  })

  it('reads as offline for exactly the states the queue exists for', () => {
    expect(isSaveOffline(flushConnectivity({ id: '1', isOnline: false }, true, true))).toBe(true)
    expect(isSaveOffline(flushConnectivity({ id: '1', isOnline: true }, false, true))).toBe(true)
    expect(isSaveOffline(flushConnectivity({ id: '1', isOnline: true }, true, false))).toBe(true)
    expect(isSaveOffline(flushConnectivity({ id: '1', isOnline: true }, true, true))).toBe(false)
  })
})
