/**
 * SW-08 — Smart Schedule must make Sleep Mode's three writes and nothing else.
 *
 * The rule these tests hold is the whole point of the change: a Smart Schedule
 * save has to land on the device the way Sleep Mode lands on it —
 * `/remote/device/config/write` (sleepMode), `/remote/device/passthrough`
 * (Modbus 0x0085) and the relay's `POST /schedule` — and must never touch
 * `/peakValley/...`, which the backend accepts and the hardware ignores.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
  const calls: { method: string; path: string; body?: any }[] = []
  // Per-path canned responses, so a test can make one write fail.
  const fail: Record<string, { code: number | string; message?: string }> = {}
  const mk = (method: string) => (path: string, body?: any) => {
    calls.push({ method, path, body })
    const key = Object.keys(fail).find((k) => path.startsWith(k))
    return Promise.resolve(key ? fail[key] : { code: 0, data: {} })
  }
  return {
    calls,
    fail,
    api: {
      get: mk('get'),
      post: mk('post'),
      postSkipAuth: mk('post'),
      getAuthed: mk('get'),
      postAuthed: mk('post'),
    },
  }
})

vi.mock('../utils/apiClient', () => ({
  api: h.api,
  tokenStore: { get: () => 'ACCESS', set: () => {}, setRefresh: () => {}, getRefresh: () => 'REFRESH', clear: () => {} },
  isApiSuccess: (c: unknown) => c === 0 || c === '0',
}))

// A configured relay, so uploadSleepSchedule really issues its POST /schedule.
vi.mock('../config/scheduling', () => ({
  RELAY_BASE_URL: 'https://relay.test',
  SCHEDULE_PATH: '/schedule',
  isRelayConfigured: () => true,
}))

import { applySmartSchedule, chargePowerFrame, isMissingConfigAttribute } from './smartScheduleControl'
import { REG_CTRL, buildWriteSingleFrame, toHexString } from '../protocols/modbusProtocol'

// A real platform id: 18 digits, past Number.MAX_SAFE_INTEGER.
const DEVICE_ID = '491513787113766912'

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
}

let relayPosts: { url: string; body: any }[] = []

beforeEach(() => {
  h.calls.length = 0
  for (const k of Object.keys(h.fail)) delete h.fail[k]
  relayPosts = []
  store.clear()
  store.set('iot_user_id', '491513787113766900')
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    relayPosts.push({ url: String(url), body: JSON.parse(init.body) })
    return { ok: true } as any
  }))
})

/** Base64 of a passthrough body back to the hex frame it carried. */
const frameOf = (body: any): string =>
  Buffer.from(String(body.base64Input), 'base64').toString('hex').toUpperCase()

/** `toHexString` spaces its bytes; the wire form does not. */
const bare = (hex: string) => hex.replace(/\s+/g, '')

const winAt = (hour: number) => {
  // Freeze the clock so "inside / outside the window" is not a flaky assertion.
  vi.setSystemTime(new Date(2026, 0, 1, hour, 0, 0, 0))
}

