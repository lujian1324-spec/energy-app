/**
 * Read register 0x000A over the cloud passthrough (v4.18.0) — the add-device
 * step that decides Sierro 1000 vs Sierro 2000 (`utils/ratedModel.ts`).
 *
 * A device that has just joined Wi-Fi may not answer the first passthrough, so
 * the read is tried a few times. `null` means no reading; the caller then keeps
 * the default model.
 */
import { passthroughDevice } from './deviceApi'
import { FRAMES, extractPassthroughRegisters } from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'
import { loadRatedParams, saveRatedParams } from '../db/powerflowDB'
import { withDetectedModel } from '../utils/ratedModel'

/** Offset of 0x000A in READ_ALL_PARAMS (0x0000 × 0x12). */
const AC_INV_OUTPUT_OFFSET = 0x000a

export interface ReadAcInvOptions {
  attempts?: number
  gapMs?: number
  sleep?: (ms: number) => Promise<void>
}

export async function readAcInvOutputPower(
  deviceId: string | number,
  { attempts = 3, gapMs = 2000, sleep = (ms) => new Promise(r => setTimeout(r, ms)) }: ReadAcInvOptions = {},
): Promise<number | null> {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(gapMs)
    try {
      const res = await passthroughDevice(String(deviceId), { data: FRAMES.READ_ALL_PARAMS })
      if (!isApiSuccess(res?.code)) continue
      const registers = extractPassthroughRegisters(res.data, AC_INV_OUTPUT_OFFSET + 1)
      const watts = registers?.[AC_INV_OUTPUT_OFFSET]
      if (typeof watts === 'number' && watts > 0) return watts
    } catch {
      // offline / timeout — try again
    }
  }
  return null
}

/**
 * After a device is added: read 0x000A and save the model it implies
 * (1000 W → Sierro 2000, else Sierro 1000). Runs after the add has succeeded,
 * so a slow or silent device never holds up the success screen; with no reading
 * the default saved at add time stays. Returns the reading.
 */
export async function detectAndSaveModel(deviceId: string, opts?: ReadAcInvOptions): Promise<number | null> {
  const watts = await readAcInvOutputPower(deviceId, opts)
  if (watts === null) return null
  // Re-read what is saved now: the add flow (or the list refresh) may have written since.
  const saved = await loadRatedParams(deviceId)
  await saveRatedParams(withDetectedModel(saved, deviceId, watts))
  return watts
}
