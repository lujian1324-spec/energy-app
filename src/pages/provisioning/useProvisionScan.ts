/**
 * BLE scan handler for provisioning.
 */
import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { toast } from '../../components/Toast'
import type { ProvisionStoreState, ProvisionStep } from '../../stores/provisionStore'
import { getProvisionManager, destroyProvisionManager, stopProvisionScan, supportsDeviceListScan } from '../../protocols/bleProvision'
import { isDtuid, parseBleName } from '../../utils/dtuidParser'
import { formatScanDisplayName } from '../../utils/scanDisplayName'
import { classifyBleError } from '../../utils/permissions'
import { DISCONNECT_COPY } from './useProvisionBind'
import { scanDeviceToFound, PROVISION_SCAN_MS, emptyScanMessage } from './scanDiscovery'
import type { FailKind } from '../../utils/provisionFailCopy'
import { toUserFacingError } from '../../utils/uiCopy'

export type FoundDevice = {
  name: string
  serial: string
  deviceId?: string
  bleName?: string
  status?: number
}

export function displayTitleFromDtuid(dtuid: string): string {
  return formatScanDisplayName({ serial: dtuid })
}

export function useProvisionScan(opts: {
  store: ProvisionStoreState
  setFoundDevices: Dispatch<SetStateAction<FoundDevice[]>>
  setFailKind: Dispatch<SetStateAction<FailKind>>
  setBleStatus: Dispatch<SetStateAction<'checking' | 'no_permission' | 'bt_off' | 'ready'>>
  wifiConfiguredRef: MutableRefObject<boolean>
  lastBleRef: MutableRefObject<{ deviceId?: string; bleName?: string }>
  bleGoneRef: MutableRefObject<boolean>
  provisionStepRef: MutableRefObject<ProvisionStep>
  reconnectingRef: MutableRefObject<boolean>
  configGuardRef: MutableRefObject<boolean>
  scanStopRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
}) {
  const {
    store, setFoundDevices, setFailKind, setBleStatus,
    wifiConfiguredRef, lastBleRef, bleGoneRef, provisionStepRef,
    reconnectingRef, configGuardRef, scanStopRef,
  } = opts

  const generation = useRef(0)
  const starting = useRef(false)
  const cancelScan = useCallback(() => {
    generation.current++
    if (scanStopRef.current) clearTimeout(scanStopRef.current)
    scanStopRef.current = null
    stopProvisionScan()
  }, [scanStopRef])
  useEffect(() => cancelScan, [cancelScan])

  const handleScan = useCallback(async () => {
    if (starting.current) return
    starting.current = true
    cancelScan()
    const run = generation.current
    const isCurrent = () => run === generation.current
    store.setIsOperating(true)
    store.setErrorMessage(null)
    store.addLog('Starting BLE scan...')
    setFoundDevices([])
    wifiConfiguredRef.current = false
    setFailKind(null)
    await destroyProvisionManager()
    if (!isCurrent()) { starting.current = false; return }
    const manager = getProvisionManager({
      onLog: (msg) => store.addLog(msg),
      onDisconnected: () => {
        store.addLog('BLE disconnected')
        /*
         * APP-20260923-001: once the device has taken the Wi-Fi details it leaves
         * Bluetooth for Wi-Fi — the drop is the hand-off, not a fault. Nothing
         * after that point (naming, icon, the cloud bind) needs the link, yet the
         * step still read 'configuring', so a drop ran three reconnects and then
         * failed the add with "The device disconnected during setup" over a
         * pairing that had succeeded — sometimes mid-bind, before the bind's own
         * result arrived.
         */
        if (wifiConfiguredRef.current) {
          bleGoneRef.current = true
          store.addLog('BLE dropped after Wi-Fi was configured (device switched to Wi-Fi)')
          return
        }
        const step = provisionStepRef.current
        if (step === 'configuring') {
          if (reconnectingRef.current) return
          reconnectingRef.current = true
          void (async () => {
            const mgr = getProvisionManager()
            const { deviceId, bleName } = lastBleRef.current
            if (deviceId && typeof mgr.connectTo === 'function') {
              for (let i = 1; i <= 3; i++) {
                await new Promise(r => setTimeout(r, 700))
                try {
                  await mgr.connectTo(deviceId, bleName)
                  store.addLog(`Reconnected after disconnect (attempt ${i})`)
                  reconnectingRef.current = false
                  return
                } catch (e) {
                  store.addLog(`Reconnect attempt ${i} failed: ${e}`)
                }
              }
            } else {
              await new Promise(r => setTimeout(r, 1500))
              reconnectingRef.current = false
              return
            }
            if (provisionStepRef.current === 'result') { reconnectingRef.current = false; return }
            bleGoneRef.current = true
            setFailKind('disconnect')
            store.setConfigResult('fail')
            store.setErrorMessage(DISCONNECT_COPY)
            store.setStep('result')
            store.setIsOperating(false)
            configGuardRef.current = false
            reconnectingRef.current = false
          })()
          return
        }
        bleGoneRef.current = true
        if (step === 'result') return
        setFailKind('disconnect')
        store.setErrorMessage(DISCONNECT_COPY)
      },
    })

    if (supportsDeviceListScan()) {
      const seen = new Set<string>()
      let strongestRssi: number | undefined
      try {
        await manager.scanDevices((d) => {
          if (!isCurrent()) return
          const next = scanDeviceToFound(d)
          seen.add(d.deviceId)
          store.clearScanFailures()
          setFoundDevices(prev => {
            const idx = prev.findIndex(x => x.deviceId === d.deviceId)
            if (idx >= 0) {
              const copy = [...prev]
              // A later nameless packet must not erase a complete ID.
              copy[idx] = next.serial || !prev[idx].serial ? next : prev[idx]
              return copy.sort((a, b) => (a.status ?? 99) - (b.status ?? 99))
            }
            return [...prev, next].sort((a, b) => (a.status ?? 99) - (b.status ?? 99))
          })
        }, rssi => {
          if (isCurrent()) strongestRssi = Math.max(strongestRssi ?? -Infinity, rssi)
        })
        if (!isCurrent()) return
        store.addLog(`[ble-scan] ${JSON.stringify({ event: 'window', timeoutMs: PROVISION_SCAN_MS })}`)
        scanStopRef.current = setTimeout(async () => {
          if (!isCurrent()) return
          scanStopRef.current = null
          generation.current++
          await manager.stopScan()
          if (generation.current !== run + 1) return
          store.addLog(`[ble-scan] ${JSON.stringify({ event: 'timeout', resultCount: seen.size, timeoutMs: PROVISION_SCAN_MS, strongestRssi })}`)
          store.setIsOperating(false)
          if (seen.size === 0) {
            store.recordScanFailure()
            store.setErrorMessage(emptyScanMessage(strongestRssi))
          }
        }, PROVISION_SCAN_MS)
      } catch (err) {
        if (!isCurrent()) return
        await manager.stopScan()
        if (!isCurrent()) return
        if (scanStopRef.current) { clearTimeout(scanStopRef.current); scanStopRef.current = null }
        const { kind, msg } = classifyBleError(err)
        store.recordScanFailure()
        store.addLog(`Scan failed: ${msg}`)
        store.setIsOperating(false)
        if (/location services are off/i.test(msg)) {
          store.setErrorMessage(msg)
        }
        else if (kind === 'permission') { setBleStatus('no_permission') }
        else if (kind === 'bluetooth_off') {
          if (/location/i.test(msg)) toast.info('Turn on Location (system setting) so Android can scan for Bluetooth devices, then try again.')
          setBleStatus('bt_off')
        }
        else { store.setErrorMessage(msg); toast.error(msg) }
      } finally {
        starting.current = false
      }
      return
    }

    starting.current = false
    try {
      await manager.connect()
      if (!isCurrent()) return
      const rawName = manager.deviceName ?? 'Sierro Device'
      const parsed = parseBleName(rawName)
      const duid = manager.getDuid() || parsed?.dtuid
      if (!duid) {
        store.recordScanFailure()
        const msg = "Couldn't read this device's ID. Make sure it's a Sierro device and try again."
        store.setErrorMessage(msg); toast.error(msg)
        return
      }
      const display = isDtuid(duid) ? displayTitleFromDtuid(duid) : formatScanDisplayName({ serial: duid, name: rawName })
      lastBleRef.current = { deviceId: undefined, bleName: rawName }
      bleGoneRef.current = false
      store.setDeviceInfo(display, duid)
      setFoundDevices([{ name: display, serial: duid, bleName: rawName, status: parsed?.status }])
      store.clearScanFailures()
    } catch (err) {
      if (!isCurrent()) return
      store.recordScanFailure()
      const msg = toUserFacingError(err, 'Scan failed')
      store.setErrorMessage(msg)
      store.addLog(`Scan failed: ${err}`)
      toast.error(msg)
    } finally {
      if (isCurrent()) store.setIsOperating(false)
    }
  }, [cancelScan, store, setFoundDevices, setFailKind, setBleStatus, wifiConfiguredRef, lastBleRef, bleGoneRef, provisionStepRef, reconnectingRef, configGuardRef, scanStopRef])

  return { handleScan, cancelScan }
}
