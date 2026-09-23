import type { BleWifiAp } from '../types/protocol'

export function wifiRequiresPassword(aps: BleWifiAp[], ssid: string | null): boolean {
  return aps.find(ap => ap.SSID === ssid)?.Secu !== 0
}

export function canConfigureWifi(aps: BleWifiAp[], ssid: string | null, password: string): boolean {
  return !!ssid && (!wifiRequiresPassword(aps, ssid) || password.length > 0)
}
