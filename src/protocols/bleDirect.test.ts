import { describe, it, expect, vi } from 'vitest'
import { readLiveStatusBle, setAcOutputBle, setDcOutputBle, setSleepPowerBle } from './bleDirect'
import { crc16modbus, toHexString } from './modbusProtocol'
import type { IBleProvisionManager } from './bleProvision'

// Build a valid FC03 read-response frame for `registers` (each Uint16), with correct CRC —
// same construction as modbusProtocol.test.ts, but hex-encoded (BLE's Rsp field is hex, not base64).
function buildResponseHex(registers: number[]): string {
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
  return toHexString(frame)
}

/** Minimal fake manager: only uartPassthrough is exercised by bleDirect.ts. */
function fakeManager(uartPassthrough: IBleProvisionManager['uartPassthrough']): IBleProvisionManager {
  return {
    connect: vi.fn(), disconnect: vi.fn(), getDuid: () => null, deviceName: undefined,
    scanDevices: vi.fn(), stopScan: vi.fn(), connectTo: vi.fn(),
    getVersion: vi.fn() as never, scanAp: vi.fn() as never, configWifi: vi.fn() as never,
    restart: vi.fn() as never, getWifiStatus: vi.fn() as never, confirmBleKey: vi.fn() as never,
    uartPassthrough,
  }
}

describe('readLiveStatusBle', () => {
  const regs = new Array(0x24).fill(0)
  regs[0x04] = 168   // output
  regs[0x06] = 120   // solar
  regs[0x07] = 400   // ac
  regs[0x1a] = 856   // soc ×0.1 => 85.6
  regs[0x23] = 0xffec // cell temp Int16 ×0.1 => -2.0

  it('decodes a valid BLE UART-passthrough response into LiveStatus', async () => {
    const mgr = fakeManager(async () => ({ CID: 30025, RC: 0, PL: { Rsp: buildResponseHex(regs) } }))
    const live = await readLiveStatusBle(mgr)
    expect(live).not.toBeNull()
    expect(live!.outputPower).toBe(168)
    expect(live!.solarPower).toBe(120)
    expect(live!.acPower).toBe(400)
    expect(live!.soc).toBeCloseTo(85.6, 5)
    expect(live!.batteryTemp).toBeCloseTo(-2.0, 5)
    expect(live!.batteryPower).toBe(400 + 120 - 168)
  })

  it('returns null when RC !== 0 (device rejected the command)', async () => {
    const mgr = fakeManager(async () => ({ CID: 30025, RC: 1 }))
    expect(await readLiveStatusBle(mgr)).toBeNull()
  })

  it('returns null on a corrupted-CRC response instead of trusting garbage data', async () => {
    const hex = buildResponseHex(regs)
    const corrupted = hex.split(' ')
    corrupted[5] = 'FF' // flip a data byte, CRC no longer matches
    const mgr = fakeManager(async () => ({ CID: 30025, RC: 0, PL: { Rsp: corrupted.join(' ') } }))
    expect(await readLiveStatusBle(mgr)).toBeNull()
  })

  it('returns null when the transport throws (timeout / disconnect)', async () => {
    const mgr = fakeManager(async () => { throw new Error('timeout') })
    expect(await readLiveStatusBle(mgr)).toBeNull()
  })
})

describe('port + sleep control writes', () => {
  it('setAcOutputBle sends AC_POWER_ON/OFF and reports success from RC===0', async () => {
    const sent: unknown[] = []
    const mgr = fakeManager(async (pl) => { sent.push(pl); return { CID: 30025, RC: 0 } })
    expect(await setAcOutputBle(mgr, true)).toBe(true)
    expect(await setAcOutputBle(mgr, false)).toBe(true)
    expect(sent.length).toBe(2)
  })

  it('setDcOutputBle/setSleepPowerBle report failure when RC!==0', async () => {
    const mgr = fakeManager(async () => ({ CID: 30025, RC: 1 }))
    expect(await setDcOutputBle(mgr, true)).toBe(false)
    expect(await setSleepPowerBle(mgr, 'Sierro 2000', true)).toBe(false)
  })
})
