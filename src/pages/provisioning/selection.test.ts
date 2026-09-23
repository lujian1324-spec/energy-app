import { beforeEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  states: [] as any[], refs: [] as any[], si: 0, ri: 0,
  store: {} as any,
  manager: { connectTo: vi.fn(), getDuid: vi.fn(), getVersion: vi.fn(), disconnect: vi.fn() },
  close: vi.fn(), cancel: vi.fn(), destroy: vi.fn(),
}))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useState: (initial: unknown) => {
    const i = h.si++
    if (!(i in h.states)) h.states[i] = initial
    return [h.states[i], (value: any) => { h.states[i] = typeof value === 'function' ? value(h.states[i]) : value }]
  },
  useRef: (initial: unknown) => { const i = h.ri++; return h.refs[i] ||= { current: initial } },
}))
vi.mock('../../stores/provisionStore', () => ({
  useProvisionStore: Object.assign(() => h.store, { getState: () => h.store }),
}))
vi.mock('../../stores/deviceStore', () => ({ useDeviceStore: { getState: () => ({ devices: [] }) } }))
vi.mock('../../protocols/bleProvision', () => ({
  getProvisionManager: () => h.manager, destroyProvisionManager: h.destroy, supportsDeviceListScan: () => true,
}))
vi.mock('./useProvisionScan', () => ({
  useProvisionScan: () => ({ handleScan: vi.fn(), cancelScan: h.cancel }), displayTitleFromDtuid: () => 'Fixture',
}))
vi.mock('./useProvisionBind', () => ({ useProvisionBind: () => ({}) }))
// Exercise the retained QR flow separately; qrEntryHidden.test covers production.
vi.mock('../../config/qrEntry', () => ({ QR_ENTRY_ENABLED: true }))
vi.mock('../../components/Toast', () => ({ toast: { info: vi.fn(), error: vi.fn() } }))
import ProvisioningPage from '../ProvisioningPage'

const DTUID = '20839350917702012920'
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
function render(): any { h.si = 0; h.ri = 0; return ProvisioningPage({ onClose: h.close }) }
beforeEach(() => {
  vi.resetAllMocks()
  h.states = []; h.refs = []
  h.store = { step: 'scan', dtuid: null, isOperating: false,
    setIsOperating: (v: boolean) => { h.store.isOperating = v },
    setErrorMessage: (v: string | null) => { h.store.errorMessage = v },
    setStep: (v: string) => { h.store.step = v },
    setDeviceInfo: (name: string, dtuid: string) => { h.store.deviceName = name; h.store.dtuid = dtuid },
    setVersionInfo: vi.fn(), setNeedBleKey: vi.fn(), setBleKeyVerified: vi.fn(),
    setApList: vi.fn(), setSelectedSsid: vi.fn(), setWifiPassword: vi.fn(),
    reset: () => { h.store.dtuid = null },
  }
  h.manager.getDuid.mockReturnValue(DTUID)
  h.manager.getVersion.mockResolvedValue({ RC: 0, PL: { SV: '1', HV: '1' } })
  h.manager.disconnect.mockResolvedValue(undefined)
})

it('QR identification returns to BLE discovery without calling verification', () => {
  render().props.setUiScreen('qr')
  render().props.onScanned('Fixture', DTUID)
  expect(h.store.dtuid).toBeNull()
  render().props.onConnect()
  expect(render().props.handleSelectDevice).toBeTypeOf('function')
  expect(h.manager.getVersion).not.toHaveBeenCalled()
})

it('ignores a second tap and stays busy until device verification finishes', async () => {
  let connected!: () => void, verified!: (value: unknown) => void
  h.manager.connectTo.mockImplementation(() => new Promise<void>(resolve => { connected = resolve }))
  h.manager.getVersion.mockImplementation(() => new Promise(resolve => { verified = resolve }))
  const props = render().props
  const first = props.handleSelectDevice({ deviceId: 'a', name: 'Fixture' })
  await props.handleSelectDevice({ deviceId: 'b', name: 'Other' })
  expect(h.manager.connectTo).toHaveBeenCalledTimes(1)
  expect(render().props.isConnecting).toBe(true)
  connected(); await flush()
  expect(h.store.isOperating).toBe(true)
  verified({ RC: 0, PL: { SV: '1', HV: '1' } })
  await first
  expect(h.store.step).toBe('wifi')
  expect(h.store.isOperating).toBe(false)
})

it('does not revive setup when a connection completes after the user closes it', async () => {
  let finish!: () => void
  h.manager.connectTo.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  const props = render().props
  const pending = props.handleSelectDevice({ deviceId: 'a', name: 'Fixture' })
  props.handleClose()
  finish(); await pending
  expect(h.manager.getVersion).not.toHaveBeenCalled()
  expect(h.store.dtuid).toBeNull()
  expect(h.destroy).toHaveBeenCalled()
})

it('rejects selecting a different DTUID after scanning a device QR', async () => {
  render().props.setUiScreen('qr')
  render().props.onScanned('Fixture', '11111111111111111111')
  render().props.onConnect()
  await render().props.handleSelectDevice({ deviceId: 'wrong', name: 'Fixture' })
  expect(h.manager.disconnect).toHaveBeenCalled()
  expect(h.manager.getVersion).not.toHaveBeenCalled()
  expect(h.store.errorMessage).toMatch(/not the device identified/)
})
