/**
 * The layering these tests pin exists because the Device list had two writers
 * into one slot: the 60s /state/latest poll replaced the whole raw object, so
 * it erased the passthrough numbers written into it seconds earlier, and the
 * battery ring swung between two measurements of two different ages once a
 * minute. Sources are layered now and merged in one fixed order.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { LiveStatus } from '../protocols/modbusProtocol'
import {
  clearLivePassthrough,
  lookupLivePassthrough,
  mergeWithPassthrough,
  resolveLiveValues,
  saveLivePassthrough,
} from './livePassthroughStore'

const pass: LiveStatus = {
  soc: 72.4, acPower: 210, solarPower: 35, outputPower: 90,
  batteryPower: 155, batteryTemp: 24.6,
}
const ble: LiveStatus = {
  soc: 86.5, acPower: 120, solarPower: 40, outputPower: 80,
  batteryPower: 80, batteryTemp: 27.1,
}
const cloud = {
  remainingBatteryCapacity: 61, acPower: 0, solarPower: 0,
  outputPower: 12, batteryPower: -12, batteryTemp: 22,
  // A field only the cloud carries, to prove the overlay does not drop it.
  totalGeneration: 1234,
}

beforeEach(() => { clearLivePassthrough() })

describe('mergeWithPassthrough', () => {
  it('overlays all six decoded fields, and leaves everything else alone', () => {
    expect(mergeWithPassthrough(cloud, pass)).toEqual({
      remainingBatteryCapacity: 72.4, acPower: 210, solarPower: 35,
      outputPower: 90, batteryPower: 155, batteryTemp: 24.6,
      totalGeneration: 1234,
    })
  })

  it('returns the base untouched when there is no sample yet', () => {
    expect(mergeWithPassthrough(cloud, null)).toEqual(cloud)
    expect(mergeWithPassthrough(null, null)).toEqual({})
  })
})

describe('resolveLiveValues', () => {
  it('reads cloud → BLE → passthrough, passthrough on top', () => {
    const v = resolveLiveValues(cloud, ble, pass)
    expect(v.remainingBatteryCapacity).toBe(pass.soc)
    expect(v.acPower).toBe(pass.acPower)
    expect(v.outputPower).toBe(pass.outputPower)
  })

  it('lets passthrough win over a real cloud SOC — the value that used to clobber it', () => {
    // BLE deliberately stands aside when cloud has a real SOC; passthrough does
    // not, because it is the fresher read of the two and the one being polled.
    const v = resolveLiveValues(cloud, ble, pass)
    expect(v.remainingBatteryCapacity).toBe(72.4)
    expect(resolveLiveValues(cloud, ble, null).remainingBatteryCapacity).toBe(61)
  })

  it('falls through to BLE, then to cloud, when no passthrough sample has arrived', () => {
    // First paint on a freshly bound device: cloud SOC is still 0/empty.
    const empty = { ...cloud, remainingBatteryCapacity: 0 }
    expect(resolveLiveValues(empty, ble, null).remainingBatteryCapacity).toBe(ble.soc)
    expect(resolveLiveValues(cloud, null, null).remainingBatteryCapacity).toBe(61)
  })
})

describe('the live layer', () => {
  it('keeps the last good sample when a read fails, rather than dropping back', () => {
    expect(saveLivePassthrough('491513787113766912', pass)).toBe(true)
    // A failed read decodes to null. It must not erase what is already there:
    // falling back to the older cloud value is the jump this exists to prevent.
    expect(saveLivePassthrough('491513787113766912', null)).toBe(false)
    expect(lookupLivePassthrough('491513787113766912')?.live).toEqual(pass)
  })

  it('keys by device, so one device cannot paint another', () => {
    saveLivePassthrough('491513787113766912', pass)
    expect(lookupLivePassthrough('491513787113766913')).toBeNull()
    expect(lookupLivePassthrough(null)).toBeNull()
  })

  it('accepts a numeric id as the same key as its string form', () => {
    saveLivePassthrough(491513787113766912n.toString(), pass)
    expect(lookupLivePassthrough('491513787113766912')?.live).toEqual(pass)
  })

  it('is emptied on sign-out, so the next account starts blank', () => {
    saveLivePassthrough('491513787113766912', pass)
    clearLivePassthrough()
    expect(lookupLivePassthrough('491513787113766912')).toBeNull()
  })
})
