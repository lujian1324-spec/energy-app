/**
 * Switching the AC outlets waits for the device and reads the result back
 * (APP-20260922-001): acceptance by the platform is not the device switching.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
  const calls: { path: string; body?: any }[] = []
  const state: { reply: { code: number | string; message?: string } | Error } = { reply: { code: 0 } }
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

import { setAcOutput } from './acOutputControl'
import type { LiveStatus } from '../protocols/modbusProtocol'

const DEVICE_ID = '491513787113766912'
const live = (acOutput?: boolean): LiveStatus => ({ soc: 50, batteryTemp: 25, ...(acOutput === undefined ? {} : { acOutput }) })
const noSleep = async () => {}
const bytes = (body: any) => Array.from(atob(String(body.base64Input)), (c) => c.charCodeAt(0))

beforeEach(() => {
  h.calls.length = 0
  h.state.reply = { code: 0 }
})

describe('setAcOutput', () => {
  it('writes 0x0080 and waits for the device (noOutput is not set)', async () => {
    await setAcOutput(DEVICE_ID, false, { readback: async () => live(false), sleep: noSleep })
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0].path).toBe(`/remote/device/passthrough?deviceId=${DEVICE_ID}`)
    expect(h.calls[0].body.noOutput).toBe(false)
    const b = bytes(h.calls[0].body)
    expect([b[1], b[2], b[3], b[4], b[5]]).toEqual([0x06, 0x00, 0x80, 0xaa, 0x01]) // AC off = 0xAA01
  })

  it('is confirmed as soon as a read-back shows the requested state', async () => {
    const readback = vi.fn().mockResolvedValueOnce(live(true)).mockResolvedValueOnce(live(false))
    const r = await setAcOutput(DEVICE_ID, false, { readback, sleep: noSleep })
    expect(r).toMatchObject({ ok: true, confirmed: true })
    expect(r.live?.acOutput).toBe(false)
    expect(readback).toHaveBeenCalledTimes(2)
  })

  it('reports not_switched when every read-back still shows the old state', async () => {
    const readback = vi.fn().mockResolvedValue(live(true))
    const r = await setAcOutput(DEVICE_ID, false, { readback, sleep: noSleep, attempts: 3 })
    expect(r).toMatchObject({ ok: false, confirmed: false, reason: 'not_switched' })
    expect(r.live?.acOutput).toBe(true)
    expect(readback).toHaveBeenCalledTimes(3)
  })

  it('a read-back that decodes nothing is not evidence: sent, unconfirmed', async () => {
    const readback = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(live(undefined))
    const r = await setAcOutput(DEVICE_ID, true, { readback, sleep: noSleep })
    expect(r).toEqual({ ok: true, confirmed: false })
  })

  it('a refused write is a failure and reads nothing back', async () => {
    h.state.reply = { code: 20101, message: 'illegal argument' }
    const readback = vi.fn()
    const r = await setAcOutput(DEVICE_ID, true, { readback, sleep: noSleep })
    expect(r).toMatchObject({ ok: false, reason: 'refused', detail: 'illegal argument' })
    expect(readback).not.toHaveBeenCalled()
  })

  it('a thrown write is a failure, not an exception', async () => {
    h.state.reply = new Error('timeout')
    const r = await setAcOutput(DEVICE_ID, true, { readback: vi.fn(), sleep: noSleep })
    expect(r).toMatchObject({ ok: false, reason: 'refused', detail: 'timeout' })
  })
})
