import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  parseWorkMode,
  priorityFromWorkMode,
  resolveBatteryPriority,
  loadConfirmedPriority,
  saveConfirmedPriority,
} from './batteryPriority'

// vitest runs these in the `node` environment — give the module a localStorage.
function installLocalStorage() {
  const store = new Map<string, string>()
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
  }
  vi.stubGlobal('localStorage', mock)
  return store
}

describe('parseWorkMode', () => {
  it('accepts the three backend values as numbers', () => {
    expect(parseWorkMode(0)).toBe(0)
    expect(parseWorkMode(1)).toBe(1)
    expect(parseWorkMode(2)).toBe(2)
  })

  it('accepts them as strings — the API sends several of these fields as strings', () => {
    expect(parseWorkMode('0')).toBe(0)
    expect(parseWorkMode('1')).toBe(1)
    expect(parseWorkMode('2')).toBe(2)
  })

  it('rejects anything else', () => {
    for (const v of [null, undefined, '', 3, -1, 'Savings', NaN, true, false, {}]) {
      expect(parseWorkMode(v)).toBeNull()
    }
  })
})

describe('priorityFromWorkMode', () => {
  it('maps Backup=1 and Savings=2', () => {
    expect(priorityFromWorkMode(1)).toBe(1)
    expect(priorityFromWorkMode('2')).toBe(2)
  })

  it('treats Normal (0) as "no priority the sheet can show"', () => {
    // The old page turned 0 into Backup, which is what made Savings look lost.
    expect(priorityFromWorkMode(0)).toBeNull()
    expect(priorityFromWorkMode('0')).toBeNull()
  })

  it('treats a missing field as unknown', () => {
    expect(priorityFromWorkMode(undefined)).toBeNull()
  })
})

describe('resolveBatteryPriority', () => {
  const base = { deviceWorkMode: undefined as unknown, remembered: null, pending: null, current: 1 as const }

  it('takes the device read-back when it reports a priority', () => {
    expect(resolveBatteryPriority({ ...base, deviceWorkMode: 2 }))
      .toEqual({ priority: 2, confirmed: true })
    expect(resolveBatteryPriority({ ...base, deviceWorkMode: '1', current: 2 }))
      .toEqual({ priority: 1, confirmed: true })
  })

  it('holds the pending write while the device still reports the old value', () => {
    expect(resolveBatteryPriority({ ...base, deviceWorkMode: 1, pending: 2, current: 1 }))
      .toEqual({ priority: 2, confirmed: false })
  })

  it('settles the pending write once the device echoes it back', () => {
    expect(resolveBatteryPriority({ ...base, deviceWorkMode: '2', pending: 2, current: 1 }))
      .toEqual({ priority: 2, confirmed: true })
  })

  it('falls back to the remembered value when the device reports Normal (0)', () => {
    expect(resolveBatteryPriority({ ...base, deviceWorkMode: 0, remembered: 2 }))
      .toEqual({ priority: 2, confirmed: false })
  })

  it('keeps the current value when there is nothing remembered and nothing reported', () => {
    expect(resolveBatteryPriority({ ...base, current: 2 }))
      .toEqual({ priority: 2, confirmed: false })
  })

  it('lets a device that reports the other priority override what we remembered', () => {
    expect(resolveBatteryPriority({ ...base, deviceWorkMode: 1, remembered: 2, current: 2 }))
      .toEqual({ priority: 1, confirmed: true })
  })
})

describe('confirmed-priority storage', () => {
  beforeEach(() => { installLocalStorage() })

  it('round-trips per device', () => {
    saveConfirmedPriority('77', 2)
    saveConfirmedPriority('88', 1)
    expect(loadConfirmedPriority('77')).toBe(2)
    expect(loadConfirmedPriority('88')).toBe(1)
    expect(loadConfirmedPriority('99')).toBeNull()
  })

  it('ignores a blank or missing device id', () => {
    saveConfirmedPriority('', 2)
    expect(loadConfirmedPriority('')).toBeNull()
    expect(loadConfirmedPriority(null)).toBeNull()
    expect(loadConfirmedPriority(undefined)).toBeNull()
  })

  it('survives storage being unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    })
    expect(() => saveConfirmedPriority('77', 2)).not.toThrow()
    expect(loadConfirmedPriority('77')).toBeNull()
  })

  it('cold start reads back the value the device last confirmed', () => {
    saveConfirmedPriority('77', 2)
    // Fresh mount: nothing in memory, device has not answered yet.
    const onMount = resolveBatteryPriority({
      deviceWorkMode: undefined,
      remembered: loadConfirmedPriority('77'),
      pending: null,
      current: 1,
    })
    expect(onMount.priority).toBe(2)
  })
})
