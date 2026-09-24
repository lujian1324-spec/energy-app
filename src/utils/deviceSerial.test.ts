/**
 * Device Info: Serial Number is the device's own serial; the Bluetooth ID is a
 * separate, labelled row (after-sales R15).
 */
import { describe, it, expect } from 'vitest'
import { deviceBluetoothId, deviceSerialNumber } from './deviceSerial'

describe('deviceSerialNumber', () => {
  it('shows a serial the device reported', () => {
    expect(deviceSerialNumber({ serialNumber: 'SN26312510CN003146260849', isVirtualSerialNumber: false }))
      .toBe('SN26312510CN003146260849')
  })

  it('never shows a virtual serial the app generated at bind time', () => {
    expect(deviceSerialNumber({ serialNumber: 'SR1000-874514', isVirtualSerialNumber: true })).toBe('--')
    // Even when the record does not say it is virtual, the generated form is recognised.
    expect(deviceSerialNumber({ serialNumber: 'SR2000-123456' })).toBe('--')
  })

  it('shows "--" rather than a placeholder when there is none', () => {
    expect(deviceSerialNumber({ serialNumber: '' })).toBe('--')
    expect(deviceSerialNumber(undefined)).toBe('--')
  })
})

describe('deviceBluetoothId', () => {
  it('is the DTU id the device was bound with', () => {
    expect(deviceBluetoothId({ dtuDtuid: '43767893781169874514' }, { bleId: 'other' })).toBe('43767893781169874514')
  })

  it('falls back to the id saved on this phone at add time, then "--"', () => {
    expect(deviceBluetoothId({ dtuDtuid: '' }, { bleId: ' 00112233445566778899 ' })).toBe('00112233445566778899')
    expect(deviceBluetoothId(null, undefined)).toBe('--')
  })
})
