/**
 * A station belongs to the account that owns it, and provisioning binds a new
 * device into one. These are the two ways the previous account's station used
 * to survive a sign-out and get sent up under the next account's token, which
 * the backend answers with 20101 "illegal argument".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const fetchStationList = vi.fn()
vi.mock('../api/deviceApi', async () => {
  const actual = await vi.importActual<typeof import('../api/deviceApi')>('../api/deviceApi')
  return { ...actual, fetchStationList: (...a: unknown[]) => fetchStationList(...a) }
})

const { useDeviceStore } = await import('./deviceStore')

const STALE = [{ id: '491513787113766912', stationName: "the previous account's station" }]

beforeEach(() => {
  fetchStationList.mockReset()
  useDeviceStore.setState({ stations: STALE as never, stationTotal: 1 })
})

describe('loadStations', () => {
  it('replaces the list when the account has no stations, rather than leaving the old one', async () => {
    // What a brand-new account gets back: success, and nothing in it.
    fetchStationList.mockResolvedValue({ code: 0, message: 'ok', data: { list: [], total: 0 } })

    await expect(useDeviceStore.getState().loadStations()).resolves.toBe(true)
    expect(useDeviceStore.getState().stations).toEqual([])
    expect(useDeviceStore.getState().stationTotal).toBe(0)
  })

  it('also clears when success carries no payload at all', async () => {
    fetchStationList.mockResolvedValue({ code: 0, message: 'ok', data: null })

    await expect(useDeviceStore.getState().loadStations()).resolves.toBe(true)
    expect(useDeviceStore.getState().stations).toEqual([])
  })

  it('reports failure — and leaves the list alone — when the call does not succeed', async () => {
    fetchStationList.mockResolvedValue({ code: 20101, message: 'Iillegal argument', data: null })
    await expect(useDeviceStore.getState().loadStations()).resolves.toBe(false)

    fetchStationList.mockRejectedValue(new Error('offline'))
    await expect(useDeviceStore.getState().loadStations()).resolves.toBe(false)

    // Unchanged: the caller is told it is stale, and decides what to do.
    expect(useDeviceStore.getState().stations).toEqual(STALE)
  })
})

describe('signing out', () => {
  it('drops the stations along with the devices', () => {
    useDeviceStore.setState({ devices: [{ id: '1' }] as never, deviceTotal: 1 })

    useDeviceStore.getState().exitDemoMode()

    expect(useDeviceStore.getState().stations).toEqual([])
    expect(useDeviceStore.getState().stationTotal).toBe(0)
    expect(useDeviceStore.getState().devices).toEqual([])
  })
})
