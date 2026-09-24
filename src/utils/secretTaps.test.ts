import { describe, it, expect } from 'vitest'
import { NO_TAPS, SECRET_TAPS, registerTap, type TapState } from './secretTaps'

const tapAt = (times: number[]) => {
  let state: TapState = NO_TAPS
  let unlocked = false
  for (const t of times) ({ state, unlocked } = registerTap(state, t))
  return { state, unlocked }
}

describe('registerTap', () => {
  it('unlocks on the tenth quick tap, not before', () => {
    expect(tapAt(Array.from({ length: SECRET_TAPS - 1 }, (_, i) => i * 300)).unlocked).toBe(false)
    expect(tapAt(Array.from({ length: SECRET_TAPS }, (_, i) => i * 300)).unlocked).toBe(true)
  })

  it('a pause longer than the gap starts the count again', () => {
    const times = [...Array.from({ length: 9 }, (_, i) => i * 300), 9 * 300 + 2000]
    const r = tapAt(times)
    expect(r.unlocked).toBe(false)
    expect(r.state.count).toBe(1)
  })

  it('starts from zero again after unlocking', () => {
    const r = tapAt(Array.from({ length: SECRET_TAPS + 1 }, (_, i) => i * 300))
    expect(r.unlocked).toBe(false)
    expect(r.state.count).toBe(1)
  })
})
