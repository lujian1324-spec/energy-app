/**
 * SW-13 — the one question "is this save offline?" is allowed to be asked from.
 *
 * Saving Smart Schedule while the device was unreachable showed "Could not set
 * the charge power" and threw the settings away: the passthrough came back a
 * business failure, and a business failure is the same shape whether the device
 * is on the far side of a dead link or has genuinely refused the register.
 *
 * The fix is not to read the failure harder. A refusal's wording is not a
 * connection state — `can not set charge power` is exactly what a real firmware
 * reject says too, so classifying on that substring would quietly turn every
 * true reject into a "saved, will send later" and the user would never learn
 * the device said no (AC-13-0a). So offline is decided **only** from connection
 * state we hold on the client, before the request is made:
 *
 * - the phone has no network at all (`navigator.onLine === false`);
 * - there is no session, so there is no channel to the cloud to write over;
 * - the cloud says this device is offline (`isOnline === false`).
 *
 * Anything else — including "we don't know yet" — is treated as connected, so a
 * failure on a device that is marked online stays a failure (AC-13-0b). Erring
 * this way is deliberate: a save wrongly reported as failed is visible and
 * repeatable, a reject wrongly reported as queued is silent.
 *
 * Storage- and React-free, and free of store imports, so the page, the flush
 * hook and the tests all decide with the same function.
 */

/** Connection state as the client knows it at the moment of a save. */
export interface SaveConnectivity {
  /** Does the phone have a network? `navigator.onLine`. */
  clientOnline: boolean
  /** Is there an access token, i.e. a channel to write over? */
  hasSession: boolean
  /** The cloud's `isOnline` for this device; `undefined` when not known yet. */
  deviceOnline?: boolean
}

/** Why a save cannot reach the device right now. */
export type OfflineReason = 'client-offline' | 'no-session' | 'device-offline'

/**
 * The clear offline signal, or null when the save should be attempted.
 *
 * Order matters only for the reason string: the phone's own network is checked
 * first because a device's `isOnline` is a cached cloud value and says nothing
 * once the phone itself is off the network.
 */
export function offlineReason(c: SaveConnectivity): OfflineReason | null {
  if (!c.clientOnline) return 'client-offline'
  if (!c.hasSession) return 'no-session'
  if (c.deviceOnline === false) return 'device-offline'
  return null
}

/** Is a save offline? See `offlineReason` — never decided from response text. */
export function isSaveOffline(c: SaveConnectivity): boolean {
  return offlineReason(c) !== null
}

/** `navigator.onLine`, treating an environment without it as online. */
export function readClientOnline(): boolean {
  try {
    const nav = globalThis.navigator as { onLine?: boolean } | undefined
    return nav?.onLine !== false
  } catch {
    return true
  }
}

/** Minimal shape of the two places a device's online flag is cached. */
export interface DeviceOnlineSource {
  id: string | number
  isOnline?: boolean
}

/**
 * This device's cloud online flag, or `undefined` when nothing holds it.
 *
 * `details` (from `/device/select/one`) wins over the list entry when it is the
 * same device — it is the fresher of the two — and a `details` for some other
 * device is ignored rather than read as this one's state.
 */
export function deviceOnlineFlag(
  deviceId: string | number,
  details: DeviceOnlineSource | null | undefined,
  list: DeviceOnlineSource[] | null | undefined
): boolean | undefined {
  const id = String(deviceId ?? '')
  if (!id) return undefined
  if (details && String(details.id) === id) return details.isOnline
  return (list ?? []).find(d => String(d.id) === id)?.isOnline
}
