import { describe, it, expect } from 'vitest'
import { decodePowerU16, INVALID_POWER_U16 } from './powerU16'
import { decodeLiveStatus } from './modbusProtocol'

describe('decodePowerU16 0xFFFF sentinel', () => {
  it('maps 0xFFFF → undefined and other values through', () => {
    expect(INVALID_POWER_U16).toBe(0xffff)
    expect(decodePowerU16(0xffff)).toBeUndefined()
    expect(decodePowerU16(0)).toBe(0)
    expect(decodePowerU16(168)).toBe(168)
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

  it('keeps zero watts as a valid reading (distinct from 0xFFFF)', () => {
    const regs = new Array(0x24).fill(0)
    const live = decodeLiveStatus(regs)
    expect(live.outputPower).toBe(0)
    expect(live.solarPower).toBe(0)
    expect(live.acPower).toBe(0)
    expect(live.batteryPower).toBe(0)
  })
})
