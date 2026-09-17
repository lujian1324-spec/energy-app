/**
 * Deleting an account, in the order the backend will actually accept.
 *
 * `/user/logout/account` refuses an account that still owns a station, so the
 * app used to call it, get a rejection, and — on the Settings dialog — sign the
 * user out anyway. They were told their account was deleted when it was not,
 * which is the worst of the three possible outcomes and, for Apple 5.1.1(v) and
 * Play's deletion policy, the one that matters.
 *
 * So the account's contents come down first: devices, then stations, then the
 * account. Devices before stations because a device is bound INTO a station —
 * provisioning creates the station and adds the device to it — and a station
 * that still has one bound is not an empty station.
 *
 * Nothing here is recoverable, so the rules are:
 *
 *  - stop at the first failure, and say which step and which thing failed. Half
 *    a deletion reported as success is how the old behaviour lied;
 *  - never call the account delete unless everything before it succeeded, so a
 *    user whose station would not delete still HAS an account to try again with;
 *  - report progress, because a full account can be a couple of dozen round
 *    trips and a dialog that sits on "Deleting…" reads as hung.
 *
 * The caller is responsible for confirming with the user first, and the wording
 * has to say that devices and stations go too — by the time this runs, it is
 * already too late to ask.
 */
import {
  deleteDevice,
  deleteStation,
  fetchDeviceList,
  fetchStationList,
} from '../api/deviceApi'
import { deleteAccount } from '../api/authApi'
import { isApiSuccess } from '../utils/apiClient'
import type { ApiResponse } from '../utils/apiClient'

export type DeleteAccountStep = 'devices' | 'stations' | 'account'

export interface DeleteAccountProgress {
  step: DeleteAccountStep
  /** How many of this step's items are finished. 0/0 while the step has none. */
  done: number
  total: number
}

export interface DeleteAccountResult {
  ok: boolean
  /** Where it stopped. Only meaningful when `ok` is false. */
  failedAt?: DeleteAccountStep
  /** Something to show the user — the server's words where there are any. */
  message?: string
  /** What actually went, so a partial run can be described honestly. */
  devicesDeleted: number
  stationsDeleted: number
}

/** One page at a time, so an account with more than a page-full is not truncated. */
const PAGE = 50
/** A runaway pager must not loop forever if the backend keeps answering `total`. */
const MAX_PAGES = 40

function reason(res: ApiResponse<unknown> | undefined, fallback: string): string {
  const m = res?.message ?? res?.msg
  return typeof m === 'string' && m.trim() ? m : fallback
}

/** Every id the list endpoint will give us, across pages. */
async function collectIds(
  fetchPage: (page: number, count: number) => Promise<ApiResponse<{ list?: Array<{ id?: string | number }>; total?: number }>>,
): Promise<{ ids: string[]; error?: string }> {
  const ids: string[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchPage(page, PAGE)
    if (!isApiSuccess(res.code)) {
      return { ids, error: reason(res, 'Could not read the account contents.') }
    }
    const list = res.data?.list ?? []
    for (const item of list) {
      // Ids are Java Longs: 18 digits, past what a JS number holds exactly.
      // They arrive as strings and must stay strings all the way to the wire.
      if (item?.id != null) ids.push(String(item.id))
    }
    if (list.length < PAGE) break
  }
  return { ids }
}

export async function deleteAccountAndContents(
  onProgress?: (p: DeleteAccountProgress) => void,
): Promise<DeleteAccountResult> {
  const result: DeleteAccountResult = { ok: false, devicesDeleted: 0, stationsDeleted: 0 }

  // ── Devices ──────────────────────────────────────────────────────────────
  const devices = await collectIds((page, count) => fetchDeviceList(page, count))
  if (devices.error) {
    return { ...result, failedAt: 'devices', message: devices.error }
  }
  onProgress?.({ step: 'devices', done: 0, total: devices.ids.length })
  for (const id of devices.ids) {
    let res: ApiResponse<unknown>
    try {
      res = await deleteDevice(id)
    } catch {
      return { ...result, failedAt: 'devices', message: 'Could not remove a device. Please try again.' }
    }
    if (!isApiSuccess(res.code)) {
      return { ...result, failedAt: 'devices', message: reason(res, 'Could not remove a device.') }
    }
    result.devicesDeleted += 1
    onProgress?.({ step: 'devices', done: result.devicesDeleted, total: devices.ids.length })
  }

  // ── Stations ─────────────────────────────────────────────────────────────
  // Listed AFTER the devices are gone, so the list reflects what is actually
  // left rather than what was there before the run started.
  const stations = await collectIds((page, count) => fetchStationList(page, count))
  if (stations.error) {
    return { ...result, failedAt: 'stations', message: stations.error }
  }
  onProgress?.({ step: 'stations', done: 0, total: stations.ids.length })
  for (const id of stations.ids) {
    let res: ApiResponse<unknown>
    try {
      res = await deleteStation(id)
    } catch {
      return { ...result, failedAt: 'stations', message: 'Could not remove a power station. Please try again.' }
    }
    if (!isApiSuccess(res.code)) {
      return { ...result, failedAt: 'stations', message: reason(res, 'Could not remove a power station.') }
    }
    result.stationsDeleted += 1
    onProgress?.({ step: 'stations', done: result.stationsDeleted, total: stations.ids.length })
  }

  // ── The account itself ───────────────────────────────────────────────────
  onProgress?.({ step: 'account', done: 0, total: 1 })
  let res: ApiResponse<unknown>
  try {
    res = await deleteAccount()
  } catch {
    return { ...result, failedAt: 'account', message: 'Could not delete the account. Please try again.' }
  }
  if (!isApiSuccess(res.code)) {
    return { ...result, failedAt: 'account', message: reason(res, 'Could not delete the account.') }
  }
  onProgress?.({ step: 'account', done: 1, total: 1 })

  result.ok = true
  return result
}

/** "Removing devices (2/5)…" — what the button says while this runs. */
export function deleteAccountProgressLabel(p: DeleteAccountProgress | null): string {
  if (!p) return 'Deleting…'
  if (p.step === 'account') return 'Deleting account…'
  const what = p.step === 'devices' ? 'Removing devices' : 'Removing stations'
  return p.total > 1 ? `${what} (${p.done}/${p.total})…` : `${what}…`
}
