/**
 * SW-13 — offline Save and the flush on reconnect.
 *
 * The rule under test is the one Jason's report turns on: a device that is not
 * there and a device that says no must produce different outcomes, and the
 * difference must come from connection state rather than from what the reply
 * says (AC-13-0a / AC-13-0c). Everything else here is the consequence — a
 * queued save is a success, the queue holds only the latest, a flush is the same
 * A→B→C run a live save makes, and one device's queue is not another's.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => {
  const calls: { method: string; path: string; body?: any }[] = []
  const fail: Record<string, { code: number | string; message?: string }> = {}
  const mk = (method: string) => (path: string, body?: any) => {
    calls.push({ method, path, body })
    const key = Object.keys(fail).find(k => path.startsWith(k))
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

// A configured relay, so step C really issues its POST /schedule.
vi.mock('../config/scheduling', () => ({
  RELAY_BASE_URL: 'https://relay.test',
  SCHEDULE_PATH: '/schedule',
  isRelayConfigured: () => true,
}))

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => store.clear(),
}

import { flushPendingSmartSchedule, saveSmartSchedule } from './smartScheduleSave'
import type { SmartScheduleResult, SmartScheduleWindow } from './smartScheduleControl'
import {
  MAX_FLUSH_ATTEMPTS,
  enqueueSmartScheduleSave,
  getPendingSmartScheduleSave,
} from '../utils/smartScheduleQueue'
import { getActiveScheduleMode, setActiveScheduleMode } from '../utils/activeScheduleMode'
import type { SaveConnectivity } from '../utils/deviceConnectivity'

const A = '491513787113766912'
const B = '491513787113766913'

const win = (over: Partial<SmartScheduleWindow> = {}): SmartScheduleWindow => ({
  enabled: true,
  startTime: '01:00',
  endTime: '05:00',
  chargePowerW: 600,
  model: 'Sierro 1000',
  ...over,
})

const ONLINE: SaveConnectivity = { clientOnline: true, hasSession: true, deviceOnline: true }
const DEVICE_OFFLINE: SaveConnectivity = { ...ONLINE, deviceOnline: false }

/** The exact wording Jason saw. It must never move the outcome on its own. */
const REJECT_TEXT = 'can not set charge power'

const ok = (over: Partial<SmartScheduleResult> = {}): SmartScheduleResult => ({
  ok: true,
  phase: 'sleep',
  wattsWritten: 600,
  instantPowerApplied: true,
  relayConfigured: true,
  relayAccepted: true,
  ...over,
})

const rejected = (detail = REJECT_TEXT): SmartScheduleResult => ({
  ok: false,
  failedStep: 'passthrough',
  detail,
  phase: 'sleep',
  instantPowerApplied: false,
  relayConfigured: false,
  relayAccepted: false,
})

/** A stub `applySmartSchedule` that records what it was asked to write. */
function stubApply(result: SmartScheduleResult | ((w: SmartScheduleWindow) => SmartScheduleResult)) {
  const seen: { deviceId: string; window: SmartScheduleWindow }[] = []
  const apply = vi.fn(async (deviceId: string | number, window: SmartScheduleWindow) => {
    seen.push({ deviceId: String(deviceId), window })
    return typeof result === 'function' ? result(window) : result
  })
  return { apply: apply as any, seen }
}

