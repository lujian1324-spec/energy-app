/**
 * Firmware update decisions (v4.20.0) — pure, so every rule is unit-tested.
 *
 *  - Which published firmware is the latest for a device (`pickLatestFirmware`).
 *  - Whether the device needs it (`firmwareStatus`): the versions differ, unless
 *    this phone already installed exactly that file on the device (the platform's
 *    `softwareVersion` and a firmware file name need not share a format, and a
 *    successful update must not be offered again and again).
 *  - How far an update has got (`upgradeProgress`) from the task details and the
 *    device record.
 */
import type { FirmwareInfo } from '../api/firmwareApi'

/** Latest usable firmware: newest by creation time, disabled files skipped. */
export function pickLatestFirmware(list: FirmwareInfo[]): FirmwareInfo | null {
  const usable = list.filter(f => !f.disabled)
  if (!usable.length) return null
  return [...usable].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]
}

/** "V1.0.2", "v1.0.2", "fw_1.0.2.hex" → comparable text. */
export function normalizeVersion(v: string | null | undefined): string {
  return String(v ?? '').trim().replace(/\.(hex|bin)$/i, '').replace(/^v(?=\d)/i, '').toLowerCase()
}

export type FirmwareStatus = 'up-to-date' | 'update-available' | 'unavailable'

export function firmwareStatus(
  currentVersion: string | null | undefined,
  latest: FirmwareInfo | null,
  installedFirmwareId?: string | null,
): FirmwareStatus {
  if (!latest) return 'unavailable'
  if (installedFirmwareId && installedFirmwareId === latest.id) return 'up-to-date'
  const cur = normalizeVersion(currentVersion)
  if (cur && (cur === normalizeVersion(latest.version) || cur === normalizeVersion(latest.name))) return 'up-to-date'
  return 'update-available'
}

export type UpgradePhase = 'running' | 'success' | 'failed'

export interface UpgradeProgress {
  phase: UpgradePhase
  /** 0–100 when the platform reports it. */
  percent?: number
}

const SUCCESS = /success|succeed|complete|finish|done|成功|完成/i
const FAILURE = /fail|error|timeout|timed out|abort|cancel|失败|超时|取消/i

/**
 * Progress from the task details (`status` / `progress` in whatever form) and the
 * device record: the task's own verdict wins; otherwise the device no longer
 * upgrading on a new version means it finished.
 */
export function upgradeProgress(
  details: Record<string, unknown> | null,
  device: { isUpgrading?: boolean; softwareVersion?: string | null } | null,
  fromVersion?: string,
): UpgradeProgress {
  const status = details ? [details.status, details.statusDict, details.state, details.stateDict, details.upgradeStatus, details.result]
    .filter(v => v != null).map(String).join(' ') : ''
  let percent: number | undefined
  const p = Number(details?.progress ?? details?.percent ?? details?.rate ?? details?.upgradeProgress)
  if (Number.isFinite(p)) percent = Math.max(0, Math.min(100, p <= 1 && p > 0 ? p * 100 : p))
  if (FAILURE.test(status)) return { phase: 'failed', percent }
  if (SUCCESS.test(status)) return { phase: 'success', percent: 100 }
  if (device && device.isUpgrading === false && fromVersion != null
    && normalizeVersion(device.softwareVersion) !== '' && normalizeVersion(device.softwareVersion) !== normalizeVersion(fromVersion)) {
    return { phase: 'success', percent: 100 }
  }
  return { phase: 'running', percent }
}

const INSTALLED_KEY = (deviceId: string) => `sierro-firmware-installed-${deviceId}`

export function loadInstalledFirmware(deviceId: string): string | null {
  try { return localStorage.getItem(INSTALLED_KEY(deviceId)) } catch { return null }
}
export function saveInstalledFirmware(deviceId: string, firmwareId: string): void {
  try { localStorage.setItem(INSTALLED_KEY(deviceId), firmwareId) } catch { /* ignore */ }
}
