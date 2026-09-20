/**
 * Sierro 设备型号规格 + 默认参数
 * 新增设备时按所选型号自动填充序列号与额定参数，并写入 Device Info。
 */
export type SierroModel = 'Sierro 1000' | 'Sierro 2000'

/** Longest device name the app accepts, wherever one can be typed. */
export const DEVICE_NAME_MAX = 20

export interface ModelSpec {
  model: SierroModel
  ratedPower: number        // 额定功率 W
  ratedCapacityWh: number   // 额定容量 Wh
  ratedChargePower: number  // 额定充电功率 W
  /** = ratedCapacityWh / 2，沿用 Rated Capacity = acInvOutputPower×2 的既有口径 */
  acInvOutputPower: number
  batteryType: string
  batteryHealth: number     // %
  serialPrefix: string
}

export const SIERRO_MODELS: Record<SierroModel, ModelSpec> = {
  'Sierro 1000': {
    model: 'Sierro 1000',
    ratedPower: 500,
    ratedCapacityWh: 1000,
    ratedChargePower: 400,
    acInvOutputPower: 500,
    batteryType: 'LFP',
    batteryHealth: 100,
    serialPrefix: 'SR1000',
  },
  'Sierro 2000': {
    model: 'Sierro 2000',
    ratedPower: 1000,
    ratedCapacityWh: 2000,
    ratedChargePower: 1000,
    acInvOutputPower: 1000,
    batteryType: 'LFP',
    batteryHealth: 100,
    serialPrefix: 'SR2000',
  },
}

export const SIERRO_MODEL_LIST: ModelSpec[] = [
  SIERRO_MODELS['Sierro 1000'],
  SIERRO_MODELS['Sierro 2000'],
]

/** Six digits folded from a string — same input, same output, every time. */
function foldToSixDigits(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h % 1_000_000).toString().padStart(6, '0')
}

/**
 * A stand-in serial for a device whose own serial the platform never reported:
 * `<prefix>-<last 6 digits of the DTUID>`.
 *
 * It must be derived from the unit, never rolled: the suffix used to fall back
 * to `Math.random()` whenever the DTUID held fewer than six digits, so the same
 * unit could answer with a different serial on each call and two units could
 * collide outright. Without a DTUID there is nothing to derive from and this
 * returns an empty string — callers show the device has no serial rather than
 * print one that belongs to no hardware.
 */
export function generateSerial(spec: ModelSpec, dtuid?: string | null): string {
  const id = (dtuid ?? '').trim()
  if (!id) return ''
  const digits = id.replace(/\D/g, '')
  const suffix = digits.length >= 6 ? digits.slice(-6) : foldToSixDigits(id)
  return `${spec.serialPrefix}-${suffix}`
}
