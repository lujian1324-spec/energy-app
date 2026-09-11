import { describe, it, expect } from 'vitest'
import { splitAlarmForRow } from './NotificationsPage'

/**
 * splitAlarmForRow turns a firing alarm into the row's title + subtitle. Grid power
 * not connected must keep its title but always show the Jason-approved explanation
 * as the subtitle, overriding any server-sent body.
 */
describe('splitAlarmForRow — Grid power not connected', () => {
  const approved = 'AC grid input isn’t detected. Confirm the AC cable and that the wall outlet.'

  it('overrides the body with the approved copy and keeps the title', () => {
    const row = splitAlarmForRow(
      { title: 'Grid power not connected', alarmMessage: 'some server body' },
      'Living Room',
    )
    expect(row.title).toBe('Grid power not connected')
    expect(row.description).toBe(approved)
  })

  it('does not add the device name or server body for this alarm', () => {
    const row = splitAlarmForRow({ title: 'Grid power not connected' }, 'Garage')
    expect(row.description).toBe(approved)
  })

  it('leaves an unrelated alarm using the normal {device} • {detail} body', () => {
    const row = splitAlarmForRow(
      { title: 'Cell overvoltage', alarmMessage: 'Cell overvoltage', severity: 'high' },
      'Garage',
    )
    expect(row.title).toBe('Cell overvoltage')
    expect(row.description).toBe('Garage • High')
  })
})
