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
 */

import { useState, useEffect, useRef } from 'react'
import { buildWriteSingleFrame, toHexString, REG_CTRL } from '../protocols/modbusProtocol'
import { passthroughDevice } from '../api/deviceApi'
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

  // Last phase we actually applied (persisted, for catch-up after suspension)
  const lastPhaseRef = useRef<SleepPhase | null>(null)

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

  // ── Send power frame ──────────────────────────────────────────────────────

  async function sendPower(watts: number, label: string) {
    const { deviceId: did } = paramsRef.current
    if (!did) return
    try {
      // 写 AC 实时充电功率寄存器 0x0085（AC_CHARGE_POWER_RT），而非额定 0x0024
      const frame = buildWriteSingleFrame(REG_CTRL.AC_CHARGE_POWER_RT, watts)
      const hexFrame = toHexString(frame)
      await passthroughDevice(did, { data: hexFrame })
      setLastSentAt(new Date())
      setLastSentLabel(label)
    } catch {
      // fire and forget — silently ignore errors
    }
  }

  // ── Persist schedule whenever params change ───────────────────────────────

  useEffect(() => {
    if (!deviceId) return
    saveSchedule(deviceId, { enabled, sleepFrom, sleepTo }, storagePrefix)
  }, [deviceId, enabled, sleepFrom, sleepTo, storagePrefix])

  // ── Load the last applied phase whenever the device changes ───────────────

  useEffect(() => {
    lastPhaseRef.current = deviceId ? loadPhase(deviceId, storagePrefix) : null
  }, [deviceId, storagePrefix])

  // ── Apply immediately on enable / settings change (not just at time edges) ──
  //   切 Sleep Mode 开或改 sleepFrom/sleepTo 时，立刻按当前相位强制下发 0x85：
  //   sleep 相位 → inWindowW（1000:150 / 2000:300），wake 相位 → outWindowW（400 / 800）。
  //   关闭时恢复到 restoreW（正常充电功率）。此前只在时间边界"边沿"发送，导致切换开关
  //   看不到任何写入。
  const prevEnabledRef = useRef<boolean>(false)
  useEffect(() => {
    const cur = paramsRef.current
    const { enabled: en, sleepFrom: sf, sleepTo: st, deviceId: did, storagePrefix: sp } = cur
    if (!did) { prevEnabledRef.current = en; return }
    const p = resolvePowers(cur)
    const wasEnabled = prevEnabledRef.current
    prevEnabledRef.current = en

    if (en) {
      // 开启 / 编辑时段 → 立即应用当前相位对应的充电功率
      const phase = phaseFor(sf, st)
      const w = powerForPhase(p, phase)
      sendPower(w, phase === 'sleep' ? `Sleep (${w}W)` : `Wake (${w}W)`)
      lastPhaseRef.current = phase
      savePhase(did, phase, sp)
    } else if (wasEnabled) {
      // 由开→关 → 恢复正常（restore）充电功率
      sendPower(p.restoreW, `Wake (${p.restoreW}W)`)
      lastPhaseRef.current = 'wake'
      savePhase(did, 'wake', sp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sleepFrom, sleepTo, model, deviceId, inWindowW, outWindowW, storagePrefix])

  // ── Enforce the desired phase; only sends on phase change (edge) ──────────

  useEffect(() => {
    const enforce = () => {
      const cur = paramsRef.current
      const { enabled: en, sleepFrom: sf, sleepTo: st, deviceId: did, storagePrefix: sp } = cur
      if (!en || !did) return

      const phase = phaseFor(sf, st)
      if (phase === lastPhaseRef.current) return  // already in the right state

      const w = powerForPhase(resolvePowers(cur), phase)
      sendPower(w, phase === 'sleep' ? `Sleep (${w}W)` : `Wake (${w}W)`)
      lastPhaseRef.current = phase
      savePhase(did, phase, sp)
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
