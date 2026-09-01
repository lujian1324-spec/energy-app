import { describe, it, expect } from 'vitest'
import { formatScanDisplayName } from './scanDisplayName'

describe('formatScanDisplayName', () => {
  it('uses last 4 of a DTUID and omits model 1000', () => {
    expect(formatScanDisplayName({ serial: '20839350917702012920', name: 'Sierro 1000' }))
      .toBe('Sierro · 2920')
  })

  it('strips Sierro 1000 from a composed scan title', () => {
    expect(formatScanDisplayName({ name: 'Sierro 1000 · 2920' })).toBe('Sierro · 2920')
  })

  it('uses last 4 of a MAC-like deviceId when serial is missing', () => {
    expect(formatScanDisplayName({ deviceId: 'AA:BB:CC:DD:EE:FF' })).toBe('Sierro · EEFF')
  })

  it('falls back to Sierro when there is no last4', () => {
    expect(formatScanDisplayName({ name: 'Sierro 1000' })).toBe('Sierro')
    expect(formatScanDisplayName({})).toBe('Sierro')
  })
})
