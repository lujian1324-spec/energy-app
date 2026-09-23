import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { encrypt } from '../utils/bleCrypto'
import { buildPackets } from '../utils/blePacket'
import type { BleProvisionResponse } from '../types/protocol'

const NAME = 'SSL_0IIOTUJF3AgEpIA=='
const DTUID = '20839350917702012920'
const h = vi.hoisted(() => ({
  notify: undefined as undefined | ((value: DataView) => void),
  disconnected: undefined as undefined | (() => void),
  ble: {
    connect: vi.fn(), disconnect: vi.fn(), stopLEScan: vi.fn(),
    startNotifications: vi.fn(), stopNotifications: vi.fn(),
    getServices: vi.fn(), getMtu: vi.fn(), discoverServices: vi.fn(),
    writeWithoutResponse: vi.fn(), write: vi.fn(), read: vi.fn(),
  },
}))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))
vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: h.ble }))
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }

async function manager(connect = true) {
  const mod = await import('./bleProvision')
  const mgr = mod.getProvisionManager()
  if (connect) await mgr.connectTo('device-a', NAME)
  return mgr
}
function reply(value: BleProvisionResponse) {
  for (const packet of buildPackets(encrypt(value, DTUID))) {
    h.notify!(new DataView(packet.buffer, packet.byteOffset, packet.byteLength))
  }
}
beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { userAgent: 'Android 16' })
  h.ble.connect.mockImplementation(async (_id, callback) => { h.disconnected = callback })
  h.ble.getServices.mockResolvedValue([{ uuid: '0000fee7-0000-1000-8000-00805f9b34fb' }])
  h.ble.getMtu.mockResolvedValue(243)
  h.ble.startNotifications.mockImplementation(async (_id, _s, _c, callback) => { h.notify = callback })
  h.ble.read.mockResolvedValue(new DataView(new TextEncoder().encode(NAME).buffer))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('does not let a second connection overwrite the selected device', async () => {
  const mgr = await manager(false)
  const first = mgr.connectTo('device-a', NAME)
  await expect(mgr.connectTo('device-b', NAME)).rejects.toThrow(/already in progress/)
  await first
  expect(h.ble.connect.mock.calls.map(args => args[0])).toEqual(['device-a'])
})

it('cancels a connection that finishes after disconnect without subscribing', async () => {
  let finish!: () => void
  h.ble.connect.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  const mgr = await manager(false)
  const connecting = mgr.connectTo('device-a', NAME)
  const rejected = expect(connecting).rejects.toThrow(/cancelled/)
  await flush()
  await mgr.disconnect()
  finish()
  await rejected
  expect(h.ble.startNotifications).not.toHaveBeenCalled()
  expect(mgr.getDuid()).toBeNull()
})

it('rejects active and queued commands on explicit disconnect', async () => {
  const mgr = await manager()
  const first = expect(mgr.getVersion()).rejects.toThrow(/disconnected/)
  const second = expect(mgr.scanAp()).rejects.toThrow(/cancelled/)
  await flush()
  await mgr.disconnect()
  await Promise.all([first, second])
  expect(vi.getTimerCount()).toBe(0)
})

it('rejects promptly when the radio disconnects during an unresolved native write', async () => {
  const mgr = await manager()
  h.ble.writeWithoutResponse.mockImplementation(() => new Promise(() => {}))
  const result = expect(mgr.getVersion()).rejects.toThrow(/disconnected/)
  await flush()
  h.disconnected!()
  await result
  expect(vi.getTimerCount()).toBe(0)
})

it('serializes commands and ignores a reply for a different CID', async () => {
  const mgr = await manager()
  const first = mgr.getVersion()
  const second = mgr.getWifiStatus()
  await flush()
  expect(h.ble.writeWithoutResponse).toHaveBeenCalledTimes(1)
  let settled = false
  first.then(() => { settled = true })
  reply({ CID: 30004, RC: 0, PL: [] })
  await flush()
  expect(settled).toBe(false)
  reply({ CID: 30002, RC: 0, PL: { SV: '1', HV: '1' } })
  await first
  await flush()
  expect(h.ble.writeWithoutResponse).toHaveBeenCalledTimes(2)
  reply({ CID: 30021, RC: 0, PL: { WConn: 1, SConn: 1 } })
  expect((await second).CID).toBe(30021)
})

it('ends timed-out commands and cancels the queue instead of replaying writes', async () => {
  const mgr = await manager()
  const first = expect(mgr.getVersion()).rejects.toThrow(/Timed out/)
  const second = expect(mgr.scanAp()).rejects.toThrow(/cancelled/)
  await vi.advanceTimersByTimeAsync(15000)
  await Promise.all([first, second])
  expect(h.ble.writeWithoutResponse).toHaveBeenCalledTimes(1)
  expect(h.ble.disconnect).toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('a late failure from a cancelled write cannot cancel a new session', async () => {
  const mgr = await manager()
  let failOld!: (error: Error) => void
  h.ble.writeWithoutResponse.mockImplementationOnce(() => new Promise((_resolve, reject) => { failOld = reject }))
  const old = expect(mgr.getVersion()).rejects.toThrow(/disconnected/)
  await flush()
  await mgr.disconnect()
  await old
  await mgr.connectTo('device-b', NAME)
  const current = mgr.getVersion()
  await flush()
  failOld(new Error('late native write failure'))
  await flush()
  reply({ CID: 30002, RC: 0, PL: { SV: '1' } })
  expect((await current).RC).toBe(0)
})

it('fits each protocol packet inside the negotiated MTU=23 ATT value', async () => {
  h.ble.getMtu.mockResolvedValue(23)
  const mgr = await manager(false)
  const connecting = mgr.connectTo('device-a', NAME)
  await vi.advanceTimersByTimeAsync(300)
  await connecting
  const pending = mgr.configWifi('fixture-network', 'fixture-password')
  await vi.advanceTimersByTimeAsync(3000)
  const values = h.ble.writeWithoutResponse.mock.calls.map(args => args[3] as DataView)
  expect(values.length).toBeGreaterThan(1)
  expect(values.every(value => value.byteLength <= 20)).toBe(true)
  reply({ CID: 30006, RC: 0 })
  await pending
})

it('accepts a valid reply after ignoring a malformed fragment', async () => {
  const mgr = await manager()
  const pending = mgr.getVersion()
  await flush()
  h.notify!(new DataView(Uint8Array.from([0, 1, 5, 1]).buffer))
  reply({ CID: 30002, RC: 0, PL: { SV: '1' } })
  expect((await pending).RC).toBe(0)
})
