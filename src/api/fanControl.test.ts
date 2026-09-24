/**
 * Manual fan speed — one FC16 write of 0x0081 = 0x01SS over passthrough.
 * Frames are checked byte for byte, including the Modbus CRC, against the
 * example supplied with the spec (23 % → 01 10 00 81 00 01 02 01 17 F9 DF), and
 * against what the request actually carries after base64 encoding.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
  const calls: { path: string; body?: any }[] = []
  const state: { reply: { code: number | string; message?: string } | Error } = { reply: { code: 0, data: {} } as any }
  const post = (path: string, body?: any) => {
    calls.push({ path, body })
    return state.reply instanceof Error ? Promise.reject(state.reply) : Promise.resolve(state.reply)
  }
  return { calls, state, api: { get: post, post, postSkipAuth: post, getAuthed: post, postAuthed: post } }
})

vi.mock('../utils/apiClient', () => ({
  api: h.api,
  tokenStore: { get: () => 'ACCESS', set: () => {}, setRefresh: () => {}, getRefresh: () => 'REFRESH', clear: () => {} },
  isApiSuccess: (c: unknown) => c === 0 || c === '0',
}))

import {
  applyFanSpeed,
  clampFanSpeed,
  fanRegisterValue,
  fanSpeedFrame,
  loadFanSpeed,
  saveFanSpeed,
} from './fanControl'

// A real platform id: 18 digits, past Number.MAX_SAFE_INTEGER.
const DEVICE_ID = '491513787113766912'

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
}

const bytesOf = (body: any) => Array.from(atob(String(body.base64Input)), (c) => c.charCodeAt(0))

beforeEach(() => {
  h.calls.length = 0
  h.state.reply = { code: 0, data: {} } as any
  store.clear()
})

describe('fanSpeedFrame', () => {
  it('matches the spec example for 23 % (0x17), CRC included', () => {
    expect(fanSpeedFrame(23)).toBe('01 10 00 81 00 01 02 01 17 F9 DF')
  })

  it('puts the percentage in hex in byte 9, with a valid CRC at both ends of the range', () => {
    expect(fanSpeedFrame(0)).toBe('01 10 00 81 00 01 02 01 00 B9 D1')
    expect(fanSpeedFrame(50)).toBe('01 10 00 81 00 01 02 01 32 38 04')
    expect(fanSpeedFrame(100)).toBe('01 10 00 81 00 01 02 01 64 B8 3A')
  })

  it('keeps the enable bit set at 0 %', () => {
    expect(fanRegisterValue(0)).toBe(0x0100)
    expect(fanRegisterValue(100)).toBe(0x0164)
  })
})

describe('clampFanSpeed', () => {
  it('rounds and bounds to 0–100', () => {
    expect(clampFanSpeed(-5)).toBe(0)
    expect(clampFanSpeed(150)).toBe(100)
    expect(clampFanSpeed(42.6)).toBe(43)
    expect(clampFanSpeed(Number.NaN)).toBe(0)
  })
})

describe('applyFanSpeed', () => {
  it('sends exactly one passthrough with the frame, to the string device id', async () => {
    const r = await applyFanSpeed(DEVICE_ID, 23)
    expect(r).toEqual({ ok: true, speed: 23 })
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0].path).toBe(`/remote/device/passthrough?deviceId=${DEVICE_ID}`)
    expect(bytesOf(h.calls[0].body)).toEqual([0x01, 0x10, 0x00, 0x81, 0x00, 0x01, 0x02, 0x01, 0x17, 0xf9, 0xdf])
  })

  it('clamps before sending, so the frame never carries more than 0x64', async () => {
    const r = await applyFanSpeed(DEVICE_ID, 250)
    expect(r.speed).toBe(100)
    expect(bytesOf(h.calls[0].body)[8]).toBe(0x64)
  })

  it('reports a refused write as a failure without throwing', async () => {
    h.state.reply = { code: 20101, message: 'illegal argument' }
    const r = await applyFanSpeed(DEVICE_ID, 40)
    expect(r.ok).toBe(false)
    expect(r.detail).toBe('illegal argument')
  })

  it('reports a thrown request as a failure without throwing', async () => {
    h.state.reply = new Error('Network down')
    const r = await applyFanSpeed(DEVICE_ID, 40)
    expect(r).toEqual({ ok: false, speed: 40, detail: 'Network down' })
  })
})

describe('saved speed', () => {
  it('is null until set, then per device', () => {
    expect(loadFanSpeed(DEVICE_ID)).toBeNull()
    saveFanSpeed(DEVICE_ID, 70)
    expect(loadFanSpeed(DEVICE_ID)).toBe(70)
    expect(loadFanSpeed('another')).toBeNull()
  })

  it('ignores a corrupt stored value', () => {
    store.set(`sierro-fan-speed-${DEVICE_ID}`, 'abc')
    expect(loadFanSpeed(DEVICE_ID)).toBeNull()
  })
})
