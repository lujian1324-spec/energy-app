/**
 * SW-12 — the write half of the shared charge-power scheduler.
 *
 * `useSleepModeScheduler` used to fire the 0x0085 passthrough and record the
 * phase as applied in the same breath: the record happened before the request
 * resolved, and a business refusal (`code !== 0`) was swallowed by an empty
 * catch. A device that was offline for the 23:00 boundary therefore looked, to
 * every later check, as if it had already been told — the online/focus/60s
 * re-checks all short-circuit on "phase already applied", so the window was
 * simply never enforced.
 *
 * This module owns that bookkeeping and nothing else, so it can be tested
 * without React:
 *
 * - a phase counts as applied only after the write comes back a **business**
 *   success (AC-12-1 / AC-12-2);
 * - a failed write stays `pending` and is retried on a bounded backoff ladder,
 *   and the app's own wake signals (online / focus / the 60s tick) may restart
 *   that ladder at most once every `minRetryGapMs` (AC-12-1 / AC-12-3);
 * - exactly one write is ever in flight — a request made while one is running
 *   supersedes the pending one and goes out when the first resolves (AC-12-3);
 * - `setDevice()` bumps an epoch, so a reply for the device the user just
 *   navigated away from can never mark a phase applied for the new one
 *   (AC-12-3).
 */

import type { ChargePhase } from './chargeWindow'

/** Outcome of one 0x0085 write. `ok` is the *business* result, not HTTP. */
export interface ChargePhaseSendResult {
  ok: boolean
  detail?: string
}

export interface ChargePhaseWriterOptions {
  /** Performs the write. Must resolve `ok: false` on a business refusal. */
  send: (deviceId: string, watts: number) => Promise<ChargePhaseSendResult>
  /** Called once a write has actually landed — the only place a phase is recorded. */
  onApplied?: (deviceId: string, phase: ChargePhase, watts: number, label: string) => void
  /** Called on every failed attempt (1-based), for logging / UI. */
  onFailed?: (deviceId: string, phase: ChargePhase, attempt: number, detail?: string) => void
  /** Bounded auto-retry ladder (ms), one entry per retry after the first attempt. */
  backoffMs?: number[]
  /** Floor between externally triggered retries (online / focus / tick). */
  minRetryGapMs?: number
}

interface PendingWrite {
  deviceId: string
  phase: ChargePhase
  watts: number
  label: string
  attempts: number
}

/** 10s → 30s → 60s → 120s, then the ladder stops and wake signals take over. */
const DEFAULT_BACKOFF_MS = [10_000, 30_000, 60_000, 120_000]
const DEFAULT_MIN_RETRY_GAP_MS = 30_000

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export class ChargePhaseWriter {
  private readonly opts: ChargePhaseWriterOptions
  private readonly backoff: number[]
  private readonly minRetryGapMs: number

  private deviceId = ''
  /** Last phase known to be on the device. `watts: null` = restored from storage. */
  private applied: { phase: ChargePhase; watts: number | null } | null = null
  private pending: PendingWrite | null = null
  private inFlight = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private epoch = 0
  private lastAttemptAt = 0

  constructor(opts: ChargePhaseWriterOptions) {
    this.opts = opts
    this.backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS
    this.minRetryGapMs = opts.minRetryGapMs ?? DEFAULT_MIN_RETRY_GAP_MS
  }

  /**
   * Point the writer at a device. Any pending write for the previous device is
   * dropped and any reply still in flight for it is ignored, so switching
   * devices cannot pollute the new one's phase.
   */
  setDevice(deviceId: string, appliedPhase: ChargePhase | null = null): void {
    this.epoch += 1
    this.clearTimer()
    this.pending = null
    this.deviceId = deviceId
    this.applied = appliedPhase ? { phase: appliedPhase, watts: null } : null
    this.lastAttemptAt = 0
  }

  /** The phase the device is known to be in, or null if nothing has landed yet. */
  getAppliedPhase(): ChargePhase | null {
    return this.applied?.phase ?? null
  }

  /** Is a write still owed to the device? */
  hasPending(): boolean {
    return this.pending !== null
  }

  /**
   * Ask for a phase. Repeats of the phase already on the device are dropped
   * (AC-12-2) unless `force` — the user changed a setting or switched modes.
   * A repeat of a phase still pending is rate-limited, not re-queued.
   */
  request(phase: ChargePhase, watts: number, label: string, force = false): void {
    if (!this.deviceId) return

    if (this.pending && !force &&
        this.pending.phase === phase && this.pending.watts === watts) {
      this.retryPending()
      return
    }

    if (!force && !this.pending && this.applied &&
        this.applied.phase === phase &&
        (this.applied.watts === null || this.applied.watts === watts)) {
      return
    }

    this.clearTimer()
    this.pending = { deviceId: this.deviceId, phase, watts, label, attempts: 0 }
    void this.flush()
  }

  /**
   * A wake signal (online / focus / 60s tick) — retry what is still owed. Bounded:
   * at most one attempt per `minRetryGapMs`, and never while one is in flight.
   */
  retryPending(): void {
    if (!this.pending || this.inFlight) return
    if (Date.now() - this.lastAttemptAt < this.minRetryGapMs) return
    this.pending.attempts = 0 // a wake signal restarts the bounded ladder
    this.clearTimer()
    void this.flush()
  }

  /**
   * Drop whatever is still owed and ignore any reply already in flight — the
   * screen went away, or another mode took the device. The writer stays usable
   * afterwards: React StrictMode mounts effects twice in dev, so a cleanup must
   * not leave a permanently dead writer behind.
   */
  cancelPending(): void {
    this.epoch += 1
    this.clearTimer()
    this.pending = null
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private async flush(): Promise<void> {
    if (this.inFlight) return
    const p = this.pending
    if (!p || p.deviceId !== this.deviceId) return

    const epoch = this.epoch
    this.inFlight = true
    this.lastAttemptAt = Date.now()

    let res: ChargePhaseSendResult
    try {
      res = await this.opts.send(p.deviceId, p.watts)
    } catch (e) {
      res = { ok: false, detail: errText(e) }
    }
    this.inFlight = false

    // The user left this device (or the hook unmounted) while we waited — this
    // reply says nothing about whatever device is selected now.
    if (epoch !== this.epoch) {
      // A new device/session may already be queued behind this old request.
      void this.flush()
      return
    }

    if (res.ok) {
      this.applied = { phase: p.phase, watts: p.watts }
      this.opts.onApplied?.(p.deviceId, p.phase, p.watts, p.label)
      if (this.pending === p) this.pending = null
      else void this.flush() // a newer request arrived mid-flight
      return
    }

    this.opts.onFailed?.(p.deviceId, p.phase, p.attempts + 1, res.detail)

    if (this.pending !== p) { void this.flush(); return }

    p.attempts += 1
    const delay = this.backoff[p.attempts - 1]
    if (delay === undefined) return // ladder spent; wake signals may restart it
    this.timer = setTimeout(() => { this.timer = null; void this.flush() }, delay)
  }
}
