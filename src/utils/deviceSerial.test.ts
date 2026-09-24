/**
 * Device Info's Serial Number is the Bluetooth ID read when the device was added.
 */
import { describe, it, expect } from 'vitest'
import { deviceSerialNumber } from './deviceSerial'

describe('deviceSerialNumber', () => {
  it('shows the DTU id the device was bound with', () => {
    expect(deviceSerialNumber({ dtuDtuid: '43767893781169874514' }, { bleId: 'other' })).toBe('43767893781169874514')
  })

  it('falls back to the id saved on this phone at add time', () => {
    expect(deviceSerialNumber({ dtuDtuid: '' }, { bleId: '00112233445566778899' })).toBe('00112233445566778899')
    expect(deviceSerialNumber(undefined, { bleId: ' 0011 ' })).toBe('0011')
  })

  it('never shows a made-up serial: "--" when no Bluetooth ID is known', () => {
    expect(deviceSerialNumber({ dtuDtuid: null } as never, null)).toBe('--')
    expect(deviceSerialNumber(null, undefined)).toBe('--')
  })
})
