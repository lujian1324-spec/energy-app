/**
 * Switch a device's AC outlets and find out whether it actually happened.
 *
 * The Device card used to send the 0x0080 write with `noOutput: true` and treat
 * the backend's acceptance as done — which only says the platform took the
 * frame, not that the device switched. Now:
 *
 *  1. the write waits for the device's reply (`noOutput: false`), so a device
 *     that never answers is a failure rather than a silent success;
 *  2. the run-state word is read back (0x0126 bit 2, via READ_ALL_STATUS) a few
 *     times, spaced out, until it shows the requested state. Intermediate reads
 *     are not reported, so a device that takes a second to switch does not make
 *     the switch flicker back and forth;
 *  3. only a read-back that still shows the old state after every attempt counts
 *     as "the device did not switch". A read-back that yields nothing is not
 *     evidence either way: the write is reported sent-but-unconfirmed and the
 *     next regular poll decides.
 */
import { passthroughDevice } from './deviceApi'
import { FRAMES, type LiveStatus } from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'
import { readLivePassthroughOnce } from '../hooks/useLivePassthrough'

export interface AcOutputResult {
  ok: boolean
  /** A read-back showed the requested state. */
  confirmed: boolean
  /** The last useful read-back, for the live layer; absent when none decoded. */
  live?: LiveStatus
  reason?: 'refused' | 'not_switched'
  /** Raw server / transport text, for logs only. */
  detail?: string
}

export interface AcOutputOptions {
  attempts?: number
  spacingMs?: number
  readback?: (deviceId: string) => Promise<LiveStatus | null>
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export async function setAcOutput(
  deviceId: string | number,
  on: boolean,
  {
    attempts = 3,
    spacingMs = 1500,
    readback = readLivePassthroughOnce,
    sleep = defaultSleep,
  }: AcOutputOptions = {},
): Promise<AcOutputResult> {
  const id = String(deviceId)
  try {
    const r = await passthroughDevice(id, { data: on ? FRAMES.AC_POWER_ON : FRAMES.AC_POWER_OFF })
    if (!isApiSuccess(r.code)) {
      return { ok: false, confirmed: false, reason: 'refused', detail: String(r.message ?? r.msg ?? `code ${r.code}`) }
    }
  } catch (e) {
    return { ok: false, confirmed: false, reason: 'refused', detail: e instanceof Error ? e.message : String(e) }
  }

  let last: LiveStatus | undefined
  for (let i = 0; i < attempts; i++) {
    await sleep(spacingMs)
    let live: LiveStatus | null = null
    try { live = await readback(id) } catch { live = null }
    if (!live || live.acOutput === undefined) continue
    last = live
    if (live.acOutput === on) return { ok: true, confirmed: true, live }
  }
  if (last) return { ok: false, confirmed: false, reason: 'not_switched', live: last }
  return { ok: true, confirmed: false }
}
