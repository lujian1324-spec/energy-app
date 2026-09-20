import { describe, it, expect } from 'vitest'
import { decodePowerU16, INVALID_POWER_U16, MAX_PLAUSIBLE_POWER_W } from './powerU16'
import { decodeLiveStatus } from './modbusProtocol'

describe('decodePowerU16 sentinel', () => {
  it('maps 0xFFFF → undefined and other values through', () => {
    expect(INVALID_POWER_U16).toBe(0xffff)
    expect(decodePowerU16(0xffff)).toBeUndefined()
    expect(decodePowerU16(0)).toBe(0)
    expect(decodePowerU16(168)).toBe(168)
  })

  it('rejects 0xFFFE — the value a customer actually saw as 65534 W', () => {
    expect(decodePowerU16(0xfffe)).toBeUndefined()
  })

  it('rejects the rest of the top of the U16 range, not just the last two codes', () => {
    for (const raw of [0xfffd, 0xff00, 0x8000, 32768, 65000]) {
      expect(decodePowerU16(raw)).toBeUndefined()
    }
  })

  it('keeps everything the hardware can actually deliver', () => {
    for (const raw of [0, 1, 15, 400, 1000, 2400, MAX_PLAUSIBLE_POWER_W]) {
      expect(decodePowerU16(raw)).toBe(raw)
    }
  })

  it('rejects a negative or non-finite raw rather than passing it on', () => {
    expect(decodePowerU16(-1)).toBeUndefined()
    expect(decodePowerU16(NaN)).toBeUndefined()
  })
})

describe('decodeLiveStatus 0xFFFF power sentinel', () => {
  it('omits outputPower / acPower / solarPower when raw === 0xFFFF (not 65535)', () => {
    const regs = new Array(0x24).fill(0)
    regs[0x04] = INVALID_POWER_U16
    regs[0x06] = INVALID_POWER_U16
    regs[0x07] = INVALID_POWER_U16
    regs[0x1a] = 856
    const live = decodeLiveStatus(regs)
    expect(live.outputPower).toBeUndefined()
    expect(live.solarPower).toBeUndefined()
    expect(live.acPower).toBeUndefined()
    expect(live.batteryPower).toBeUndefined()
    expect(live.soc).toBeCloseTo(85.6, 5)
  })

  it('omits only the invalid power channel and skips batteryPower', () => {
    const regs = new Array(0x24).fill(0)
    regs[0x04] = INVALID_POWER_U16
    regs[0x06] = 120
    regs[0x07] = 400
    const live = decodeLiveStatus(regs)
    expect(live.outputPower).toBeUndefined()
    expect(live.solarPower).toBe(120)
    expect(live.acPower).toBe(400)
    expect(live.batteryPower).toBeUndefined()
  })

  it('omits the channel for 0xFFFE too, the value seen in the field', () => {
    const regs = new Array(0x24).fill(0)
    regs[0x04] = 0xfffe
    regs[0x06] = 0
    regs[0x07] = 0
    regs[0x1a] = 980
    const live = decodeLiveStatus(regs)
    expect(live.outputPower).toBeUndefined()
    expect(live.batteryPower).toBeUndefined()
    expect(live.soc).toBeCloseTo(98, 5)
  })

  it('keeps zero watts as a valid reading (distinct from 0xFFFF)', () => {
    const regs = new Array(0x24).fill(0)
    const live = decodeLiveStatus(regs)
    expect(live.outputPower).toBe(0)
    expect(live.solarPower).toBe(0)
    expect(live.acPower).toBe(0)
    expect(live.batteryPower).toBe(0)
  })
})