describe('applySmartSchedule — Sleep Mode\'s three writes', () => {
  it('hits config/write, passthrough and the relay, in that order', async () => {
    vi.useFakeTimers()
    winAt(2) // 02:00 — inside a 23:00→07:00 charge window
    const r = await applySmartSchedule(DEVICE_ID, {
      enabled: true, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
    })
    vi.useRealTimers()

    expect(r.ok).toBe(true)
    expect(h.calls).toHaveLength(2)

    // A — sleepMode config write, deviceId in the query as an exact decimal string
    expect(h.calls[0].path).toBe(`/remote/device/config/write?deviceId=${DEVICE_ID}`)
    expect(h.calls[0].body).toEqual({ key: 'sleepMode', value: true })

    // B — Modbus 0x0085 over passthrough, carrying the rate the user typed
    expect(h.calls[1].path).toBe(`/remote/device/passthrough?deviceId=${DEVICE_ID}`)
    expect(frameOf(h.calls[1].body)).toBe(bare(chargePowerFrame(500)))
    expect(r.wattsWritten).toBe(500)

    // C — the relay, so the window is honoured with the app closed
    expect(relayPosts).toHaveLength(1)
    expect(relayPosts[0].url).toBe('https://relay.test/schedule')
    expect(relayPosts[0].body.deviceId).toBe(DEVICE_ID)
    expect(relayPosts[0].body.schedule).toMatchObject({
      enabled: true, sleepFrom: '23:00', sleepTo: '07:00', model: 'Sierro 1000',
      sleepW: 500, wakeW: 0,
    })
    expect(r.relayAccepted).toBe(true)
  })

  it('writes 0x0085 and not the rated-power register', () => {
    expect(REG_CTRL.AC_CHARGE_POWER_RT).toBe(0x0085)
    expect(chargePowerFrame(500)).toBe(toHexString(buildWriteSingleFrame(0x0085, 500)))
  })

  it('never issues a peakValley request', async () => {
    vi.useFakeTimers(); winAt(2)
    await applySmartSchedule(DEVICE_ID, {
      enabled: true, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
    })
    await applySmartSchedule(DEVICE_ID, {
      enabled: false, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
    })
    vi.useRealTimers()
    expect(h.calls.some((c) => c.path.includes('peakValley'))).toBe(false)
    expect(relayPosts.some((p) => p.url.includes('peakValley'))).toBe(false)
  })

  it('outside the charge window it writes 0W, so the battery carries the peak', async () => {
    vi.useFakeTimers(); winAt(18) // 18:00 — peak
    const r = await applySmartSchedule(DEVICE_ID, {
      enabled: true, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
    })
    vi.useRealTimers()
    expect(r.phase).toBe('wake')
    expect(r.wattsWritten).toBe(0)
    expect(frameOf(h.calls[1].body)).toBe(bare(chargePowerFrame(0)))
  })

  it('switching off restores the model charge power instead of leaving it at 0W', async () => {
    vi.useFakeTimers(); winAt(18)
    const r = await applySmartSchedule(DEVICE_ID, {
      enabled: false, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 2000',
    })
    vi.useRealTimers()
    expect(h.calls[0].body).toEqual({ key: 'sleepMode', value: false })
    expect(r.wattsWritten).toBe(800) // Sierro 2000 normal charge power
    expect(relayPosts[0].body.schedule.enabled).toBe(false)
  })

  it('a refused sleepMode write stops before the charge power is touched', async () => {
    h.fail['/remote/device/config/write'] = { code: 20101, message: 'illegal argument' }
    const r = await applySmartSchedule(DEVICE_ID, {
      enabled: true, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
    })
    expect(r.ok).toBe(false)
    expect(r.failedStep).toBe('config')
    expect(r.detail).toBe('illegal argument')
    expect(h.calls).toHaveLength(1)
    expect(relayPosts).toHaveLength(0)
  })

  it('a refused passthrough is reported and never reaches the relay', async () => {
    h.fail['/remote/device/passthrough'] = { code: 1, message: 'device offline' }
    const r = await applySmartSchedule(DEVICE_ID, {
      enabled: true, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
    })
    expect(r.ok).toBe(false)
    expect(r.failedStep).toBe('passthrough')
    expect(r.detail).toBe('device offline')
    expect(relayPosts).toHaveLength(0)
  })

  it('an unreachable relay still counts as saved — the device already took it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const r = await applySmartSchedule(DEVICE_ID, {
      enabled: true, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
    })
    expect(r.ok).toBe(true)
    expect(r.relayAccepted).toBe(false)
  })
})

/**
 * SW-11 — a product model without a `sleepMode` config attribute must not block
 * the save. Step A is the only one that can hit that gap; B is the write that
 * moves the charge rate and C is what keeps the window with the app closed, so
 * both still have to run.
 */
