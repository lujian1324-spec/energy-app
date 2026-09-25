import { describe, it, expect, beforeEach, vi } from 'vitest'

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
}

import {
  MAX_LOCK_MS, clearFirmwareSession, getFirmwareSession, isFirmwareTraffic, isFirmwareUpdateLocked,
  setFirmwareSession, subscribeFirmwareLock, type FirmwareSession,
} from './firmwareLock'
import { firmwareStatus, normalizeVersion, pickLatestFirmware, upgradeProgress } from './firmwareUpdate'
import { listOf, normalizeFirmware, type FirmwareInfo } from '../api/firmwareApi'

const session = (over: Partial<FirmwareSession> = {}): FirmwareSession => ({
  deviceId: '1001', deviceName: 'Garage', firmwareId: 'fw-2', version: 'V1.1.0', notes: '', startedAt: 1_000_000, ...over,
})
const fw = (over: Partial<FirmwareInfo>): FirmwareInfo => ({ id: 'x', name: 'x.hex', version: 'x', notes: '', disabled: false, ...over })

beforeEach(() => { store.clear(); clearFirmwareSession() })

describe('firmware lock (v4.20.0)', () => {
  it('lets only firmware, device-record and session calls through', () => {
    for (const p of ['/device/firmware/list/fromManufacturer?deviceId=1', '/device/firmware/details?id=2', '/device/upgrade/create',
      '/device/upgrade/details?id=3', '/device/details?deviceId=1', '/login/refresh/access/token', '/user/select/iotUserInfo',
      '/gather/protocol/manufacturerDeviceUpgradeProtocol/overviews?gatherProtocolId=1']) {
      expect(isFirmwareTraffic(p), p).toBe(true)
    }
    for (const p of ['/device/list', '/remote/device/state/latest?deviceId=1', '/remote/device/passthrough?deviceId=1',
      '/deviceState/simple/attribute/keys/history/v1', '/remote/device/config/write?deviceId=1', '/alarm/query/list', '/device/detailsX']) {
      expect(isFirmwareTraffic(p), p).toBe(false)
    }
  })

  it('locks while a session runs, persists it, and lapses after MAX_LOCK_MS', () => {
    const seen = vi.fn()
    const off = subscribeFirmwareLock(seen)
    setFirmwareSession(session())
    expect(isFirmwareUpdateLocked(1_000_000 + 1000)).toBe(true)
    expect(JSON.parse(store.get('sierro-firmware-update')!).firmwareId).toBe('fw-2')
    expect(isFirmwareUpdateLocked(1_000_000 + MAX_LOCK_MS + 1)).toBe(false)
    clearFirmwareSession()
    expect(getFirmwareSession(1_000_000)).toBeNull()
    expect(seen).toHaveBeenCalledTimes(2)
    off()
  })
})

describe('version rules', () => {
  it('normalises the usual spellings', () => {
    expect(normalizeVersion(' V1.1.0 ')).toBe('1.1.0')
    expect(normalizeVersion('yfk_control_V1.1.0.hex')).toBe('yfk_control_v1.1.0')
    expect(normalizeVersion(null)).toBe('')
  })

  it('picks the newest enabled firmware', () => {
    const list = [fw({ id: 'a', createdAt: 1 }), fw({ id: 'b', createdAt: 3, disabled: true }), fw({ id: 'c', createdAt: 2 })]
    expect(pickLatestFirmware(list)?.id).toBe('c')
    expect(pickLatestFirmware([fw({ disabled: true })])).toBeNull()
  })

  it('offers an update only when the versions differ', () => {
    const latest = fw({ id: 'fw-2', version: 'V1.1.0', name: 'yfk_control_V1.1.0.hex' })
    expect(firmwareStatus('V1.0.0', latest)).toBe('update-available')
    expect(firmwareStatus('v1.1.0', latest)).toBe('up-to-date')
    expect(firmwareStatus('', latest)).toBe('update-available')
    expect(firmwareStatus('V1.0.0', null)).toBe('unavailable')
  })

  it('never offers the file this phone already installed again', () => {
    const latest = fw({ id: 'fw-2', version: 'EOD-580HV01_LV_CN501_1102_CL260725' })
    expect(firmwareStatus('V1.0.0', latest, 'fw-2')).toBe('up-to-date')
    expect(firmwareStatus('V1.0.0', latest, 'fw-1')).toBe('update-available')
  })
})

describe('upgrade progress', () => {
  it('reads the task status and percentage in their usual forms', () => {
    expect(upgradeProgress({ status: 'UPGRADING', progress: 40 }, null)).toEqual({ phase: 'running', percent: 40 })
    expect(upgradeProgress({ progress: 0.5 }, null)).toEqual({ phase: 'running', percent: 50 })
    expect(upgradeProgress({ statusDict: 'Success' }, null).phase).toBe('success')
    expect(upgradeProgress({ status: '升级失败' }, null).phase).toBe('failed')
    expect(upgradeProgress({ stateDict: 'Timeout' }, null).phase).toBe('failed')
  })

  it('without a task verdict, a device back on a new version has finished', () => {
    expect(upgradeProgress(null, { isUpgrading: true, softwareVersion: 'V1.0.0' }, 'V1.0.0').phase).toBe('running')
    expect(upgradeProgress(null, { isUpgrading: false, softwareVersion: 'V1.0.0' }, 'V1.0.0').phase).toBe('running')
    expect(upgradeProgress(null, { isUpgrading: false, softwareVersion: 'V1.1.0' }, 'V1.0.0').phase).toBe('success')
  })

  it('reads "not upgrading" in the forms the platform sends, and 1 on a 0–100 scale as 1 % (v4.23.2)', () => {
    for (const v of [0, '0', 'false']) {
      expect(upgradeProgress(null, { isUpgrading: v, softwareVersion: 'V1.1.0' }, 'V1.0.0').phase).toBe('success')
    }
    expect(upgradeProgress(null, { softwareVersion: 'V1.1.0' }, 'V1.0.0').phase).toBe('running')
    expect(upgradeProgress(null, { isUpgrading: 1, softwareVersion: 'V1.1.0' }, 'V1.0.0').phase).toBe('running')
    expect(upgradeProgress({ progress: 1 }, null).percent).toBe(1)
    expect(upgradeProgress({ progress: 0.25 }, null).percent).toBe(25)
  })
})

describe('firmware records', () => {
  it('normalises the platform fields and list shapes', () => {
    const f = normalizeFirmware({ id: 511784252588920832n.toString(), name: 'a.hex', description: 'Fixed X', fileSize: '147165', createdAt: '2026-09-20 10:00:00', status: 'Disabled' })!
    expect(f).toMatchObject({ id: '511784252588920832', version: 'a.hex', notes: 'Fixed X', sizeBytes: 147165, disabled: true })
    expect(f.createdAt).toBe(Date.parse('2026-09-20T10:00:00'))
    expect(normalizeFirmware({ name: 'no id' })).toBeNull()
    expect(listOf({ records: [1] })).toEqual([1])
    expect(listOf([2])).toEqual([2])
    expect(listOf(null)).toEqual([])
  })
})
