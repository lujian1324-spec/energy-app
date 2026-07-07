import { describe, it, expect } from 'vitest'
import { isApiSuccess } from './apiClient'

describe('isApiSuccess', () => {
  it('accepts numeric 0 and string "0"', () => {
    expect(isApiSuccess(0)).toBe(true)
    expect(isApiSuccess('0')).toBe(true)
  })
  it('rejects everything else', () => {
    expect(isApiSuccess(1)).toBe(false)
    expect(isApiSuccess('1')).toBe(false)
    expect(isApiSuccess(200)).toBe(false)   // 200 is NOT a business-success code here
    expect(isApiSuccess('success')).toBe(false)
    expect(isApiSuccess(undefined)).toBe(false)
    expect(isApiSuccess(null)).toBe(false)
  })
})
