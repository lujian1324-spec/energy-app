/**
 * Solar of Things firmware / upgrade endpoints (v4.20.0) — see docs/siseli-firmware-api.md.
 *
 * Paths come from the console capture; the response SHAPES were not captured
 * (the capture tool saw URLs and methods only), so every reader here accepts the
 * field names the platform uses elsewhere and treats anything else as missing.
 * The one write, `upgrade/create`, has a body that is still a best reading of
 * `DeviceUpgradeCreateDtio`; it is only reachable while FIRMWARE_UPDATE_ENABLED
 * is on (dev / QA builds) until the real request is captured on a test unit.
 */
import { api, isApiSuccess, type ApiResponse } from '../utils/apiClient'
import { fetchDeviceDetails, type DeviceListItem } from './deviceApi'

/** A firmware file as the platform lists it, reduced to what the app shows and sends. */
export interface FirmwareInfo {
  id: string
  name: string
  /** The version to compare with the device's; the file name when there is no version field. */
  version: string
  notes: string
  sizeBytes?: number
  md5?: string
  createdAt?: number
  disabled: boolean
}

type Raw = Record<string, unknown>

const str = (v: unknown): string => (v == null ? '' : String(v).trim())
const num = (v: unknown): number | undefined => {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
const time = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : Date.parse(String(v).replace(' ', 'T'))
  return Number.isFinite(n) ? n : undefined
}

/** One firmware record → FirmwareInfo (null when it has no id). */
export function normalizeFirmware(raw: unknown): FirmwareInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Raw
  const id = str(r.id ?? r.firmwareId ?? r.deviceFirmwareId)
  if (!id) return null
  const name = str(r.name ?? r.firmwareName ?? r.fileName ?? r.originalFileName)
  const statusText = str(r.status ?? r.statusDict ?? r.state).toLowerCase()
  return {
    id,
    name,
    version: str(r.version ?? r.firmwareVersion ?? r.versionName ?? r.versionNumber) || name,
    notes: str(r.description ?? r.remark ?? r.releaseNotes ?? r.upgradeContent),
    sizeBytes: num(r.fileSize ?? r.size),
    md5: str(r.fileMd5 ?? r.md5) || undefined,
    createdAt: time(r.createdAt ?? r.createTime ?? r.creationTime ?? r.gmtCreate),
    disabled: r.isEnabled === false || r.enabled === false || r.isDisabled === true || /disabl|停用|禁用/.test(statusText),
  }
}

/** A list reply in any of the platform's shapes → its records. */
export function listOf(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const d = data as Raw
    for (const k of ['list', 'records', 'rows', 'items']) if (Array.isArray(d[k])) return d[k] as unknown[]
  }
  return []
}

/** Is this account allowed to upgrade firmware? `null` = the platform did not say. */
export async function fetchUpgradePermission(): Promise<boolean | null> {
  try {
    const r = await api.get<unknown>('/device/upgrade/permission/get')
    if (!isApiSuccess(r.code)) return null
    const d = r.data as unknown
    if (typeof d === 'boolean') return d
    if (d && typeof d === 'object') {
      const o = d as Raw
      for (const k of ['enabled', 'isEnabled', 'permission', 'hasPermission', 'allowed', 'isAllowed']) {
        if (typeof o[k] === 'boolean') return o[k] as boolean
      }
    }
    return null
  } catch {
    return null
  }
}

/** The device record: version, `isUpgrading`, `isFirmwareUpgradeEnabled`, `deviceUpgradeId`. */
export async function fetchFirmwareDevice(deviceId: string): Promise<DeviceListItem | null> {
  try {
    const r = await fetchDeviceDetails(deviceId)
    return isApiSuccess(r.code) && r.data ? r.data : null
  } catch {
    return null
  }
}

/** Firmware the manufacturer published for this device (API_REFERENCE §14). */
export async function fetchDeviceFirmware(deviceId: string, dtuId?: string | null): Promise<FirmwareInfo[]> {
  const q = new URLSearchParams({ deviceId: String(deviceId) })
  if (dtuId) q.set('certificateDtuID', String(dtuId))
  const r = await api.post<unknown>(`/device/firmware/list/fromManufacturer?${q}`, { page: 1, count: 50 })
  if (!isApiSuccess(r.code)) throw new Error(r.message || r.msg || 'Firmware list refused')
  return listOf(r.data).map(normalizeFirmware).filter((f): f is FirmwareInfo => f !== null)
}

/** One firmware's details (release notes, size, MD5) — merged over the list record. */
export async function fetchFirmwareDetails(fw: FirmwareInfo): Promise<FirmwareInfo> {
  try {
    const r = await api.get<unknown>(`/device/firmware/details?id=${encodeURIComponent(fw.id)}`)
    if (!isApiSuccess(r.code)) return fw
    const d = normalizeFirmware(r.data)
    if (!d) return fw
    return { ...fw, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== '' && v !== undefined)) } as FirmwareInfo
  } catch {
    return fw
  }
}

/**
 * Start the upgrade. Returns the platform's upgrade task id when it gives one.
 * Body: best reading of `DeviceUpgradeCreateDtio` — to be confirmed (see file header).
 */
export async function createFirmwareUpgrade(deviceId: string, firmwareId: string): Promise<{ ok: boolean; deviceUpgradeId?: string; message?: string }> {
  // Never retried: a second create could start a second flash on the same unit.
  const r: ApiResponse<unknown> = await api.post<unknown>('/device/upgrade/create', {
    deviceId: String(deviceId),
    deviceFirmwareId: String(firmwareId),
  }, undefined, { maxRetries: 0 })
  if (!isApiSuccess(r.code)) return { ok: false, message: r.message || r.msg }
  const d = r.data as unknown
  const id = typeof d === 'string' || typeof d === 'number' ? String(d)
    : d && typeof d === 'object' ? str((d as Raw).id ?? (d as Raw).deviceUpgradeId) : ''
  return { ok: true, deviceUpgradeId: id || undefined }
}

/** An upgrade task's details (status / progress), or null. */
export async function fetchUpgradeDetails(deviceUpgradeId: string): Promise<Raw | null> {
  try {
    const r = await api.get<unknown>(`/device/upgrade/details?id=${encodeURIComponent(deviceUpgradeId)}`)
    return isApiSuccess(r.code) && r.data && typeof r.data === 'object' ? r.data as Raw : null
  } catch {
    return null
  }
}
