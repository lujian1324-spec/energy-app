import { describe, it, expect } from 'vitest'
import { resolveAlarmText, describeAlarmCode, knownAlarmText, dedupeAndFilterAlarms } from './alarmText'

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

  it('skips a CJK backend name and uses the mapped English or humanized key', () => {
    expect(resolveAlarmText({ key: 'unknownVendorFault', name: '电芯过压' }))
      .toBe('Cell overvoltage')
    expect(resolveAlarmText({ key: 'busOverCurrent', name: '未知告警名称' }))
      .toBe('Bus Over Current')
  })

  it('maps a Chinese timeout name instead of showing CJK', () => {
    expect(resolveAlarmText({ name: '等待设备应答超时' }))
      .toBe('Timed out waiting for the device.')
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

describe('dedupeAndFilterAlarms', () => {
  const titles = (arr: Array<{ title: string }>) => arr.map(a => a.title)

  it('hides Mains power failure entirely (lineLoss + mainsFailure both suppressed)', () => {
    const out = dedupeAndFilterAlarms([
      { key: 'lineLoss', alarmId: '1' },
      { key: 'mainsFailure', alarmId: '2' },
    ])
    expect(titles(out)).toEqual([])
  })

  it('hides a Mains power failure and its correlated undervoltage symptoms, keeps unrelated', () => {
    const out = dedupeAndFilterAlarms([
      { key: 'lineLoss', alarmId: '1' },            // Mains power failure → hidden
      { key: 'gridVoltLows', alarmId: '2' },        // Mains undervoltage → hidden (correlated)
      { key: 'bypassUndervoltageFault', alarmId: '3' }, // Bypass undervoltage → hidden (correlated)
      { key: 'cellOverVoltage', alarmId: '4' },     // unrelated → kept
    ])
    expect(titles(out)).toEqual(['Cell overvoltage'])
  })

  it('keeps undervoltage alarms when there is no Mains power failure', () => {
    const out = dedupeAndFilterAlarms([
      { key: 'gridVoltLows', alarmId: '1' },
      { key: 'bypassUndervoltageFault', alarmId: '2' },
    ])
    expect(titles(out)).toEqual(['Mains undervoltage', 'Bypass undervoltage'])
  })

  it('annotates each kept alarm with its resolved title and preserves other fields', () => {
    const out = dedupeAndFilterAlarms([{ key: 'fanFault', alarmId: '9', severity: 'high' } as any])
    expect(out[0].title).toBe('Fan fault')
    expect((out[0] as any).severity).toBe('high')
  })
})

describe('dedupeAndFilterAlarms — suppressed alarms (Jason)', () => {
  const titles = (arr: Array<{ title: string }>) => arr.map(a => a.title)

  it('hides PV under voltage (spaced, joined, and the "votage" typo)', () => {
    const out = dedupeAndFilterAlarms([
      { key: 'x1', name: 'PV under voltage', alarmId: '1' },
      { key: 'x2', name: 'PV undervoltage', alarmId: '2' },
      { key: 'x3', name: 'PV under votage', alarmId: '3' },   // typo variant
      { key: 'cellOverVoltage', alarmId: '4' },               // kept
    ])
    expect(titles(out)).toEqual(['Cell overvoltage'])
  })

  it('hides PV not connected', () => {
    const out = dedupeAndFilterAlarms([{ name: 'PV not connected', alarmId: '1' }])
    expect(out).toEqual([])
  })

  it('hides "Mains power fail" close variants and the CJK mains-input name', () => {
    const out = dedupeAndFilterAlarms([
      { name: 'Mains power fail', alarmId: '1' },
      { name: '市电输入失效', alarmId: '2' },
    ])
    expect(out).toEqual([])
  })

  it('matches case-insensitively and on the raw wire fields', () => {
    const out = dedupeAndFilterAlarms([
      { alarmMessage: 'DEVICE REPORTS PV NOT CONNECTED', alarmId: '1' },
      { key: 'pvNotConnected', alarmId: '2' },
    ])
    expect(out).toEqual([])
  })

  it('does NOT hide Grid power not connected (only PV/mains variants)', () => {
    const out = dedupeAndFilterAlarms([{ name: 'Grid power not connected', alarmId: '1' }])
    expect(titles(out)).toEqual(['Grid power not connected'])
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
