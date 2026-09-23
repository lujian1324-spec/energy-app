/**
 * SW-13 — replay a queued Smart Schedule save when the device comes back.
 *
 * The trigger is the device's cloud `isOnline` going true: the list page
 * reloads it on entry and on pull-to-refresh, and `selectDevice` reloads the
 * device's details on entry, so a device waking up flips a flag this hook
 * already watches. The app's own wake signals (`window online`, `focus`,
 * `visibilitychange`) are checked too — the same signals SW-12's
 * `ChargePhaseWriter` restarts its ladder on. Sharing the trigger is fine and
 * intended; what is *not* shared is the data: that writer owes one register
 * value for the current phase, this owes a whole save (see
 * `utils/smartScheduleQueue`).
 *
 * Bounded like the writer is: one flush in flight per device, at most one
 * attempt per device per `MIN_FLUSH_GAP_MS`, and `flushPendingSmartSchedule`
 * spends a capped ladder before it drops a save the device keeps refusing.
 * Nothing is reported while the device is still unreachable (AC-13-6).
 */

import { useCallback, useEffect, useRef } from 'react'
import { flushPendingSmartSchedule } from '../api/smartScheduleSave'
import type { SmartScheduleResult } from '../api/smartScheduleControl'
import { getScheduleAccount, hasPendingSmartScheduleSave, type PendingSmartSchedule } from '../utils/smartScheduleQueue'
import { readClientOnline, type DeviceOnlineSource } from '../utils/deviceConnectivity'
import { tokenStore } from '../utils/apiClient'
import { toast } from '../components/Toast'
import { backgroundScheduleNotice } from '../utils/scheduleOutcome'

/** Floor between flush attempts for one device, so a flapping device cannot spin. */
export const MIN_FLUSH_GAP_MS = 30_000

/*
 * Module-level, not per-hook: `DevicePage` and `SmartSchedulePage` both mount
 * this, and a route transition has them mounted together for a frame. Two
 * instances flushing the same device at once would send the save twice, so the
 * guard and the 30s floor are shared — the floor deliberately survives the
 * navigation too, for the same reason.
 */
const inFlight = new Set<string>()
const lastAttemptAt = new Map<string, number>()

/** What the hook knows about one device besides its online flag. */
export interface FlushGate {
  hasPending: boolean
  inFlight: boolean
  msSinceLastAttempt: number
}

/**
 * Is this device due a flush right now?
 *
 * Pure, and exported, because it is the whole selection rule: only a device the
 * cloud reports **up** (`undefined` is not a reconnect), only one that is owed a
 * save, only one not already being flushed, and at most once per
 * `MIN_FLUSH_GAP_MS`. Every device is judged on its own row, which is what keeps
 * one device's queue from being flushed under another's name (AC-13-10).
 */
export function shouldFlushDevice(device: DeviceOnlineSource, gate: FlushGate): boolean {
  if (!String(device.id ?? '')) return false
  if (device.isOnline !== true) return false
  if (!gate.hasPending) return false
  if (gate.inFlight) return false
  return gate.msSinceLastAttempt >= MIN_FLUSH_GAP_MS
}

export interface UseSmartScheduleFlushParams {
  /** Devices to watch, with their cloud online flag. */
  devices: DeviceOnlineSource[]
  /** Off while unauthenticated or in demo mode. Defaults to on. */
  active?: boolean
  /**
   * The device was reachable and refused the replayed save. The caller may show
   * its existing failure copy; there is no new copy for this (AC-13-11).
   */
  onRejected?: (
    deviceId: string,
    result: SmartScheduleResult,
    pending: PendingSmartSchedule,
    gaveUp: boolean
  ) => void
  /** A queued save reached the device. For logging. */
  onFlushed?: (deviceId: string, pending: PendingSmartSchedule) => void
}

export function useSmartScheduleFlush(params: UseSmartScheduleFlushParams): void {
  const { devices, active = true } = params

  // Refs, so the callbacks and the listeners never need re-binding on a render.
  const paramsRef = useRef(params)
  paramsRef.current = params

  const run = useCallback(() => {
    const { devices: list, active: on = true, onRejected, onFlushed } = paramsRef.current
    if (!on) return
    const hasSession = !!tokenStore.get()
    const clientOnline = readClientOnline()
    if (!clientOnline || !hasSession) return

    for (const d of list) {
      const id = String(d.id ?? '')
      if (!id) continue
      const account = getScheduleAccount()
      if (!account) continue
      const guardKey = `${account}:${id}`
      const due = shouldFlushDevice(d, {
        hasPending: hasPendingSmartScheduleSave(id),
        inFlight: inFlight.has(guardKey),
        msSinceLastAttempt: Date.now() - (lastAttemptAt.get(guardKey) ?? 0),
      })
      if (!due) continue

      inFlight.add(guardKey)
      lastAttemptAt.set(guardKey, Date.now())
      const connectivity = { clientOnline: true, hasSession: true, deviceOnline: true }
      void flushPendingSmartSchedule(id, {
        connectivity,
        // Re-read at failure time: the phone may have dropped off mid-flush.
        recheck: () => ({
          clientOnline: readClientOnline(),
          hasSession: !!tokenStore.get(),
          deviceOnline: paramsRef.current.devices.find(device => String(device.id) === id)?.isOnline,
        }),
      })
        .then(r => {
          if (getScheduleAccount() !== account) return
          if (r.status === 'flushed' && r.pending) {
            if (r.applied) {
              const notice = backgroundScheduleNotice({ enabling: r.pending.window.enabled, ...r.applied })
              if (notice) toast.warning(notice.title, notice.message)
            }
            onFlushed?.(id, r.pending)
          } else if (r.status === 'rejected' && r.applied && r.pending) {
            console.warn(
              `[SmartSchedule] queued save refused by ${id} (attempt ${r.attempts}):`,
              r.applied.detail
            )
            onRejected?.(id, r.applied, r.pending, !!r.gaveUp)
            if (!onRejected) toast.error('Could not apply the saved schedule', r.gaveUp ? 'Automatic retries stopped. Reopen Smart Schedule and save again.' : 'Open Smart Schedule to check the settings. The device refused the update.')
          }
        })
        .catch(e => { console.warn('[SmartSchedule] flush failed for', id, e) })
        .finally(() => { inFlight.delete(guardKey) })
    }
  }, [])

  /* The set of devices currently reported online — this changes exactly when a
     device reconnects, which is the event we are waiting for. Keyed as a string
     so the 60s list refresh does not re-run the effect on unrelated fields. */
  const onlineKey = devices
    .filter(d => d.isOnline === true)
    .map(d => String(d.id))
    .sort()
    .join(',')

  useEffect(() => {
    if (!active) return
    run()
  }, [onlineKey, active, run])

  useEffect(() => {
    if (!active) return
    const onWake = () => run()
    const timer = window.setInterval(onWake, MIN_FLUSH_GAP_MS)
    window.addEventListener('online', onWake)
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', onWake)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [active, run])
}
