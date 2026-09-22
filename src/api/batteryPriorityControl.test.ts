/**
 * SW-09 — a Battery Priority save must write the two Modbus registers the
 * hardware acts on, over `/remote/device/passthrough`, and must not write the
 * cloud `workMode` field. The frames are checked by decoding the base64 the
 * request actually carries, so a change to the frame builders cannot silently
 * send Backup's 100% as 1000 or flip the enable/disable words.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
  const calls: { method: string; path: string; body?: any }[] = []
  const fail: Record<string, { code: number | string; message?: string }> = {}
  // Fail the Nth passthrough call only (1-based); 0 = none.
  const state = { failPassthroughAt: 0, passthroughSeen: 0 }
  const mk = (method: string) => (path: string, body?: any) => {
    calls.push({ method, path, body })
    if (path.startsWith('/remote/device/passthrough')) {
      state.passthroughSeen += 1
      if (state.passthroughSeen === state.failPassthroughAt) {
        return Promise.resolve({ code: 20101, message: 'illegal argument' })
      }
    }
    const key = Object.keys(fail).find((k) => path.startsWith(k))
    return Promise.resolve(key ? fail[key] : { code: 0, data: {} })
  }
  return {
    calls,
    fail,
    state,
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

import {
  applyBatteryPriority,
  batteryPriorityErrorMessage,
  PRIORITY_MIN_SOC,
  PRIORITY_REGISTER_VALUE,
} from './batteryPriorityControl'
import { PRIORITY_BACKUP, PRIORITY_SAVINGS } from '../utils/batteryPriority'

// A real platform id: 18 digits, past Number.MAX_SAFE_INTEGER.
const DEVICE_ID = '491513787113766912'

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
}

/** `{ addr, value }` of the write-single frame a passthrough call carries. */
function decodeWrite(body: any): { addr: number; value: number } {
  const raw = atob(String(body.base64Input))
  const b = Array.from(raw, (c) => c.charCodeAt(0))
  expect(b[1]).toBe(0x06) // function code: write single register
  return { addr: (b[2] << 8) | b[3], value: (b[4] << 8) | b[5] }
}

const passthroughs = () => h.calls.filter((c) => c.path.startsWith('/remote/device/passthrough'))

beforeEach(() => {
  h.calls.length = 0
  h.state.failPassthroughAt = 0
  h.state.passthroughSeen = 0
  store.clear()
})

describe('applyBatteryPriority — Savings', () => {
  it('writes 0x0086 = 0x01AA then 0x0054 = 60', async () => {
    const res = await applyBatteryPriority(DEVICE_ID, PRIORITY_SAVINGS)

    expect(res.ok).toBe(true)
    const p = passthroughs()
    expect(p).toHaveLength(2)
    expect(decodeWrite(p[0].body)).toEqual({ addr: 0x0086, value: 0x01aa })
    expect(decodeWrite(p[1].body)).toEqual({ addr: 0x0054, value: 60 })
    expect(res).toMatchObject({ priorityValue: 0x01aa, minSoc: 60 })
  })
})

describe('applyBatteryPriority — Backup', () => {
  it('writes 0x0086 = 0xAA01 then 0x0054 = 100 (percent, not 1000)', async () => {
    const res = await applyBatteryPriority(DEVICE_ID, PRIORITY_BACKUP)

    expect(res.ok).toBe(true)
    const p = passthroughs()
    expect(p).toHaveLength(2)
    expect(decodeWrite(p[0].body)).toEqual({ addr: 0x0086, value: 0xaa01 })
    expect(decodeWrite(p[1].body)).toEqual({ addr: 0x0054, value: 100 })
    expect(decodeWrite(p[1].body).value).not.toBe(1000)
  })
})

describe('applyBatteryPriority — path', () => {
  it('sends the device id as a string on the passthrough query', async () => {
    await applyBatteryPriority(DEVICE_ID, PRIORITY_SAVINGS)
    for (const c of passthroughs()) {
      expect(c.path).toBe(`/remote/device/passthrough?deviceId=${DEVICE_ID}`)
    }
  })

  it('never writes the cloud workMode config field', async () => {
    await applyBatteryPriority(DEVICE_ID, PRIORITY_SAVINGS)
    await applyBatteryPriority(DEVICE_ID, PRIORITY_BACKUP)

    expect(h.calls.some((c) => c.path.includes('/remote/device/config/write'))).toBe(false)
    expect(JSON.stringify(h.calls)).not.toContain('workMode')
  })

  it('touches no peakValley surface', async () => {
    await applyBatteryPriority(DEVICE_ID, PRIORITY_SAVINGS)
    expect(h.calls.some((c) => c.path.includes('peakValley'))).toBe(false)
  })
})

describe('applyBatteryPriority — failures', () => {
  it('reports a rejected 0x0086 and never writes the SOC', async () => {
    h.state.failPassthroughAt = 1

    const res = await applyBatteryPriority(DEVICE_ID, PRIORITY_SAVINGS)

    expect(res.ok).toBe(false)
    expect(res.failedStep).toBe('priority')
    expect(passthroughs()).toHaveLength(1)
    expect(batteryPriorityErrorMessage(res)).toContain('illegal argument')
  })

  it('reports a rejected 0x0054 as its own step', async () => {
    h.state.failPassthroughAt = 2

    const res = await applyBatteryPriority(DEVICE_ID, PRIORITY_BACKUP)

    expect(res.ok).toBe(false)
    expect(res.failedStep).toBe('minSoc')
    expect(passthroughs()).toHaveLength(2)
    expect(batteryPriorityErrorMessage(res)).toContain('100%')
  })

  it('reports a thrown request instead of swallowing it', async () => {
    const boom = vi.spyOn(h.api, 'post').mockRejectedValueOnce(new Error('network down'))

    const res = await applyBatteryPriority(DEVICE_ID, PRIORITY_SAVINGS)

    expect(res.ok).toBe(false)
    expect(res.failedStep).toBe('priority')
    expect(batteryPriorityErrorMessage(res)).toContain('network down')
    boom.mockRestore()
  })
})

describe('mode tables', () => {
  it('pairs each mode with its register value and reserve', () => {
    expect(PRIORITY_REGISTER_VALUE[PRIORITY_SAVINGS]).toBe(0x01aa)
    expect(PRIORITY_REGISTER_VALUE[PRIORITY_BACKUP]).toBe(0xaa01)
    expect(PRIORITY_MIN_SOC[PRIORITY_SAVINGS]).toBe(60)
    expect(PRIORITY_MIN_SOC[PRIORITY_BACKUP]).toBe(100)
  })
})
