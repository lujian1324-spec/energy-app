import { describe, it, expect } from 'vitest'
import { parseLossless, quoteUnsafeIntegers } from './losslessJson'

describe('parseLossless', () => {
  it('preserves a Long id beyond MAX_SAFE_INTEGER as an exact string', () => {
    // 19-digit station id — JSON.parse would round this
    const raw = '{"code":0,"data":{"list":[{"id":1839203948570293847,"name":"Home"}]}}'
    const parsed = parseLossless(raw) as any
    expect(parsed.data.list[0].id).toBe('1839203948570293847')
    expect(typeof parsed.data.list[0].id).toBe('string')
    // sanity: the native parser really does lose precision (stringifies to a different value)
    expect(String(JSON.parse(raw).data.list[0].id)).not.toBe('1839203948570293847')
  })

  it('leaves safe integers as numbers', () => {
    const parsed = parseLossless('{"id":42,"count":9007199254740991}') as any
    expect(parsed.id).toBe(42)
    expect(parsed.count).toBe(9007199254740991) // exactly MAX_SAFE_INTEGER — still safe
    expect(typeof parsed.id).toBe('number')
  })

  it('quotes an integer just past MAX_SAFE_INTEGER', () => {
    const parsed = parseLossless('{"n":9007199254740993}') as any // MAX_SAFE + 2
    expect(parsed.n).toBe('9007199254740993')
  })

  it('handles negative big integers', () => {
    const parsed = parseLossless('{"n":-1839203948570293847}') as any
    expect(parsed.n).toBe('-1839203948570293847')
  })

  it('never touches floats, exponents, or safe values', () => {
    const parsed = parseLossless('{"price":0.185,"big":1.234e5,"soc":98}') as any
    expect(parsed.price).toBe(0.185)
    expect(parsed.big).toBe(123400)
    expect(parsed.soc).toBe(98)
  })

  it('does not modify digit runs INSIDE strings', () => {
    const raw = '{"serial":"1839203948570293847","note":"has \\"1839203948570293847\\" inside"}'
    const parsed = parseLossless(raw) as any
    expect(parsed.serial).toBe('1839203948570293847')
    expect(parsed.note).toBe('has "1839203948570293847" inside')
  })

  it('quoteUnsafeIntegers only rewrites the unsafe integer literal', () => {
    expect(quoteUnsafeIntegers('[42, 1839203948570293847, 3.14]'))
      .toBe('[42, "1839203948570293847", 3.14]')
  })

  it('round-trips a realistic station-list payload', () => {
    const raw = '{"code":0,"data":{"list":[' +
      '{"id":7300000000000000123,"name":"A","installedCapacity":2000,"latitude":25.03}' +
      '],"total":1}}'
    const parsed = parseLossless(raw) as any
    expect(parsed.data.list[0].id).toBe('7300000000000000123')
    expect(parsed.data.list[0].installedCapacity).toBe(2000)
    expect(parsed.data.list[0].latitude).toBe(25.03)
  })
})
