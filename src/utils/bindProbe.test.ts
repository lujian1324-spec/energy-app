/**
 * The probe's job is to try everything once. These pin the shape of "everything"
 * so a variant can't quietly disappear, and pin the two facts the whole exercise
 * turns on: the power goes up in kilowatts, and a station created on its own
 * carries all ten of StationAddDtio's required fields.
 */
import { describe, it, expect } from 'vitest'
import { buildVariants, fullStation, type ProbeInput } from './bindProbe'

const input: ProbeInput = {
  deviceName: 'Sierrohome',
  dtuDtuid: '22560262584348802715',
  reportedSerial: '2412315001',
  virtualSerial: 'SR1000-802715',
  ratedPowerW: 500,
}

describe('buildVariants', () => {
  const vs = buildVariants(input)

  it('covers both routes and every station shape that has been suggested', () => {
    const labels = vs.map(v => v.label)
    expect(labels.filter(l => l.startsWith('two-step')).length).toBeGreaterThanOrEqual(3)
    expect(labels.filter(l => l.startsWith('together')).length).toBeGreaterThanOrEqual(6)
    // The refused shapes are all still in the sweep, not quietly dropped.
    expect(labels.some(l => l.includes('full StationAddDtio'))).toBe(true)
    expect(labels.some(l => l.includes('{name} only'))).toBe(true)
    expect(labels.some(l => l.includes('watts'))).toBe(true)
    expect(labels.some(l => l.includes('virtual serial'))).toBe(true)
    expect(labels.some(l => l.includes('no empty strings'))).toBe(true)
  })

  it('sends the two-step route first — /station/add then /device/add/single', () => {
    const first = vs[0]
    const s1 = first.steps(undefined)!
    expect(s1.path).toBe('/station/add')
    const s2 = first.steps('7300000000000000123')!
    expect(s2.path).toBe('/device/add/single')
    expect(s2.body.stationId).toBe('7300000000000000123')
  })

  it('puts the power up in kilowatts unless the variant says watts', () => {
    const kw = vs.find(v => v.label.endsWith('· kW'))!.steps(undefined)!
    // the two-step's first call is the station, so check a together variant
    const tog = vs.find(v => v.label.startsWith('together') && v.label.endsWith('· kW'))!
    expect(tog.steps(undefined)!.body.ratedPower).toBe(0.5)
    const watts = vs.find(v => v.label.startsWith('together') && v.label.endsWith('· watts'))!
    expect(watts.steps(undefined)!.body.ratedPower).toBe(500)
    expect(kw).toBeTruthy()
  })

  it('prefers the serial the collector reported', () => {
    const tog = vs.find(v => v.label.startsWith('together') && !v.label.includes('virtual serial'))!
    expect(tog.steps(undefined)!.body.deviceSerialNumber).toBe('2412315001')
    expect(tog.steps(undefined)!.body.isVirtualSerialNumber).toBe(false)
    const virt = vs.find(v => v.label.includes('virtual serial'))!
    expect(virt.steps(undefined)!.body.deviceSerialNumber).toBe('SR1000-802715')
    expect(virt.steps(undefined)!.body.isVirtualSerialNumber).toBe(true)
  })

  it('falls back to a virtual serial when the collector reported none', () => {
    const [v] = buildVariants({ ...input, reportedSerial: undefined })
    const s2 = v.steps('1')!
    expect(s2.body.deviceSerialNumber).toBe('SR1000-802715')
    expect(s2.body.isVirtualSerialNumber).toBe(true)
  })
})

describe('fullStation', () => {
  it('carries all ten of StationAddDtio, with the capacity floor', () => {
    const st = fullStation('S', 0, 31.2304, 121.4737)
    for (const k of ['name', 'country', 'latitude', 'longitude', 'stationType',
                     'connectedGridType', 'installedCapacity', 'installedAt',
                     'timezone', 'currencyCode']) {
      expect(st, `missing ${k}`).toHaveProperty(k)
    }
    expect(st.installedCapacity).toBeGreaterThanOrEqual(0.001)
    expect(fullStation('x'.repeat(60), 1, 0, 0).name).toHaveLength(40)
  })
})
