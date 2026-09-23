import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('../utils/iotSign', () => ({ calcSign: () => ({}), parseUrlParams: () => ({}) }))
vi.mock('../stores/bleLiveStatusStore', () => ({ overlayBleOnLatestApiResponse: (_path: string, data: unknown) => data }))
import { addDevice, addDeviceWithStation, addStation } from './deviceApi'

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => 'fixture-token' })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('lost response'), { name: 'TimeoutError' })))
})
afterEach(() => vi.unstubAllGlobals())
it.each([
  () => addDevice({ stationId: 'station' } as any),
  () => addDeviceWithStation({} as any),
  () => addStation({} as any),
])('does not automatically replay a creation POST after a timeout', async call => {
  await expect(call()).rejects.toThrow('lost response')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toHaveProperty('IOT-Token', 'fixture-token')
})
