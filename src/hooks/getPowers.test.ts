import { describe, it, expect } from 'vitest'
import { getPowers } from './useSleepModeScheduler'

describe('getPowers — Sleep Mode 0x0085 AC charge power per model', () => {
  it('Sierro 1000 (default): sleep 150W / wake 400W', () => {
    expect(getPowers('Sierro 1000')).toEqual({ sleepW: 150, wakeW: 400 })
    expect(getPowers('')).toEqual({ sleepW: 150, wakeW: 400 })
    expect(getPowers('unknown')).toEqual({ sleepW: 150, wakeW: 400 })
  })
  it('Sierro 2000: sleep 300W / wake 800W', () => {
    expect(getPowers('Sierro 2000')).toEqual({ sleepW: 300, wakeW: 800 })
    expect(getPowers('SIERRO-2000-X')).toEqual({ sleepW: 300, wakeW: 800 })
  })
})
