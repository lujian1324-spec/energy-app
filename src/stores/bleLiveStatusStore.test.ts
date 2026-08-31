import { describe, it, expect, beforeEach } from 'vitest'
import type { LiveStatus } from '../protocols/modbusProtocol'
import {
  aliasBleLiveFromDevices,
  clearBleLiveStatus,
  hasRealCloudSoc,
  lookupBleLiveStatus,
  mergeCloudWithBle,
  overlayBleOnLatestApiResponse,
  overlayBleOnStateFields,
  saveBleLiveStatus,
} from './bleLiveStatusStore'

const ble: LiveStatus = {
  soc: 86.5,
  acPower: 120,
  solarPower: 40,
  outputPower: 80,
  batteryPower: 80,
  batteryTemp: 27.1,
}

beforeEach(() => {
  clearBleLiveStatus()
})

describe('hasRealCloudSoc', () => {
  it('rejects missing / non-finite / zero (first-add empty telemetry)', () => {
    expect(hasRealCloudSoc(undefined)).toBe(false)
    expect(hasRealCloudSoc(null)).toBe(false)
    expect(hasRealCloudSoc(0)).toBe(false)
    expect(hasRealCloudSoc(Number.NaN)).toBe(false)
  })

  it('accepts a positive finite SOC as real cloud data', () => {
    expect(hasRealCloudSoc(1)).toBe(true)
    expect(hasRealCloudSoc(84.2)).toBe(true)
  })
})

describe('mergeCloudWithBle', () => {
  it('uses BLE when cloud SOC is missing', () => {
    const merged = mergeCloudWithBle({}, ble)
    expect(merged.remainingBatteryCapacity).toBe(86.5)
    expect(merged.acPower).toBe(120)
    expect(merged.solarPower).toBe(40)
    expect(merged.outputPower).toBe(80)
    expect(merged.batteryPower).toBe(80)
    expect(merged.batteryTemp).toBe(27.1)
  })

  it('uses BLE when cloud SOC is 0 (typical first-add placeholder)', () => {
    const merged = mergeCloudWithBle(
      { remainingBatteryCapacity: 0, acPower: 0, solarPower: 0, outputPower: 0 },
      ble,
    )
    expect(merged.remainingBatteryCapacity).toBe(86.5)
    expect(merged.acPower).toBe(120)
  })

  it('lets cloud win once it has a real SOC', () => {
    const merged = mergeCloudWithBle(
      { remainingBatteryCapacity: 84, acPower: 10, solarPower: 5, outputPower: 20, batteryPower: -5, batteryTemp: 30 },
      ble,
    )
    expect(merged.remainingBatteryCapacity).toBe(84)
    expect(merged.acPower).toBe(10)
    expect(merged.outputPower).toBe(20)
    expect(merged.batteryTemp).toBe(30)
  })

  it('does not overwrite good cloud data with a null BLE snapshot', () => {
    const cloud = { remainingBatteryCapacity: 50, acPower: 9 }
    expect(mergeCloudWithBle(cloud, null)).toEqual(cloud)
    expect(mergeCloudWithBle(cloud, undefined)).toEqual(cloud)
  })

  it('leaves guest/mock cloud data unchanged when no BLE snapshot exists', () => {
    const demo = { remainingBatteryCapacity: 72, acPower: 200, solarPower: 15, outputPower: 40 }
    expect(mergeCloudWithBle(demo, null).remainingBatteryCapacity).toBe(72)
    expect(lookupBleLiveStatus({ deviceId: '10001' })).toBeNull()
  })
})

describe('save / lookup / alias', () => {
  it('looks up a snapshot by deviceId, DTUID, or serial', () => {
    saveBleLiveStatus(
      { deviceId: '42', dtuDtuid: 'DTU-AAA', serialNumber: 'SN-AAA' },
      ble,
    )
    expect(lookupBleLiveStatus({ deviceId: 42 })?.live.soc).toBe(86.5)
    expect(lookupBleLiveStatus({ dtuDtuid: 'DTU-AAA' })?.live.soc).toBe(86.5)
    expect(lookupBleLiveStatus({ serialNumber: 'SN-AAA' })?.live.outputPower).toBe(80)
  })

  it('refuses to save a null snapshot so it cannot clobber later cloud reads', () => {
    expect(saveBleLiveStatus({ deviceId: '1' }, null)).toBe(false)
    expect(lookupBleLiveStatus({ deviceId: '1' })).toBeNull()
  })

  it('aliases a DTUID snapshot onto the cloud deviceId after bind', () => {
    saveBleLiveStatus({ dtuDtuid: 'DTU-9' }, ble)
    expect(lookupBleLiveStatus({ deviceId: '99' })).toBeNull()
    aliasBleLiveFromDevices([{ id: '99', dtuDtuid: 'DTU-9', serialNumber: 'SN-9' }])
    expect(lookupBleLiveStatus({ deviceId: '99' })?.live.soc).toBe(86.5)
  })
})

describe('overlayBleOnStateFields', () => {
  it('fills remainingBatteryCapacity from BLE when cloud fields are empty', () => {
    saveBleLiveStatus({ deviceId: '7' }, ble)
    const out = overlayBleOnStateFields({ deviceId: '7' }, {})
    expect(out?.remainingBatteryCapacity?.value).toBe(86.5)
    expect(out?.exchangeChargingPower?.value).toBe(120)
  })

  it('does not overwrite a real cloud SOC field', () => {
    saveBleLiveStatus({ deviceId: '7' }, ble)
    const out = overlayBleOnStateFields(
      { deviceId: '7' },
      { remainingBatteryCapacity: { key: 'remainingBatteryCapacity', value: 91, valueDisplay: '91', unit: '%' } },
    )
    expect(out?.remainingBatteryCapacity?.value).toBe(91)
  })
})

describe('overlayBleOnLatestApiResponse', () => {
  const path = '/remote/device/state/latest?deviceId=7'

  it('fills empty cloud state/latest with BLE SOC', () => {
    saveBleLiveStatus({ deviceId: '7' }, ble)
    const out = overlayBleOnLatestApiResponse(path, { code: 0, data: { deviceId: '7', fields: {} } })
    const fields = (out.data as { fields: Record<string, { value: number }> }).fields
    expect(fields.remainingBatteryCapacity.value).toBe(86.5)
  })

  it('does not clobber a real cloud SOC', () => {
    saveBleLiveStatus({ deviceId: '7' }, ble)
    const out = overlayBleOnLatestApiResponse(path, {
      code: 0,
      data: { deviceId: '7', fields: { remainingBatteryCapacity: { value: 91 } } },
    })
    const fields = (out.data as { fields: Record<string, { value: number }> }).fields
    expect(fields.remainingBatteryCapacity.value).toBe(91)
  })

  it('leaves auth-expired responses untouched', () => {
    saveBleLiveStatus({ deviceId: '7' }, ble)
    const src = { code: 401, data: undefined as unknown }
    expect(overlayBleOnLatestApiResponse(path, src)).toBe(src)
  })

  it('does not touch unrelated endpoints', () => {
    saveBleLiveStatus({ deviceId: '7' }, ble)
    const src = { code: 0, data: { fields: {} } }
    expect(overlayBleOnLatestApiResponse('/device/list', src)).toBe(src)
  })
})
