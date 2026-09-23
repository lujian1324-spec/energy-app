import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useProvisionStore } from '../../stores/provisionStore'
const h = vi.hoisted(() => ({
  ds: { stations: [{ id: 'station' }], devices: [] as any[], deviceError: null as string | null,
    loadStations: vi.fn(), loadDevices: vi.fn(), addNewDevice: vi.fn() },
  info: vi.fn(), addStation: vi.fn(), toast: vi.fn(), configWifi: vi.fn(), disconnect: vi.fn(), connectTo: vi.fn(),
}))
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(), useCallback: (fn: unknown) => fn }))
vi.mock('../../components/Toast', () => ({ toast: { info: h.toast, error: vi.fn() } }))
vi.mock('../../stores/deviceStore', () => ({ useDeviceStore: { getState: () => h.ds } }))
vi.mock('../../protocols/bleProvision', () => ({ getProvisionManager: () => h }))
vi.mock('../../api/deviceApi', () => ({ fetchDtuInfo: h.info, addStation: h.addStation, ratedPowerKw: (n: number) => n / 1000 }))
vi.mock('../../api/authApi', () => ({ fetchUserInfo: async () => ({ code: 0, data: {} }) }))
vi.mock('../../db/powerflowDB', () => ({ saveRatedParams: vi.fn() }))
import { useProvisionBind } from './useProvisionBind'

function setup() {
  const opts = { store: useProvisionStore.getState(), deviceNameInput: 'Fixture', selectedModel: 'Sierro 1000' as const,
    failKind: null, bindRetrying: false, restarting: false,
    configGuardRef: { current: false }, wifiConfiguredRef: { current: true },
    lastBleRef: { current: { deviceId: 'fixture' } }, bleGoneRef: { current: false },
    provisionStepRef: { current: 'password' as const }, selectedIconRef: { current: '' },
    onWifiConfigured: vi.fn(), setBindRetrying: vi.fn(), setRestarting: vi.fn(), setShowRestartHelp: vi.fn(),
    setConfigStage: vi.fn(), setFailKind: vi.fn(), setBindReason: vi.fn(), setBindDetails: vi.fn(),
    setBindReasonKind: vi.fn(), setBindErrorId: vi.fn(),
  }
  return { hook: useProvisionBind(opts), opts }
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers()
  useProvisionStore.getState().reset()
  useProvisionStore.getState().setDeviceInfo('Fixture', '20839350917702012920')
  useProvisionStore.getState().setApList([{ SSID: 'open', Secu: 0 }])
  useProvisionStore.getState().setSelectedSsid('open')
  h.ds.deviceError = null
  h.ds.loadStations.mockResolvedValue(true)
  h.ds.addNewDevice.mockResolvedValue({ code: 0 })
  h.info.mockResolvedValue({ code: 0, data: { devicesToBeAdded: [{ deviceSerialNumber: 'fixture-serial' }], devicesAlreadyAdded: [] } })
  h.configWifi.mockResolvedValue({ RC: 0 })
  h.disconnect.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

it('sends an empty password for an open network and permits setup to continue', async () => {
  const { hook, opts } = setup()
  await hook.handleConfig()
  expect(h.configWifi).toHaveBeenCalledWith('open', '')
  expect(opts.onWifiConfigured).toHaveBeenCalled()
})

it('an outer Wi-Fi deadline cancels the BLE operation rather than leaving it running', async () => {
  h.configWifi.mockImplementation(() => new Promise(() => {}))
  const { hook } = setup()
  const pending = hook.handleConfig()
  await vi.advanceTimersByTimeAsync(25000)
  await pending
  expect(h.disconnect).toHaveBeenCalled()
  expect(useProvisionStore.getState().isOperating).toBe(false)
})

it('does not expire cloud binding on an unrelated 25-second UI timer', async () => {
  let finish!: (value: unknown) => void
  h.ds.addNewDevice.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const { hook } = setup()
  const pending = hook.handleBindToCloud()
  await vi.advanceTimersByTimeAsync(25001)
  expect(useProvisionStore.getState().isOperating).toBe(true)
  expect(useProvisionStore.getState().configResult).toBeNull()
  finish({ code: 0 }); await pending
  expect(useProvisionStore.getState().configResult).toBe('success')
})

it('does not create a station after its account lookup fails', async () => {
  h.ds.loadStations.mockResolvedValue(false)
  await setup().hook.handleBindToCloud()
  expect(h.addStation).not.toHaveBeenCalled()
  expect(h.ds.addNewDevice).not.toHaveBeenCalled()
  expect(useProvisionStore.getState().isOperating).toBe(false)
})

it('does not invent a serial when the DTU lookup itself fails', async () => {
  h.info.mockRejectedValue(new Error('offline'))
  await setup().hook.handleBindToCloud()
  expect(h.ds.addNewDevice).not.toHaveBeenCalled()
})

it('shows a refresh warning rather than silently hiding a successful bind', async () => {
  h.ds.loadDevices.mockImplementation(async () => { h.ds.deviceError = 'offline' })
  await setup().hook.handleBindToCloud()
  expect(useProvisionStore.getState().configResult).toBe('success')
  expect(h.toast).toHaveBeenCalledWith(expect.stringContaining('could not refresh'))
})

it('cloud retry does not require a BLE connection after Wi-Fi setup', async () => {
  await setup().hook.handleRetryCurrentStage()
  expect(h.connectTo).not.toHaveBeenCalled()
  expect(h.ds.addNewDevice).toHaveBeenCalledTimes(1)
})

it('stops a Wi-Fi retry and clears busy state if BLE reconnection fails', async () => {
  const { hook, opts } = setup()
  opts.wifiConfiguredRef.current = false
  h.connectTo.mockRejectedValue(new Error('offline'))
  await hook.handleRetryCurrentStage()
  expect(h.configWifi).not.toHaveBeenCalled()
  expect(useProvisionStore.getState().isOperating).toBe(false)
  expect(opts.configGuardRef.current).toBe(false)
})
