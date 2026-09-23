/**
 * SW-12 项 1 — a phase is applied only when the device says so.
 *
 * The bug these tests hold the line on: the scheduler recorded the phase as
 * applied at the moment it fired the write, so one refused 0x0085 made every
 * later online / focus / 60s re-check decide there was nothing to do. A window
 * missed while the device was offline stayed missed for the rest of the day.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ChargePhaseWriter } from './chargePhaseWriter'

const DEVICE_A = '491513787113766912'
const DEVICE_B = '491513787113766913'

/** A `send` whose per-call outcome the test controls, plus a call log. */
function makeSend() {
  const calls: { deviceId: string; watts: number }[] = []
  let resolvers: ((v: { ok: boolean; detail?: string }) => void)[] = []
  let auto: { ok: boolean; detail?: string } | null = { ok: true }
  const send = vi.fn(async (deviceId: string, watts: number) => {
    calls.push({ deviceId, watts })
    if (auto) return auto
    return new Promise<{ ok: boolean; detail?: string }>(res => { resolvers.push(res) })
  })
  return {
    calls,
    send,
    /** Answer every call immediately with this outcome. */
    setAuto(v: { ok: boolean; detail?: string } | null) { auto = v },
    /** Release the oldest manually-held call. */
    release(v: { ok: boolean; detail?: string }) { resolvers.shift()?.(v) },
    get held() { return resolvers.length },
    reset() { calls.length = 0; resolvers = []; auto = { ok: true } },
  }
}

/** Let queued microtasks (the writer's awaits) run. */
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

let s: ReturnType<typeof makeSend>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0, 0))
  s = makeSend()
})
afterEach(() => { vi.useRealTimers() })

const newWriter = (opts: Partial<ConstructorParameters<typeof ChargePhaseWriter>[0]> = {}) =>
  new ChargePhaseWriter({
    send: s.send,
    backoffMs: [10_000, 30_000],
    minRetryGapMs: 30_000,
    ...opts,
  })

describe('AC-12-1 — a failed write is not recorded as applied', () => {
  it('leaves the phase unapplied and keeps it pending', async () => {
    const applied: string[] = []
    const w = newWriter({ onApplied: (_d, phase) => applied.push(phase) })
    w.setDevice(DEVICE_A)
    s.setAuto({ ok: false, detail: 'device offline' })

    w.request('sleep', 150, 'Sleep (150W)')
    await settle()

    expect(s.calls).toHaveLength(1)
    expect(w.getAppliedPhase()).toBeNull()
    expect(w.hasPending()).toBe(true)
    expect(applied).toEqual([])
  })

  it('a business refusal counts as a failure even though nothing threw', async () => {
    const failures: { attempt: number; detail?: string }[] = []
    const w = newWriter({ onFailed: (_d, _p, attempt, detail) => failures.push({ attempt, detail }) })
    w.setDevice(DEVICE_A)
    s.setAuto({ ok: false, detail: 'illegal argument' })

    w.request('sleep', 150, 'Sleep (150W)')
    await settle()

    expect(failures).toEqual([{ attempt: 1, detail: 'illegal argument' }])
    expect(w.getAppliedPhase()).toBeNull()
  })

  it('a thrown write is a failure, not a silent success', async () => {
    const w = new ChargePhaseWriter({
      send: async () => { throw new Error('network down') },
      backoffMs: [],
    })
    w.setDevice(DEVICE_A)
    w.request('wake', 400, 'Wake (400W)')
    await settle()

    expect(w.getAppliedPhase()).toBeNull()
    expect(w.hasPending()).toBe(true)
  })

  it('a wake signal (online/focus/tick) retries the same phase', async () => {
    const w = newWriter()
    w.setDevice(DEVICE_A)
    s.setAuto({ ok: false, detail: 'device offline' })
    w.request('sleep', 150, 'Sleep (150W)')
    await settle()
    expect(s.calls).toHaveLength(1)

    // Ladder spent (2 rungs), then an "online" event comes in.
    await vi.advanceTimersByTimeAsync(10_000); await settle()
    await vi.advanceTimersByTimeAsync(30_000); await settle()
    expect(s.calls).toHaveLength(3)

    s.setAuto({ ok: true })
    await vi.advanceTimersByTimeAsync(30_000)
    w.retryPending()
    await settle()

    expect(s.calls).toHaveLength(4)
    expect(w.getAppliedPhase()).toBe('sleep')
    expect(w.hasPending()).toBe(false)
  })
})

