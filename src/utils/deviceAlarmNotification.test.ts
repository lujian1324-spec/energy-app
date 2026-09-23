import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { showDeviceAlarmNotification, showLocalNotification } from './pushNotification'
import { checkAndNotifyDeviceAlarms, clearDeviceAlarmNotificationCache } from './deviceAlarmNotification'
import { checkAndNotifyPowerOutage, clearOutageNotificationCache, type FiringAlarm } from './powerOutageNotification'

vi.mock('./pushNotification', () => ({
  showDeviceAlarmNotification: vi.fn().mockResolvedValue(undefined),
  showLocalNotification: vi.fn().mockResolvedValue(undefined),
}))

function alarm(key: string, name?: string): FiringAlarm {
  return {
    alarmId: key,
    alarmCode: key,
    alarmMessage: '',
    severity: 'high',
    timestamp: '',
    key,
    name,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearDeviceAlarmNotificationCache()
  clearOutageNotificationCache()
  const notification = { permission: 'granted' }
  vi.stubGlobal('Notification', notification)
  vi.stubGlobal('window', { Notification: notification })
})

afterEach(() => vi.unstubAllGlobals())

describe('foreground alarm notifications', () => {
  it('does not push PV or MPPT alarms, but still pushes unrelated device alarms', async () => {
    await checkAndNotifyDeviceAlarms('Sierro', true, [
      alarm('pvOverVoltage'),
      alarm('mpptOverTemp'),
      alarm('fanFault'),
    ])

    expect(showDeviceAlarmNotification).toHaveBeenCalledTimes(1)
    expect(showDeviceAlarmNotification).toHaveBeenCalledWith('Sierro', 'fanFault', 'Fan fault', 'high')
  })

  it('does not reclassify a PV power failure as a mains outage', async () => {
    await checkAndNotifyPowerOutage('Sierro', true, [
      alarm('pvPowerFailure'),
      alarm('lineLoss'),
    ])

    expect(showLocalNotification).toHaveBeenCalledTimes(1)
    expect(showLocalNotification).toHaveBeenCalledWith(
      '⚡ Power Outage Detected',
      expect.objectContaining({ tag: 'power-outage-lineLoss' }),
    )
  })
})
