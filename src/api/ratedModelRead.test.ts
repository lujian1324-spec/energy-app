import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ replies: [] as unknown[], sent: [] as unknown[], saved: [] as unknown[] }))
vi.mock('./deviceApi', () => ({
  passthroughDevice: vi.fn(async (_id: string, body: unknown) => {
    h.sent.push(body)
    const r = h.replies.shift()
    if (r instanceof Error) throw r
    return r
  }),
}))
vi.mock('../db/powerflowDB', () => ({
  loadRatedParams: vi.fn(async () => ({ deviceId: '1', acInvOutputPower: 500, fetchedAt: 1, model: 'Sierro 1000', modelSource: 'default' })),
  saveRatedParams: vi.fn(async (p: unknown) => { h.saved.push(p) }),
}))

import { readAcInvOutputPower, detectAndSaveModel } from './ratedModelRead'
import { FRAMES } from '../protocols/modbusProtocol'

/** FC03 reply for 0x0000 × 0x12 with 0x000A = `watts`, base64 like the platform. */
function reply(watts: number) {
  const regs = new Array(0x12).fill(0)
  regs[0x0a] = watts
  const bytes = [0x01, 0x03, regs.length * 2]
  for (const r of regs) bytes.push((r >> 8) & 0xff, r & 0xff)
  let crc = 0xffff
  for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1 }
  bytes.push(crc & 0xff, crc >> 8)
  return { code: 0, data: { base64Output: Buffer.from(bytes).toString('base64') } }
}
const noSleep = async () => {}

beforeEach(() => { h.replies = []; h.sent = []; h.saved = [] })

describe('reading 0x000A at add time (v4.18.0)', () => {
  it('reads the rated AC inverter output power over passthrough', async () => {
    h.replies.push(reply(0x012c))
    expect(await readAcInvOutputPower('1', { sleep: noSleep })).toBe(300)
    expect(h.sent[0]).toEqual({ data: FRAMES.READ_ALL_PARAMS })
  })

  it('retries a device that has not come online yet, then gives up with null', async () => {
    h.replies.push({ code: 1, message: 'device offline' }, new Error('timeout'), reply(1000))
    expect(await readAcInvOutputPower('1', { sleep: noSleep })).toBe(1000)
    h.replies.push({ code: 1 }, { code: 1 }, { code: 1 })
    expect(await readAcInvOutputPower('1', { sleep: noSleep })).toBeNull()
  })

  it('1000 W saves the Sierro 2000; no reading leaves the default alone', async () => {
    h.replies.push(reply(1000))
    await detectAndSaveModel('1', { sleep: noSleep })
    expect(h.saved[0]).toMatchObject({ model: 'Sierro 2000', modelSource: 'detected', acInvOutputPower: 1000 })
    h.replies.push({ code: 1 }, { code: 1 }, { code: 1 })
    await detectAndSaveModel('1', { sleep: noSleep })
    expect(h.saved).toHaveLength(1)
  })
})