describe('AC-12-2 — a phase is recorded only after a business success', () => {
  it('records the phase and stops repeating it', async () => {
    const applied: { phase: string; watts: number; label: string }[] = []
    const w = newWriter({ onApplied: (_d, phase, watts, label) => applied.push({ phase, watts, label }) })
    w.setDevice(DEVICE_A)

    w.request('sleep', 150, 'Sleep (150W)')
    await settle()
    expect(applied).toEqual([{ phase: 'sleep', watts: 150, label: 'Sleep (150W)' }])

    // The 60s tick asks for the same phase again — nothing goes out.
    w.request('sleep', 150, 'Sleep (150W)')
    w.request('sleep', 150, 'Sleep (150W)')
    await settle()
    expect(s.calls).toHaveLength(1)
  })

  it('a settings change re-sends the same phase (force), a tick does not', async () => {
    const w = newWriter()
    w.setDevice(DEVICE_A)
    w.request('sleep', 150, 'Sleep (150W)')
    await settle()

    w.request('sleep', 500, 'Sleep (500W)', true) // user typed a new charge power
    await settle()
    expect(s.calls.map(c => c.watts)).toEqual([150, 500])

    w.request('sleep', 500, 'Sleep (500W)')
    await settle()
    expect(s.calls).toHaveLength(2)
  })

  it('a phase restored from storage is trusted, so a fresh mount is silent', async () => {
    const w = newWriter()
    w.setDevice(DEVICE_A, 'sleep')
    w.request('sleep', 150, 'Sleep (150W)')
    await settle()
    expect(s.calls).toHaveLength(0)

    // …but the opposite phase at the window boundary still goes out.
    w.request('wake', 400, 'Wake (400W)')
    await settle()
    expect(s.calls).toHaveLength(1)
  })
})

