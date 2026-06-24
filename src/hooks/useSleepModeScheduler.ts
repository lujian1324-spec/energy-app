/**
 * useSleepModeScheduler
 *
 * Automatically sends AC charge power commands at sleepFrom / sleepTo times.
 * - sleepFrom → sends "sleep" power (150W for Sierro 1000, 300W for Sierro 2000)
 * - sleepTo   → sends "wake"  power (400W for Sierro 1000, 1000W for Sierro 2000)
 *
 * Persists schedule to localStorage under key `sierro-sleep-${deviceId}`.
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

// ─── Helper: current time as "HH:MM" string ──────────────────────────────────

function currentHHMM(): string {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
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

// ─── localStorage key ─────────────────────────────────────────────────────────

function storageKey(deviceId: string) {
  return `sierro-sleep-${deviceId}`
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

  // ── 60s interval: check if it's time to send ─────────────────────────────

  useEffect(() => {
    const tick = () => {
      const { enabled: en, sleepFrom: sf, sleepTo: st, model: mdl } = paramsRef.current
      if (!en) return

      const now = currentHHMM()
      const { sleepW: sw, wakeW: ww } = getPowers(mdl)

      if (now === sf) {
        sendPower(sw, `Sleep (${sw}W)`)
      } else if (now === st) {
        sendPower(ww, `Wake (${ww}W)`)
      }
    }

    // Run once immediately in case we're exactly on the minute
    tick()

    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
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
