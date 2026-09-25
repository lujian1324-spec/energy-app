/**
 * Model from the device itself (v4.18.0).
 *
 * Register 0x000A (额定交流逆变输出功率, Uint16, 1 W per unit — e.g. 300 =
 * 0x012C) holds the unit's rated AC inverter output power. A Sierro 2000
 * reports 1000; anything else, or no reading at all, is the default Sierro 1000.
 *
 * `modelSource` on the saved rated params says where the model came from, so a
 * later background read may upgrade a default to the Sierro 2000 but never
 * overrides a model the user picked in Device Info.
 */
import { SIERRO_MODELS, type SierroModel } from '../data/deviceModels'
import type { RatedParams } from '../db/powerflowDB'

/** 0x000A value a Sierro 2000 reports (W). */
export const SIERRO_2000_AC_INV_OUTPUT_W = 1000

export type ModelSource = 'detected' | 'default' | 'user'

/** Model for a 0x000A reading: 1000 W → Sierro 2000, else Sierro 1000. */
export function modelFromAcInvOutputPower(watts: number | null | undefined): SierroModel {
  return watts === SIERRO_2000_AC_INV_OUTPUT_W ? 'Sierro 2000' : 'Sierro 1000'
}

/** May a background 0x000A read replace the saved model? Only when the user never chose one. */
export function mayAutoSetModel(saved: { modelSource?: ModelSource } | null | undefined): boolean {
  return saved?.modelSource !== 'user'
}

/**
 * Saved rated params after a 0x000A reading: the measured power always, and the
 * model (with its spec defaults) from the reading unless the user picked one.
 */
export function withDetectedModel(
  saved: RatedParams | null | undefined,
  deviceId: string,
  watts: number,
  now = Date.now(),
): RatedParams {
  const base: RatedParams = { ...(saved ?? {}), deviceId, acInvOutputPower: watts, fetchedAt: now }
  if (!mayAutoSetModel(saved)) return base
  const spec = SIERRO_MODELS[modelFromAcInvOutputPower(watts)]
  return {
    ...base,
    model: spec.model,
    ratedPower: spec.ratedPower,
    ratedChargePower: spec.ratedChargePower,
    batteryType: spec.batteryType,
    batteryHealth: spec.batteryHealth,
    modelSource: 'detected',
  }
}
