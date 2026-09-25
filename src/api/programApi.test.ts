import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  relay: true,
  fetches: [] as { url: string; init?: RequestInit }[],
  relayReply: { status: 200, body: { code: 0 } } as { status: number; body: unknown },
  relayProgram: null as unknown,
  passthrough: [] as string[],
  passthroughOk: true,
  locked: false,
}))

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
}

vi.mock('../config/scheduling', () => ({
  RELAY_BASE_URL: 'https://relay.test', PROGRAM_PATH: '/program', SCHEDULE_PATH: '/schedule',
  isRelayConfigured: () => h.relay,
}))
vi.mock('./deviceApi', () => ({
  passthroughDevice: vi.fn(async (_id: string, p: { data: string }) => {
    h.passthrough.push(p.data)
    return { code: h.passthroughOk ? 0 : 500 }
  }),
}))
vi.mock('../utils/firmwareLock', () => ({ isFirmwareUpdateLocked: () => h.locked }))

;(globalThis as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
  h.fetches.push({ url, init })
  if (!init || init.method !== 'POST') {
    return { ok: true, status: 200, json: async () => ({ code: 0, data: { program: h.relayProgram } }) }
  }
  return { ok: h.relayReply.status < 400, status: h.relayReply.status, json: async () => h.relayReply.body }
})

import { loadProgram, saveProgram } from './programApi'
import {
  EVERY_DAY, defaultProgram, initialProgram, newTask, repeatLabel, snapChargePower, stampChanges,
  taskTitle, time12, type DeviceProgram,
} from '../utils/deviceProgram'

const frameWatts = (hex: string) => parseInt(hex.replace(/\s+/g, '').slice(8, 12), 16)
const prog = (over: Partial<DeviceProgram> = {}): DeviceProgram => ({ ...defaultProgram('Sierro 1000', 'UTC'), ...over })

beforeEach(() => {
  store.clear()
  store.set('iot_user_id', '491513787113766912')
  store.set('iot_access_token', 'ACCESS')
  h.relay = true; h.fetches = []; h.passthrough = []; h.passthroughOk = true; h.locked = false
  h.relayReply = { status: 200, body: { code: 0 } }
  h.relayProgram = null
})

describe('labels', () => {
  it('reads repeat days, times and task names the way the screens show them', () => {
    expect(repeatLabel(EVERY_DAY)).toBe('Every day')
    expect(repeatLabel([1, 2, 3, 4, 5])).toBe('Weekdays')
    expect(repeatLabel([6, 0])).toBe('Weekends')
    expect(repeatLabel([0, 1, 3])).toBe('Mon, Wed, Sun')
    expect(time12('23:00')).toBe('11:00 PM')
    expect(time12('00:05')).toBe('12:05 AM')
    expect(taskTitle({ kind: 'charge', action: 'stop' })).toBe('Stop Charging')
    expect(taskTitle({ kind: 'ac', action: 'on' })).toBe('Turn On AC Output')
  })

  it('snaps a power to the model\'s choices', () => {
    expect(snapChargePower('Sierro 1000', 250)).toBe(200)
    expect(snapChargePower('Sierro 2000', 700)).toBe(600)
    expect(snapChargePower('Sierro 1000', 10)).toBe(50)
  })
})

describe('Silent Mode replaces Sleep Mode', () => {
  it('a saved Sleep Mode window becomes the Silent Mode schedule', () => {
    const p = initialProgram('Sierro 1000', { enabled: true, sleepFrom: '22:00', sleepTo: '09:00', wakeW: 300 })
    expect(p.silent).toMatchObject({ enabled: true, scheduled: true, from: '22:00', to: '09:00', days: EVERY_DAY })
    expect(p.chargePowerW).toBe(300)
    expect(initialProgram('Sierro 1000', { enabled: false, sleepFrom: '22:00', sleepTo: '09:00' }).silent.scheduled).toBe(false)
  })
})

describe('stamping changes', () => {
  it('only new or edited tasks, and an edited Silent schedule, get the save time', () => {
    const t = { ...newTask('charge'), id: 'a', updatedAt: 5 }
    const prev = prog({ tasks: [t], savedAt: 5 })
    prev.silent.updatedAt = 5
    const same = stampChanges(prev, prog({ tasks: [t] }), 99)
    expect(same.tasks[0].updatedAt).toBe(5)
    expect(same.silent.updatedAt).toBe(5)
    const edited = stampChanges(prev, prog({ tasks: [{ ...t, time: '22:00' }, { ...newTask('ac'), id: 'b' }] }), 99)
    expect(edited.tasks.map(x => x.updatedAt)).toEqual([99, 99])
    const silent = stampChanges(prev, prog({ tasks: [t], silent: { ...prev.silent, enabled: true } }), 99)
    expect(silent.silent.updatedAt).toBe(99)
    expect(silent.savedAt).toBe(99)
  })
})

