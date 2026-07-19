import { describe, it, expect } from 'vitest'
import { resolveAlarmText, describeAlarmCode, knownAlarmText } from './alarmText'

/**
 * resolveAlarmText is the single entry that turns a firing-alarm object into a
 * human-readable description. The real backend reports each alarm via key/name
 * (not the legacy alarmCode/alarmMessage), so the resolver must read all of them
 * — otherwise NotificationsPage falls back to a generic "Device Alarm".
 */
describe('resolveAlarmText', () => {
  it('uses the curated English dictionary for a known key', () => {
    expect(resolveAlarmText({ key: 'cellOverVoltage', name: '电芯过压' }))
      .toBe('Cell overvoltage')
  })

  it('is case-insensitive on the code', () => {
    expect(resolveAlarmText({ key: 'CELLOVERVOLTAGE' })).toBe('Cell overvoltage')
  })

  it('falls back to the backend name for an unknown key', () => {
    expect(resolveAlarmText({ key: 'someVendorSpecificFault', name: 'Inverter board fault' }))
      .toBe('Inverter board fault')
  })

  it('supports the legacy alarmCode/alarmMessage shape (demo data)', () => {
    expect(resolveAlarmText({
      alarmCode: 'LOW_BATTERY_WIFI_ROUTER',
      alarmMessage: 'WiFi Router Battery Below 10%, estimated remaining time 20mins',
    })).toBe('WiFi Router Battery Below 10%, estimated remaining time 20mins')
  })

  it('humanizes an unknown code when no name/message is present', () => {
    expect(resolveAlarmText({ key: 'busOverCurrent' })).toBe('Bus Over Current')
  })

  it('renders a numeric-only code as "Alarm N"', () => {
    expect(resolveAlarmText({ key: '512' })).toBe('Alarm 512')
  })

  it('falls back to the alarm id, then a generic label, when empty', () => {
    expect(resolveAlarmText({ alarmId: 'A-1' })).toBe('Alarm A-1')
    expect(resolveAlarmText({})).toBe('Device Alarm')
  })
})

describe('knownAlarmText / describeAlarmCode', () => {
  it('knownAlarmText returns "" for an unknown code', () => {
    expect(knownAlarmText('totallyUnknown')).toBe('')
    expect(knownAlarmText('lineLoss')).toBe('Mains power failure')
  })

  it('describeAlarmCode humanizes unknown codes but keeps dictionary hits', () => {
    expect(describeAlarmCode('lineLoss')).toBe('Mains power failure')
    expect(describeAlarmCode('fanFault')).toBe('Fan fault')
    expect(describeAlarmCode('')).toBe('')
  })
})
