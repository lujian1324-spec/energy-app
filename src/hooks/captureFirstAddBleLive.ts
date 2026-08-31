/**
 * After a successful first bind, read LiveStatus via BLE UART passthrough
 * (readLiveStatusBle → CID 30024/30025) while the provision GATT session is
 * still up, and persist it for the Device page overlay.
 *
 * iOS may drop the link when the station restarts onto Wi-Fi; native
 * ensureReady() reconnects if the peripheral id is still known. We retry
 * once after a short pause. Never throws — bind already succeeded.
 */
import { useEffect } from 'react'
import { getProvisionManager } from '../protocols/bleProvision'
import { readLiveStatusBle } from '../protocols/bleDirect'
import { useProvisionStore } from '../stores/provisionStore'
import { useDeviceStore } from '../stores/deviceStore'
import {
  aliasBleLiveFromDevices,
  saveBleLiveStatus,
} from '../stores/bleLiveStatusStore'

function findBoundDevice(dtuid: string | null) {
  if (!dtuid) return undefined
  const devices = useDeviceStore.getState().devices
  return devices.find(d => {
    const dtu = String((d as { dtuDtuid?: string }).dtuDtuid ?? '')
    const serial = String(d.serialNumber ?? '')
    return dtu === dtuid || serial === dtuid || (dtuid.length >= 4 && serial.includes(dtuid))
  })
}

export async function captureFirstAddBleLive(): Promise<boolean> {
  if (useDeviceStore.getState().isDemoMode) return false
  const provision = useProvisionStore.getState()
  if (provision.configResult !== 'success') return false

  let mgr
  try {
    mgr = getProvisionManager()
  } catch {
    return false
  }

  let live = await readLiveStatusBle(mgr)
  if (!live) {
    await new Promise(r => setTimeout(r, 800))
    live = await readLiveStatusBle(mgr)
  }
  if (!live) return false

  const dtuid = provision.dtuid ?? mgr.getDuid()
  let added = findBoundDevice(dtuid)
  if (!added && dtuid) {
    try { await useDeviceStore.getState().loadDevices() } catch { /* list refresh is best-effort */ }
    added = findBoundDevice(dtuid)
  }

  const saved = saveBleLiveStatus({
    deviceId: added?.id,
    dtuDtuid: dtuid,
    serialNumber: added?.serialNumber,
  }, live)
  if (saved) aliasBleLiveFromDevices(useDeviceStore.getState().devices)
  return saved
}

export function useFirstAddBleCapture(): void {
  const devices = useDeviceStore(s => s.devices)
  useEffect(() => {
    aliasBleLiveFromDevices(devices)
  }, [devices])

  useEffect(() => {
    const unsub = useProvisionStore.subscribe((state, prev) => {
      if (state.configResult === 'success' && prev.configResult !== 'success') {
        void captureFirstAddBleLive()
      }
    })
    return unsub
  }, [])
}
