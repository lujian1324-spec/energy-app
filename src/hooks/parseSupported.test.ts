import { describe, it, expect } from 'vitest'
import { parseSupported } from './useLiveDeviceStatus'

describe('parseSupported (fast-report support probe, undocumented shape)', () => {
  it('accepts truthy scalar shapes', () => {
    expect(parseSupported(true)).toBe(true)
    expect(parseSupported('true')).toBe(true)
    expect(parseSupported(1)).toBe(true)
    expect(parseSupported('1')).toBe(true)
  })
  it('accepts object shapes', () => {
    expect(parseSupported({ supported: true })).toBe(true)
    expect(parseSupported({ isSupported: true })).toBe(true)
    expect(parseSupported({ support: true })).toBe(true)
  })
  it('rejects unsupported / ambiguous shapes (falls back to passthrough)', () => {
    expect(parseSupported(false)).toBe(false)
    expect(parseSupported(0)).toBe(false)
    expect(parseSupported('false')).toBe(false)
    expect(parseSupported(null)).toBe(false)
    expect(parseSupported(undefined)).toBe(false)
    expect(parseSupported({ supported: false })).toBe(false)
    expect(parseSupported({})).toBe(false)
  })
})
