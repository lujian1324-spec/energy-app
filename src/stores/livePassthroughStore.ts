/**
 * The live layer: Modbus passthrough readings, kept apart from the cloud sample.
 *
 * Two writers, one slot was the first jump. The Device list wrote its
 * passthrough result straight into the same slot the 60s `/state/latest` poll
 * replaces wholesale, so every minute the cloud sample overwrote the Modbus
 * numbers and seconds later passthrough overwrote them back. Sources are
 * layered here instead of mixed, and merged at read time in one fixed order:
 * cloud is the base, BLE overlays it where cloud has no real SOC, and
 * passthrough — the freshest continuously polled read — sits on top.
 *
 * Entering a page was the second jump, and it is why this layer outlives the
 * screen and knows whether a read is outstanding.
 *
 * Every screen's cloud cache is component state, rebuilt from empty on each
 * mount, and a cloud GET comes back far sooner than a Modbus round trip through
 * the gateway. So a freshly entered page painted the cloud number first and
 * replaced it with the passthrough number a second or two later — a switch
 * between two sources, seen as a jump, on every entry. Two things stop it:
 *
 *  - the layer survives the mount, and survives a restart (persisted, with an
 *    age bound), so the page paints the passthrough value immediately and the
 *    next read is a step within one measurement rather than a change of source;
 *  - while the first read for a device is still outstanding and there is
 *    nothing to paint, the six live fields read as UNKNOWN rather than as the
 *    cloud value. The ring draws its muted no-data state for that moment and
 *    then shows the real figure once — one transition, and no number that is
 *    about to be contradicted.
 *
 * A device keeps its last good sample. A failed read does NOT drop the layer
 * back to the cloud value: that fallback is the jump this exists to prevent,
 * and a read that fails usually means the device is out of reach, in which case
 * the cloud sample is no fresher. Only a device that has never answered is
 * handed back to cloud, and that is one switch, once.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { LiveStatus } from '../protocols/modbusProtocol'
import { mergeCloudWithBle, type CloudLiveSlice } from './bleLiveStatusStore'

/**
 * How old a carried-over sample may be and still be painted on entry.
 *
 * Long enough to cover leaving the app and coming back, short enough that what
 * is on screen is never from a session the user has forgotten about. Past it
 * the sample is dropped and the screen waits for the first live read.
 */
export const LIVE_SAMPLE_MAX_AGE_MS = 15 * 60_000

/**
 * How long a passthrough sample stays on top of a NEWER cloud sample (v4.21.1).
 *
 * Passthrough is read every 5 s on the monitor (every minute on the list), so a
 * sample this old means the reads have been failing for a while. Keeping it on
 * top of a cloud sample that is newer froze the screen: "Connected", while every
 * figure stayed where the last good read left it for up to LIVE_SAMPLE_MAX_AGE_MS
 * and the 30 s cloud poll landed underneath, unseen.
 */
export const LIVE_SAMPLE_FRESH_MS = 2 * 60_000

/** When each source's sample was taken, so the newest one is shown. */
export interface LiveSampleTimes {
  /** The cloud sample's own time (`/state/latest` `time`). */
  cloudAt?: number | null
  /** When the BLE sample was read. */
  bleAt?: number | null
  now?: number
}

/** ready = a real sample; pending = first read outstanding; failed = it settled with nothing. */
export type LiveStatusPhase = 'pending' | 'ready' | 'failed'

export type LivePassthroughEntry = {
  live: LiveStatus | null
  phase: LiveStatusPhase
  source: 'passthrough'
  updatedAt: number
}

type LivePassthroughState = {
  byDevice: Record<string, LivePassthroughEntry>
  /** Bumped on every write so components re-render off a plain subscription. */
  epoch: number
}

/** Carried-over entries worth painting: a real sample, still young enough. */
function prune(byDevice: Record<string, LivePassthroughEntry> | undefined): Record<string, LivePassthroughEntry> {
  const cutoff = Date.now() - LIVE_SAMPLE_MAX_AGE_MS
  const out: Record<string, LivePassthroughEntry> = {}
  for (const [k, e] of Object.entries(byDevice ?? {})) {
    // A restored 'pending' is a read that died with the last session, not one
    // this session is waiting on, so only real samples are carried over.
    if (e?.live && e.phase === 'ready' && e.updatedAt > cutoff) out[k] = e
  }
  return out
}

export const useLivePassthroughStore = create<LivePassthroughState>()(
  persist(
    () => ({ byDevice: {}, epoch: 0 }),
    {
      name: 'powerflow-live-passthrough',
      storage: createJSONStorage(() => localStorage),
      // Only the samples; `epoch` is this session's render counter.
      partialize: (s) => ({ byDevice: s.byDevice }) as unknown as LivePassthroughState,
      merge: (persisted, current) => ({
        ...current,
        byDevice: prune((persisted as Partial<LivePassthroughState> | undefined)?.byDevice),
      }),
    },
  ),
)

function norm(id: string | number | null | undefined): string | null {
  if (id == null) return null
  const s = String(id).trim()
  return s.length > 0 ? s : null
}

export function lookupLivePassthrough(deviceId: string | number | null | undefined): LivePassthroughEntry | null {
  const key = norm(deviceId)
  if (!key) return null
  const e = useLivePassthroughStore.getState().byDevice[key]
  if (!e) return null
  // A sample that has aged out is no longer worth painting as live. It is not a
  // 'pending' read either, so the screen falls back to cloud rather than waiting.
  if (e.live && Date.now() - e.updatedAt > LIVE_SAMPLE_MAX_AGE_MS) {
    return { ...e, live: null, phase: 'failed' }
  }
  return e
}

