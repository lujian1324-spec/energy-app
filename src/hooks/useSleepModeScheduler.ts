/**
 * useSleepModeScheduler
 *
 * State-based scheduler: instead of firing only at the exact minute of
 * sleepFrom / sleepTo, it continuously derives the *desired phase* from the
 * current time relative to the [sleepFrom, sleepTo) window and enforces it.
 *
 * Writes AC realtime charge power (register 0x0085) via passthrough:
 * - Inside the window  → "sleep" power (150W Sierro 1000, 300W Sierro 2000)
 * - Outside the window → "wake"  power (400W Sierro 1000, 800W Sierro 2000)
 *
 * Callers with their own rates pass `powers` instead — Smart Schedule (SW-08)
 * uses the same engine with the user's manual charge power inside the window
 * and 0W outside it (see `src/utils/chargeWindow.ts`).
 *
 * The power is applied immediately whenever Sleep Mode is toggled or the
 * sleepFrom/sleepTo window is edited (not only at the exact boundary minute),
 * and again at each window boundary (edge-detected so it doesn't spam every
 * tick). Turning Sleep Mode off restores the wake power. The applied phase is
 * persisted, and the scheduler re-checks on mount and whenever the app becomes
 * visible again — so a transition that happened while the app was suspended is
 * caught up the moment it resumes, rather than missed.
 *
 * Persists schedule to localStorage under key `${storagePrefix}-${deviceId}` and
 * the last applied phase under `${storagePrefix}-phase-${deviceId}`. The prefix
 * defaults to `sierro-sleep`; Smart Schedule passes its own so the two features
 * never overwrite each other's locally remembered window.
 *
 * SW-12 changes two things about how it writes:
 *
 * 1. The write itself is owned by `ChargePhaseWriter`: a phase is recorded as
 *    applied only once the passthrough comes back a business success, a refused
 *    or thrown write stays pending on a bounded backoff ladder, only one write
 *    is ever in flight, and a reply for a device the user has left is dropped.
 *    Before this, the phase was recorded before the request resolved and
 *    failures were swallowed, so every later re-check said "already applied"
 *    and the window was never enforced.
 * 2. It writes only while its `mode` owns the device (`activeScheduleMode`).
 *    Sleep Mode and Smart Schedule drive the same register and the same relay
 *    slot, so whichever one the user last enabled is the only one that runs.
 */

import { useState, useEffect, useRef } from 'react'
import { buildWriteSingleFrame, toHexString, REG_CTRL } from '../protocols/modbusProtocol'
import { passthroughDevice } from '../api/deviceApi'
import { runScheduleCommand } from '../utils/scheduleCommandQueue'
import { hasPendingSmartScheduleSave } from '../utils/smartScheduleQueue'
import { isApiSuccess } from '../utils/apiClient'
import { ChargePhaseWriter } from '../utils/chargePhaseWriter'
import {
  canExecuteScheduleMode,
  subscribeActiveScheduleMode,
  type ScheduleMode,
} from '../utils/activeScheduleMode'
import {
  getPowers,
  sleepPowers,
  phaseFor,
  powerForPhase,
  type ChargePhase,
  type ChargePowers,
} from '../utils/chargeWindow'

// Re-exported: `bleDirect.ts` and the Sleep Mode UI have imported it from here
// since before the helpers moved to utils/chargeWindow.
export { getPowers }
export type { ChargePowers }

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SleepSchedule {
  enabled: boolean
  sleepFrom: string  // "HH:MM"
  sleepTo: string    // "HH:MM"
}

export interface UseSleepModeSchedulerParams {
  enabled: boolean
  sleepFrom: string
  sleepTo: string
  deviceId: string
  model: string
  /** Charge powers to enforce. Defaults to Sleep Mode's per-model values. */
  powers?: ChargePowers
  /** localStorage namespace for the window + applied phase. */
  storagePrefix?: string
  /**
   * Which feature this instance is. Only the mode that owns the device (see
   * `activeScheduleMode`) writes charge power; the other one goes quiet.
   */
  mode?: ScheduleMode
}

export interface UseSleepModeSchedulerReturn {
  nextEventLabel: string
  nextEventMs: number
  lastSentAt: Date | null
  lastSentLabel: string
}

export type SleepPhase = ChargePhase

export const SLEEP_STORAGE_PREFIX = 'sierro-sleep'

/** The powers a set of params asks for — explicit if given, else Sleep's model defaults. */
function resolvePowers(p: { model: string; powers?: ChargePowers }): ChargePowers {
  return p.powers ?? sleepPowers(p.model)
}

// ─── Helper: ms until a given "HH:MM" time (today or tomorrow) ───────────────

