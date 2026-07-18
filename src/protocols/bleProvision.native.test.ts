import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ProvisionScanDevice } from './bleProvision'

/**
 * Native scanDevices() coverage — the core v4.4.3 "stuck searching / no devices"
 * fix. We mock Capacitor (native) + the bluetooth-le plugin and assert:
 *  - requestLEScan runs with NO OS name filter; results are filtered client-side
 *    via isSierroScanResult (SSL_ name OR FEE7 service), dropping unrelated devices.
 *  - Android pre-checks isLocationEnabled() and throws a 'location' error when off
 *    (Android silently returns zero scan results otherwise).
 *  - iOS never calls isLocationEnabled().
 */

const FEE7 = '0000fee7-0000-1000-8000-00805f9b34fb'

const h = vi.hoisted(() => ({
  platform: 'android' as 'android' | 'ios' | 'web',
  scanResults: [] as any[],
  ble: {
    initialize: vi.fn(),
    isLocationEnabled: vi.fn(),
    requestLEScan: vi.fn(),
    stopLEScan: vi.fn(),
  },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => h.platform },
}))
vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: h.ble }))

async function loadManager() {
  vi.resetModules()
  const mod = await import('./bleProvision')
  return mod.getProvisionManager()
}

beforeEach(() => {
  h.platform = 'android'
  h.scanResults = []
  vi.clearAllMocks()
  h.ble.initialize.mockResolvedValue(undefined)
  h.ble.isLocationEnabled.mockResolvedValue(true)
  h.ble.stopLEScan.mockResolvedValue(undefined)
  // Drive the scan callback with whatever h.scanResults holds at scan time.
  h.ble.requestLEScan.mockImplementation(async (_opts: any, cb: (r: any) => void) => {
    for (const r of h.scanResults) cb(r)
  })
})

describe('NativeBleProvisionManager.scanDevices', () => {
  it('forwards only Sierro devices (SSL_ name or FEE7 service) and drops the rest', async () => {
    h.scanResults = [
      { device: { deviceId: 'a', name: 'SSL_0F3A' } },                 // SSL_ name → keep
      { device: { deviceId: 'b', name: 'AirPods' }, uuids: ['0000180a-0000-1000-8000-00805f9b34fb'] }, // drop
      { device: { deviceId: 'c', name: 'Unknown' }, uuids: [FEE7] },   // FEE7 service → keep
      { device: { name: 'SSL_noid' } },                                // no deviceId → drop
    ]
    const mgr = await loadManager()
    const found: ProvisionScanDevice[] = []
    await mgr.scanDevices(d => found.push(d))

    expect(found.map(d => d.deviceId)).toEqual(['a', 'c'])
    // scanned with no hardware name filter (allowDuplicates only)
    expect(h.ble.requestLEScan).toHaveBeenCalledWith({ allowDuplicates: false }, expect.any(Function))
  })

  it('throws a location error on Android when Location services are off', async () => {
    h.ble.isLocationEnabled.mockResolvedValue(false)
    const mgr = await loadManager()
    await expect(mgr.scanDevices(() => {})).rejects.toThrow(/location/i)
    expect(h.ble.requestLEScan).not.toHaveBeenCalled()
  })

  it('still scans on Android when a location query throws (does not block scanning)', async () => {
    h.ble.isLocationEnabled.mockRejectedValue(new Error('not supported'))
    h.scanResults = [{ device: { deviceId: 'a', name: 'SSL_1' } }]
    const mgr = await loadManager()
    const found: ProvisionScanDevice[] = []
    await mgr.scanDevices(d => found.push(d))
    expect(found.map(d => d.deviceId)).toEqual(['a'])
  })

  it('does not check Location on iOS', async () => {
    h.platform = 'ios'
    h.scanResults = [{ device: { deviceId: 'a', name: 'SSL_1' } }]
    const mgr = await loadManager()
    await mgr.scanDevices(() => {})
    expect(h.ble.isLocationEnabled).not.toHaveBeenCalled()
    expect(h.ble.requestLEScan).toHaveBeenCalled()
  })
})