function setEntry(key: string, entry: LivePassthroughEntry): void {
  useLivePassthroughStore.setState(s => ({
    byDevice: { ...s.byDevice, [key]: entry },
    epoch: s.epoch + 1,
  }))
}

/**
 * "Nothing has been heard from this device yet, and a read is on its way."
 *
 * Strictly a first-contact state: a device that has already answered, already
 * failed, or is already marked keeps whatever it has. If a later failure could
 * put a device back into 'pending', one that never answers would alternate
 * between the cloud value and the placeholder on every tick — a jump of its
 * own, and a slower one that is harder to spot.
 */
export function markLivePassthroughPending(deviceId: string | number | null | undefined): void {
  const key = norm(deviceId)
  if (!key) return
  if (useLivePassthroughStore.getState().byDevice[key]) return
  setEntry(key, { live: null, phase: 'pending', source: 'passthrough', updatedAt: Date.now() })
}

/**
 * A read came back with nothing. The last good sample is kept — only a device
 * that has never answered is handed back to the cloud value, once.
 */
export function markLivePassthroughFailed(deviceId: string | number | null | undefined): void {
  const key = norm(deviceId)
  if (!key) return
  const prev = useLivePassthroughStore.getState().byDevice[key]
  if (prev?.live) return
  if (prev?.phase === 'failed') return   // already settled; don't churn renders
  setEntry(key, { live: null, phase: 'failed', source: 'passthrough', updatedAt: Date.now() })
}

export function saveLivePassthrough(
  deviceId: string | number | null | undefined,
  live: LiveStatus | null | undefined,
): boolean {
  const key = norm(deviceId)
  if (!key || !live) return false
  setEntry(key, { live, phase: 'ready', source: 'passthrough', updatedAt: Date.now() })
  return true
}

/** Sign-out and demo-mode entry: the next account must not inherit these numbers. */
export function clearLivePassthrough(): void {
  useLivePassthroughStore.setState({ byDevice: {}, epoch: 0 })
}

/** The six fields a READ_ALL_STATUS frame decodes — all of them, together. */
const LIVE_KEYS = [
  'remainingBatteryCapacity', 'batteryPower', 'acPower',
  'solarPower', 'outputPower', 'batteryTemp',
] as const

/** Overlays all six, or none. */
export function mergeWithPassthrough<T extends CloudLiveSlice>(
  base: T | null | undefined,
  live: LiveStatus | null | undefined,
): CloudLiveSlice & Partial<T> {
  const merged = { ...(base ?? {}) } as CloudLiveSlice & Partial<T>
  if (!live) return merged
  return {
    ...merged,
    remainingBatteryCapacity: live.soc,
    batteryTemp: live.batteryTemp,
    ...(live.batteryPower !== undefined ? { batteryPower: live.batteryPower } : {}),
    ...(live.acPower !== undefined ? { acPower: live.acPower } : {}),
    ...(live.solarPower !== undefined ? { solarPower: live.solarPower } : {}),
    ...(live.outputPower !== undefined ? { outputPower: live.outputPower } : {}),
  }
}

/** Drops the six live fields, so the UI reads them as unknown and draws its placeholder. */
function withoutLiveFields<T extends CloudLiveSlice>(base: T | null | undefined): CloudLiveSlice & Partial<T> {
  const out = { ...(base ?? {}) } as Record<string, unknown>
  for (const k of LIVE_KEYS) delete out[k]
  return out as CloudLiveSlice & Partial<T>
}

/**
 * The one merge both pages read through: cloud → BLE → passthrough.
 *
 * Every live figure on a screen comes out of a single call to this, so the
 * battery ring and the AC / Solar / Output boxes beside it are always the same
 * sample rather than fields that each fell back to a different source.
 *
 * While the first read for a device is outstanding the six fields read as
 * unknown instead of as the cloud value, so entering a page does not paint a
 * number a passthrough reply is about to contradict.
 */
export function resolveLiveValues<T extends CloudLiveSlice>(
  cloud: T | null | undefined,
  ble: LiveStatus | null | undefined,
  layer: LivePassthroughEntry | null | undefined,
  times: LiveSampleTimes = {},
): CloudLiveSlice & Partial<T> {
  const now = times.now ?? Date.now()
  // A BLE reading is a one-off (taken while adding the device): past the carry-over
  // age it is no longer what the device is doing.
  const bleLive = ble && !(times.bleAt != null && now - times.bleAt > LIVE_SAMPLE_MAX_AGE_MS) ? ble : null
  const withBle = mergeCloudWithBle(cloud, bleLive)
  if (layer?.live) {
    // The newest sample wins once the passthrough one has gone stale (v4.21.1).
    const stale = now - layer.updatedAt > LIVE_SAMPLE_FRESH_MS
    const cloudNewer = times.cloudAt != null && Number.isFinite(times.cloudAt) && times.cloudAt > layer.updatedAt
    if (!(stale && cloudNewer)) return mergeWithPassthrough(withBle, layer.live) as unknown as CloudLiveSlice & Partial<T>
    return withBle as CloudLiveSlice & Partial<T>
  }
  // Nothing from the device yet. BLE is a direct read and stands in happily;
  // the cloud sample does not, until we know passthrough has nothing coming.
  if (layer?.phase === 'pending' && !bleLive) {
    return withoutLiveFields(withBle) as unknown as CloudLiveSlice & Partial<T>
  }
  return withBle as CloudLiveSlice & Partial<T>
}
