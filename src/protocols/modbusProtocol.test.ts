import { describe, it, expect } from 'vitest'
import {
  crc16modbus,
  decodePassthroughBase64,
  extractPassthroughRegisters,
  decodeLiveStatus,
  toInt16,
  parseReadResponse,
  parseResponseToParams,
  buildReadFrame,
} from './modbusProtocol'

// Build a valid FC03 read-response frame for `registers` (each Uint16), with correct CRC.
function buildResponse(registers: number[]): Uint8Array {
  const dataLen = registers.length * 2
  const frame = new Uint8Array(3 + dataLen + 2)
  frame[0] = 0x01
  frame[1] = 0x03
  frame[2] = dataLen
  registers.forEach((v, i) => {
    frame[3 + i * 2] = (v >> 8) & 0xff
    frame[4 + i * 2] = v & 0xff
  })
  const crc = crc16modbus(frame.slice(0, 3 + dataLen))
  frame[3 + dataLen] = crc & 0xff
  frame[4 + dataLen] = (crc >> 8) & 0xff
  return frame
}
const toB64 = (b: Uint8Array) => Buffer.from(b).toString('base64')
const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

describe('crc16modbus', () => {
  it('matches the known Modbus CRC for 01 03 00 00 00 12', () => {
    // buildReadFrame appends the CRC; recompute and compare
    const f = buildReadFrame(0x0000, 0x12)
    const crc = crc16modbus(f.slice(0, 6))
    expect(f[6]).toBe(crc & 0xff)
    expect(f[7]).toBe((crc >> 8) & 0xff)
  })
})

describe('toInt16', () => {
  it('treats high-bit values as negative', () => {
    expect(toInt16(0xffec)).toBe(-20)
    expect(toInt16(0x0000)).toBe(0)
    expect(toInt16(0x7fff)).toBe(32767)
    expect(toInt16(0x8000)).toBe(-32768)
  })
})

describe('decodePassthroughBase64 + decodeLiveStatus', () => {
  const regs = new Array(0x24).fill(0)
  regs[0x04] = 168   // output
  regs[0x06] = 120   // solar
  regs[0x07] = 400   // ac
  regs[0x1a] = 856   // soc ×0.1 => 85.6
  regs[0x23] = 0xffec // cell temp Int16 ×0.1 => -2.0

  it('decodes a valid frame to the right live values', () => {
    const registers = decodePassthroughBase64(toB64(buildResponse(regs)), 8)
    expect(registers).not.toBeNull()
    const live = decodeLiveStatus(registers!)
    expect(live.outputPower).toBe(168)
    expect(live.solarPower).toBe(120)
    expect(live.acPower).toBe(400)
    expect(live.soc).toBeCloseTo(85.6, 5)
    expect(live.batteryTemp).toBeCloseTo(-2.0, 5)
    // batteryPower = AC + Solar − Output
    expect(live.batteryPower).toBe(400 + 120 - 168)
  })

  it('REJECTS a frame with a corrupted CRC (bug guard v3.27.6)', () => {
    const frame = buildResponse(regs)
    frame[10] ^= 0xff // corrupt a data byte, CRC no longer matches
    expect(decodePassthroughBase64(toB64(frame), 8)).toBeNull()
  })

  it('REJECTS a truncated frame', () => {
    const frame = buildResponse(regs).slice(0, 10)
    expect(decodePassthroughBase64(toB64(frame), 8)).toBeNull()
  })

  it('returns null for undefined/empty input', () => {
    expect(decodePassthroughBase64(undefined, 1)).toBeNull()
    expect(decodePassthroughBase64('', 1)).toBeNull()
  })

  it('enforces the minRegisters floor', () => {
    // a 2-register frame cannot satisfy minRegisters=8
    expect(decodePassthroughBase64(toB64(buildResponse([1, 2])), 8)).toBeNull()
  })
})

