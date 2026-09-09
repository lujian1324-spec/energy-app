/**
 * The station this app creates was landing at latitude 0, longitude 0 with no
 * city, area or address — while the vendor's own form makes all of those
 * required and picks the point off a map. These pin the one thing that matters:
 * whatever the device's zone is, the station gets a real place.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { stationPlace, currencyFor, deviceTimezone } from './stationLocation'

function withZone(tz: string, fn: () => void) {
  const real = Intl.DateTimeFormat
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(((...a: unknown[]) => {
    const d = new (real as never)(...(a as []))
    return { ...d, resolvedOptions: () => ({ ...d.resolvedOptions(), timeZone: tz }) }
  }) as never)
  try { fn() } finally { vi.restoreAllMocks() }
}

afterEach(() => vi.restoreAllMocks())

describe('stationPlace', () => {
  it('never returns the 0,0 that reads as unset', () => {
    for (const tz of ['Asia/Shanghai', 'America/Los_Angeles', 'Europe/Berlin',
                      'Antarctica/Troll', 'Pacific/Chatham', 'UTC']) {
      withZone(tz, () => {
        const p = stationPlace()
        expect(p.latitude === 0 && p.longitude === 0, `${tz} landed on 0,0`).toBe(false)
        expect(Math.abs(p.latitude)).toBeLessThanOrEqual(90)
        expect(Math.abs(p.longitude)).toBeLessThanOrEqual(180)
      })
    }
  })

  it('fills the address fields the vendor form requires', () => {
    withZone('Asia/Shanghai', () => {
      const p = stationPlace()
      expect(p.country).toBe('CN')
      expect(p.city).toBe('Shanghai')
      expect(p.area).toBeTruthy()
      expect(p.address).toBeTruthy()
      expect(p.timezone).toBe('Asia/Shanghai')
      expect(p.latitude).toBeCloseTo(31.2304, 3)
    })
  })

  it('still names a city for a zone it has never heard of', () => {
    withZone('Antarctica/Troll', () => {
      expect(stationPlace().city).toBe('Troll')
    })
  })
})

describe('currencyFor', () => {
  it('matches the country, and falls back to USD', () => {
    expect(currencyFor('CN')).toBe('CNY')
    expect(currencyFor('DE')).toBe('EUR')
    expect(currencyFor('ZZ')).toBe('USD')
  })
})

describe('deviceTimezone', () => {
  it('answers something even when the platform will not', () => {
    expect(deviceTimezone()).toBeTruthy()
  })
})
