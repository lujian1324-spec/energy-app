import { describe, it, expect } from 'vitest'
import { classifyBleError } from './permissions'

// classifyBleError drives the BLE error UI: 'permission' -> Open Settings,
// 'bluetooth_off' -> enable Bluetooth/Location retry, 'generic' -> raw text.
// Regression guard for v4.4.3: native reject strings must route to an actionable branch.
describe('classifyBleError', () => {
  it('routes explicit permission denials to "permission"', () => {
    expect(classifyBleError(new Error('Permission denied.')).kind).toBe('permission')
    expect(classifyBleError(new Error('NotAllowedError: user gesture required')).kind).toBe('permission')
    expect(classifyBleError(new Error('CBManager unauthorized')).kind).toBe('permission')
  })

  it('routes radio/adapter/location/uninitialized failures to "bluetooth_off"', () => {
    expect(classifyBleError(new Error('Bluetooth is off')).kind).toBe('bluetooth_off')
    expect(classifyBleError(new Error('BLE is not available.')).kind).toBe('bluetooth_off')
    expect(classifyBleError(new Error('Bluetooth LE not initialized.')).kind).toBe('bluetooth_off')
    expect(classifyBleError(new Error('Location services are off — enable location to scan.')).kind).toBe('bluetooth_off')
    expect(classifyBleError(new Error('requestEnable is not available on iOS.')).kind).toBe('bluetooth_off')
  })

  it('falls back to "generic" for unrecognized failures and non-Error input', () => {
    expect(classifyBleError(new Error('GATT write timed out')).kind).toBe('generic')
    const nonError = classifyBleError('boom')
    expect(nonError.kind).toBe('generic')
    expect(nonError.msg).toBe('Connection failed')
  })

  it('preserves the original message', () => {
    expect(classifyBleError(new Error('Permission denied.')).msg).toBe('Permission denied.')
  })
})
