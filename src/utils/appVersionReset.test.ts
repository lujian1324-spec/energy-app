import { describe, it, expect, beforeEach } from 'vitest'

class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
}
;(globalThis as any).localStorage = new MemoryStorage()

import { APP_VERSION_KEY, CACHE_RESET_PENDING_KEY, resetCachesOnUpdate } from './appVersionReset'

let s: MemoryStorage
beforeEach(() => {
  s = new MemoryStorage()
  s.setItem('iot_access_token', 'ACCESS')
  s.setItem('iot_refresh_token', 'REFRESH')
  s.setItem('iot_user_id', '491513787113766912')
  s.setItem('iot-auth', '{"state":{"isAuthenticated":true}}')
  s.setItem('powerflow-storage', '{"state":{"settings":{"pushLowBattery":true}}}')
  s.setItem('sierro-program-1001', '{"chargePowerW":200}')
  s.setItem('sierro-display-icon-1001', 'fridge')
  s.setItem('sierro-alarm-dismissed', '{"state":{}}')
  s.setItem('powerflow-live-passthrough', '{"state":{"byDevice":{"1001":{"live":{"soc":50}}}}}')
  s.setItem('sierro-config-missing-sierro 1000-sleepMode', '1')
  s.setItem('powerflow-device-store', JSON.stringify({
    state: { selectedDeviceId: '1001', isDemoMode: false, devices: [{ id: '1001' }], deviceTotal: 1, devicesListReady: true },
    version: 0,
  }))
})

describe('clear cached data once per app update (v4.23.0)', () => {
  it('a new version drops the server-data copies and keeps the user\'s own data', () => {
    s.setItem(APP_VERSION_KEY, '4.22.0+100')
    expect(resetCachesOnUpdate('4.23.0+101', s)).toBe(true)
    // Gone: copies of server data.
    expect(s.getItem('powerflow-live-passthrough')).toBeNull()
    expect(s.getItem('sierro-config-missing-sierro 1000-sleepMode')).toBeNull()
    const devices = JSON.parse(s.getItem('powerflow-device-store')!)
    expect(devices.state).toEqual({ selectedDeviceId: '1001', isDemoMode: false })
    // Kept: the session and everything the user set.
    for (const k of ['iot_access_token', 'iot_refresh_token', 'iot_user_id', 'iot-auth', 'powerflow-storage',
      'sierro-program-1001', 'sierro-display-icon-1001', 'sierro-alarm-dismissed']) {
      expect(s.getItem(k), k).not.toBeNull()
    }
    // IndexedDB is told to clear on its next open; the new version is recorded.
    expect(s.getItem(CACHE_RESET_PENDING_KEY)).toBe('4.23.0+101')
    expect(s.getItem(APP_VERSION_KEY)).toBe('4.23.0+101')
  })

  it('the same version clears nothing', () => {
    s.setItem(APP_VERSION_KEY, '4.23.0+101')
    expect(resetCachesOnUpdate('4.23.0+101', s)).toBe(false)
    expect(s.getItem('powerflow-live-passthrough')).not.toBeNull()
    expect(s.getItem(CACHE_RESET_PENDING_KEY)).toBeNull()
  })

  it('a phone updating from a version before this feature (no record) is cleared too', () => {
    expect(resetCachesOnUpdate('4.23.0+101', s)).toBe(true)
    expect(s.getItem('powerflow-live-passthrough')).toBeNull()
  })

  it('a new build of the same version number counts as an update', () => {
    s.setItem(APP_VERSION_KEY, '4.23.0+101')
    expect(resetCachesOnUpdate('4.23.0+102', s)).toBe(true)
  })

  it('a corrupt device store is dropped rather than kept half-read', () => {
    s.setItem('powerflow-device-store', '{not json')
    expect(resetCachesOnUpdate('4.23.0+101', s)).toBe(true)
    expect(s.getItem('powerflow-device-store')).toBeNull()
  })
})
