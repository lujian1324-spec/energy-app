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
 *    (BLUETOOTH_SCAN neverForLocation decouples scan from Location) it is diagnostic only.
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
    disconnect: vi.fn(),
    read: vi.fn(),
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
  it('reports valid RSSI from unmatched advertisements without adding unrelated devices', async () => {
    h.scanResults = [-95, -85, undefined, NaN, 127, 0, -128].map(rssi => ({ device: { deviceId: 'unknown' }, rssi }))
    const mgr = await loadManager()
    const found = vi.fn()
    const signal = vi.fn()
    await mgr.scanDevices(found, signal)
    expect(found).not.toHaveBeenCalled()
    expect(signal.mock.calls).toEqual([[-95], [-85]])
  })

  it('does not deliver signal diagnostics after cancellation', async () => {
    let callback!: (result: any) => void
    h.ble.requestLEScan.mockImplementation(async (_opts, cb) => { callback = cb })
    const mgr = await loadManager()
    const signal = vi.fn()
    await mgr.scanDevices(vi.fn(), signal)
    await mgr.stopScan()
    callback({ device: { deviceId: 'late' }, rssi: -95 })
    expect(signal).not.toHaveBeenCalled()
  })
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
    expect(h.ble.requestLEScan).toHaveBeenCalledWith({ allowDuplicates: true }, expect.any(Function))
  })

  it.each(['android', 'ios'] as const)('%s delivers later scan-response names', async (platform) => {
    h.platform = platform
    h.scanResults = [
      { device: { deviceId: 'a' } },                              // first ADV: no name, no UUID → drop
      { device: { deviceId: 'a' }, localName: 'SSL_0F3A' },       // scan response: keep
    ]
    const mgr = await loadManager()
    const found: ProvisionScanDevice[] = []
    await mgr.scanDevices(d => found.push(d))
    expect(h.ble.requestLEScan).toHaveBeenCalledWith({ allowDuplicates: true }, expect.any(Function))
    expect(found.map(d => d.deviceId)).toEqual(['a'])
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
    // is diagnostic only, and the scan proceeds.
    h.ble.isLocationEnabled.mockResolvedValue(false)
    h.scanResults = [{ device: { deviceId: 'a', name: 'SSL_1' } }]
    const mgr = await loadManager()
    const found: ProvisionScanDevice[] = []
    await mgr.scanDevices(d => found.push(d))
    expect(found.map(d => d.deviceId)).toEqual(['a'])
    expect(h.ble.isLocationEnabled).toHaveBeenCalled()
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

  it('does not start a scan cancelled during initialization', async () => {
    let ready!: () => void
    h.ble.initialize.mockImplementationOnce(() => new Promise<void>(resolve => { ready = resolve }))
    const mgr = await loadManager()
    const pending = mgr.scanDevices(vi.fn())
    await vi.waitFor(() => expect(ready).toBeDefined())
    await mgr.stopScan()
    ready()
    await pending
    expect(h.ble.requestLEScan).not.toHaveBeenCalled()
  })

  it('reads GAP for an unnamed candidate and never reuses the previous device ID', async () => {
    const mgr = await loadManager()
    vi.spyOn(mgr as any, 'openLink').mockResolvedValue(undefined)
    const name = 'SSL_0IIOTUJF3AgEpIA=='
    h.ble.read.mockResolvedValue(new DataView(new TextEncoder().encode(name).buffer))
    await mgr.connectTo('first', name)
    expect(mgr.getDuid()).toBe('20839350917702012920')
    await mgr.connectTo('second')
    expect(h.ble.read).toHaveBeenCalledWith('second', expect.any(String), expect.any(String))
    expect(mgr.getDuid()).toBe('20839350917702012920')
    h.ble.read.mockRejectedValue(new Error('unreadable'))
    await mgr.connectTo('third')
    expect(mgr.getDuid()).toBeNull()
  })
