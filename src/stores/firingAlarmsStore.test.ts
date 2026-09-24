/**
 * APP-20260923-004 — the bell and the Notifications list read one store, over
 * all devices, so a lit dot always has a row behind it and opening the list
 * clears it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  replies: {} as Record<string, { code: number | string; data?: any } | Error>,
}))

vi.mock('../api/deviceApi', () => ({
  fetchDeviceState: (id: string) => {
    const r = h.replies[id]
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r ?? { code: 0, data: { firingAlarms: [] } })
  },
}))
vi.mock('../data/demoData', () => ({
  getDemoDeviceState: (id: string) => (id === 'demo1' ? { firingAlarms: [alarm('Battery temperature high')] } : null),
}))
vi.mock('../utils/apiClient', () => ({ isApiSuccess: (c: unknown) => c === 0 || c === '0' }))

import {
  useFiringAlarmsStore,
  recordFiringAlarms,
  recordFiringAlarmsFailed,
  clearFiringAlarms,
  refreshFiringAlarms,
  visibleAlarmEntries,
  unreadAlarmCount,
} from './firingAlarmsStore'

function alarm(message: string) {
  return { alarmId: message, alarmCode: '', key: '', alarmMessage: message, severity: 'warning', timestamp: '' }
}

const A = '491513787113766912'
const B = '491513787113766999'

beforeEach(() => {
  clearFiringAlarms()
  for (const k of Object.keys(h.replies)) delete h.replies[k]
})

describe('bell and list agree', () => {
  it('the reported case: device B alarms while A is the selected one — the list shows it, not "all caught up"', () => {
    recordFiringAlarms(A, [])
    recordFiringAlarms(B, [alarm('Battery temperature high')])
    const { byDevice } = useFiringAlarmsStore.getState()
    const entries = visibleAlarmEntries(byDevice, [A, B], [])
    expect(entries).toHaveLength(1)
    expect(entries[0].deviceId).toBe(B)
    expect(unreadAlarmCount(byDevice, [A, B], [], [])).toBe(1)
  })

  it('marking the listed rows seen clears the bell', () => {
    recordFiringAlarms(A, [alarm('Battery temperature high')])
    recordFiringAlarms(B, [alarm('Battery temperature high')])
    const { byDevice } = useFiringAlarmsStore.getState()
    const keys = visibleAlarmEntries(byDevice, [A, B], []).map(e => e.key)
    expect(keys).toHaveLength(2) // same alarm on two devices = two rows, keyed apart
    expect(unreadAlarmCount(byDevice, [A, B], [], keys)).toBe(0)
  })

  it('the bell never counts a row the list would not show', () => {
    recordFiringAlarms(A, [alarm('Battery temperature high'), alarm('Battery temperature high')])
    recordFiringAlarms(B, [alarm('Overload')])
    const { byDevice } = useFiringAlarmsStore.getState()
    const dismissed = visibleAlarmEntries(byDevice, [A, B], []).filter(e => e.deviceId === B).map(e => e.key)
    const rows = visibleAlarmEntries(byDevice, [A, B], dismissed)
    expect(unreadAlarmCount(byDevice, [A, B], dismissed, [])).toBe(rows.length)
  })

  it('devices no longer in the list (another account) are ignored', () => {
    recordFiringAlarms('old-account-device', [alarm('Overload')])
    const { byDevice } = useFiringAlarmsStore.getState()
    expect(unreadAlarmCount(byDevice, [A], [], [])).toBe(0)
  })
})

describe('refreshFiringAlarms', () => {
  it('reads every device and records each result', async () => {
    h.replies[A] = { code: 0, data: { firingAlarms: [alarm('Overload')] } }
    h.replies[B] = { code: 0, data: { firingAlarms: [] } }
    await refreshFiringAlarms([A, B])
    const s = useFiringAlarmsStore.getState()
    expect(s.byDevice[A].alarms).toHaveLength(1)
    expect(s.byDevice[B].alarms).toHaveLength(0)
    expect(s.failed).toEqual({})
  })

  it('a failed read keeps the last good entry and flags the device', async () => {
    recordFiringAlarms(A, [alarm('Overload')])
    h.replies[A] = new Error('network')
    h.replies[B] = { code: 500 }
    await refreshFiringAlarms([A, B])
    const s = useFiringAlarmsStore.getState()
    expect(s.byDevice[A].alarms).toHaveLength(1)
    expect(Object.keys(s.failed).sort()).toEqual([A, B].sort())
  })

  it('a later success clears the failure flag', () => {
    recordFiringAlarmsFailed(A)
    recordFiringAlarms(A, [])
    expect(useFiringAlarmsStore.getState().failed[A]).toBeUndefined()
  })

  it('demo mode reads the demo state instead of the network', async () => {
    await refreshFiringAlarms(['demo1'], { demo: true })
    expect(useFiringAlarmsStore.getState().byDevice.demo1.alarms).toHaveLength(1)
  })
})
