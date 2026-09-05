import { describe, it, expect } from 'vitest'
import { formatLowBatteryBannerCopy } from './formatLowBatteryBannerCopy'

describe('formatLowBatteryBannerCopy', () => {
  it('with duration uses the Figma template (strips trailing remaining)', () => {
    expect(formatLowBatteryBannerCopy('Kitchen', '1h24m remaining'))
      .toBe('Kitchen • Battery below 30%, estimated remaining time: 1h24m')
    expect(formatLowBatteryBannerCopy('Sierro', '1h 24m remaining'))
      .toBe('Sierro • Battery below 30%, estimated remaining time: 1h 24m')
    expect(formatLowBatteryBannerCopy('Home', '1h0m'))
      .toBe('Home • Battery below 30%, estimated remaining time: 1h0m')
  })

  it('empty / -- / remaining junk never shows a dash', () => {
    expect(formatLowBatteryBannerCopy('Kitchen', null)).toBe('Kitchen • Battery below 30%')
    expect(formatLowBatteryBannerCopy('Kitchen', undefined)).toBe('Kitchen • Battery below 30%')
    expect(formatLowBatteryBannerCopy('Kitchen', '')).toBe('Kitchen • Battery below 30%')
    expect(formatLowBatteryBannerCopy('Kitchen', '--')).toBe('Kitchen • Battery below 30%')
    expect(formatLowBatteryBannerCopy('Kitchen', '-- remaining')).toBe('Kitchen • Battery below 30%')
    expect(formatLowBatteryBannerCopy('Kitchen', 'remaining')).toBe('Kitchen • Battery below 30%')
    expect(formatLowBatteryBannerCopy('Kitchen', ' remaining ')).toBe('Kitchen • Battery below 30%')
    expect(formatLowBatteryBannerCopy('Kitchen', 'Charging')).toBe('Kitchen • Battery below 30%')
    expect(formatLowBatteryBannerCopy('Kitchen', '1h0m to full')).toBe('Kitchen • Battery below 30%')
  })
})
