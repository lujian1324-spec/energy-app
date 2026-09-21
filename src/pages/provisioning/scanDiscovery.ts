import type { ProvisionScanDevice } from '../../protocols/bleProvision'
import { parseBleName } from '../../utils/dtuidParser'
import { formatScanDisplayName } from '../../utils/scanDisplayName'
import type { FoundDevice } from './useProvisionScan'

// Measured from successful scan startup, excluding OS permission prompts.
export const PROVISION_SCAN_MS = 30000

// A retry hint, not a distance estimate or a filter on selectable devices.
export const WEAK_SCAN_RSSI_DBM = -85
export const WEAK_SCAN_COPY = 'Only weak Bluetooth signals were detected. Move closer to your Sierro device and search again.'

export function emptyScanMessage(strongestRssi?: number): string {
  return strongestRssi !== undefined && strongestRssi <= WEAK_SCAN_RSSI_DBM
    ? WEAK_SCAN_COPY
    : 'No nearby Sierro devices found.'
}

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
