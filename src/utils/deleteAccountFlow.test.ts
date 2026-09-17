/**
 * `/user/logout/account` refuses an account that still owns a station. The app
 * called it on its own, and the Settings dialog swallowed the rejection and
 * signed the user out — so an account the backend had REFUSED to delete looked
 * deleted to the person who asked. For Apple 5.1.1(v) and Play's deletion
 * policy that is the one outcome that must not happen.
 *
 * What these pin: the order the backend accepts, that a failure stops the run
 * before the account is touched, and that the answer is never "ok" unless every
 * step really succeeded.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const calls: string[] = []
type Reply = { code: number; message?: string; data?: unknown }
const deleteDevice = vi.fn(async (id: string): Promise<Reply> => { calls.push(`device:${id}`); return { code: 0 } })
const deleteStation = vi.fn(async (id: string): Promise<Reply> => { calls.push(`station:${id}`); return { code: 0 } })
const deleteAccount = vi.fn(async (): Promise<Reply> => { calls.push('account'); return { code: 0 } })
const fetchDeviceList = vi.fn(async (): Promise<Reply> => ({ code: 0, data: { list: [{ id: '1' }, { id: '2' }], total: 2 } }))
const fetchStationList = vi.fn(async (): Promise<Reply> => ({ code: 0, data: { list: [{ id: '900' }], total: 1 } }))

vi.mock('../api/deviceApi', () => ({
  deleteDevice: (...a: unknown[]) => deleteDevice(...(a as [string])),
  deleteStation: (...a: unknown[]) => deleteStation(...(a as [string])),
  fetchDeviceList: (...a: unknown[]) => fetchDeviceList(...(a as [])),
  fetchStationList: (...a: unknown[]) => fetchStationList(...(a as [])),
}))
vi.mock('../api/authApi', () => ({
  deleteAccount: () => deleteAccount(),
}))

const { deleteAccountAndContents, deleteAccountProgressLabel } = await import('./deleteAccountFlow')

beforeEach(() => {
  calls.length = 0
  for (const m of [deleteDevice, deleteStation, deleteAccount]) m.mockClear()
  deleteDevice.mockImplementation(async (id: string) => { calls.push(`device:${id}`); return { code: 0 } })
  deleteStation.mockImplementation(async (id: string) => { calls.push(`station:${id}`); return { code: 0 } })
  deleteAccount.mockImplementation(async () => { calls.push('account'); return { code: 0 } })
  fetchDeviceList.mockResolvedValue({ code: 0, data: { list: [{ id: '1' }, { id: '2' }], total: 2 } })
  fetchStationList.mockResolvedValue({ code: 0, data: { list: [{ id: '900' }], total: 1 } })
})

describe('deleting an account', () => {
  it('takes the contents down before the account, devices before stations', async () => {
    const res = await deleteAccountAndContents()

    expect(res.ok).toBe(true)
    expect(res.devicesDeleted).toBe(2)
    expect(res.stationsDeleted).toBe(1)
    // The order is the whole point: a station with a device still bound is not
    // empty, and an account that still owns a station cannot be deleted.
    expect(calls).toEqual(['device:1', 'device:2', 'station:900', 'account'])
  })

  it('lists stations only after the devices are gone', async () => {
    // Otherwise the list is what was there before the run, not what is left.
    const order: string[] = []
    fetchStationList.mockImplementation(async () => {
      order.push(`stations-listed-after-${deleteDevice.mock.calls.length}-devices`)
      return { code: 0, data: { list: [], total: 0 } }
    })
    await deleteAccountAndContents()
    expect(order).toEqual(['stations-listed-after-2-devices'])
  })

  it('sends ids as strings, so an 18-digit id is not rounded', async () => {
    // Java Longs. Number('491513787113766912') is a different station.
    fetchDeviceList.mockResolvedValue({ code: 0, data: { list: [{ id: '491513787113766912' }], total: 1 } })
    fetchStationList.mockResolvedValue({ code: 0, data: { list: [{ id: '491513787113766913' }], total: 1 } })

    await deleteAccountAndContents()

    expect(deleteDevice).toHaveBeenCalledWith('491513787113766912')
    expect(deleteStation).toHaveBeenCalledWith('491513787113766913')
  })

  it('deletes the account of someone who owns nothing', async () => {
    fetchDeviceList.mockResolvedValue({ code: 0, data: { list: [], total: 0 } })
    fetchStationList.mockResolvedValue({ code: 0, data: { list: [], total: 0 } })

    const res = await deleteAccountAndContents()

    expect(res.ok).toBe(true)
    expect(calls).toEqual(['account'])
  })
})

describe('when a step fails', () => {
  it('leaves the account standing if a station will not delete', async () => {
    // The reported bug, from the other side: the station refuses, so the
    // account must survive for the user to try again with.
    deleteStation.mockResolvedValue({ code: 20101, message: 'Iillegal argument' })

    const res = await deleteAccountAndContents()

    expect(res.ok).toBe(false)
    expect(res.failedAt).toBe('stations')
    expect(res.message).toBe('Iillegal argument')
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('stops at the first device that will not delete', async () => {
    deleteDevice.mockImplementation(async (id: string) => {
      calls.push(`device:${id}`)
      return id === '1' ? { code: 0 } : { code: 500, message: 'Device busy' }
    })

    const res = await deleteAccountAndContents()

    expect(res.ok).toBe(false)
    expect(res.failedAt).toBe('devices')
    expect(res.devicesDeleted).toBe(1)   // honest about the half that went
    expect(deleteStation).not.toHaveBeenCalled()
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('reports a thrown request as a failure rather than a success', async () => {
    deleteStation.mockRejectedValue(new Error('offline'))

    const res = await deleteAccountAndContents()

    expect(res.ok).toBe(false)
    expect(res.failedAt).toBe('stations')
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('says so when the account delete itself is refused', async () => {
    deleteAccount.mockResolvedValue({ code: 500, message: 'Account still has a station' })

    const res = await deleteAccountAndContents()

    expect(res.ok).toBe(false)
    expect(res.failedAt).toBe('account')
    expect(res.message).toBe('Account still has a station')
    // The contents really did go, and the caller is told, so the message can
    // be accurate about what is left behind.
    expect(res.devicesDeleted).toBe(2)
    expect(res.stationsDeleted).toBe(1)
  })

  it('does not start deleting when the list cannot even be read', async () => {
    fetchDeviceList.mockResolvedValue({ code: 401, message: 'Token missing' })

    const res = await deleteAccountAndContents()

    expect(res.ok).toBe(false)
    expect(res.failedAt).toBe('devices')
    expect(deleteDevice).not.toHaveBeenCalled()
    expect(deleteAccount).not.toHaveBeenCalled()
  })
})

describe('progress', () => {
  it('reports each step as it goes, so the button is not silent', async () => {
    const seen: string[] = []
    await deleteAccountAndContents((p) => seen.push(`${p.step} ${p.done}/${p.total}`))

    expect(seen).toEqual([
      'devices 0/2', 'devices 1/2', 'devices 2/2',
      'stations 0/1', 'stations 1/1',
      'account 0/1', 'account 1/1',
    ])
  })

  it('reads as a sentence on the button', () => {
    expect(deleteAccountProgressLabel(null)).toBe('Deleting…')
    expect(deleteAccountProgressLabel({ step: 'devices', done: 1, total: 3 })).toBe('Removing devices (1/3)…')
    expect(deleteAccountProgressLabel({ step: 'stations', done: 0, total: 1 })).toBe('Removing stations…')
    expect(deleteAccountProgressLabel({ step: 'account', done: 0, total: 1 })).toBe('Deleting account…')
  })
})
