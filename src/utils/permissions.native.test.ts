import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Native (Capacitor) branch coverage for the permission helpers. Node can't run
 * the real native plugins, so we mock Capacitor + each plugin and assert our glue
 * logic — the v4.4.3 BLE behaviour in particular: initialize() is the permission
 * gate, it's called at most once (bleInitialized flag), Android offers
 * requestEnable() when the radio is off, iOS never calls requestEnable(), and an
 * initialize() rejection is surfaced as denied.
 *
 * The module-level bleInitialized flag persists per module instance, so every test
 * does vi.resetModules() and imports ./permissions fresh for a clean flag.
 */

const h = vi.hoisted(() => ({
  native: true,
  platform: 'android' as 'android' | 'ios' | 'web',
  nativePushReady: false,
  ble: {
    initialize: vi.fn(),
    isEnabled: vi.fn(),
    requestEnable: vi.fn(),
    isLocationEnabled: vi.fn(),
  },
  camera: { checkPermissions: vi.fn(), requestPermissions: vi.fn() },
  push: { checkPermissions: vi.fn(), requestPermissions: vi.fn(), register: vi.fn() },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.native, getPlatform: () => h.platform },
}))
vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: h.ble }))
vi.mock('@capacitor/camera', () => ({ Camera: h.camera }))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: h.push }))
vi.mock('../config/webPush', () => ({
  get NATIVE_PUSH_READY() { return h.nativePushReady },
  PUSH_ENABLED: true,
}))

async function loadPerms() {
  vi.resetModules()
  return import('./permissions')
}

beforeEach(() => {
  h.native = true
  h.platform = 'android'
  h.nativePushReady = false
  vi.clearAllMocks()
  h.ble.initialize.mockResolvedValue(undefined)
  h.ble.isEnabled.mockResolvedValue(true)
  h.ble.requestEnable.mockResolvedValue(undefined)
  h.ble.isLocationEnabled.mockResolvedValue(true)
})

// ── checkBluetooth (native) ──────────────────────────────────────────────────
describe('checkBluetooth (native)', () => {
  it('is granted when initialize succeeds and the radio is on', async () => {
    const { checkBluetooth } = await loadPerms()
    expect((await checkBluetooth()).state).toBe('granted')
    expect(h.ble.initialize).toHaveBeenCalledWith({ androidNeverForLocation: true })
  })

  it('is denied when the radio is off', async () => {
    h.ble.isEnabled.mockResolvedValue(false)
    const { checkBluetooth } = await loadPerms()
    expect((await checkBluetooth()).state).toBe('denied')
  })

  it('is denied when initialize() rejects (OS permission denied)', async () => {
    h.ble.initialize.mockRejectedValue(new Error('Permission denied.'))
    const { checkBluetooth } = await loadPerms()
    expect((await checkBluetooth()).state).toBe('denied')
  })

  it('initializes at most once across repeated checks (no double prompt)', async () => {
    const { checkBluetooth } = await loadPerms()
    await checkBluetooth()
    await checkBluetooth()
    expect(h.ble.initialize).toHaveBeenCalledTimes(1)
  })
})

// ── requestBluetooth (native) ────────────────────────────────────────────────
describe('requestBluetooth (native)', () => {
  it('grants without asking to enable when the radio is already on', async () => {
    const { requestBluetooth } = await loadPerms()
    expect((await requestBluetooth()).state).toBe('granted')
    expect(h.ble.requestEnable).not.toHaveBeenCalled()
  })

  it('on Android offers requestEnable() when the radio is off, then grants', async () => {
    h.ble.isEnabled.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { requestBluetooth } = await loadPerms()
    expect((await requestBluetooth()).state).toBe('granted')
    expect(h.ble.requestEnable).toHaveBeenCalledTimes(1)
  })

  it('stays denied when the user declines the Android enable dialog', async () => {
    h.ble.isEnabled.mockResolvedValue(false)
    h.ble.requestEnable.mockRejectedValue(new Error('declined'))
    const { requestBluetooth } = await loadPerms()
    expect((await requestBluetooth()).state).toBe('denied')
  })

  it('on iOS never calls requestEnable() (API unavailable there)', async () => {
    h.platform = 'ios'
    h.ble.isEnabled.mockResolvedValue(false)
    const { requestBluetooth } = await loadPerms()
    expect((await requestBluetooth()).state).toBe('denied')
    expect(h.ble.requestEnable).not.toHaveBeenCalled()
  })

  it('is denied when initialize() rejects (permission dialog denied)', async () => {
    h.ble.initialize.mockRejectedValue(new Error('Permission denied.'))
    const { requestBluetooth } = await loadPerms()
    expect((await requestBluetooth()).state).toBe('denied')
  })
})

// ── Camera (native) ──────────────────────────────────────────────────────────
describe('camera (native)', () => {
  it('checkCamera maps the plugin granted state', async () => {
    h.camera.checkPermissions.mockResolvedValue({ camera: 'granted' })
    const { checkCamera } = await loadPerms()
    expect((await checkCamera()).state).toBe('granted')
  })

  it('requestCamera maps granted / denied', async () => {
    const { requestCamera } = await loadPerms()
    h.camera.requestPermissions.mockResolvedValue({ camera: 'granted' })
    expect((await requestCamera()).state).toBe('granted')
    h.camera.requestPermissions.mockResolvedValue({ camera: 'denied' })
    expect((await requestCamera()).state).toBe('denied')
    expect(h.camera.requestPermissions).toHaveBeenCalledWith({ permissions: ['camera'] })
  })
})

// ── Notifications (native) ───────────────────────────────────────────────────
describe('notifications (native)', () => {
  it('grants without registering APNs/FCM when NATIVE_PUSH_READY is false', async () => {
    h.nativePushReady = false
    h.push.requestPermissions.mockResolvedValue({ receive: 'granted' })
    const { requestNotifications } = await loadPerms()
    expect((await requestNotifications()).state).toBe('granted')
    expect(h.push.register).not.toHaveBeenCalled()
  })

  it('registers APNs/FCM after grant when NATIVE_PUSH_READY is true', async () => {
    h.nativePushReady = true
    h.push.requestPermissions.mockResolvedValue({ receive: 'granted' })
    const { requestNotifications } = await loadPerms()
    expect((await requestNotifications()).state).toBe('granted')
    expect(h.push.register).toHaveBeenCalledTimes(1)
  })

  it('is denied when the user blocks notifications', async () => {
    h.push.requestPermissions.mockResolvedValue({ receive: 'denied' })
    const { requestNotifications } = await loadPerms()
    expect((await requestNotifications()).state).toBe('denied')
  })
})
