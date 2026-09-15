/**
 * The live layer: Modbus passthrough readings, kept apart from the cloud sample.
 *
 * The Device list used to write its passthrough result straight into the same
 * slot the 60s `/state/latest` poll writes to. Two writers, one slot: every
 * minute the cloud sample overwrote the passthrough numbers, and seconds later
 * passthrough overwrote them back. The battery ring flip-flopped between two
 * measurements of two different ages — the jumping this store exists to end.
 *
 * So the sources are layered instead of mixed, and merged at read time in one
 * fixed order: the cloud sample is the base, BLE overlays it where cloud has no
 * real SOC, and passthrough — the freshest continuously polled read — sits on
 * top. One order, one place, both pages.
 *
 * A device keeps its last good passthrough sample. A failed read does NOT drop
 * the layer back to the cloud value: that fallback is exactly the jump this is
 * here to prevent, and a read that fails usually means the device is out of
 * reach, in which case the cloud sample is no fresher. Whether the device is
 * reachable at all is `isOnline`'s job to show, not the number's.
 */
import { create } from 'zustand'
import type { LiveStatus } from '../protocols/modbusProtocol'
import { mergeCloudWithBle, type CloudLiveSlice } from './bleLiveStatusStore'

export type LivePassthroughEntry = {
  live: LiveStatus
  source: 'passthrough'
  updatedAt: number
}

type LivePassthroughState = {
  byDevice: Record<string, LivePassthroughEntry>
  /** Bumped on every write so components re-render off a plain subscription. */
  epoch: number
}

export const useLivePassthroughStore = create<LivePassthroughState>(() => ({
  byDevice: {},
  epoch: 0,
}))

function norm(id: string | number | null | undefined): string | null {
  if (id == null) return null
  const s = String(id).trim()
  return s.length > 0 ? s : null
}

export function lookupLivePassthrough(deviceId: string | number | null | undefined): LivePassthroughEntry | null {
  const key = norm(deviceId)
  if (!key) return null
  return useLivePassthroughStore.getState().byDevice[key] ?? null
}

export function saveLivePassthrough(
  deviceId: string | number | null | undefined,
  live: LiveStatus | null | undefined,
): boolean {
  const key = norm(deviceId)
  if (!key || !live) return false
  useLivePassthroughStore.setState(s => ({
    byDevice: { ...s.byDevice, [key]: { live, source: 'passthrough', updatedAt: Date.now() } },
    epoch: s.epoch + 1,
  }))
  return true
}

/** Sign-out and demo-mode entry: the next account must not inherit these numbers. */
export function clearLivePassthrough(): void {
  useLivePassthroughStore.setState({ byDevice: {}, epoch: 0 })
}

/** Overlays the six fields a READ_ALL_STATUS frame decodes, all of them or none. */
export function mergeWithPassthrough<T extends CloudLiveSlice>(
  base: T | null | undefined,
  live: LiveStatus | null | undefined,
): CloudLiveSlice & Partial<T> {
  const merged = { ...(base ?? {}) } as CloudLiveSlice & Partial<T>
  if (!live) return merged
  return {
    ...merged,
    remainingBatteryCapacity: live.soc,
    batteryPower: live.batteryPower,
    acPower: live.acPower,
    solarPower: live.solarPower,
    outputPower: live.outputPower,
    batteryTemp: live.batteryTemp,
  }
}

/**
 * The one merge both pages read through: cloud → BLE → passthrough.
 *
 * Every live figure on a screen comes out of a single call to this, so the
 * battery ring and the AC / Solar / Output boxes beside it are always the same
 * sample rather than three fields that happened to be written at three times.
 */
export function resolveLiveValues<T extends CloudLiveSlice>(
  cloud: T | null | undefined,
  ble: LiveStatus | null | undefined,
  passthrough: LiveStatus | null | undefined,
): CloudLiveSlice & Partial<T> {
  const withBle = mergeCloudWithBle(cloud, ble)
  return mergeWithPassthrough(withBle, passthrough) as CloudLiveSlice & Partial<T>
}
