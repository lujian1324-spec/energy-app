import { describe, it, expect } from 'vitest'
import { parseBleName, extractDtuid, isDtuid } from './dtuidParser'

const SAMPLE = 'SSL_0IIOTUJF3AgEpIA=='
const DTUID = '20839350917702012920'

describe('parseBleName', () => {
  it('decodes the factory SSL_ name into a 20-digit DTUID', () => {
    const parsed = parseBleName(SAMPLE)
    expect(parsed).toEqual({ prefix: 'SSL_', status: 0, dtuid: DTUID })
    expect(extractDtuid(SAMPLE)).toBe(DTUID)
    expect(isDtuid(DTUID)).toBe(true)
  })

  it('tolerates missing base64 padding, whitespace, and trailing NULs (iOS)', () => {
    expect(extractDtuid('SSL_0IIOTUJF3AgEpIA')).toBe(DTUID)
    expect(extractDtuid('  SSL_0IIOTUJF3AgEpIA==  ')).toBe(DTUID)
    expect(extractDtuid('SSL_0IIOTUJF3AgEpIA==\0')).toBe(DTUID)
  })

  it('returns null for unrelated BLE names', () => {
    expect(parseBleName('AirPods')).toBeNull()
    expect(parseBleName('SSL_')).toBeNull()
    expect(extractDtuid('')).toBeNull()
  })
})