function msUntil(hhMM: string): number {
  const now = new Date()
  const [h, m] = hhMM.split(':').map(Number)
  const target = new Date(now)
  target.setHours(h, m, 0, 0)
  let diff = target.getTime() - now.getTime()
  if (diff <= 0) diff += 24 * 60 * 60 * 1000  // tomorrow
  return diff
}

// ─── localStorage keys ────────────────────────────────────────────────────────

function storageKey(deviceId: string, prefix = SLEEP_STORAGE_PREFIX) {
  return `${prefix}-${deviceId}`
}

function phaseKey(deviceId: string, prefix = SLEEP_STORAGE_PREFIX) {
  return `${prefix}-phase-${deviceId}`
}

function loadPhase(deviceId: string, prefix?: string): SleepPhase | null {
  try {
    const v = localStorage.getItem(phaseKey(deviceId, prefix))
    return v === 'sleep' || v === 'wake' ? v : null
  } catch {
    return null
  }
}

function savePhase(deviceId: string, phase: SleepPhase, prefix?: string): void {
  try {
    localStorage.setItem(phaseKey(deviceId, prefix), phase)
  } catch {
    // ignore storage errors
  }
}

export function loadSchedule(deviceId: string, prefix?: string): SleepSchedule | null {
  try {
    const raw = localStorage.getItem(storageKey(deviceId, prefix))
    if (!raw) return null
    return JSON.parse(raw) as SleepSchedule
  } catch {
    return null
  }
}

