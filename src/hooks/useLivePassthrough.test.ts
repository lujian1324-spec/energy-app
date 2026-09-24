/**
 * The single read behind the poll. What matters here is what it returns on a
 * bad reply: null, never a half-decoded sample — the caller only writes into
 * the live layer on a real one, which is how the last good value survives a
 * failed tick, and how the ring stops dropping to 0% on a short frame.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crc16modbus, decodeLiveStatus } from '../protocols/modbusProtocol'

const passthroughDevice = vi.fn()
vi.mock('../api/deviceApi', () => ({
  passthroughDevice: (...a: unknown[]) => passthroughDevice(...a),
}))

const {
  readLivePassthroughOnce,
  LIVE_PASSTHROUGH_INTERVAL_MS,
  LIVE_PASSTHROUGH_FAST_INTERVAL_MS,
} = await import('./useLivePassthrough')

/** A real FC03 reply of `count` registers, CRC and all. */
function replyFrame(count: number, edit: (regs: number[]) => void = () => {}, crcOk = true): string {
  const regs = new Array(count).fill(0)
  edit(regs)
  const body = new Uint8Array(3 + regs.length * 2)
  body[0] = 0x01
  body[1] = 0x03
  body[2] = regs.length * 2
  regs.forEach((r, i) => { body[3 + i * 2] = (r >> 8) & 0xff; body[4 + i * 2] = r & 0xff })
  const crc = crc16modbus(body) ^ (crcOk ? 0 : 0xffff)
  const full = new Uint8Array(body.length + 2)
  full.set(body)
  full[body.length] = crc & 0xff
  full[body.length + 1] = (crc >> 8) & 0xff
  return Buffer.from(full).toString('base64')
}

const live = (regs: number[]) => {
  regs[0x04] = 90     // output W
  regs[0x06] = 35     // solar W
  regs[0x07] = 210    // AC W
  regs[0x1a] = 724    // SOC ×0.1 %
  regs[0x23] = 246    // cell temp ×0.1 ℃
}

beforeEach(() => { passthroughDevice.mockReset() })

describe('readLivePassthroughOnce', () => {
  it('decodes SOC and the three powers out of a full reply', async () => {
    passthroughDevice.mockResolvedValue({ code: 0, data: { base64Output: replyFrame(0x38, live) } })

    const got = await readLivePassthroughOnce('491513787113766912')
    expect(got).toEqual({
      soc: 72.4, acPower: 210, solarPower: 35, outputPower: 90,
      batteryPower: 155, batteryTemp: 24.6,
      // A full reply reaches the run-state word at 0x0126; 0 there = outlets off.
      acOutput: false,
    })
    // The same decode the BLE path uses — one definition of LiveStatus.
    const regs = new Array(0x38).fill(0); live(regs)
    expect(got).toEqual(decodeLiveStatus(regs))
  })

  it('rejects a frame too short to carry SOC, rather than reporting 0%', async () => {
    // The regression: 8 registers covers AC / Solar / Output at offsets 4/6/7,
    // so the power boxes would look live while SOC at 0x1A decoded to a
    // synthetic 0 and the ring dropped to empty. A rejected read keeps the last
    // good sample instead.
    const short = replyFrame(8, regs => { regs[0x04] = 90; regs[0x06] = 35; regs[0x07] = 210 })
    passthroughDevice.mockResolvedValue({ code: 0, data: { base64Output: short } })
    expect(await readLivePassthroughOnce('1')).toBeNull()

    // One register more than the SOC offset is enough, and SOC is real.
    passthroughDevice.mockResolvedValue({
      code: 0, data: { base64Output: replyFrame(0x1B, live) },
    })
    expect((await readLivePassthroughOnce('1'))?.soc).toBe(72.4)
  })

  it('returns null — not a zeroed sample — when the call is rejected', async () => {
    passthroughDevice.mockResolvedValue({ code: 20101, message: 'Iillegal argument', data: null })
    expect(await readLivePassthroughOnce('1')).toBeNull()
  })

  it('returns null on a corrupt or absent reply rather than trusting it', async () => {
    passthroughDevice.mockResolvedValue({ code: 0, data: { base64Output: replyFrame(0x38, live, false) } })
    expect(await readLivePassthroughOnce('1')).toBeNull()

    passthroughDevice.mockResolvedValue({ code: 0, data: { base64Output: 'not a frame at all' } })
    expect(await readLivePassthroughOnce('1')).toBeNull()

    passthroughDevice.mockResolvedValue({ code: 0, data: {} })
    expect(await readLivePassthroughOnce('1')).toBeNull()
  })
})

describe('the poll cadences', () => {
  it('are the minute the Device list was asked for, and the 5s the monitor already ran', () => {
    expect(LIVE_PASSTHROUGH_INTERVAL_MS).toBe(60_000)
    expect(LIVE_PASSTHROUGH_FAST_INTERVAL_MS).toBe(5_000)
  })
})