describe('saving a program', () => {
  it('uploads to the relay, keeps a local copy, disarms the old Sleep window and applies the power now', async () => {
    store.set('sierro-sleep-1001', JSON.stringify({ enabled: true, sleepFrom: '22:00', sleepTo: '09:00' }))
    const r = await saveProgram('1001', prog({ chargePowerW: 200 }))
    expect(r).toMatchObject({ ok: true, background: true, applied: true })
    const post = h.fetches.find(f => f.init?.method === 'POST')!
    expect(post.url).toBe('https://relay.test/program')
    const body = JSON.parse(String(post.init!.body))
    expect(body).toMatchObject({ userId: '491513787113766912', deviceId: '1001' })
    expect(body.program.chargePowerW).toBe(200)
    expect((post.init!.headers as Record<string, string>)['IOT-Token']).toBe('ACCESS')
    expect(JSON.parse(store.get('sierro-program-1001')!).chargePowerW).toBe(200)
    expect(JSON.parse(store.get('sierro-sleep-1001')!).enabled).toBe(false)
    expect(h.passthrough.map(frameWatts)).toEqual([200])
  })

  it('a relay refusal is a failed save: nothing stored, nothing written', async () => {
    h.relayReply = { status: 409, body: { code: 1, reason: 'POLLER_SESSION_REQUIRED' } }
    const r = await saveProgram('1001', prog({ tasks: [newTask('charge')] }))
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/Sign in again/)
    expect(store.get('sierro-program-1001')).toBeUndefined()
    expect(h.passthrough).toEqual([])
  })

  it('an invalid program never leaves the phone', async () => {
    const r = await saveProgram('1001', prog({ chargePowerW: 250 }))
    expect(r.ok).toBe(false)
    expect(h.fetches).toEqual([])
  })

  it('an offline device is saved for the relay and not written now', async () => {
    const r = await saveProgram('1001', prog(), { deviceOnline: false })
    expect(r).toMatchObject({ ok: true, applied: null })
    expect(r.detail).toMatch(/offline/)
    expect(h.passthrough).toEqual([])
  })

  it('changing the power while charging is paused writes 0, never a charge', async () => {
    const stop = { ...newTask('charge'), id: 'stop', action: 'stop' as const, time: '00:00' }
    // Saved yesterday, so today's 00:00 occurrence is in effect.
    store.set('sierro-program-1001', JSON.stringify(prog({ tasks: [{ ...stop, updatedAt: Date.now() - 2 * 86_400_000 }] })))
    const r = await saveProgram('1001', prog({ chargePowerW: 300, tasks: [{ ...stop, updatedAt: Date.now() - 2 * 86_400_000 }] }))
    expect(r.ok).toBe(true)
    expect(h.passthrough.map(frameWatts)).toEqual([0])
  })

  it('nothing is saved during a firmware update', async () => {
    h.locked = true
    expect((await saveProgram('1001', prog())).ok).toBe(false)
    expect(h.fetches).toEqual([])
  })
})

describe('loading a program', () => {
  it('prefers the relay\'s copy, then this phone\'s, then a new one', async () => {
    h.relayProgram = prog({ chargePowerW: 100 })
    expect((await loadProgram('1001', 'Sierro 1000'))).toMatchObject({ source: 'relay', program: { chargePowerW: 100 } })
    h.relayProgram = null
    store.clear()
    store.set('iot_user_id', '1'); store.set('iot_access_token', 'A')
    expect((await loadProgram('1001', 'Sierro 1000')).source).toBe('new')
    h.relay = false
    store.set('sierro-program-1001', JSON.stringify(prog({ chargePowerW: 300 })))
    expect((await loadProgram('1001', 'Sierro 1000'))).toMatchObject({ source: 'local', program: { chargePowerW: 300 } })
  })

  it('a program read for a different model keeps a valid power', async () => {
    h.relayProgram = { ...defaultProgram('Sierro 2000', 'UTC'), chargePowerW: 600 }
    const { program } = await loadProgram('1001', 'Sierro 1000')
    expect(program.chargePowerW).toBe(400)
    expect(program.model).toBe('Sierro 1000')
  })
})