describe('applySmartSchedule — missing sleepMode attribute (SW-11)', () => {
  for (const message of [
    'config attribute not exist',
    'Config Attribute Not Exist',
    'attribute does not exist',
    'device config attribute [sleepMode] not exist',
  ]) {
    it(`soft-fails A and still writes B and C: "${message}"`, async () => {
      vi.useFakeTimers(); winAt(2)
      h.fail['/remote/device/config/write'] = { code: 20101, message }
      const r = await applySmartSchedule(DEVICE_ID, {
        enabled: true, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
      })
      vi.useRealTimers()

      // B ran even though A was refused, and carries the rate the user typed.
      expect(h.calls).toHaveLength(2)
      expect(h.calls[1].path).toBe(`/remote/device/passthrough?deviceId=${DEVICE_ID}`)
      expect(frameOf(h.calls[1].body)).toBe(bare(chargePowerFrame(500)))
      // C ran too.
      expect(relayPosts).toHaveLength(1)
      expect(r.relayAccepted).toBe(true)

      // AC-4: B/C succeeded, but the skipped A stays visible on the result.
      expect(r.ok).toBe(true)
      expect(r.failedStep).toBeUndefined()
      expect(r.configSkipped).toBe(true)
      expect(r.configSkippedDetail).toBe(message)
      expect(r.wattsWritten).toBe(500)
    })
  }

  it('soft-fails a thrown missing-attribute error the same way', async () => {
    vi.useFakeTimers(); winAt(2)
    const realPost = h.api.post
    h.api.post = ((path: string, body?: any) => {
      h.calls.push({ method: 'post', path, body })
      if (path.startsWith('/remote/device/config/write')) {
        return Promise.reject(new Error('config attribute not exist'))
      }
      return Promise.resolve({ code: 0, data: {} })
    }) as any
    let r
    try {
      r = await applySmartSchedule(DEVICE_ID, {
        enabled: true, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
      })
    } finally {
      h.api.post = realPost
      vi.useRealTimers()
    }
    expect(r.ok).toBe(true)
    expect(r.configSkipped).toBe(true)
    expect(h.calls).toHaveLength(2)
    expect(relayPosts).toHaveLength(1)
  })

  it('a hard B failure after a soft-failed A still fails the save', async () => {
    h.fail['/remote/device/config/write'] = { code: 20101, message: 'config attribute not exist' }
    h.fail['/remote/device/passthrough'] = { code: 1, message: 'device offline' }
    const r = await applySmartSchedule(DEVICE_ID, {
      enabled: true, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
    })
    expect(r.ok).toBe(false)
    expect(r.failedStep).toBe('passthrough')
    expect(r.detail).toBe('device offline')
    expect(r.configSkipped).toBe(true)
    expect(r.wattsWritten).toBeUndefined()
    expect(relayPosts).toHaveLength(0)
  })

  it('a real A refusal is still hard — it is not a missing attribute', async () => {
    h.fail['/remote/device/config/write'] = { code: 20101, message: 'illegal argument' }
    const r = await applySmartSchedule(DEVICE_ID, {
      enabled: true, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
    })
    expect(r.ok).toBe(false)
    expect(r.failedStep).toBe('config')
    expect(r.configSkipped).toBeFalsy()
    expect(h.calls).toHaveLength(1)
  })

  it('a happy-path A leaves the result unflagged (SW-08 unchanged)', async () => {
    vi.useFakeTimers(); winAt(2)
    const r = await applySmartSchedule(DEVICE_ID, {
      enabled: true, startTime: '23:00', endTime: '07:00', chargePowerW: 500, model: 'Sierro 1000',
    })
    vi.useRealTimers()
    expect(r.ok).toBe(true)
    expect(r.configSkipped).toBeFalsy()
    expect(r.configSkippedDetail).toBeUndefined()
    expect(h.calls[0].body).toEqual({ key: 'sleepMode', value: true })
    expect(h.calls).toHaveLength(2)
    expect(relayPosts).toHaveLength(1)
  })

  it('matches the missing-attribute wordings and nothing else', () => {
    expect(isMissingConfigAttribute('config attribute not exist')).toBe(true)
    expect(isMissingConfigAttribute('ATTRIBUTE NOT EXIST')).toBe(true)
    expect(isMissingConfigAttribute('attribute does not exist')).toBe(true)
    expect(isMissingConfigAttribute('illegal argument')).toBe(false)
    expect(isMissingConfigAttribute('device offline')).toBe(false)
    expect(isMissingConfigAttribute('')).toBe(false)
  })
})
