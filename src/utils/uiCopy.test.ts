import { describe, it, expect } from 'vitest'
import { sanitizeUiCopy, containsCjk } from './uiCopy'

describe('sanitizeUiCopy', () => {
  it('maps the known device timeout phrase', () => {
    expect(sanitizeUiCopy('等待设备应答超时')).toBe('Timed out waiting for the device.')
  })

  it('maps a timeout phrase embedded in a longer backend message', () => {
    expect(sanitizeUiCopy('错误: 等待设备应答超时 (rc=1)')).toBe('Timed out waiting for the device.')
  })

  it('uses Request timed out for unknown CJK timeout text', () => {
    expect(sanitizeUiCopy('操作超时，请重试')).toBe('Request timed out')
  })

  it('uses the generic fallback for other unknown CJK', () => {
    expect(sanitizeUiCopy('未知的内部错误')).toBe('Something went wrong')
    expect(sanitizeUiCopy('未知的内部错误', 'Request timed out')).toBe('Request timed out')
  })

  it('passes through English unchanged', () => {
    expect(sanitizeUiCopy('Failed to save name')).toBe('Failed to save name')
  })

  it('falls back on empty input', () => {
    expect(sanitizeUiCopy('')).toBe('Something went wrong')
    expect(sanitizeUiCopy(null)).toBe('Something went wrong')
  })
})

describe('containsCjk', () => {
  it('detects Han characters', () => {
    expect(containsCjk('电芯过压')).toBe(true)
    expect(containsCjk('Cell overvoltage')).toBe(false)
    expect(containsCjk('')).toBe(false)
  })
})
