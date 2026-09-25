import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  relay: true,
  fetches: [] as { url: string; init?: RequestInit }[],
  relayReply: { status: 200, body: { code: 0 } } as { status: number; body: unknown },
  /** Replies for the next POSTs, in order, before `relayReply`. */
  relayQueue: [] as { status: number; body: unknown }[],
  relayProgram: null as unknown,
  passthrough: [] as string[],
  passthroughOk: true,
  locked: false,
  remint: false,
  remints: 0,
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
vi.mock('./authApi', () => ({
  POLLER_REFRESH_PENDING_KEY: 'iot_poller_refresh_pending',
  remintRelaySession: vi.fn(async () => {
    h.remints++
    if (h.remint) store.set('iot_poller_refresh_pending', JSON.stringify({ accessToken: 'RA', refreshToken: 'RR', accessExpiresAt: 1 }))
    return h.remint
  }),
}))

;(globalThis as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
  h.fetches.push({ url, init })
  if (!init || init.method !== 'POST') {
    return { ok: true, status: 200, json: async () => ({ code: 0, data: { program: h.relayProgram } }) }
  }
  const reply = h.relayQueue.shift() ?? h.relayReply
  return { ok: reply.status < 400, status: reply.status, json: async () => reply.body }
})

import { loadLocalProgram, loadProgram, saveProgram } from './programApi'
import {
  EVERY_DAY, defaultProgram, initialProgram, newTask, rebaseProgram, repeatLabel, snapChargePower, stampChanges,
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
  h.relayQueue = []
  h.relayProgram = null
  h.remint = false; h.remints = 0
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
    expect(r.detail).toMatch(/can't run in the background for this account/)
    expect(h.remints).toBe(1)
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

describe('another phone saved in between (v4.23.1)', () => {
  const task = (id: string, time: string, over: Record<string, unknown> = {}) =>
    ({ id, kind: 'charge' as const, action: 'stop' as const, time, days: [...EVERY_DAY], enabled: true, updatedAt: 5, ...over })

  it('re-applies only this phone\'s changes on top of the stored program', () => {
    const base = prog({ savedAt: 10, tasks: [task('a', '07:00'), task('b', '08:00')] })
    // This phone: deleted b, edited a, added c, changed the power.
    const mine = { ...base, chargePowerW: 200, tasks: [task('a', '07:30'), task('c', '09:00')] }
    // The other phone: added d, turned Silent Mode on, kept b.
    const current = prog({ savedAt: 20, silent: { ...base.silent, enabled: true }, tasks: [task('a', '07:00'), task('b', '08:00'), task('d', '10:00')] })
    const merged = rebaseProgram(base, mine, current)
    expect(merged.tasks.map(t => `${t.id}@${t.time}`)).toEqual(['a@07:30', 'd@10:00', 'c@09:00'])
    expect(merged.chargePowerW).toBe(200)
    expect(merged.silent.enabled).toBe(true)
  })

  it('a refused save is merged and sent again based on the stored program', async () => {
    const base = prog({ savedAt: 10 })
    const stored = prog({ savedAt: 20, tasks: [task('d', '10:00', { kind: 'ac', action: 'off' })] })
    h.relayQueue = [{ status: 409, body: { code: 1, reason: 'PROGRAM_CHANGED', data: { program: stored } } }]
    const r = await saveProgram('1001', { ...base, chargePowerW: 200 }, { base })
    expect(r).toMatchObject({ ok: true, background: true })
    expect(r.detail).toMatch(/another phone/)
    const posts = h.fetches.filter(f => f.init?.method === 'POST').map(f => JSON.parse(String(f.init!.body)))
    expect(posts.map(p => p.baseSavedAt)).toEqual([10, 20])
    expect(posts[1].program.chargePowerW).toBe(200)
    expect(posts[1].program.tasks.map((t: { id: string }) => t.id)).toEqual(['d'])
    expect(r.program!.tasks.map(t => t.id)).toEqual(['d'])
    expect(loadLocalProgram('1001')!.tasks.map(t => t.id)).toEqual(['d'])
    expect(h.passthrough.map(frameWatts)).toEqual([200])
  })

  it('a second refusal in a row is a failed save that shows the stored program', async () => {
    const base = prog({ savedAt: 10 })
    const stored = prog({ savedAt: 30, chargePowerW: 100 })
    const refuse = { status: 409, body: { code: 1, reason: 'PROGRAM_CHANGED', data: { program: stored } } }
    h.relayQueue = [refuse, refuse]
    const r = await saveProgram('1001', { ...base, chargePowerW: 200 }, { base })
    expect(r.ok).toBe(false)
    expect(r.current?.chargePowerW).toBe(100)
    expect(r.detail).toMatch(/another phone/)
    expect(h.passthrough).toEqual([])
  })
})

describe('this phone\'s copy belongs to the account that saved it (v4.23.1)', () => {
  it('another account signed in on this phone does not see it', async () => {
    await saveProgram('1001', prog({ chargePowerW: 200 }))
    expect(loadLocalProgram('1001')?.chargePowerW).toBe(200)
    store.set('iot_user_id', '555')
    expect(loadLocalProgram('1001')).toBeNull()
    // A copy from before v4.23.1 carries no owner and is still read.
    store.set('sierro-program-1001', JSON.stringify(prog({ chargePowerW: 300 })))
    expect(loadLocalProgram('1001')?.chargePowerW).toBe(300)
  })
})

describe('a relay with no background session for the account (v4.23.2)', () => {
  it('an untimed save it did not keep is this phone\'s copy, and loads back from it', async () => {
    h.relayReply = { status: 200, body: { code: 0, data: { stored: false } } }
    const r = await saveProgram('1001', prog({ chargePowerW: 200 }))
    expect(r).toMatchObject({ ok: true, background: false, applied: true })
    expect(r.detail).toBeUndefined()
    // The relay answers "none"; the screens still open on what was saved here.
    h.relayProgram = null
    expect(await loadProgram('1001', 'Sierro 1000')).toMatchObject({ source: 'local', program: { chargePowerW: 200 } })
  })

  it('says so when the device did not take it either', async () => {
    h.relayReply = { status: 200, body: { code: 0, data: { stored: false } } }
    const r = await saveProgram('1001', prog({ chargePowerW: 200 }), { deviceOnline: false })
    expect(r.ok).toBe(true)
    expect(r.detail).toMatch(/this phone only/)
  })
})

describe('no background session on the relay (v4.23.3)', () => {
  it('mints one in the background and saves again, with no one asked', async () => {
    h.remint = true
    h.relayQueue = [{ status: 409, body: { code: 1, reason: 'POLLER_SESSION_REQUIRED' } }]
    const r = await saveProgram('1001', prog({ tasks: [newTask('charge')] }))
    expect(r).toMatchObject({ ok: true, background: true })
    const posts = h.fetches.filter(f => f.init?.method === 'POST').map(f => JSON.parse(String(f.init!.body)))
    expect(posts).toHaveLength(2)
    expect(posts[0].refreshToken).toBeUndefined()
    expect(posts[1]).toMatchObject({ accessToken: 'RA', refreshToken: 'RR' })
    // Handed over: the one-time copy is gone from the phone.
    expect(store.get('iot_poller_refresh_pending')).toBeUndefined()
  })
})
