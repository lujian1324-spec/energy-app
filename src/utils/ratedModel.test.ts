import { describe, it, expect } from 'vitest'
import { modelFromAcInvOutputPower, withDetectedModel, mayAutoSetModel } from './ratedModel'
import { sleepPowerMaxW, snapSleepPower, sleepWatts, sleepPowers } from './chargeWindow'

describe('model from register 0x000A (v4.18.0)', () => {
  it('1000 W is a Sierro 2000; anything else, or nothing, is the Sierro 1000', () => {
    expect(modelFromAcInvOutputPower(1000)).toBe('Sierro 2000')
    expect(modelFromAcInvOutputPower(300)).toBe('Sierro 1000')
    expect(modelFromAcInvOutputPower(500)).toBe('Sierro 1000')
    expect(modelFromAcInvOutputPower(null)).toBe('Sierro 1000')
  })

  it('a reading sets the model and its spec unless the user picked one', () => {
    const detected = withDetectedModel({ deviceId: 'd', acInvOutputPower: 500, fetchedAt: 1, model: 'Sierro 1000', modelSource: 'default', bleId: 'B' }, 'd', 1000, 2)
    expect(detected).toMatchObject({ model: 'Sierro 2000', ratedPower: 1000, acInvOutputPower: 1000, modelSource: 'detected', bleId: 'B', fetchedAt: 2 })

    const user = withDetectedModel({ deviceId: 'd', acInvOutputPower: 500, fetchedAt: 1, model: 'Sierro 1000', modelSource: 'user' }, 'd', 1000, 2)
    expect(user.model).toBe('Sierro 1000')
    expect(user.acInvOutputPower).toBe(1000)
    expect(mayAutoSetModel(null)).toBe(true)
  })

  it('a guess from the scan name is corrected back to the Sierro 1000', () => {
    const r = withDetectedModel({ deviceId: 'd', acInvOutputPower: 1000, fetchedAt: 1, model: 'Sierro 2000', modelSource: 'default' }, 'd', 500)
    expect(r.model).toBe('Sierro 1000')
  })
})

describe('Sleep Mode power sliders (v4.18.0)', () => {
  it('0–400 W on a Sierro 1000, 0–800 W on a Sierro 2000, in 50 W steps', () => {
    expect(sleepPowerMaxW('Sierro 1000')).toBe(400)
    expect(sleepPowerMaxW('Sierro 2000')).toBe(800)
    expect(snapSleepPower('Sierro 1000', 460, 150)).toBe(400)
    expect(snapSleepPower('Sierro 2000', 460, 150)).toBe(450)
    expect(snapSleepPower('Sierro 1000', -20, 150)).toBe(0)
    expect(snapSleepPower('Sierro 1000', 74, 150)).toBe(50)
    expect(snapSleepPower('Sierro 1000', undefined, 150)).toBe(150)
  })

  it('defaults stay the model values; switching off restores the model power', () => {
    expect(sleepWatts('Sierro 1000')).toEqual({ sleepW: 150, wakeW: 400 })
    expect(sleepWatts('Sierro 2000')).toEqual({ sleepW: 300, wakeW: 800 })
    expect(sleepPowers('Sierro 2000', { sleepW: 100, wakeW: 250 })).toEqual({ inWindowW: 100, outWindowW: 250, restoreW: 800 })
  })
})

describe('rated capacity comes from the model, not 0x000A (v4.19.0)', () => {
  it('1 kWh for a Sierro 1000 (and an unknown model), 2 kWh for a Sierro 2000', async () => {
    const { ratedCapacityWh } = await import('../data/deviceModels')
    expect(ratedCapacityWh('Sierro 1000')).toBe(1000)
    expect(ratedCapacityWh('Sierro 2000')).toBe(2000)
    expect(ratedCapacityWh(undefined)).toBe(1000)
    expect(ratedCapacityWh('')).toBe(1000)
  })
})
