/**
 * Firmware update flow (v4.20.0): check every device, start one update, follow it.
 *
 * Order matters when starting: the lock (utils/firmwareLock) is taken BEFORE
 * `upgrade/create` goes out, so no state poll, AC switch or charge-power write
 * can reach the device once the flash may have begun; a refused create releases
 * it again. Progress is polled every POLL_MS from the task details and the
 * device record, which are the only calls the lock lets through. Success,
 * failure and the MAX_LOCK_MS lapse all release the lock.
 */
import { create } from 'zustand'
import {
  createFirmwareUpgrade, fetchDeviceFirmware, fetchFirmwareDetails, fetchFirmwareDevice,
  fetchUpgradeDetails, fetchUpgradePermission, type FirmwareInfo,
} from '../api/firmwareApi'
import {
  MAX_LOCK_MS, clearFirmwareSession, getFirmwareSession, getStoredFirmwareSession,
  setFirmwareSession, type FirmwareSession,
} from '../utils/firmwareLock'
import {
  firmwareStatus, loadInstalledFirmware, pickLatestFirmware, saveInstalledFirmware, upgradeProgress,
} from '../utils/firmwareUpdate'

export const POLL_MS = 5000

export type DeviceFirmwareState =
  | 'checking' | 'up-to-date' | 'update-available' | 'unavailable' | 'offline' | 'not-allowed' | 'error'

export interface DeviceFirmwareCheck {
  deviceId: string
  name: string
  state: DeviceFirmwareState
  currentVersion: string
  latest?: FirmwareInfo
}

export type RunPhase = 'idle' | 'starting' | 'running' | 'success' | 'failed' | 'unknown'

interface FirmwareUpdateState {
  checks: DeviceFirmwareCheck[]
  checking: boolean
  run: { phase: RunPhase; percent?: number; session?: FirmwareSession; message?: string }
  checkAll: (devices: Array<{ id: string | number; name?: string }>) => Promise<void>
  start: (deviceId: string) => Promise<void>
  resume: () => void
  dismiss: () => void
}

let timer: ReturnType<typeof setInterval> | null = null
let polling = false
function stopPolling() { if (timer) { clearInterval(timer); timer = null } }

export const useFirmwareUpdateStore = create<FirmwareUpdateState>((set, get) => {
  async function pollOnce(): Promise<void> {
    if (polling) return
    const session = getFirmwareSession()
    if (!session) {
      // Lapsed (or cleared elsewhere): stop holding the app, say we could not confirm.
      stopPolling()
      if (getStoredFirmwareSession()) clearFirmwareSession()
      if (get().run.phase === 'running') set({ run: { phase: 'unknown', session: get().run.session } })
      return
    }
    polling = true
    try {
      const details = session.deviceUpgradeId ? await fetchUpgradeDetails(session.deviceUpgradeId) : null
      const device = await fetchFirmwareDevice(session.deviceId)
      const p = upgradeProgress(details, device, session.fromVersion)
      if (p.phase === 'running') {
        set({ run: { phase: 'running', percent: p.percent, session } })
        return
      }
      stopPolling()
      clearFirmwareSession()
      if (p.phase === 'success') saveInstalledFirmware(session.deviceId, session.firmwareId)
      set({ run: { phase: p.phase, percent: p.percent, session } })
    } finally {
      polling = false
    }
  }

  function follow() {
    stopPolling()
    void pollOnce()
    timer = setInterval(() => { void pollOnce() }, POLL_MS)
  }

  return {
    checks: [],
    checking: false,
    run: { phase: 'idle' },

    async checkAll(devices) {
      set({
        checking: true,
        checks: devices.map(d => ({ deviceId: String(d.id), name: d.name ?? String(d.id), state: 'checking', currentVersion: '' })),
      })
      const permission = await fetchUpgradePermission()
      const results = await Promise.all(devices.map(async (d): Promise<DeviceFirmwareCheck> => {
        const deviceId = String(d.id)
        const base = { deviceId, name: d.name ?? deviceId }
        const record = await fetchFirmwareDevice(deviceId)
        if (!record) return { ...base, state: 'error', currentVersion: '' }
        const currentVersion = String(record.softwareVersion ?? '').trim()
        const withName = { ...base, name: record.name || base.name, currentVersion }
        if (permission === false || record.isFirmwareUpgradeEnabled === false) return { ...withName, state: 'not-allowed' }
        try {
          const latest = pickLatestFirmware(await fetchDeviceFirmware(deviceId, record.dtuDtuid))
          const status = firmwareStatus(currentVersion, latest, loadInstalledFirmware(deviceId))
          if (status !== 'update-available' || !latest) return { ...withName, state: status === 'up-to-date' ? 'up-to-date' : 'unavailable', latest: latest ?? undefined }
          const full = await fetchFirmwareDetails(latest)
          return { ...withName, state: record.isOnline ? 'update-available' : 'offline', latest: full }
        } catch {
          return { ...withName, state: 'error' }
        }
      }))
      set({ checks: results, checking: false })
    },

    async start(deviceId) {
      const check = get().checks.find(c => c.deviceId === deviceId)
      if (!check?.latest || check.state !== 'update-available' || getFirmwareSession()) return
      const session: FirmwareSession = {
        deviceId, deviceName: check.name, firmwareId: check.latest.id,
        version: check.latest.version, notes: check.latest.notes,
        fromVersion: check.currentVersion, startedAt: Date.now(),
      }
      // Lock first: nothing else may reach the device once the flash could begin.
      setFirmwareSession(session)
      set({ run: { phase: 'starting', session } })
      let res: Awaited<ReturnType<typeof createFirmwareUpgrade>>
      try {
        res = await createFirmwareUpgrade(deviceId, check.latest.id)
      } catch (e) {
        res = { ok: false, message: e instanceof Error ? e.message : String(e) }
      }
      if (!res.ok) {
        clearFirmwareSession()
        set({ run: { phase: 'failed', session, message: 'The update could not be started. Check the device is online and try again.' } })
        return
      }
      const started = { ...session, deviceUpgradeId: res.deviceUpgradeId }
      setFirmwareSession(started)
      set({ run: { phase: 'running', session: started } })
      follow()
    },

    resume() {
      const stored = getStoredFirmwareSession()
      if (!stored) return
      if (Date.now() - stored.startedAt > MAX_LOCK_MS) {
        clearFirmwareSession()
        set({ run: { phase: 'unknown', session: stored } })
        return
      }
      set({ run: { phase: 'running', session: stored } })
      follow()
    },

    dismiss() {
      if (get().run.phase === 'running' || get().run.phase === 'starting') return
      set({ run: { phase: 'idle' } })
    },
  }
})

/** Test hook. */
export function __stopFirmwarePolling(): void { stopPolling(); polling = false }