describe('AC-12-3 — bounded retry, no concurrency, no cross-device leakage', () => {
  it('retries on a bounded backoff ladder and then stops on its own', async () => {
    const w = newWriter()
    w.setDevice(DEVICE_A)
    s.setAuto({ ok: false, detail: 'device offline' })
    w.request('sleep', 150, 'Sleep (150W)')
    await settle()
    expect(s.calls).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(10_000); await settle()
    expect(s.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(30_000); await settle()
    expect(s.calls).toHaveLength(3)

    // Ladder spent — no further self-scheduled attempts, however long we wait.
    await vi.advanceTimersByTimeAsync(10 * 60_000); await settle()
    expect(s.calls).toHaveLength(3)
    expect(w.hasPending()).toBe(true)
  })

  it('never has two writes in flight, however often it is poked', async () => {
    const w = newWriter()
    w.setDevice(DEVICE_A)
    s.setAuto(null) // hold every call open

    w.request('sleep', 150, 'Sleep (150W)')
    await settle()
    w.request('wake', 400, 'Wake (400W)')
    w.retryPending()
    w.request('sleep', 150, 'Sleep (150W)')
    await settle()
    expect(s.calls).toHaveLength(1)
    expect(s.held).toBe(1)

    s.release({ ok: true })
    await settle()
    expect(s.calls).toHaveLength(2) // the superseding request, once the first landed
  })

  it('rate-limits wake-signal retries instead of writing on every event', async () => {
    const w = newWriter()
    w.setDevice(DEVICE_A)
    s.setAuto({ ok: false, detail: 'device offline' })
    w.request('sleep', 150, 'Sleep (150W)')
    await settle()
    expect(s.calls).toHaveLength(1)

    // visibilitychange + focus + online, all within a second of each other.
    w.retryPending(); w.retryPending(); w.retryPending()
    await settle()
    expect(s.calls).toHaveLength(1)

    // The ladder's own rungs still fire (10s, then 30s later) …
    await vi.advanceTimersByTimeAsync(40_000); await settle()
    const afterLadder = s.calls.length
    expect(afterLadder).toBe(3)

    // … and a wake signal a full gap after the last attempt buys exactly one more.
    await vi.advanceTimersByTimeAsync(30_000)
    w.retryPending()
    w.retryPending()
    await settle()
    expect(s.calls.length).toBe(afterLadder + 1)
  })

  it('a reply for the previous device never marks a phase on the new one', async () => {
    const applied: { deviceId: string; phase: string }[] = []
    const w = newWriter({ onApplied: (deviceId, phase) => applied.push({ deviceId, phase }) })
    w.setDevice(DEVICE_A)
    s.setAuto(null)
    w.request('sleep', 150, 'Sleep (150W)')
    await settle()
    expect(s.calls[0].deviceId).toBe(DEVICE_A)

    // The user opens another device while A's write is still open.
    w.setDevice(DEVICE_B, null)
    s.release({ ok: true })
    await settle()

    expect(applied).toEqual([])
    expect(w.getAppliedPhase()).toBeNull()
    expect(w.hasPending()).toBe(false)
  })

  it('drops a pending write for a device the user has left', async () => {
    const w = newWriter()
    w.setDevice(DEVICE_A)
    s.setAuto({ ok: false, detail: 'device offline' })
    w.request('sleep', 150, 'Sleep (150W)')
    await settle()

    w.setDevice(DEVICE_B, null)
    s.setAuto({ ok: true })
    await vi.advanceTimersByTimeAsync(5 * 60_000); await settle()

    expect(s.calls.filter(c => c.deviceId === DEVICE_B)).toHaveLength(0)
    expect(s.calls.every(c => c.deviceId === DEVICE_A)).toBe(true)
    expect(s.calls).toHaveLength(1)
  })

  it('flushes the new device immediately after a stale in-flight reply', async () => {
    const applied: string[] = []
    const w = newWriter({ onApplied: did => applied.push(did) })
    w.setDevice(DEVICE_A)
    s.setAuto(null)
    w.request('sleep', 150, 'old')
    await settle()
    w.setDevice(DEVICE_B)
    w.request('wake', 800, 'new')
    expect(s.calls).toHaveLength(1)
    s.release({ ok: true })
    await settle()
    expect(s.calls).toHaveLength(2)
    expect(s.calls[1].deviceId).toBe(DEVICE_B)
    expect(applied).toEqual([])
    s.release({ ok: true })
    await settle()
    expect(applied).toEqual([DEVICE_B])
  })

  it('cancelPending stops the ladder but leaves the writer usable (StrictMode)', async () => {
    const w = newWriter()
    w.setDevice(DEVICE_A)
    s.setAuto({ ok: false, detail: 'device offline' })
    w.request('sleep', 150, 'Sleep (150W)')
    await settle()

    w.cancelPending()
    await vi.advanceTimersByTimeAsync(5 * 60_000); await settle()
    expect(s.calls).toHaveLength(1)

    s.setAuto({ ok: true })
    w.setDevice(DEVICE_A)
    w.request('sleep', 150, 'Sleep (150W)')
    await settle()
    expect(s.calls).toHaveLength(2)
    expect(w.getAppliedPhase()).toBe('sleep')
  })

  it('a phase crossing midnight is applied like any other (23:00→07:00 wrap)', async () => {
    const w = newWriter()
    w.setDevice(DEVICE_A, 'wake')
    // 23:00 boundary: the window opens, the device is asked for `sleep`.
    w.request('sleep', 500, 'Sleep (500W)')
    await settle()
    expect(w.getAppliedPhase()).toBe('sleep')
    // 07:00 boundary the next morning: back out of the window.
    w.request('wake', 0, 'Wake (0W)')
    await settle()
    expect(s.calls.map(c => c.watts)).toEqual([500, 0])
    expect(w.getAppliedPhase()).toBe('wake')
  })
})
