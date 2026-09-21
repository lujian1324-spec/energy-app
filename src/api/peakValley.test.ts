/**
 * SW-05 — Smart Schedule (削峰填谷) request contract.
 *
 * Every one of these asserts something that, when it was not true, came back
 * from the backend as 20101 "illegal argument" and stopped Smart Schedule from
 * opening: a deviceId that was not an exact decimal string, a body carrying
 * fields the DTO does not declare, or a request sent with no IOT-Token at all.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
  const calls: { method: string; path: string; body?: any; authed: boolean }[] = []
  const mk = (method: string, authed: boolean) => (path: string, body?: any) => {
    calls.push({ method, path, body, authed })
    return Promise.resolve({ code: 0, data: {} })
  }
  return {
    calls,
    api: {
      get: mk('get', false),
      post: mk('post', false),
      postSkipAuth: mk('post', false),
      getAuthed: mk('get', true),
      postAuthed: mk('post', true),
    },
  }
})

vi.mock('../utils/apiClient', () => ({
  api: h.api,
  tokenStore: { get: () => 'ACCESS', set: () => {}, setRefresh: () => {}, getRefresh: () => 'REFRESH', clear: () => {} },
  isApiSuccess: (c: unknown) => c === 0 || c === '0',
}))

import {
  fetchPeakValleyConfig,
  fetchPeakValleyGeneral,
  fetchPeakValleyAttributeGroup,
  fetchPeakValleyTypes,
  setPeakValleyEnabled,
  setPeakValleyGeneral,
  normalizeDeviceId,
  InvalidDeviceIdError,
  mapSettingsToGeneralConfig,
} from './deviceApi'

const last = () => h.calls[h.calls.length - 1]
beforeEach(() => { h.calls.length = 0 })

// A real platform id: 18 digits, past Number.MAX_SAFE_INTEGER.
const LONG_ID = '491513787113766912'

describe('normalizeDeviceId', () => {
  it('keeps an 18-digit Long id digit-for-digit', () => {
    expect(normalizeDeviceId(LONG_ID)).toBe(LONG_ID)
    expect(normalizeDeviceId(` ${LONG_ID} `)).toBe(LONG_ID)
  })

  it('accepts a safe-integer number as its decimal string', () => {
    expect(normalizeDeviceId(10001)).toBe('10001')
  })

  it('rejects anything that would spell a query the backend cannot answer', () => {
    for (const bad of [null, undefined, '', '   ', 'undefined', 'abc', '12a', -1, 1e21, 1.5, NaN]) {
      expect(() => normalizeDeviceId(bad as never)).toThrow(InvalidDeviceIdError)
    }
  })
})

describe('peakValley reads', () => {
  it('put the deviceId in the query as an exact decimal string', async () => {
    await fetchPeakValleyConfig(LONG_ID)
    expect(last().path).toBe(`/peakValley/device/get?deviceId=${LONG_ID}`)

    await fetchPeakValleyGeneral(10001)
    expect(last().path).toBe('/peakValley/device/general/get?deviceId=10001')

    await fetchPeakValleyAttributeGroup(LONG_ID)
    expect(last().path).toBe(`/peakValley/device/attribute/group?deviceId=${LONG_ID}`)

    await fetchPeakValleyTypes(LONG_ID)
    expect(last().path).toBe(`/peakValley/types/device?deviceId=${LONG_ID}&includeDefault=true`)
  })

  it('send nothing when the deviceId is missing', async () => {
    for (const bad of [null, undefined, '']) {
      await expect(fetchPeakValleyConfig(bad as never)).rejects.toThrow(InvalidDeviceIdError)
    }
    expect(h.calls).toHaveLength(0)
  })

  it('go out only with an IOT-Token', async () => {
    await fetchPeakValleyConfig(LONG_ID)
    expect(last().authed).toBe(true)
  })
})

describe('/peakValley/device/enable body', () => {
  it('is exactly DevicePeakValleyEnableDtio, deviceId as a string', async () => {
    await setPeakValleyEnabled({ deviceId: LONG_ID, isEnabled: true })
    expect(last().path).toBe('/peakValley/device/enable')
    expect(last().body).toEqual({ deviceId: LONG_ID, isEnabled: true })
    expect(typeof last().body.deviceId).toBe('string')
    expect(last().authed).toBe(true)
  })

  it('omits category rather than sending it undefined', async () => {
    await setPeakValleyEnabled({ deviceId: '10001', isEnabled: false, category: undefined })
    expect(Object.keys(last().body).sort()).toEqual(['deviceId', 'isEnabled'])
    await setPeakValleyEnabled({ deviceId: '10001', isEnabled: false, category: 'general' })
    expect(last().body.category).toBe('general')
  })

  it('sends nothing when the deviceId is missing', async () => {
    await expect(
      setPeakValleyEnabled({ deviceId: null as never, isEnabled: true })
    ).rejects.toThrow(InvalidDeviceIdError)
    expect(h.calls).toHaveLength(0)
  })
})

describe('/peakValley/device/general/set body', () => {
  const uiConfig = mapSettingsToGeneralConfig(LONG_ID, {
    enabled: true,
    peakPrice: 0.42,
    offPeakPrice: 0.12,
    partPeakPrice: 0.3,
    maxChargePower: 500,
    maxDischargePower: 1000,
    minBatteryLevel: 10,
    maxBatteryLevel: 95,
    schedules: [
      { id: 's1', name: 'Charge', startTime: '00:00', endTime: '06:00', type: 'charge', enabled: true },
    ],
  } as never)

  it('maps the UI settings with the deviceId still an exact string', () => {
    expect(uiConfig.deviceId).toBe(LONG_ID)
  })

  it('posts only deviceId / isEnabled / items — the DTO the backend declares', async () => {
    await setPeakValleyGeneral(uiConfig)
    expect(last().path).toBe('/peakValley/device/general/set')
    expect(Object.keys(last().body).sort()).toEqual(['deviceId', 'isEnabled', 'items'])
    expect(last().body.deviceId).toBe(LONG_ID)
    expect(last().body.isEnabled).toBe(true)
    expect(last().body.items).toHaveLength(1)
    expect(last().body.items[0].startTime).toBe('00:00')
    expect(last().authed).toBe(true)
  })

  it('drops the UI-only price / power / SOC fields that 20101 the request', async () => {
    await setPeakValleyGeneral(uiConfig)
    for (const k of [
      'peakPrice', 'offPeakPrice', 'partPeakPrice',
      'maxChargePower', 'maxDischargePower', 'minBatteryLevel', 'maxBatteryLevel',
    ]) {
      expect(last().body).not.toHaveProperty(k)
    }
  })

  it('sends nothing when the deviceId is missing', async () => {
    await expect(
      setPeakValleyGeneral({ ...uiConfig, deviceId: '' })
    ).rejects.toThrow(InvalidDeviceIdError)
    expect(h.calls).toHaveLength(0)
  })
})
