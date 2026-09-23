/**
 * SW-12 项 2 — one active schedule mode per device.
 *
 * Sleep Mode and Smart Schedule drive the same register and the same relay slot.
 * Before this they both kept their own `enabled` flag, so a device could have
 * two executors fighting over 0x0085 — whichever screen ticked last won, and the
 * relay held whichever window was saved last. Enabling one must take the device
 * from the other, in storage as well as at runtime.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getActiveScheduleMode,
  setActiveScheduleMode,
  clearActiveScheduleMode,
  canExecuteScheduleMode,
  subscribeActiveScheduleMode,
  disarmStoredWindow,
  getSavedScheduleEnabled,
} from './activeScheduleMode'

const DEVICE = '491513787113766912'
const OTHER = '491513787113766913'

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
}

beforeEach(() => { store.clear() })

describe('per-device status', () => {
  it('does not enable a different device or an unsaved window', () => {
    setActiveScheduleMode(DEVICE, 'smart')
    expect(getSavedScheduleEnabled(DEVICE, 'smart')).toBe(true)
    expect(getSavedScheduleEnabled(OTHER, 'smart')).toBe(false)
  })
  it('Sleep ownership overrides a stale saved Smart window', () => {
    store.set('sierro-smart-' + DEVICE, JSON.stringify({ enabled: true }))
    setActiveScheduleMode(DEVICE, 'sleep')
    expect(getSavedScheduleEnabled(DEVICE, 'smart')).toBe(false)
  })
  it('reads legacy per-device windows but not malformed values', () => {
    store.set('sierro-smart-' + DEVICE, JSON.stringify({ enabled: true }))
    expect(getSavedScheduleEnabled(DEVICE, 'smart')).toBe(true)
    store.set('sierro-smart-' + DEVICE, 'invalid')
    expect(getSavedScheduleEnabled(DEVICE, 'smart')).toBe(false)
  })
})

const armWindow = (prefix: string, deviceId: string) =>
  store.set(`${prefix}-${deviceId}`, JSON.stringify({ enabled: true, sleepFrom: '23:00', sleepTo: '07:00' }))

const savedWindow = (prefix: string, deviceId: string) =>
  JSON.parse(store.get(`${prefix}-${deviceId}`) ?? '{}')

describe('AC-12-4 / AC-12-5 — enabling one mode stops the other', () => {
  it('an unclaimed device lets either mode run (pre-SW-12 installs keep working)', () => {
    expect(getActiveScheduleMode(DEVICE)).toBeNull()
    expect(canExecuteScheduleMode(DEVICE, 'sleep')).toBe(true)
    expect(canExecuteScheduleMode(DEVICE, 'smart')).toBe(true)
  })

  it('Smart Schedule claiming the device silences Sleep Mode', () => {
    setActiveScheduleMode(DEVICE, 'smart')
    expect(canExecuteScheduleMode(DEVICE, 'smart')).toBe(true)
    expect(canExecuteScheduleMode(DEVICE, 'sleep')).toBe(false)
  })

  it('Sleep Mode claiming the device silences Smart Schedule', () => {
    setActiveScheduleMode(DEVICE, 'sleep')
    expect(canExecuteScheduleMode(DEVICE, 'sleep')).toBe(true)
    expect(canExecuteScheduleMode(DEVICE, 'smart')).toBe(false)
  })

  it('is per device — claiming one leaves the others alone', () => {
    setActiveScheduleMode(DEVICE, 'smart')
    expect(canExecuteScheduleMode(OTHER, 'sleep')).toBe(true)
  })

  it('disarms the loser\'s stored window, keeping its times as a draft', () => {
    armWindow('sierro-sleep', DEVICE)
    setActiveScheduleMode(DEVICE, 'smart')
    expect(savedWindow('sierro-sleep', DEVICE)).toEqual({
      enabled: false, sleepFrom: '23:00', sleepTo: '07:00',
    })
  })

  it('leaves the winner\'s own stored window untouched', () => {
    armWindow('sierro-smart', DEVICE)
    setActiveScheduleMode(DEVICE, 'smart')
    expect(savedWindow('sierro-smart', DEVICE).enabled).toBe(true)
  })

  it('notifies a live executor so it stops before its next tick', () => {
    const seen: [string, string | null][] = []
    const off = subscribeActiveScheduleMode((d, m) => seen.push([d, m]))
    setActiveScheduleMode(DEVICE, 'smart')
    clearActiveScheduleMode(DEVICE, 'smart')
    off()
    setActiveScheduleMode(DEVICE, 'sleep')
    expect(seen).toEqual([[DEVICE, 'smart'], [DEVICE, null]])
  })
})

describe('AC-12-6 — switching and cancelling stay consistent', () => {
  it('handing the device back and forth always leaves exactly one owner', () => {
    armWindow('sierro-sleep', DEVICE)
    armWindow('sierro-smart', DEVICE)

    setActiveScheduleMode(DEVICE, 'smart')
    expect(savedWindow('sierro-sleep', DEVICE).enabled).toBe(false)
    expect(canExecuteScheduleMode(DEVICE, 'sleep')).toBe(false)

    armWindow('sierro-sleep', DEVICE) // the user re-arms Sleep on its screen
    setActiveScheduleMode(DEVICE, 'sleep')
    expect(savedWindow('sierro-smart', DEVICE).enabled).toBe(false)
    expect(canExecuteScheduleMode(DEVICE, 'smart')).toBe(false)
    expect(getActiveScheduleMode(DEVICE)).toBe('sleep')
  })

  it('turning a mode off releases the device to either mode', () => {
    setActiveScheduleMode(DEVICE, 'sleep')
    clearActiveScheduleMode(DEVICE, 'sleep')
    expect(getActiveScheduleMode(DEVICE)).toBeNull()
    expect(canExecuteScheduleMode(DEVICE, 'smart')).toBe(true)
  })

  it('turning off a mode that no longer owns the device does not steal the claim', () => {
    setActiveScheduleMode(DEVICE, 'smart')
    clearActiveScheduleMode(DEVICE, 'sleep') // stale Sleep screen saves "off"
    expect(getActiveScheduleMode(DEVICE)).toBe('smart')
    expect(canExecuteScheduleMode(DEVICE, 'sleep')).toBe(false)
  })

  it('survives malformed or absent stored windows', () => {
    store.set('sierro-sleep-' + DEVICE, 'not json')
    expect(() => setActiveScheduleMode(DEVICE, 'smart')).not.toThrow()
    disarmStoredWindow(DEVICE, 'smart') // nothing saved yet
    expect(getActiveScheduleMode(DEVICE)).toBe('smart')
  })

  it('ignores an empty device id instead of writing a global claim', () => {
    setActiveScheduleMode('', 'smart')
    expect(store.size).toBe(0)
    expect(getActiveScheduleMode('')).toBeNull()
  })
})
