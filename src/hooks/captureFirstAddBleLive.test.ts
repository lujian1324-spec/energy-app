import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { LiveStatus } from '../protocols/modbusProtocol'

const readLive = vi.fn()
const getDuid = vi.fn(() => 'DTU-1')
const loadDevices = vi.fn(async () => {})

vi.mock('../protocols/bleDirect', () => ({
  readLiveStatusBle: (...args: unknown[]) => readLive(...args),
}))
vi.mock('../protocols/bleProvision', () => ({
  getProvisionManager: () => ({ getDuid, uartPassthrough: vi.fn() }),
}))
vi.mock('../stores/provisionStore', () => {
  const state = { configResult: 'success' as string | null, dtuid: 'DTU-1' }
  return {
    useProvisionStore: Object.assign(
      (sel: (s: typeof state) => unknown) => sel(state),
      { getState: () => state, subscribe: vi.fn(() => () => {}) },
    ),
  }
})
vi.mock('../stores/deviceStore', () => {
  const state = {
    isDemoMode: false,
    devices: [{ id: '55', dtuDtuid: 'DTU-1', serialNumber: 'SN-1' }],
    loadDevices,
  }
  return {
    useDeviceStore: Object.assign(
      (sel: (s: typeof state) => unknown) => sel(state),
      { getState: () => state },
    ),
  }
})

const ble: LiveStatus = {
  soc: 77, acPower: 1, solarPower: 2, outputPower: 3, batteryPower: 0, batteryTemp: 20,
}

describe('captureFirstAddBleLive', () => {
  beforeEach(async () => {
    readLive.mockReset()
    loadDevices.mockClear()
    const { clearBleLiveStatus } = await import('../stores/bleLiveStatusStore')
    clearBleLiveStatus()
  })

  it('reads BLE UART live status after bind and stores it under the new deviceId', async () => {
    readLive.mockResolvedValue(ble)
    const { captureFirstAddBleLive } = await import('./captureFirstAddBleLive')
    const { lookupBleLiveStatus } = await import('../stores/bleLiveStatusStore')
    expect(await captureFirstAddBleLive()).toBe(true)
    expect(lookupBleLiveStatus({ deviceId: '55' })?.live.soc).toBe(77)
    expect(lookupBleLiveStatus({ dtuDtuid: 'DTU-1' })?.live.soc).toBe(77)
  })

  it('skips guest/demo mode so mock devices stay unchanged', async () => {
    const deviceStore = await import('../stores/deviceStore')
    deviceStore.useDeviceStore.getState().isDemoMode = true
    readLive.mockResolvedValue(ble)
    const { captureFirstAddBleLive } = await import('./captureFirstAddBleLive')
    const { lookupBleLiveStatus } = await import('../stores/bleLiveStatusStore')
    expect(await captureFirstAddBleLive()).toBe(false)
    expect(lookupBleLiveStatus({ deviceId: '55' })).toBeNull()
    deviceStore.useDeviceStore.getState().isDemoMode = false
  })

  it('retries once when the first UART read returns null (iOS drop after Wi-Fi join)', async () => {
    readLive.mockResolvedValueOnce(null).mockResolvedValueOnce(ble)
    const { captureFirstAddBleLive } = await import('./captureFirstAddBleLive')
    const { lookupBleLiveStatus } = await import('../stores/bleLiveStatusStore')
    expect(await captureFirstAddBleLive()).toBe(true)
    expect(readLive).toHaveBeenCalledTimes(2)
    expect(lookupBleLiveStatus({ deviceId: '55' })?.live.soc).toBe(77)
  })
})