beforeEach(() => {
  store.clear()
  h.calls.length = 0
  for (const k of Object.keys(h.fail)) delete h.fail[k]
  vi.restoreAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// ─── Offline save ─────────────────────────────────────────────────────────────

describe('saveSmartSchedule — the device is not there (AC-13-1 / AC-13-2)', () => {
  it('queues the save, reports success, and never attempts the write', async () => {
    const { apply } = stubApply(rejected())
    const res = await saveSmartSchedule(A, win(), {
      connectivity: DEVICE_OFFLINE, apply, now: () => 1000,
    })

    expect(res).toMatchObject({ ok: true, queued: true, offlineReason: 'device-offline' })
    expect(res.applied).toBeUndefined()
    expect(apply).not.toHaveBeenCalled()
    // Nothing the page could turn into "Could not set the charge power".
    expect(getPendingSmartScheduleSave(A)).toEqual({ window: win(), queuedAt: 1000, attempts: 0 })
  })

  it('queues when the phone itself has no network', async () => {
    const { apply } = stubApply(rejected())
    const res = await saveSmartSchedule(A, win(), {
      connectivity: { clientOnline: false, hasSession: true, deviceOnline: true }, apply,
    })
    expect(res).toMatchObject({ ok: true, queued: true, offlineReason: 'client-offline' })
    expect(apply).not.toHaveBeenCalled()
  })

  it('queues when there is no session to write over', async () => {
    const { apply } = stubApply(rejected())
    const res = await saveSmartSchedule(A, win(), {
      connectivity: { clientOnline: true, hasSession: false }, apply,
    })
    expect(res).toMatchObject({ ok: true, queued: true, offlineReason: 'no-session' })
    expect(apply).not.toHaveBeenCalled()
  })

  it('queues an offline turn-off with its disable intent intact (AC-13-3)', async () => {
    const { apply } = stubApply(rejected())
    const res = await saveSmartSchedule(A, win({ enabled: false }), {
      connectivity: DEVICE_OFFLINE, apply,
    })
    expect(res.ok).toBe(true)
    expect(res.queued).toBe(true)
    expect(getPendingSmartScheduleSave(A)!.window.enabled).toBe(false)
  })

  it('keeps only the latest offline save (AC-13-7)', async () => {
    const { apply } = stubApply(rejected())
    await saveSmartSchedule(A, win({ chargePowerW: 300 }), { connectivity: DEVICE_OFFLINE, apply, now: () => 1000 })
    await saveSmartSchedule(A, win({ chargePowerW: 900 }), { connectivity: DEVICE_OFFLINE, apply, now: () => 2000 })
    const p = getPendingSmartScheduleSave(A)!
    expect(p.window.chargePowerW).toBe(900)
    expect(p.queuedAt).toBe(2000)
  })
})

// ─── Online reject ────────────────────────────────────────────────────────────

describe('saveSmartSchedule — the device is there and says no (AC-13-0b)', () => {
  it('fails, exactly as before, and queues nothing', async () => {
    const { apply } = stubApply(rejected())
    const res = await saveSmartSchedule(A, win(), { connectivity: ONLINE, apply })

    expect(res.ok).toBe(false)
    expect(res.queued).toBe(false)
    expect(res.applied).toMatchObject({ failedStep: 'passthrough', detail: REJECT_TEXT })
    expect(getPendingSmartScheduleSave(A)).toBeNull()
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('is not softened by the refusal wording — the same text, the two outcomes (AC-13-0c)', async () => {
    const offline = await saveSmartSchedule(A, win(), {
      connectivity: DEVICE_OFFLINE, apply: stubApply(rejected(REJECT_TEXT)).apply,
    })
    const online = await saveSmartSchedule(B, win(), {
      connectivity: ONLINE, apply: stubApply(rejected(REJECT_TEXT)).apply,
    })
    expect([offline.ok, offline.queued]).toEqual([true, true])
    expect([online.ok, online.queued]).toEqual([false, false])
  })

  it('a device with an unknown online flag is treated as there', async () => {
    const { apply } = stubApply(rejected())
    const res = await saveSmartSchedule(A, win(), {
      connectivity: { clientOnline: true, hasSession: true }, apply,
    })
    expect(res.ok).toBe(false)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('a link that dropped mid-save is a queue, not a failure — from state, not text', async () => {
    const { apply } = stubApply(rejected())
    const res = await saveSmartSchedule(A, win(), {
      connectivity: ONLINE,
      recheck: () => ({ clientOnline: false, hasSession: true }),
      apply,
      now: () => 1000,
    })
    expect(res).toMatchObject({ ok: true, queued: true, offlineReason: 'client-offline' })
    expect(getPendingSmartScheduleSave(A)!.queuedAt).toBe(1000)
  })

  it('a recheck that still reads connected leaves the failure a failure', async () => {
    const { apply } = stubApply(rejected())
    const res = await saveSmartSchedule(A, win(), {
      connectivity: ONLINE, recheck: () => ONLINE, apply,
    })
    expect(res.ok).toBe(false)
    expect(getPendingSmartScheduleSave(A)).toBeNull()
  })
})

describe('saveSmartSchedule — the ordinary online success (AC-13-8)', () => {
  it('writes and reports the device result untouched', async () => {
    const { apply, seen } = stubApply(ok({ configSkipped: true, configSkippedDetail: 'x' }))
    const res = await saveSmartSchedule(A, win(), { connectivity: ONLINE, apply })
    expect(res).toMatchObject({ ok: true, queued: false })
    expect(res.applied).toMatchObject({ ok: true, wattsWritten: 600, configSkipped: true })
    expect(seen).toEqual([{ deviceId: A, window: win() }])
  })

  it('drops a stale pending save — the device now holds something newer', async () => {
    enqueueSmartScheduleSave(A, win({ chargePowerW: 100 }), 1000)
    const { apply } = stubApply(ok())
    await saveSmartSchedule(A, win({ chargePowerW: 700 }), { connectivity: ONLINE, apply })
    expect(getPendingSmartScheduleSave(A)).toBeNull()
  })
})

// ─── Flush ────────────────────────────────────────────────────────────────────

describe('flushPendingSmartSchedule (AC-13-4 / AC-13-5)', () => {
  it('does nothing when nothing is owed', async () => {
    const { apply } = stubApply(ok())
    expect(await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply }))
      .toEqual({ status: 'none' })
    expect(apply).not.toHaveBeenCalled()
  })

  it('sends the queued save and clears it', async () => {
    enqueueSmartScheduleSave(A, win({ chargePowerW: 450 }), 1000)
    const { apply, seen } = stubApply(ok())
    const r = await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply })

    expect(r.status).toBe('flushed')
    expect(seen).toEqual([{ deviceId: A, window: win({ chargePowerW: 450 }) }])
    expect(getPendingSmartScheduleSave(A)).toBeNull()
  })

  it('sends the latest only — the older intents were already overwritten', async () => {
    enqueueSmartScheduleSave(A, win({ chargePowerW: 100 }), 1000)
    enqueueSmartScheduleSave(A, win({ chargePowerW: 250 }), 2000)
    enqueueSmartScheduleSave(A, win({ chargePowerW: 950, endTime: '06:30' }), 3000)
    const { apply, seen } = stubApply(ok())
    await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply })

    expect(apply).toHaveBeenCalledTimes(1)
    expect(seen[0].window).toEqual(win({ chargePowerW: 950, endTime: '06:30' }))
  })

  it('stays quiet and keeps the save while the device is still away (AC-13-6)', async () => {
    enqueueSmartScheduleSave(A, win(), 1000)
    const { apply } = stubApply(ok())
    const r = await flushPendingSmartSchedule(A, { connectivity: DEVICE_OFFLINE, apply })

    expect(r.status).toBe('offline')
    expect(apply).not.toHaveBeenCalled()
    expect(getPendingSmartScheduleSave(A)!.attempts).toBe(0)
  })

  it('a refusal keeps the save and spends one attempt', async () => {
    enqueueSmartScheduleSave(A, win(), 1000)
    const { apply } = stubApply(rejected())
    const r = await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply })

    expect(r.status).toBe('rejected')
    expect(r.attempts).toBe(1)
    expect(r.gaveUp).toBe(false)
    expect(r.applied?.detail).toBe(REJECT_TEXT)
    expect(getPendingSmartScheduleSave(A)!.attempts).toBe(1)
  })

  it('gives up after a bounded number of refusals rather than retrying forever', async () => {
    enqueueSmartScheduleSave(A, win(), 1000)
    const { apply } = stubApply(rejected())
    let last
    for (let i = 0; i < MAX_FLUSH_ATTEMPTS; i++) {
      last = await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply })
    }
    expect(last!.gaveUp).toBe(true)
    expect(getPendingSmartScheduleSave(A)).toBeNull()
  })

  it('a link lost mid-flush costs no attempt and reports nothing', async () => {
    enqueueSmartScheduleSave(A, win(), 1000)
    const { apply } = stubApply(rejected())
    const r = await flushPendingSmartSchedule(A, {
      connectivity: ONLINE,
      recheck: () => ({ clientOnline: false, hasSession: true }),
      apply,
    })
    expect(r.status).toBe('offline')
    expect(getPendingSmartScheduleSave(A)!.attempts).toBe(0)
  })

  it('a save made during the flush survives it and goes out next', async () => {
    enqueueSmartScheduleSave(A, win({ chargePowerW: 300 }), 1000)
    const apply = vi.fn(async () => {
      // the user saves again while A/B/C are in flight
      enqueueSmartScheduleSave(A, win({ chargePowerW: 800 }), 2000)
      return ok()
    })
    const r = await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply: apply as any })

    expect(r.status).toBe('flushed')
    expect(getPendingSmartScheduleSave(A)!.window.chargePowerW).toBe(800)
  })

  it('flushes one device without touching another\'s queue (AC-13-10)', async () => {
    enqueueSmartScheduleSave(A, win({ chargePowerW: 300 }), 1000)
    enqueueSmartScheduleSave(B, win({ chargePowerW: 800 }), 1100)
    const { apply, seen } = stubApply(ok())
    await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply })

    expect(seen.map(s => s.deviceId)).toEqual([A])
    expect(getPendingSmartScheduleSave(A)).toBeNull()
    expect(getPendingSmartScheduleSave(B)!.window.chargePowerW).toBe(800)
  })
})

