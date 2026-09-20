import { describe, it, expect } from 'vitest'
import { SIERRO_MODELS, generateSerial } from './deviceModels'

const spec = SIERRO_MODELS['Sierro 2000']

describe('generateSerial', () => {
  it('takes the last six digits of a DTUID that has them', () => {
    expect(generateSerial(spec, 'DTU-0012345678')).toBe('SR2000-345678')
  })

  it('answers the same for the same unit every time', () => {
    // The old fallback rolled Math.random() whenever the DTUID held fewer than
    // six digits, so one unit could show two different serials.
    const first = generateSerial(spec, 'AB-12')
    expect(generateSerial(spec, 'AB-12')).toBe(first)
    expect(generateSerial(spec, 'AB-12')).toBe(first)
  })

  it('gives two different units two different serials', () => {
    expect(generateSerial(spec, 'AB-12')).not.toBe(generateSerial(spec, 'AB-13'))
  })

  it('invents nothing when there is no DTUID to derive from', () => {
    expect(generateSerial(spec, '')).toBe('')
    expect(generateSerial(spec, '   ')).toBe('')
    expect(generateSerial(spec, null)).toBe('')
    expect(generateSerial(spec, undefined)).toBe('')
  })
})
