/**
 * BLE scan handler for provisioning.
 */
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { toast } from '../../components/Toast'
import type { ProvisionStoreState, ProvisionStep } from '../../stores/provisionStore'
import { getProvisionManager, destroyProvisionManager, supportsDeviceListScan } from '../../protocols/bleProvision'
import { isDtuid, parseBleName } from '../../utils/dtuidParser'
import { classifyBleError } from '../../utils/permissions'
import { DISCONNECT_COPY } from './useProvisionBind'
import type { FailKind } from '../../utils/provisionFailCopy'

export type FoundDevice = {
  name: string
  serial: string
  deviceId?: string
  bleName?: string
  status?: number
}

export function displayTitleFromDtuid(dtuid: string): string {
  return `Sierro · ${dtuid.slice(-4)}`
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

  const handleScan = useCallback(async () => {
    store.setIsOperating(true)
    store.setErrorMessage(null)
    store.addLog('Starting BLE scan...')
    setFoundDevices([])
    wifiConfiguredRef.current = false
    setFailKind(null)
    destroyProvisionManager()
    const manager = getProvisionManager({
      onLog: (msg) => store.addLog(msg),
      onDisconnected: () => {
        store.addLog('BLE disconnected')
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
      if (scanStopRef.current) clearTimeout(scanStopRef.current)
      scanStopRef.current = setTimeout(async () => {
        try { await manager.stopScan() } catch { /* ignore */ }
        store.setIsOperating(false)
        if (seen.size === 0) {
          store.setErrorMessage('No nearby Sierro devices found. Make sure the device is powered on and close by.')
        }
      }, 10000)
      try {
        await manager.scanDevices((d) => {
          const parsed = d.name ? parseBleName(d.name) : null
          if (!parsed) return
          const dtuid = parsed.dtuid
          seen.add(d.deviceId)
          setFoundDevices(prev => {
            const idx = prev.findIndex(x => x.deviceId === d.deviceId)
            const next: FoundDevice = {
              name: displayTitleFromDtuid(dtuid),
              serial: dtuid,
              deviceId: d.deviceId,
              bleName: d.name,
              status: parsed.status,
            }
            if (idx >= 0) {
              const copy = [...prev]
              copy[idx] = next
              return copy.sort((a, b) => (a.status ?? 99) - (b.status ?? 99))
            }
            return [...prev, next].sort((a, b) => (a.status ?? 99) - (b.status ?? 99))
          })
        })
      } catch (err) {
        if (scanStopRef.current) { clearTimeout(scanStopRef.current); scanStopRef.current = null }
        const { kind, msg } = classifyBleError(err)
        store.addLog(`Scan failed: ${msg}`)
        store.setIsOperating(false)
        if (kind === 'permission') { setBleStatus('no_permission') }
        else if (kind === 'bluetooth_off') {
          if (/location/i.test(msg)) toast.info('Turn on Location (system setting) so Android can scan for Bluetooth devices, then try again.')
          setBleStatus('bt_off')
        }
        else { store.setErrorMessage(msg); toast.error(msg) }
      }
      return
    }

    try {
      await manager.connect()
      const rawName = manager.deviceName ?? 'Sierro Device'
      const parsed = parseBleName(rawName)
      const duid = manager.getDuid() || parsed?.dtuid
      if (!duid) {
        const msg = "Couldn't read this device's ID. Make sure it's a Sierro device and try again."
        store.setErrorMessage(msg); toast.error(msg)
        return
      }
      const display = isDtuid(duid) ? displayTitleFromDtuid(duid) : rawName
      lastBleRef.current = { deviceId: undefined, bleName: rawName }
      bleGoneRef.current = false
      store.setDeviceInfo(display, duid)
      setFoundDevices([{ name: display, serial: duid, bleName: rawName, status: parsed?.status }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed'
      store.setErrorMessage(msg)
      store.addLog(`Scan failed: ${err}`)
      toast.error(msg)
    } finally {
      store.setIsOperating(false)
    }
  }, [store, setFoundDevices, setFailKind, setBleStatus, wifiConfiguredRef, lastBleRef, bleGoneRef, provisionStepRef, reconnectingRef, configGuardRef, scanStopRef])

  return { handleScan }
}
