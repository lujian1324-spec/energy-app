import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ProvisionScanDevice } from './bleProvision'

/**
 * Native scanDevices() coverage — the core v4.4.3 "stuck searching / no devices"
 * fix. We mock Capacitor (native) + the bluetooth-le plugin and assert:
 *  - requestLEScan runs with NO OS name filter; results are filtered client-side
 *    via isSierroScanResult (SSL_ name OR FEE7 service), dropping unrelated devices.
 *  - The Location gate is VERSION-GATED: on Android 11 and below (where BLE scan
 *    silently returns zero results when Location is off) scanDevices() pre-checks
 *    isLocationEnabled() and throws a 'location' error; on Android 12+
 *    (BLUETOOTH_SCAN neverForLocation decouples scan from Location) it is skipped.
 *  - iOS never calls isLocationEnabled().
 * Android version is read from navigator.userAgent, stubbed per test.
 */

const UA_ANDROID_13 = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36'
const UA_ANDROID_11 = 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36'

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
  // Default to Android 13 (12+) — the common modern case where Location is not required.
  vi.stubGlobal('navigator', { userAgent: UA_ANDROID_13 })
  h.ble.initialize.mockResolvedValue(undefined)
  h.ble.isLocationEnabled.mockResolvedValue(true)
  h.ble.stopLEScan.mockResolvedValue(undefined)
  // Drive the scan callback with whatever h.scanResults holds at scan time.
  h.ble.requestLEScan.mockImplementation(async (_opts: any, cb: (r: any) => void) => {
    for (const r of h.scanResults) cb(r)
  })
})

afterEach(() => { vi.unstubAllGlobals() })

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

  it('Android 11-: throws a location error when Location services are off', async () => {
    vi.stubGlobal('navigator', { userAgent: UA_ANDROID_11 })
    h.ble.isLocationEnabled.mockResolvedValue(false)
    const mgr = await loadManager()
    await expect(mgr.scanDevices(() => {})).rejects.toThrow(/location/i)
    expect(h.ble.requestLEScan).not.toHaveBeenCalled()
  })

  it('Android 12+: does NOT require Location (neverForLocation) — scans even when it is off', async () => {
    // Default UA is Android 13. Location reported off must NOT block; isLocationEnabled
    // should not even be consulted, and the scan proceeds.
    h.ble.isLocationEnabled.mockResolvedValue(false)
    h.scanResults = [{ device: { deviceId: 'a', name: 'SSL_1' } }]
    const mgr = await loadManager()
    const found: ProvisionScanDevice[] = []
    await mgr.scanDevices(d => found.push(d))
    expect(found.map(d => d.deviceId)).toEqual(['a'])
    expect(h.ble.isLocationEnabled).not.toHaveBeenCalled()
    expect(h.ble.requestLEScan).toHaveBeenCalled()
  })

  it('Android 11-: still scans when a location query throws (does not block scanning)', async () => {
    vi.stubGlobal('navigator', { userAgent: UA_ANDROID_11 })
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
