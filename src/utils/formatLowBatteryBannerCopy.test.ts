import { describe, it, expect } from 'vitest'
import { formatLowBatteryBannerCopy } from './formatLowBatteryBannerCopy'

describe('formatLowBatteryBannerCopy', () => {
  it('with duration uses the design template (strips trailing remaining)', () => {
    expect(formatLowBatteryBannerCopy('Kitchen', '1h24m remaining'))
      .toBe('Kitchen • Estimated remaining time: 1h24m')
    expect(formatLowBatteryBannerCopy('Sierro', '1h 24m remaining'))
      .toBe('Sierro • Estimated remaining time: 1h 24m')
    expect(formatLowBatteryBannerCopy('Home', '1h0m'))
      .toBe('Home • Estimated remaining time: 1h0m')
  })

  it('empty / -- / remaining junk never shows a dash', () => {
    expect(formatLowBatteryBannerCopy('Kitchen', null)).toBe('Kitchen • Low battery')
    expect(formatLowBatteryBannerCopy('Kitchen', undefined)).toBe('Kitchen • Low battery')
    expect(formatLowBatteryBannerCopy('Kitchen', '')).toBe('Kitchen • Low battery')
    expect(formatLowBatteryBannerCopy('Kitchen', '--')).toBe('Kitchen • Low battery')
    expect(formatLowBatteryBannerCopy('Kitchen', '-- remaining')).toBe('Kitchen • Low battery')
    expect(formatLowBatteryBannerCopy('Kitchen', 'remaining')).toBe('Kitchen • Low battery')
    expect(formatLowBatteryBannerCopy('Kitchen', ' remaining ')).toBe('Kitchen • Low battery')
    expect(formatLowBatteryBannerCopy('Kitchen', 'Charging')).toBe('Kitchen • Low battery')
    expect(formatLowBatteryBannerCopy('Kitchen', '1h0m to full')).toBe('Kitchen • Low battery')
  })
})
