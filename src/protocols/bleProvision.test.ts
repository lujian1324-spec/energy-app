import { describe, it, expect } from 'vitest'
import { isSierroScanResult } from './bleProvision'

// v4.4.3 Android "no devices found" fix: scanDevices() no longer OS-filters by namePrefix.
// isSierroScanResult() is the client-side filter — a device qualifies if its name starts
// with SSL_ OR it advertises the FEE7 provisioning service. This guards that logic.
const FEE7 = '0000fee7-0000-1000-8000-00805f9b34fb'

describe('isSierroScanResult', () => {
  it('matches devices whose advertised name starts with SSL_ (case-insensitive)', () => {
    expect(isSierroScanResult({ device: { name: 'SSL_0F3A' } })).toBe(true)
    expect(isSierroScanResult({ localName: 'SSL_1234' })).toBe(true)
    expect(isSierroScanResult({ device: { name: 'ssl_lower' } })).toBe(true)
  })

  it('matches devices that advertise the FEE7 service even without an SSL_ name', () => {
    expect(isSierroScanResult({ uuids: [FEE7] })).toBe(true)
    expect(isSierroScanResult({ uuids: ['0000FEE7-0000-1000-8000-00805F9B34FB'] })).toBe(true)
    expect(isSierroScanResult({ device: { name: 'Unknown' }, uuids: ['180a', FEE7] })).toBe(true)
  })

  it('rejects unrelated devices and empty advertisements', () => {
    expect(isSierroScanResult({ device: { name: 'AirPods' }, uuids: ['0000180a-0000-1000-8000-00805f9b34fb'] })).toBe(false)
    expect(isSierroScanResult({})).toBe(false)
    expect(isSierroScanResult({ device: {}, uuids: [] })).toBe(false)
    expect(isSierroScanResult({ localName: 'MyPhone' })).toBe(false)
  })
})
