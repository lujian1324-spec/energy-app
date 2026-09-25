import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  lockedAtCreate: null as boolean | null,
  createResult: { ok: true, deviceUpgradeId: 'up-1' } as { ok: boolean; deviceUpgradeId?: string; message?: string },
  details: { status: 'UPGRADING', progress: 30 } as Record<string, unknown> | null,
  device: { id: '1001', name: 'Garage', isOnline: true, softwareVersion: 'V1.0.0', isFirmwareUpgradeEnabled: true, dtuDtuid: 'D1', isUpgrading: false } as Record<string, unknown>,
  firmware: [{ id: 'fw-2', name: 'b.hex', version: 'V1.1.0', notes: 'Fixed X', disabled: false, createdAt: 2 }],
  permission: true as boolean | null,
}))

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
}

vi.mock('../api/firmwareApi', async () => {
  const { isFirmwareUpdateLocked } = await import('../utils/firmwareLock')
  return {
    fetchUpgradePermission: vi.fn(async () => h.permission),
    fetchFirmwareDevice: vi.fn(async () => h.device),
    fetchDeviceFirmware: vi.fn(async () => h.firmware),
    fetchFirmwareDetails: vi.fn(async (f: unknown) => f),
    createFirmwareUpgrade: vi.fn(async () => { h.lockedAtCreate = isFirmwareUpdateLocked(); return h.createResult }),
    fetchUpgradeDetails: vi.fn(async () => h.details),
  }
})

import { useFirmwareUpdateStore, __stopFirmwarePolling } from './firmwareUpdateStore'
import { clearFirmwareSession, isFirmwareUpdateLocked, setFirmwareSession, MAX_LOCK_MS } from '../utils/firmwareLock'

const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  store.clear(); clearFirmwareSession(); __stopFirmwarePolling()
  h.lockedAtCreate = null
  h.createResult = { ok: true, deviceUpgradeId: 'up-1' }
  h.details = { status: 'UPGRADING', progress: 30 }
  h.device = { ...h.device, isOnline: true, softwareVersion: 'V1.0.0', isFirmwareUpgradeEnabled: true }
  h.permission = true
  useFirmwareUpdateStore.setState({ checks: [], checking: false, run: { phase: 'idle' } })
})

describe('firmware update flow (v4.20.0)', () => {
  it('checks a device: newer firmware → update available, with its notes', async () => {
    await useFirmwareUpdateStore.getState().checkAll([{ id: '1001', name: 'Garage' }])
    const [c] = useFirmwareUpdateStore.getState().checks
    expect(c).toMatchObject({ state: 'update-available', currentVersion: 'V1.0.0' })
    expect(c.latest?.notes).toBe('Fixed X')
  })

  it('no permission, disabled on the device, or offline → not offered', async () => {
    h.permission = false
    await useFirmwareUpdateStore.getState().checkAll([{ id: '1001' }])
    expect(useFirmwareUpdateStore.getState().checks[0].state).toBe('not-allowed')
    h.permission = true; h.device = { ...h.device, isOnline: false }
    await useFirmwareUpdateStore.getState().checkAll([{ id: '1001' }])
    expect(useFirmwareUpdateStore.getState().checks[0].state).toBe('offline')
  })

  it('takes the lock BEFORE asking the platform to start, and keeps it while running', async () => {
    await useFirmwareUpdateStore.getState().checkAll([{ id: '1001' }])
    await useFirmwareUpdateStore.getState().start('1001')
    expect(h.lockedAtCreate).toBe(true)
    expect(isFirmwareUpdateLocked()).toBe(true)
    await flush()
    expect(useFirmwareUpdateStore.getState().run).toMatchObject({ phase: 'running', percent: 30 })
    __stopFirmwarePolling()
  })

  it('a refused start releases the lock at once', async () => {
    h.createResult = { ok: false, message: 'illegal argument' }
    await useFirmwareUpdateStore.getState().checkAll([{ id: '1001' }])
    await useFirmwareUpdateStore.getState().start('1001')
    expect(isFirmwareUpdateLocked()).toBe(false)
    expect(useFirmwareUpdateStore.getState().run.phase).toBe('failed')
  })

  it('success releases the lock and the file is not offered again', async () => {
    await useFirmwareUpdateStore.getState().checkAll([{ id: '1001' }])
    h.details = { status: 'SUCCESS' }
    await useFirmwareUpdateStore.getState().start('1001')
    await flush(); await flush()
    expect(useFirmwareUpdateStore.getState().run.phase).toBe('success')
    expect(isFirmwareUpdateLocked()).toBe(false)
    await useFirmwareUpdateStore.getState().checkAll([{ id: '1001' }])
    expect(useFirmwareUpdateStore.getState().checks[0].state).toBe('up-to-date')
  })

  it('an update older than the lock limit resumes as "status unknown", unlocked', () => {
    setFirmwareSession({ deviceId: '1001', deviceName: 'Garage', firmwareId: 'fw-2', version: 'V1.1.0', notes: '', startedAt: Date.now() - MAX_LOCK_MS - 1000 })
    useFirmwareUpdateStore.getState().resume()
    expect(useFirmwareUpdateStore.getState().run.phase).toBe('unknown')
    expect(isFirmwareUpdateLocked()).toBe(false)
  })
})