// The hardened entry the live pages actually call. Real hardware returns the
// passthrough payload in shapes the old object-only + strict-frame path dropped,
// which pinned Device Monitor to the 30s cloud feed. These lock the tolerated shapes.
describe('extractPassthroughRegisters (hardened passthrough decode)', () => {
  const regs = new Array(0x24).fill(0)
  regs[0x04] = 168   // output
  regs[0x06] = 120   // solar
  regs[0x07] = 400   // ac
  regs[0x1a] = 856   // soc ×0.1 => 85.6

  const expectLive = (registers: number[] | null) => {
    expect(registers).not.toBeNull()
    const live = decodeLiveStatus(registers!)
    expect(live.outputPower).toBe(168)
    expect(live.solarPower).toBe(120)
    expect(live.acPower).toBe(400)
    expect(live.soc).toBeCloseTo(85.6, 5)
  }

  it('decodes a pure base64 frame string', () => {
    expectLive(extractPassthroughRegisters(toB64(buildResponse(regs)), 8))
  })

  it('decodes a hex string frame (with and without spaces)', () => {
    const hex = toHex(buildResponse(regs))
    expectLive(extractPassthroughRegisters(hex, 8))
    const spaced = hex.match(/.{2}/g)!.join(' ')
    expectLive(extractPassthroughRegisters(spaced, 8))
  })

  it('locates a valid frame after leading echo/wrapper bytes (base64)', () => {
    // Gateway echoes the read request, then appends the real FC03 response.
    const echo = buildReadFrame(0x0100, 0x38)               // 8-byte request echo
    const wrapped = concat(echo, buildResponse(regs))
    expectLive(extractPassthroughRegisters(toB64(wrapped), 8))
  })

  it('locates a valid frame after leading echo/wrapper bytes (hex)', () => {
    const junk = new Uint8Array([0xaa, 0xbb, 0xcc])          // gateway header noise
    const wrapped = concat(junk, buildResponse(regs))
    expectLive(extractPassthroughRegisters(toHex(wrapped), 8))
  })

  it('reads the payload from object shapes: base64Output | data | content', () => {
    const b64 = toB64(buildResponse(regs))
    expectLive(extractPassthroughRegisters({ base64Output: b64 }, 8))
    expectLive(extractPassthroughRegisters({ data: b64 }, 8))
    expectLive(extractPassthroughRegisters({ content: b64 }, 8))
    // hex value inside the object works too
    expectLive(extractPassthroughRegisters({ base64Output: toHex(buildResponse(regs)) }, 8))
  })

  it('rejects a corrupted-CRC frame across every shape', () => {
    const bad = buildResponse(regs)
    bad[10] ^= 0xff
    expect(extractPassthroughRegisters(toB64(bad), 8)).toBeNull()
    expect(extractPassthroughRegisters(toHex(bad), 8)).toBeNull()
    expect(extractPassthroughRegisters({ base64Output: toB64(bad) }, 8)).toBeNull()
  })

  it('returns null for empty / missing / non-payload input', () => {
    expect(extractPassthroughRegisters(undefined, 8)).toBeNull()
    expect(extractPassthroughRegisters(null, 8)).toBeNull()
    expect(extractPassthroughRegisters('', 8)).toBeNull()
    expect(extractPassthroughRegisters({}, 8)).toBeNull()
    expect(extractPassthroughRegisters({ base64Output: '' }, 8)).toBeNull()
    expect(extractPassthroughRegisters({ success: true }, 8)).toBeNull()
  })

  it('still enforces the minRegisters floor', () => {
    expect(extractPassthroughRegisters(toB64(buildResponse([1, 2])), 8)).toBeNull()
  })
})

describe('parseReadResponse crcOk flag', () => {
  it('flags a good frame crcOk=true and a bad one crcOk=false', () => {
    const good = parseReadResponse(buildResponse([0x0102, 0x0304]))
    expect(good?.crcOk).toBe(true)
    expect(good?.registers).toEqual([0x0102, 0x0304])
    const bad = buildResponse([0x0102, 0x0304])
    bad[bad.length - 1] ^= 0xff
    expect(parseReadResponse(bad)?.crcOk).toBe(false)
  })
})

describe('0x0133 System State Machine enum decode (bug guard v3.27.6)', () => {
  const decodeState = (raw: number): string | undefined => {
    const req = buildReadFrame(0x0133, 1)
    const resp = buildResponse([raw]) // single register at base 0x0133
    const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(' ')
    return parseResponseToParams(toHex(req), toHex(resp)).find(p => p.name === 'System State Machine')?.value
  }
  it('decodes numeric enum values, not a bitmask', () => {
    expect(decodeState(0)).toBe('System Init')
    expect(decodeState(6)).toBe('Charging')     // previously mis-decoded as Power-Up
    expect(decodeState(8)).toBe('Discharging')
  })
  it('falls back to hex for unknown states', () => {
    expect(decodeState(12)).toMatch(/^State 0x/)
  })
})
