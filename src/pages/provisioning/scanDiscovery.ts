import type { ProvisionScanDevice } from '../../protocols/bleProvision'
import { parseBleName } from '../../utils/dtuidParser'
import { formatScanDisplayName } from '../../utils/scanDisplayName'
import type { FoundDevice } from './useProvisionScan'

// Measured from successful scan startup, excluding OS permission prompts.
export const PROVISION_SCAN_MS = 20000

export function scanDeviceToFound(device: ProvisionScanDevice): FoundDevice {
  const parsed = device.name ? parseBleName(device.name) : null
  const serial = parsed?.dtuid ?? ''
  return {
    name: formatScanDisplayName({ serial, deviceId: device.deviceId, name: device.name }),
    serial,
    deviceId: device.deviceId,
    bleName: device.name,
    status: parsed?.status,
  }
}
