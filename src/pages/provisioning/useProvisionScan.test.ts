import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useProvisionScan, type FoundDevice } from './useProvisionScan'
import type { ProvisionScanDevice } from '../../protocols/bleProvision'
import { PROVISION_SCAN_MS } from './scanDiscovery'

const h = vi.hoisted(() => ({
  scanDevices: vi.fn(), stopScan: vi.fn(), destroy: vi.fn(), cleanup: () => {},
}))
// Exercise the hook's async scan lifecycle without a browser renderer.
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useRef: (current: unknown) => ({ current }),
  useEffect: (fn: () => () => void) => { h.cleanup = fn() },
}))
vi.mock('../../protocols/bleProvision', () => ({
  getProvisionManager: () => h,
  destroyProvisionManager: h.destroy,
  stopProvisionScan: () => h.stopScan(),
  supportsDeviceListScan: () => true,
}))
vi.mock('./useProvisionBind', () => ({ DISCONNECT_COPY: 'Disconnected' }))
vi.mock('../../components/Toast', () => ({ toast: { error: vi.fn(), info: vi.fn() } }))

function setup() {
  let found: FoundDevice[] = []
  const store = { setIsOperating: vi.fn(), setErrorMessage: vi.fn(), addLog: vi.fn() }
  const setBleStatus = vi.fn()
  const hook = useProvisionScan({
    store: store as any,
    setFoundDevices: next => { found = typeof next === 'function' ? next(found) : next },
    setFailKind: vi.fn(), setBleStatus,
    wifiConfiguredRef: { current: false }, lastBleRef: { current: {} },
    bleGoneRef: { current: false }, provisionStepRef: { current: 'scan' } as any,
    reconnectingRef: { current: false }, configGuardRef: { current: false },
    scanStopRef: { current: null },
  })
  return { ...hook, store, setBleStatus, found: () => found }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  h.scanDevices.mockResolvedValue(undefined)
  h.stopScan.mockResolvedValue(undefined)
  h.destroy.mockResolvedValue(undefined)
})
afterEach(() => { h.cleanup(); vi.useRealTimers() })

describe('provisioning scan lifecycle', () => {
  it('gives a full scan window after slow permission/startup completes', async () => {
    let ready!: () => void
    h.scanDevices.mockImplementation(() => new Promise<void>(resolve => { ready = resolve }))
    const scan = setup()
    const pending = scan.handleScan()
    await vi.advanceTimersByTimeAsync(30000)
    expect(scan.store.setErrorMessage.mock.calls).toEqual([[null]])
    ready()
    await pending
    await vi.advanceTimersByTimeAsync(PROVISION_SCAN_MS - 1)
    expect(scan.store.setIsOperating).not.toHaveBeenCalledWith(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(scan.store.setErrorMessage).toHaveBeenLastCalledWith('No nearby Sierro devices found.')
    expect(scan.store.setIsOperating).toHaveBeenLastCalledWith(false)
  })

  it('keeps service-only candidates, upgrades their names, and deduplicates', async () => {
    let onFound!: (d: ProvisionScanDevice) => void
    h.scanDevices.mockImplementation(async cb => { onFound = cb })
    const scan = setup()
    await scan.handleScan()
    onFound({ deviceId: 'AA:BB:CC:DD' })
    expect(scan.found()).toEqual([expect.objectContaining({ deviceId: 'AA:BB:CC:DD', serial: '' })])
    onFound({ deviceId: 'AA:BB:CC:DD', name: 'SSL_0IIOTUJF3AgEpIA==' })
    onFound({ deviceId: 'AA:BB:CC:DD' })
    expect(scan.found()).toHaveLength(1)
    expect(scan.found()[0].serial).toBe('20839350917702012920')
    await vi.advanceTimersByTimeAsync(PROVISION_SCAN_MS)
    expect(scan.store.setErrorMessage.mock.calls).toEqual([[null]])
  })

  it('ignores late callbacks/timeouts after selection, QR navigation, or unmount', async () => {
    let onFound!: (d: ProvisionScanDevice) => void
    h.scanDevices.mockImplementation(async cb => { onFound = cb })
    const scan = setup()
    await scan.handleScan()
    scan.cancelScan()
    onFound({ deviceId: 'late' })
    await vi.advanceTimersByTimeAsync(PROVISION_SCAN_MS)
    expect(scan.found()).toEqual([])
    expect(scan.store.setErrorMessage.mock.calls).toEqual([[null]])
    expect(scan.store.setIsOperating).not.toHaveBeenCalledWith(false)
  })

  it('cancels while startup is pending without arming a late timer', async () => {
    let ready!: () => void
    h.scanDevices.mockImplementation(() => new Promise<void>(resolve => { ready = resolve }))
    const scan = setup()
    const pending = scan.handleScan()
    await vi.advanceTimersByTimeAsync(1)
    scan.cancelScan()
    ready()
    await pending
    await vi.advanceTimersByTimeAsync(PROVISION_SCAN_MS)
    expect(scan.store.setIsOperating).not.toHaveBeenCalledWith(false)
  })

  it('shows Location guidance without switching to Bluetooth-off UI', async () => {
    h.scanDevices.mockRejectedValue(new Error('Location services are off. Turn on Location in Android Settings, then search again.'))
    const scan = setup()
    await scan.handleScan()
    expect(scan.setBleStatus).not.toHaveBeenCalled()
    expect(scan.store.setErrorMessage).toHaveBeenLastCalledWith(expect.stringContaining('Location services are off'))
  })
})