export function saveSchedule(deviceId: string, schedule: SleepSchedule, prefix?: string): void {
  try {
    localStorage.setItem(storageKey(deviceId, prefix), JSON.stringify(schedule))
  } catch {
    // ignore storage errors
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSleepModeScheduler(
  params: UseSleepModeSchedulerParams
): UseSleepModeSchedulerReturn {
  const { enabled, sleepFrom, sleepTo, deviceId, model, storagePrefix } = params
  const { inWindowW, outWindowW } = resolvePowers(params)

  const [lastSentAt, setLastSentAt] = useState<Date | null>(null)
  const [lastSentLabel, setLastSentLabel] = useState<string>('')

  // Countdown display state — recomputed every second
  const [nextEventLabel, setNextEventLabel] = useState<string>('')
  const [nextEventMs, setNextEventMs] = useState<number>(0)

  // Ref to avoid stale closures in intervals
  const paramsRef = useRef(params)
  paramsRef.current = params

  // The one thing that writes 0x0085 — see `chargePhaseWriter.ts`. Created once
  // per hook instance so a re-render can never start a second writer.
  const writerRef = useRef<ChargePhaseWriter | null>(null)
  if (writerRef.current === null) {
    writerRef.current = new ChargePhaseWriter({
      send: (did, watts) => runScheduleCommand(did, async () => {
        if (hasPendingSmartScheduleSave(did) || !canExecuteScheduleMode(did, paramsRef.current.mode ?? 'sleep')) {
          return { ok: false, detail: 'Schedule superseded by another mode' }
        }
        // 写 AC 实时充电功率寄存器 0x0085（AC_CHARGE_POWER_RT），而非额定 0x0024
        const frame = toHexString(buildWriteSingleFrame(REG_CTRL.AC_CHARGE_POWER_RT, watts))
        const r = await passthroughDevice(did, { data: frame })
        return isApiSuccess(r?.code)
          ? { ok: true }
          : { ok: false, detail: String(r?.message ?? r?.msg ?? '') }
      }),
      // A phase is recorded — in memory and in storage — only from here, i.e.
      // only once the device actually took the write (AC-12-1 / AC-12-2).
      onApplied: (did, phase, _watts, label) => {
        savePhase(did, phase, paramsRef.current.storagePrefix)
        setLastSentAt(new Date())
        setLastSentLabel(label)
      },
      onFailed: (did, phase, attempt, detail) => {
        console.warn(`[schedule] 0x0085 ${phase} write failed for ${did} (attempt ${attempt}):`, detail)
      },
    })
  }
  const writer = writerRef.current

  // ── Compute next event ────────────────────────────────────────────────────

  function computeNextEvent() {
    const cur = paramsRef.current
    const { enabled: en, sleepFrom: sf, sleepTo: st } = cur
    const { inWindowW: inW, outWindowW: outW } = resolvePowers(cur)

    if (!en) {
      setNextEventLabel('—')
      setNextEventMs(0)
      return
    }

    const msSleep = msUntil(sf)
    const msWake  = msUntil(st)

    if (msSleep <= msWake) {
      setNextEventLabel(`Sleep (${inW}W)`)
      setNextEventMs(msSleep)
    } else {
      setNextEventLabel(`Wake (${outW}W)`)
      setNextEventMs(msWake)
    }
  }

  // ── Ask for a phase ───────────────────────────────────────────────────────

  /** Queue a phase write, unless another mode currently owns this device. */
  function requestPhase(phase: SleepPhase, watts: number, force = false) {
    const { deviceId: did, mode = 'sleep' } = paramsRef.current
    if (!did) return
    if (hasPendingSmartScheduleSave(did)) return
    if (!canExecuteScheduleMode(did, mode)) return
    writer.request(phase, watts, phase === 'sleep' ? `Sleep (${watts}W)` : `Wake (${watts}W)`, force)
  }

  // ── Persist schedule whenever params change ───────────────────────────────

  useEffect(() => {
    if (!deviceId) return
    saveSchedule(deviceId, { enabled, sleepFrom, sleepTo }, storagePrefix)
  }, [deviceId, enabled, sleepFrom, sleepTo, storagePrefix])

  // ── Point the writer at the device (drops anything owed to the previous one) ─

  useEffect(() => {
    writer.setDevice(deviceId, deviceId ? loadPhase(deviceId, storagePrefix) : null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, storagePrefix])

  // ── Stop at once when the other mode claims this device (AC-12-4 / AC-12-5) ─

  useEffect(() => {
    return subscribeActiveScheduleMode((claimedDeviceId, claimedMode) => {
      const { deviceId: did, mode = 'sleep', storagePrefix: sp } = paramsRef.current
      if (!did || claimedDeviceId !== did) return
      if (claimedMode === null || claimedMode === mode) return
      // Cancel anything still owed; the new owner drives the register now.
      writer.setDevice(did, loadPhase(did, sp))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Apply immediately on enable / settings change (not just at time edges) ──
  //   切 Sleep Mode 开或改 sleepFrom/sleepTo 时，立刻按当前相位强制下发 0x85：
  //   sleep 相位 → inWindowW（1000:150 / 2000:300），wake 相位 → outWindowW（400 / 800）。
  //   关闭时恢复到 restoreW（正常充电功率）。此前只在时间边界"边沿"发送，导致切换开关
  //   看不到任何写入。
  const prevEnabledRef = useRef<boolean>(false)
  /** The device this effect has already run for — anything after that is an edit. */
  const appliedForDeviceRef = useRef<string>('')
  useEffect(() => {
    const cur = paramsRef.current
    const { enabled: en, sleepFrom: sf, sleepTo: st, deviceId: did } = cur
    if (!did) { prevEnabledRef.current = en; return }
    const p = resolvePowers(cur)
    const wasEnabled = prevEnabledRef.current
    prevEnabledRef.current = en

    const firstRunForDevice = appliedForDeviceRef.current !== did
    appliedForDeviceRef.current = did

    if (en) {
      // 开启 / 编辑时段 → 立即应用当前相位对应的充电功率
      const phase = phaseFor(sf, st)
      // An edit is forced through even if the device is already in this phase —
      // the watts inside it may be different now. Merely opening the screen is
      // not an edit, so it goes through the ordinary skip-if-already-applied
      // path instead of re-writing the register on every visit (AC-12-2).
      requestPhase(phase, powerForPhase(p, phase), !firstRunForDevice)
    } else if (wasEnabled) {
      // 由开→关 → 恢复正常（restore）充电功率
      requestPhase('wake', p.restoreW, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sleepFrom, sleepTo, model, deviceId, inWindowW, outWindowW, storagePrefix])

  // ── Enforce the desired phase; only sends on phase change (edge) ──────────

  useEffect(() => {
    const enforce = () => {
      const cur = paramsRef.current
      const { enabled: en, sleepFrom: sf, sleepTo: st, deviceId: did } = cur
      if (!en || !did) return

      // The writer drops a repeat of the phase already on the device and
      // rate-limits a retry of one still owed, so this can run every tick.
      const phase = phaseFor(sf, st)
      requestPhase(phase, powerForPhase(resolvePowers(cur), phase))
    }

    // Enforce immediately on mount (catches a transition missed while away)
    enforce()

    // Re-check every 60s …
    const id = setInterval(enforce, 60_000)
    // … and the moment the app is foregrounded / comes back online,
    // so suspended PWAs catch up without waiting for the next tick.
    const onResume = () => enforce()
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)
    window.addEventListener('online', onResume)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
      window.removeEventListener('online', onResume)
      writer.cancelPending()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 1s interval: update countdown display ────────────────────────────────

  useEffect(() => {
    computeNextEvent()
    const id = setInterval(computeNextEvent, 1_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sleepFrom, sleepTo, inWindowW, outWindowW])

  return { nextEventLabel, nextEventMs, lastSentAt, lastSentLabel }
}
