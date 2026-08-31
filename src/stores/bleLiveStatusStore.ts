/**
 * BLE-first live status overlay for newly bound devices.
 *
 * After first add, cloud telemetry is often empty/0% until the station
 * reports. We keep a session-memory LiveStatus snapshot (from BLE UART
 * passthrough CID 30024/30025) keyed by deviceId / DTUID / serial, and
 * merge it into Device page numbers until cloud has a real SOC.
 *
 * Guest/demo devices never write here, so mock data is unchanged.
 */
import { create } from 'zustand'
import type { LiveStatus } from '../protocols/modbusProtocol'

export type BleLiveKeys = {
  deviceId?: string | number | null
  dtuDtuid?: string | null
  serialNumber?: string | null
}

export type BleLiveEntry = {
  live: LiveStatus
  source: 'ble'
  updatedAt: number
  keys: string[]
}

export type CloudLiveSlice = {
  remainingBatteryCapacity?: number | null
  batteryPower?: number | null
  acPower?: number | null
  solarPower?: number | null
  outputPower?: number | null
  batteryTemp?: number | null
}

type BleLiveState = {
  byKey: Record<string, BleLiveEntry>
  epoch: number
}

function norm(v: string | number | null | undefined): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

export function collectBleLiveKeys(keys: BleLiveKeys): string[] {
  const out: string[] = []
  for (const v of [keys.deviceId, keys.dtuDtuid, keys.serialNumber]) {
    const s = norm(v)
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

/** Cloud SOC is real once it is a finite number > 0. First-add 0/empty must not beat BLE. */
export function hasRealCloudSoc(soc: number | null | undefined): boolean {
  return typeof soc === 'number' && Number.isFinite(soc) && soc > 0
}

export function mergeCloudWithBle<T extends CloudLiveSlice>(
  cloud: T | null | undefined,
  ble: LiveStatus | null | undefined,
): CloudLiveSlice & Partial<T> {
  const base = { ...(cloud ?? {}) } as CloudLiveSlice & Partial<T>
  if (!ble) return base
  if (hasRealCloudSoc(base.remainingBatteryCapacity)) return base
  return {
    ...base,
    remainingBatteryCapacity: ble.soc,
    batteryPower: ble.batteryPower,
    acPower: ble.acPower,
    solarPower: ble.solarPower,
    outputPower: ble.outputPower,
    batteryTemp: ble.batteryTemp,
  }
}

export const useBleLiveStatusStore = create<BleLiveState>(() => ({
  byKey: {},
  epoch: 0,
}))

export function lookupBleLiveStatus(keys: BleLiveKeys): BleLiveEntry | null {
  const { byKey } = useBleLiveStatusStore.getState()
  for (const k of collectBleLiveKeys(keys)) {
    const hit = byKey[k]
    if (hit) return hit
  }
  return null
}

export function saveBleLiveStatus(keys: BleLiveKeys, live: LiveStatus | null | undefined): boolean {
  if (!live) return false
  const ids = collectBleLiveKeys(keys)
  if (ids.length === 0) return false
  const entry: BleLiveEntry = {
    live,
    source: 'ble',
    updatedAt: Date.now(),
    keys: ids,
  }
  const byKey = { ...useBleLiveStatusStore.getState().byKey }
  for (const k of ids) byKey[k] = entry
  useBleLiveStatusStore.setState(s => ({ byKey, epoch: s.epoch + 1 }))
  return true
}

export function aliasBleLiveFromDevices(
  devices: Array<{ id?: string | number; dtuDtuid?: string | null; serialNumber?: string | null }>,
): void {
  for (const d of devices) {
    const existing = lookupBleLiveStatus({
      dtuDtuid: d.dtuDtuid,
      serialNumber: d.serialNumber,
    })
    if (!existing || d.id == null) continue
    if (lookupBleLiveStatus({ deviceId: d.id })) continue
    saveBleLiveStatus(
      { deviceId: d.id, dtuDtuid: d.dtuDtuid, serialNumber: d.serialNumber },
      existing.live,
    )
  }
}

export function clearBleLiveStatus(): void {
  useBleLiveStatusStore.setState({ byKey: {}, epoch: 0 })
}

export type LooseStateField = {
  key?: string
  name?: string
  value?: unknown
  valueDisplay?: string
  unit?: string
  valueType?: string
  category?: string
}

function bleField(key: string, value: number, unit: string): LooseStateField {
  const rounded = Math.round(value * 10) / 10
  return {
    key,
    name: key,
    value: rounded,
    valueDisplay: String(rounded),
    unit,
    valueType: 'Float',
    category: 'realtime',
  }
}

/** Inject BLE live into /state/latest fields when cloud SOC is not real. Does not clobber real cloud SOC. */
export function overlayBleOnStateFields(
  keys: BleLiveKeys,
  fields: Record<string, LooseStateField> | undefined | null,
): Record<string, LooseStateField> | undefined | null {
  const ble = lookupBleLiveStatus(keys)?.live
  if (!ble) return fields
  const current = fields ?? {}
  const socRaw = current.remainingBatteryCapacity?.value
  const soc =
    socRaw === undefined || socRaw === null || socRaw === ''
      ? undefined
      : Number(socRaw)
  if (hasRealCloudSoc(soc)) return fields ?? current
  return {
    ...current,
    remainingBatteryCapacity: bleField('remainingBatteryCapacity', ble.soc, '%'),
    batteryPower: bleField('batteryPower', ble.batteryPower, 'W'),
    exchangeChargingPower: current.exchangeChargingPower ?? bleField('exchangeChargingPower', ble.acPower, 'W'),
    generationPower: current.generationPower ?? bleField('generationPower', ble.solarPower, 'W'),
    outputPower: current.outputPower ?? bleField('outputPower', ble.outputPower, 'W'),
    cellTemperature1: current.cellTemperature1 ?? bleField('cellTemperature1', ble.batteryTemp, '°C'),
  }
}
