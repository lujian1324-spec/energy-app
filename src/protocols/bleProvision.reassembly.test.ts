import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encrypt } from '../utils/bleCrypto'
import { buildPackets } from '../utils/blePacket'
import type { BleProvisionResponse } from '../types/protocol'

/**
 * Multi-packet response reassembly (the "malformed UTF-8 data" fix).
 *
 * A long BLE provisioning response (e.g. the Wi-Fi scan list, CID 30003) is split
 * into several [seqNo][seqNum][dataLen][data] packets. The old onIncoming() combined
 * packets in ARRIVAL order and fired as soon as the "last" packet (seqNo>=seqNum)
 * showed up — so any out-of-order arrival or a dropped middle packet produced a
 * garbled/short ciphertext, whose AES decrypt yielded non-UTF-8 bytes →
 * toString(Utf8) threw "Malformed UTF-8 data". Short (single-packet) replies like
 * getVersion almost never tripped it, which is why the bug only showed at the Wi-Fi
 * step. These tests drive the native notification callback directly.
 */

const NAME = 'SSL_0IIOTUJF3AgEpIA=='   // parses to the DTUID below
const DTUID = '20839350917702012920'

const h = vi.hoisted(() => ({
  notifyCb: null as null | ((v: DataView) => void),
  ble: {
    initialize: vi.fn(),
    connect: vi.fn(),
    startNotifications: vi.fn(),
    stopNotifications: vi.fn(),
    disconnect: vi.fn(),
    stopLEScan: vi.fn(),
    writeWithoutResponse: vi.fn(),
  },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))
vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: h.ble }))

async function connectManager() {
  vi.resetModules()
  const mod = await import('./bleProvision')
  const mgr = mod.getProvisionManager()
  await mgr.connectTo('dev-1', NAME)  // establishes the notify callback + DTUID
  return mgr
}

/** Encrypt + packetize a response exactly as the device would, using the real codec. */
function makeResponsePackets(resp: BleProvisionResponse): Uint8Array[] {
  return buildPackets(encrypt(resp, DTUID))
}

/** Hand one packet to the manager the way the BLE plugin delivers a notification. */
function deliver(pkt: Uint8Array) {
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength)
  h.notifyCb!(dv)
}

/** Let sendCommand() finish writing the request and register its response resolver
 *  before we start feeding notification packets (it only arms after an await). */
const tick = () => new Promise(r => setTimeout(r, 0))

// A Wi-Fi scan reply long enough to span several packets (>237 bytes of base64).
const WIFI_RESP: BleProvisionResponse = {
  CID: 30003,
  RC: 0,
  PL: Array.from({ length: 16 }, (_, i) => ({
    SSID: `Network-${i}-with-a-fairly-long-name`, RSSI: -40 - i, Auth: 3,
  })),
} as unknown as BleProvisionResponse

beforeEach(() => {
  h.notifyCb = null
  vi.clearAllMocks()
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)' })
  h.ble.initialize.mockResolvedValue(undefined)
  h.ble.connect.mockResolvedValue(undefined)
  h.ble.stopLEScan.mockResolvedValue(undefined)
  h.ble.stopNotifications.mockResolvedValue(undefined)
  h.ble.disconnect.mockResolvedValue(undefined)
  h.ble.writeWithoutResponse.mockResolvedValue(undefined)
  h.ble.startNotifications.mockImplementation(async (_id, _svc, _ch, cb: (v: DataView) => void) => {
    h.notifyCb = cb
  })
})

afterEach(() => { vi.unstubAllGlobals() })

describe('BLE provisioning multi-packet reassembly', () => {
  it('spans multiple packets for a Wi-Fi scan reply (precondition)', () => {
    expect(makeResponsePackets(WIFI_RESP).length).toBeGreaterThan(1)
  })

  it('decodes a multi-packet reply delivered IN ORDER', async () => {
    const mgr = await connectManager()
    const packets = makeResponsePackets(WIFI_RESP)
    const p = mgr.scanAp()
    await tick()
    for (const pkt of packets) deliver(pkt)
    const resp = await p
    expect(resp.RC).toBe(0)
    expect(Array.isArray(resp.PL) && resp.PL).toHaveLength(16)
  })

  it('decodes correctly when packets arrive OUT OF ORDER (regression: malformed UTF-8)', async () => {
    const mgr = await connectManager()
    const packets = makeResponsePackets(WIFI_RESP)
    expect(packets.length).toBeGreaterThan(2)
    const p = mgr.scanAp()
    await tick()
    for (const pkt of [...packets].reverse()) deliver(pkt)   // last → first
    const resp = await p
    expect(resp.RC).toBe(0)
    expect(Array.isArray(resp.PL) && resp.PL).toHaveLength(16)
  })

  it('does NOT decode a partial reply — waits instead of decrypting a truncated frame', async () => {
    const mgr = await connectManager()
    const packets = makeResponsePackets(WIFI_RESP)
    const p = mgr.scanAp()
    await tick()
    let settled = false
    p.then(() => { settled = true }, () => { settled = true })

    // Deliver everything EXCEPT one middle packet — old code would fire on the last
    // packet and throw "Malformed UTF-8 data"; new code must keep waiting.
    const missingIdx = 1
    for (let i = 0; i < packets.length; i++) if (i !== missingIdx) deliver(packets[i])
    await Promise.resolve()
    expect(settled).toBe(false)

    // The missing packet finally arrives → the reply completes cleanly.
    deliver(packets[missingIdx])
    const resp = await p
    expect(resp.RC).toBe(0)
    expect(Array.isArray(resp.PL) && resp.PL).toHaveLength(16)
  })

  it('still handles a single-packet reply (getVersion)', async () => {
    const mgr = await connectManager()
    const packets = makeResponsePackets({ CID: 30001, RC: 0, PL: { SV: '1.2.3', HV: '4.5' } } as unknown as BleProvisionResponse)
    expect(packets).toHaveLength(1)
    const p = mgr.getVersion()
    await tick()
    deliver(packets[0])
    const resp = await p
    expect(resp.RC).toBe(0)
    expect((resp.PL as { SV: string }).SV).toBe('1.2.3')
  })

  it('resolves when the device replies DURING the write (resolver armed before write)', async () => {
    const mgr = await connectManager()
    // configWifi-style single-packet reply, delivered from inside the write call —
    // i.e. the device answers the instant the last write resolves. The old code
    // armed the resolver only AFTER the write, so this reply was dropped → timeout.
    const reply = makeResponsePackets({ CID: 30006, RC: 0 } as unknown as BleProvisionResponse)
    h.ble.writeWithoutResponse.mockImplementation(async () => { for (const pkt of reply) deliver(pkt) })
    const resp = await mgr.configWifi('MyWifi', 'secret')
    expect(resp.RC).toBe(0)
  })

  it('ignores unsolicited packets when no command is pending (no buffer pollution)', async () => {
    const mgr = await connectManager()
    // Stray notification with no command in flight — must be ignored, not buffered.
    for (const pkt of makeResponsePackets({ CID: 30004, RC: 0, PL: [] } as unknown as BleProvisionResponse)) deliver(pkt)
    // The next real command must still work cleanly.
    const packets = makeResponsePackets(WIFI_RESP)
    const p = mgr.scanAp()
    await tick()
    for (const pkt of packets) deliver(pkt)
    const resp = await p
    expect(resp.RC).toBe(0)
    expect(Array.isArray(resp.PL) && resp.PL).toHaveLength(16)
  })
})
