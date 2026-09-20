/** Outage ownership gate for the poller (DeviceListItem.ownerUserId etc.). */

/**
 * Outage pushes must only reach users bound to the device.
 * Real /device/list items expose `ownerUserId` (stringified Long); also accept
 * userId / bindUserId / bind.userId / owner.id|userId when present.
 * If no ownership marker exists, allow (listDevices is already token-scoped).
 */
export function deviceBoundToUser(device, userId) {
  const want = String(userId ?? '').trim()
  if (!want) return false
  const markers = [
    device?.ownerUserId,
    device?.userId,
    device?.bindUserId,
    device?.bind?.userId,
    device?.owner?.id,
    device?.owner?.userId,
  ].filter((v) => v != null && String(v).trim() !== '')
  if (markers.length === 0) return true
  return markers.some((v) => String(v) === want)
}
