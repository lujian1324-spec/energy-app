/**
 * Manual fan speed — one Modbus write to 0x0081 (FAN_CTRL).
 *
 * The register's high byte bit 0 enables the fan and its low byte is the speed,
 * so the value written is `0x01SS`, where SS is the percentage 0–100 in hex
 * (0x00–0x64). It goes out as an FC16 write of one register over
 * `POST /remote/device/passthrough`, which for 23 % is
 *
 *   01 10 00 81 00 01 02 01 17 F9 DF
 *   └┬┘└┬┘└─┬─┘ └─┬─┘ └┬┘ └─┬─┘ └─┬─┘
 *   id FC  addr  count bytes value  CRC (low byte first)
 *
 * The high byte stays 0x01 at 0 % as well: 0 % is "enabled, not spinning", which
 * is what the slider's bottom end says, not "hand control back to firmware".
 *
 * 0x0081 is a control register that the device does not keep across a power
 * cycle, and nothing here reads it back. The last speed this app set is kept per
 * device only so the slider reopens where the user left it.
 */
import { passthroughDevice } from './deviceApi'
import { REG_CTRL, buildWriteMultiFrame, toHexString } from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'

export const FAN_SPEED_MIN = 0
export const FAN_SPEED_MAX = 100

/** High byte of 0x0081: bit 0 = fan enabled. */
const FAN_ENABLE = 0x0100

/** Whole percent in 0–100; anything non-finite reads as 0. */
export function clampFanSpeed(percent: number): number {
  if (!Number.isFinite(percent)) return FAN_SPEED_MIN
  return Math.min(FAN_SPEED_MAX, Math.max(FAN_SPEED_MIN, Math.round(percent)))
}

/** Register value for a speed: enable bit in the high byte, percent in the low. */
export function fanRegisterValue(percent: number): number {
  return FAN_ENABLE | clampFanSpeed(percent)
}

/** The passthrough frame, as the spaced hex string `passthroughDevice` takes. */
export function fanSpeedFrame(percent: number): string {
  return toHexString(buildWriteMultiFrame(REG_CTRL.FAN_CTRL, [fanRegisterValue(percent)]))
}

export interface FanSpeedResult {
  ok: boolean
  /** The percentage actually sent, after clamping. */
  speed: number
  /** Raw server / transport text, for logs only — never rendered as-is. */
  detail?: string
}

/** Write a fan speed to the device. Never throws. */
export async function applyFanSpeed(deviceId: string | number, percent: number): Promise<FanSpeedResult> {
  const speed = clampFanSpeed(percent)
  try {
    const r = await passthroughDevice(String(deviceId), { data: fanSpeedFrame(speed) })
    if (!isApiSuccess(r.code)) {
      return { ok: false, speed, detail: String(r.message ?? r.msg ?? `code ${r.code}`) }
    }
    return { ok: true, speed }
  } catch (e) {
    return { ok: false, speed, detail: e instanceof Error ? e.message : String(e) }
  }
}

const storageKey = (deviceId: string | number) => `sierro-fan-speed-${deviceId}`

/** Last speed this app set for the device, or null if it never set one. */
export function loadFanSpeed(deviceId: string | number): number | null {
  try {
    const raw = localStorage.getItem(storageKey(deviceId))
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? clampFanSpeed(n) : null
  } catch {
    return null
  }
}

export function saveFanSpeed(deviceId: string | number, percent: number): void {
  try {
    localStorage.setItem(storageKey(deviceId), String(clampFanSpeed(percent)))
  } catch { /* storage unavailable — the slider just reopens at its default */ }
}
