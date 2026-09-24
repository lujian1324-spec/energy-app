/**
 * Switching devices fast: the previous device's details / state can answer
 * after the next device is selected, and must not land on it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  const m = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => m.clear(),
  }
})

const h = vi.hoisted(() => {
  const pending = new Map<string, (v: unknown) => void>()
  return {
    pending,
    details: vi.fn((id: string) => new Promise(resolve => pending.set(`details-${id}`, resolve))),
    state: vi.fn((id: string) => new Promise(resolve => pending.set(`state-${id}`, resolve))),
  }
})

vi.mock('../api/deviceApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/deviceApi')>()),
  fetchDeviceDetails: (id: string) => h.details(String(id)),
  fetchDeviceState: (id: string) => h.state(String(id)),
}))
vi.mock('../db/powerflowDB', () => ({
  saveRatedParams: vi.fn(), loadRatedParams: vi.fn(async () => undefined), clearDeviceHistory: vi.fn(async () => {}),
}))

import { useDeviceStore, stateForDevice } from './deviceStore'

const ok = (data: unknown) => ({ code: 0, data })
const answer = async (key: string, data: unknown) => {
  h.pending.get(key)!(ok(data))
  await new Promise(r => setTimeout(r, 0))
}

beforeEach(() => {
  h.pending.clear()
  useDeviceStore.setState({ selectedDeviceId: null, selectedDeviceDetails: null, selectedDeviceState: null, isDemoMode: false })
})

describe('switching devices fast', () => {
  it('a late details reply for the previous device does not overwrite the current one', async () => {
    const store = useDeviceStore.getState()
    store.selectDevice('A')
    store.selectDevice('B')
    await answer('details-B', { id: 'B', name: 'Cabin' })
    await answer('details-A', { id: 'A', name: 'Garage' })  // arrives last
    expect(useDeviceStore.getState().selectedDeviceDetails).toMatchObject({ id: 'B', name: 'Cabin' })
  })

  it('a late state reply for the previous device is dropped', async () => {
    const store = useDeviceStore.getState()
    store.selectDevice('A')
    store.selectDevice('B')
    await answer('state-B', { deviceId: 'B', fields: { outputPower: { value: '400' } } })
    await answer('state-A', { deviceId: 'A', fields: { outputPower: { value: '120' } } })
    expect(useDeviceStore.getState().selectedDeviceState?.deviceId).toBe('B')
  })
})

describe('stateForDevice', () => {
  const state = { deviceId: 'A', fields: {} } as never
  it('returns the state only for the device it belongs to', () => {
    expect(stateForDevice(state, 'A')).toBe(state)
    expect(stateForDevice(state, 'B')).toBeNull()
    expect(stateForDevice(null, 'A')).toBeNull()
  })
})
