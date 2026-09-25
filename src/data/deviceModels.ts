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

/**
 * Rated battery capacity (Wh) for a model: 1000 Wh Sierro 1000, 2000 Wh Sierro 2000,
 * the Sierro 1000's when the model is unknown (v4.19.0).
 *
 * Capacity is a property of the model, never of register 0x000A: that register is
 * the rated AC inverter output power, and doubling it showed a Sierro 1000 that
 * reports 300 W as 0.6 kWh and threw every "time to full / remaining" estimate off.
 */
export function ratedCapacityWh(model: string | null | undefined): number {
  return String(model ?? '').includes('2000')
    ? SIERRO_MODELS['Sierro 2000'].ratedCapacityWh
    : SIERRO_MODELS['Sierro 1000'].ratedCapacityWh
}

export const SIERRO_MODEL_LIST: ModelSpec[] = [
  SIERRO_MODELS['Sierro 1000'],
  SIERRO_MODELS['Sierro 2000'],
]

/** 按型号生成序列号：<prefix>-<DTUID 末6位 或 随机6位> */
export function generateSerial(spec: ModelSpec, dtuid?: string | null): string {
  const digits = (dtuid ?? '').replace(/\D/g, '')
  const suffix = digits.length >= 6
    ? digits.slice(-6)
    : Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')
  return `${spec.serialPrefix}-${suffix}`
}
