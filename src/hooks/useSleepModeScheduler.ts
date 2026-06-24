/**
 * useSleepModeScheduler
 *
 * State-based scheduler: instead of firing only at the exact minute of
 * sleepFrom / sleepTo, it continuously derives the *desired phase* from the
 * current time relative to the [sleepFrom, sleepTo) window and enforces it.
 *
 * - Inside the window  → "sleep" power (150W Sierro 1000, 300W Sierro 2000)
 * - Outside the window → "wake"  power (400W Sierro 1000, 1000W Sierro 2000)
 *
 * A command is only sent when the desired phase differs from the last applied
 * phase (edge detection), so it doesn't spam every tick. The applied phase is
 * persisted, and the scheduler re-checks on mount and whenever the app becomes
 * visible again — so a transition that happened while the app was suspended is
 * caught up the moment it resumes, rather than missed.
 *
 * Persists schedule to localStorage under key `sierro-sleep-${deviceId}` and the
 * last applied phase under `sierro-sleep-phase-${deviceId}`.
 */

import { useState, useEffect, useRef } from 'react'
import { buildWriteSingleFrame, toHexString, REG_CONFIG } from '../protocols/modbusProtocol'
import { passthroughDevice } from '../api/deviceApi'

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
}

export interface UseSleepModeSchedulerReturn {
  nextEventLabel: string
  nextEventMs: number
  lastSentAt: Date | null
  lastSentLabel: string
}

// ─── Helper: model → power values ────────────────────────────────────────────

function getPowers(model: string): { sleepW: number; wakeW: number } {
  if (model.includes('2000')) return { sleepW: 300, wakeW: 1000 }
  return { sleepW: 150, wakeW: 400 }  // default = Sierro 1000
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

// ─── Helper: "HH:MM" → minutes since midnight ────────────────────────────────

function timeToMin(hhMM: string): number {
  const [h, m] = hhMM.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// ─── Helper: is `nowMin` inside the [from, to) window (handles midnight wrap) ─

function isInSleepWindow(nowMin: number, fromMin: number, toMin: number): boolean {
  if (fromMin === toMin) return false          // empty window → never sleep
  if (fromMin < toMin) return nowMin >= fromMin && nowMin < toMin
  // window crosses midnight, e.g. 22:00 → 09:00
  return nowMin >= fromMin || nowMin < toMin
}

// ─── Helper: desired phase for the current wall-clock time ────────────────────

export type SleepPhase = 'sleep' | 'wake'

function currentPhase(sleepFrom: string, sleepTo: string): SleepPhase {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return isInSleepWindow(nowMin, timeToMin(sleepFrom), timeToMin(sleepTo)) ? 'sleep' : 'wake'
}

// ─── localStorage key ─────────────────────────────────────────────────────────

function storageKey(deviceId: string) {
  return `sierro-sleep-${deviceId}`
}

function phaseKey(deviceId: string) {
  return `sierro-sleep-phase-${deviceId}`
}

function loadPhase(deviceId: string): SleepPhase | null {
  try {
    const v = localStorage.getItem(phaseKey(deviceId))
    return v === 'sleep' || v === 'wake' ? v : null
  } catch {
    return null
  }
}

function savePhase(deviceId: string, phase: SleepPhase): void {
  try {
    localStorage.setItem(phaseKey(deviceId), phase)
  } catch {
    // ignore storage errors
  }
}

export function loadSchedule(deviceId: string): SleepSchedule | null {
  try {
    const raw = localStorage.getItem(storageKey(deviceId))
    if (!raw) return null
    return JSON.parse(raw) as SleepSchedule
  } catch {
    return null
  }
}

export function saveSchedule(deviceId: string, schedule: SleepSchedule): void {
  try {
    localStorage.setItem(storageKey(deviceId), JSON.stringify(schedule))
  } catch {
    // ignore storage errors
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSleepModeScheduler(
  params: UseSleepModeSchedulerParams
): UseSleepModeSchedulerReturn {
  const { enabled, sleepFrom, sleepTo, deviceId, model } = params
  const { sleepW, wakeW } = getPowers(model)

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
    const { enabled: en, sleepFrom: sf, sleepTo: st, model: mdl } = paramsRef.current
    const { sleepW: sw, wakeW: ww } = getPowers(mdl)

    if (!en) {
      setNextEventLabel('—')
      setNextEventMs(0)
      return
    }

    const msSleep = msUntil(sf)
    const msWake  = msUntil(st)

    if (msSleep <= msWake) {
      setNextEventLabel(`Sleep (${sw}W)`)
      setNextEventMs(msSleep)
    } else {
      setNextEventLabel(`Wake (${ww}W)`)
      setNextEventMs(msWake)
    }
  }

  // ── Send power frame ──────────────────────────────────────────────────────

  async function sendPower(watts: number, label: string) {
    const { deviceId: did } = paramsRef.current
    if (!did) return
    try {
      const frame = buildWriteSingleFrame(REG_CONFIG.AC_CHARGE_POWER, watts)
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
    saveSchedule(deviceId, { enabled, sleepFrom, sleepTo })
  }, [deviceId, enabled, sleepFrom, sleepTo])

  // ── Load the last applied phase whenever the device changes ───────────────

  useEffect(() => {
    lastPhaseRef.current = deviceId ? loadPhase(deviceId) : null
  }, [deviceId])

  // ── Enforce the desired phase; only sends on phase change (edge) ──────────

  useEffect(() => {
    const enforce = () => {
      const { enabled: en, sleepFrom: sf, sleepTo: st, model: mdl, deviceId: did } = paramsRef.current
      if (!en || !did) return

      const phase = currentPhase(sf, st)
      if (phase === lastPhaseRef.current) return  // already in the right state

      const { sleepW: sw, wakeW: ww } = getPowers(mdl)
      if (phase === 'sleep') {
        sendPower(sw, `Sleep (${sw}W)`)
      } else {
        sendPower(ww, `Wake (${ww}W)`)
      }
      lastPhaseRef.current = phase
      savePhase(did, phase)
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
  }, [enabled, sleepFrom, sleepTo, sleepW, wakeW])

  return { nextEventLabel, nextEventMs, lastSentAt, lastSentLabel }
}