describe('flush keeps the active mode in step (SW-12, AC-13-8)', () => {
  it('claims the device for Smart Schedule when an enable lands', async () => {
    enqueueSmartScheduleSave(A, win({ enabled: true }), 1000)
    await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply: stubApply(ok()).apply })
    expect(getActiveScheduleMode(A)).toBe('smart')
  })

  it('releases the claim when a disable lands', async () => {
    setActiveScheduleMode(A, 'smart')
    enqueueSmartScheduleSave(A, win({ enabled: false }), 1000)
    await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply: stubApply(ok()).apply })
    expect(getActiveScheduleMode(A)).toBeNull()
  })

  it('does not steal a claim Sleep Mode has taken when the flush is refused', async () => {
    setActiveScheduleMode(A, 'sleep')
    enqueueSmartScheduleSave(A, win(), 1000)
    await flushPendingSmartSchedule(A, { connectivity: ONLINE, apply: stubApply(rejected()).apply })
    expect(getActiveScheduleMode(A)).toBe('sleep')
  })
})

// ─── The flush really is Sleep Mode's three writes ────────────────────────────

describe('a flush is the same A→B→C run a live save makes (AC-13-5 / AC-13-9)', () => {
  const paths = () => h.calls.map(c => c.path)

  it('writes config/write, then passthrough 0x0085, then the relay', async () => {
    const relayPosts: { url: string }[] = []
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      relayPosts.push({ url: String(url) })
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    })

    enqueueSmartScheduleSave(A, win(), 1000)
    // No `apply` override: this exercises the real applySmartSchedule.
    const r = await flushPendingSmartSchedule(A, { connectivity: ONLINE })

    expect(r.status).toBe('flushed')
    const seen = paths()
    expect(seen.some(p => p.includes('/remote/device/config/write'))).toBe(true)
    expect(seen.some(p => p.includes('/remote/device/passthrough'))).toBe(true)
    expect(seen.findIndex(p => p.includes('config/write')))
      .toBeLessThan(seen.findIndex(p => p.includes('passthrough')))
    expect(relayPosts.some(p => p.url.includes('/schedule'))).toBe(true)
    expect(getPendingSmartScheduleSave(A)).toBeNull()
  })

  it('issues no peakValley request at any point (AC-13-9)', async () => {
    ;(globalThis as any).fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    enqueueSmartScheduleSave(A, win(), 1000)
    await flushPendingSmartSchedule(A, { connectivity: ONLINE })
    expect(paths().some(p => p.toLowerCase().includes('peakvalley'))).toBe(false)
  })

  it('keeps SW-11: a model with no sleepMode attribute still flushes B and C', async () => {
    ;(globalThis as any).fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    h.fail['/remote/device/config/write'] = { code: 20101, message: 'config attribute not exist' }

    enqueueSmartScheduleSave(A, win({ model: 'Sierro 3000' }), 1000)
    const r = await flushPendingSmartSchedule(A, { connectivity: ONLINE })

    expect(r.status).toBe('flushed')
    expect(r.applied?.configSkipped).toBe(true)
    expect(paths().some(p => p.includes('/remote/device/passthrough'))).toBe(true)
    expect(getPendingSmartScheduleSave(A)).toBeNull()
  })

  it('a refused passthrough during a flush is still a refusal', async () => {
    ;(globalThis as any).fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    h.fail['/remote/device/passthrough'] = { code: 1, message: REJECT_TEXT }

    enqueueSmartScheduleSave(A, win(), 1000)
    const r = await flushPendingSmartSchedule(A, { connectivity: ONLINE })

    expect(r.status).toBe('rejected')
    expect(r.applied?.failedStep).toBe('passthrough')
    expect(getPendingSmartScheduleSave(A)!.attempts).toBe(1)
  })
})
