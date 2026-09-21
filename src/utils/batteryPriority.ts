/**
 * Battery Priority (Device Info → "Battery Priority") resolution.
 *
 * The backend field is `workMode` and it has THREE values
 * (API_REFERENCE.md: 0=正常 Normal / 1=备份 Backup / 2=节能 Savings), while the
 * sheet only offers two. Two things went wrong because of that gap:
 *
 *  - the page compared the read-back with `val === 0 || val === 1 || val === 2`,
 *    so a device that reports the value as the string `"2"` (the API sends several
 *    of these fields as strings) never synced at all; and
 *  - a device reporting `0` fell through `WORK_MODES.find(...) ?? WORK_MODES[0]`
 *    and rendered as **Backup**, which is exactly what "Savings turns back into
 *    Backup on re-entry" looked like.
 *
 * So: the device wins whenever it reports a value the sheet can express (1 or 2),
 * and when it reports `0` — a mode the sheet has no row for — we fall back to the
 * last priority the device actually accepted, remembered per device.
 */

export type BatteryPriority = 1 | 2

export const PRIORITY_BACKUP: BatteryPriority = 1
export const PRIORITY_SAVINGS: BatteryPriority = 2

const STORAGE_PREFIX = 'sierro-battery-priority-'

/** Coerce a raw `workMode` read-back to 0 | 1 | 2; `null` when it is not one of them. */
export function parseWorkMode(raw: unknown): 0 | 1 | 2 | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'boolean') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return n === 0 || n === 1 || n === 2 ? (n as 0 | 1 | 2) : null
}

/** The read-back as a priority the sheet can show; `null` for Normal (0) / absent. */
export function priorityFromWorkMode(raw: unknown): BatteryPriority | null {
  const mode = parseWorkMode(raw)
  return mode === 1 || mode === 2 ? mode : null
}

// ─── Last value the device confirmed, per device ───

const storageKey = (deviceId: string | number) => `${STORAGE_PREFIX}${deviceId}`

export function loadConfirmedPriority(
  deviceId: string | number | null | undefined
): BatteryPriority | null {
  if (deviceId === null || deviceId === undefined || deviceId === '') return null
  try {
    return priorityFromWorkMode(localStorage.getItem(storageKey(deviceId)))
  } catch {
    return null
  }
}

export function saveConfirmedPriority(
  deviceId: string | number | null | undefined,
  priority: BatteryPriority
): void {
  if (deviceId === null || deviceId === undefined || deviceId === '') return
  try {
    localStorage.setItem(storageKey(deviceId), String(priority))
  } catch {
    /* private mode / quota — the device read-back still drives the row */
  }
}

// ─── What the row should show ───

export interface PriorityResolution {
  priority: BatteryPriority
  /** True when the device itself just told us this — the value worth remembering. */
  confirmed: boolean
}

/**
 * A write is `pending` from the moment it is sent until the device echoes it back:
 * device state keeps reporting the old value for a few polls, and letting those
 * land is what used to snap the row back to Backup a second after Save.
 */
export function resolveBatteryPriority(opts: {
  deviceWorkMode: unknown
  remembered: BatteryPriority | null
  pending: BatteryPriority | null
  current: BatteryPriority
}): PriorityResolution {
  const fromDevice = priorityFromWorkMode(opts.deviceWorkMode)

  if (opts.pending !== null) {
    return { priority: opts.pending, confirmed: fromDevice === opts.pending }
  }
  if (fromDevice !== null) {
    return { priority: fromDevice, confirmed: true }
  }
  return { priority: opts.remembered ?? opts.current, confirmed: false }
}
