/**
 * Bind / Wi-Fi config / restart handlers for 4.7.37 G-FAIL.
 */
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { toast } from '../../components/Toast'
import { useProvisionStore } from '../../stores/provisionStore'
import type { ProvisionStoreState, ProvisionStep } from '../../stores/provisionStore'
import { getProvisionManager } from '../../protocols/bleProvision'
import { SIERRO_MODELS, generateSerial, type SierroModel } from '../../data/deviceModels'
import { saveRatedParams } from '../../db/powerflowDB'
import { fetchDtuInfo } from '../../api/deviceApi'
import { useDeviceStore } from '../../stores/deviceStore'
import {
  BIND_FAIL_COPY, RESTART_HELP_COPY,
  isJunkError, mapBindFailReason,
  type BindFailReasonKind,
  type FailKind,
} from '../../utils/provisionFailCopy'
import { sanitizeUiCopy } from '../../utils/uiCopy'

export type ConfigStage = 'Sending Wi-Fi details' | 'Connecting device' | 'Adding to account'

export const DISCONNECT_COPY = 'The device disconnected during setup. Keep it powered on, stay close, and check the pairing light.'
export const WIFI_TIMEOUT_COPY = 'Timed out sending Wi-Fi details. Stay close to the device and try again.'
export const BIND_TIMEOUT_COPY = "Device connected to Wi-Fi, but adding it to your account timed out. Try adding again."

export function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(timeoutMessage)), ms)
    promise.then(
      v => { clearTimeout(t); resolve(v) },
      e => { clearTimeout(t); reject(e) },
    )
  })
}

export function useProvisionBind(opts: {
  store: ProvisionStoreState
  deviceNameInput: string
  selectedModel: SierroModel
  failKind: FailKind
  bindRetrying: boolean
  restarting: boolean
  configGuardRef: MutableRefObject<boolean>
  wifiConfiguredRef: MutableRefObject<boolean>
  lastBleRef: MutableRefObject<{ deviceId?: string; bleName?: string }>
  bleGoneRef: MutableRefObject<boolean>
  provisionStepRef: MutableRefObject<ProvisionStep>
  /** Called once Wi-Fi is configured — naming and the icon come next, then the bind. */
  onWifiConfigured: () => void
  setBindRetrying: Dispatch<SetStateAction<boolean>>
  setRestarting: Dispatch<SetStateAction<boolean>>
  setShowRestartHelp: Dispatch<SetStateAction<boolean>>
  setConfigStage: Dispatch<SetStateAction<ConfigStage>>
  setFailKind: Dispatch<SetStateAction<FailKind>>
  setBindReason: Dispatch<SetStateAction<string | null>>
  setBindDetails: Dispatch<SetStateAction<string | null>>
  setBindReasonKind: Dispatch<SetStateAction<BindFailReasonKind | null>>
  setBindErrorId: Dispatch<SetStateAction<string | null>>
}) {
  const {
    store, deviceNameInput, selectedModel, failKind, bindRetrying, restarting,
    configGuardRef, wifiConfiguredRef, lastBleRef, bleGoneRef, provisionStepRef,
    onWifiConfigured,
    setBindRetrying, setRestarting, setShowRestartHelp, setConfigStage,
    setFailKind, setBindReason, setBindReasonKind, setBindErrorId, setBindDetails,
  } = opts

  const handleBindToCloud = useCallback(async () => {
    if (configGuardRef.current) return
    configGuardRef.current = true
    const ds = useDeviceStore.getState()
    const deviceName = deviceNameInput.trim() || (store.deviceName ?? 'My Device')
    const dtuDtuid = store.dtuid ?? ''
    const isOk = (c: number | string | undefined) => c === 0 || c === '0'
    const spec = SIERRO_MODELS[selectedModel]

    const stayOnResult = store.step === 'result' && failKind === 'bind'
    if (stayOnResult) {
      setBindRetrying(true)
    } else {
      setConfigStage('Adding to account')
      store.setStep('configuring')
      store.setIsOperating(true)
      store.setErrorMessage(null)
    }

    const applyBindFail = (raw: string, code?: number | string, timeout = false) => {
      const mapped = mapBindFailReason(code, raw)
      store.addLog(`addNewDevice failed: ${isJunkError(raw) ? "[internal] " : ""}${raw || 'unknown'}`)
      setFailKind('bind')
      store.setConfigResult('fail')
      store.setErrorMessage(timeout ? BIND_TIMEOUT_COPY : BIND_FAIL_COPY)
      setBindReason(mapped.reason ?? null)
      setBindReasonKind(mapped.kind ?? null)
      setBindErrorId(mapped.errorId ?? null)
    }

    try {
      /*
       * Only a station confirmed against the server on THIS call may be reused.
       * If the refresh did not land, the list in the store may belong to whoever
       * was signed in before, and binding a device into someone else's station
       * comes back as an illegal argument. Treating that as "no station" takes
       * the addStationTogether path, which creates one — the right outcome for
       * the account that has none.
       */
      /*
       * Ask the collector what it has before adding anything. The serial number
       * is not ours to invent: once the collector has detected its inverter it
       * reports the real one, and the add call has to carry that. Making one up
       * and always claiming isVirtualSerialNumber is what the app did, and it
       * only holds for a collector that reports nothing at all.
       *
       * devicesAlreadyAdded is also the authoritative answer to "is this on
       * someone else's account" — far better than matching words in an error.
       */
      /*
       * Everything the add depended on, recorded as it is decided. Three separate
       * theories about this failure were argued from the source and each was
       * wrong, because the one thing nobody had was what the server actually
       * said — the raw message goes to a log no one can open, and the screen
       * shows a code. This is that missing evidence, on the screen, copyable.
       */
      const diag: string[] = [`dtu=${dtuDtuid || '(none)'}`]

      const dtuInfo = await fetchDtuInfo(dtuDtuid).catch((e) => {
        diag.push(`dtu/info threw: ${e instanceof Error ? e.message : String(e)}`)
        return null
      })
      if (dtuInfo) diag.push(`dtu/info code=${String(dtuInfo.code)} msg=${String(dtuInfo.message ?? '')}`)
      const toBeAdded = dtuInfo && isOk(dtuInfo.code) ? dtuInfo.data?.devicesToBeAdded ?? [] : []
      const alreadyAdded = dtuInfo && isOk(dtuInfo.code) ? dtuInfo.data?.devicesAlreadyAdded ?? [] : []

      if (alreadyAdded.length > 0) {
        applyBindFail('Device already exists', 'already_bound')
        if (!stayOnResult) store.setStep('result')
        return
      }

      const reportedSerial = toBeAdded[0]?.deviceSerialNumber
      const serialNumber = reportedSerial || generateSerial(spec, dtuDtuid)
      diag.push(`toBeAdded=${toBeAdded.length} alreadyAdded=${alreadyAdded.length} serial=${reportedSerial ? 'reported' : 'virtual'}:${serialNumber}`)

      const stationsFresh = await ds.loadStations()
      const stationId = stationsFresh ? useDeviceStore.getState().stations[0]?.id : undefined
      diag.push(`stationsFresh=${stationsFresh} stationId=${stationId ?? '(none)'}`)
      const base = {
        deviceName,
        dtuDtuid,
        // Only a serial the collector did NOT report is a virtual one.
        deviceSerialNumber: reportedSerial || serialNumber,
        isVirtualSerialNumber: !reportedSerial,
        installVendor: '',
        installedAt: '',
        ratedPower: spec.ratedPower,
      }
      diag.push(`POST ${stationId != null ? '/device/add/single' : '/device/add/single/addStationTogether'}`)
      diag.push(`body=${JSON.stringify(stationId != null ? { ...base, stationId: String(stationId) } : { ...base, station: { stationName: deviceName } })}`)
      const bindPromise = stationId != null
        ? ds.addNewDevice({ ...base, stationId })
        : ds.addNewDeviceWithStation({ ...base, station: { stationName: deviceName } })
      const devResult = await withTimeout(bindPromise, 25000, 'BIND_TIMEOUT')

      if (devResult && isOk(devResult.code)) {
        await ds.loadDevices()
        try {
          const added = useDeviceStore.getState().devices.find(
            d => d.serialNumber === serialNumber || String((d as { dtuDtuid?: string }).dtuDtuid ?? '') === dtuDtuid
          )
          if (added) {
            await saveRatedParams({
              deviceId: String(added.id),
              acInvOutputPower: spec.acInvOutputPower,
              fetchedAt: Date.now(),
              model: spec.model,
              ratedPower: spec.ratedPower,
              ratedChargePower: spec.ratedChargePower,
              batteryType: spec.batteryType,
              batteryHealth: spec.batteryHealth,
              serialNumber,
            })
          }
        } catch { /* ignore local write */ }
        store.setConfigResult('success')
        store.setErrorMessage(null)
        setFailKind(null)
        setBindReason(null)
        setBindReasonKind(null)
        setBindErrorId(null)
        setBindDetails(null)
        store.setStep('result')
      } else {
        const raw = String(devResult?.message ?? (devResult as { msg?: string } | undefined)?.msg ?? '')
        diag.push(`reply code=${String(devResult?.code)} msg=${raw || '(empty)'}`)
        setBindDetails(diag.join(String.fromCharCode(10)))
        applyBindFail(raw, devResult?.code)
        if (!stayOnResult) store.setStep('result')
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : 'bind failed'
      store.addLog(`addNewDevice exception: ${m}`)
      setBindDetails(`threw: ${m}`)
      applyBindFail(m, undefined, m === 'BIND_TIMEOUT')
      if (!stayOnResult) store.setStep('result')
    } finally {
      if (stayOnResult) {
        setBindRetrying(false)
      } else {
        store.setStep('result')
        store.setIsOperating(false)
      }
      configGuardRef.current = false
    }
  }, [store, deviceNameInput, selectedModel, failKind, configGuardRef, setBindRetrying, setConfigStage, setFailKind, setBindReason, setBindReasonKind, setBindErrorId])

  const handleConfig = useCallback(async () => {
    // Live read: `store` here is a render snapshot too (see currentDtuid).
    if (!useProvisionStore.getState().dtuid || !store.selectedSsid) return
    if (configGuardRef.current) return
    configGuardRef.current = true
    store.setIsOperating(true)
    setConfigStage('Sending Wi-Fi details')
    store.setStep('configuring')
    store.setErrorMessage(null)
    setFailKind(null)
    try {
      const manager = getProvisionManager()
      const resp = await withTimeout(
        manager.configWifi(store.selectedSsid, store.wifiPassword),
        25000,
        'WIFI_TIMEOUT',
      )
      if (provisionStepRef.current === 'result') return
      if (resp.RC !== 0) {
        setFailKind('wifi')
        store.setConfigResult('fail')
        store.setErrorMessage(`Couldn't connect to Wi-Fi (code ${resp.RC}). Check the password and try again.`)
        store.setStep('result')
        return
      }
      wifiConfiguredRef.current = true
      store.addLog('Wi-Fi config RC=0')
      configGuardRef.current = false
      // Naming and the icon come after Wi-Fi now; the bind runs once they are set.
      onWifiConfigured()
    } catch (err) {
      if (provisionStepRef.current === 'result') return
      const m = err instanceof Error ? err.message : 'Config failed'
      store.addLog(`configWifi failed: ${m}`)
      store.setConfigResult('fail')
      if (m === 'WIFI_TIMEOUT') {
        setFailKind('timeout')
        store.setErrorMessage(WIFI_TIMEOUT_COPY)
      } else if (/disconnect|GATT/i.test(m)) {
        setFailKind('disconnect')
        store.setErrorMessage(DISCONNECT_COPY)
      } else {
        setFailKind('wifi')
        store.setErrorMessage(sanitizeUiCopy(m, "Couldn't connect to Wi-Fi. Try again."))
      }
      store.setStep('result')
    } finally {
      store.setIsOperating(false)
      configGuardRef.current = false
    }
  }, [store, onWifiConfigured, configGuardRef, wifiConfiguredRef, provisionStepRef, setConfigStage, setFailKind])

  const handleRetryCurrentStage = useCallback(async () => {
    if (configGuardRef.current) return
    configGuardRef.current = true
    store.setIsOperating(true)
    store.setErrorMessage(null)
    const { deviceId, bleName } = lastBleRef.current
    if (deviceId) {
      try {
        const manager = getProvisionManager()
        await manager.connectTo(deviceId, bleName)
        store.addLog('Reconnected before retrying current stage')
      } catch (e) {
        store.addLog(`Reconnect before retry failed: ${e}`)
      }
    }
    configGuardRef.current = false
    if (wifiConfiguredRef.current) {
      await handleBindToCloud()
    } else {
      await handleConfig()
    }
  }, [store, handleBindToCloud, handleConfig, configGuardRef, lastBleRef, wifiConfiguredRef])

  const handleCheckStatus = useCallback(async () => {
    if (!useProvisionStore.getState().dtuid) return
    store.setIsOperating(true)
    try {
      const manager = getProvisionManager()
      const resp = await manager.getWifiStatus()
      if (resp.RC === 0 && resp.PL) store.setWifiStatus(resp.PL)
    } catch (e) { console.warn('[Provisioning] getWifiStatus failed:', e) }
    finally { store.setIsOperating(false) }
  }, [store])

  const handleRestart = useCallback(async () => {
    if (bindRetrying || restarting) return
    const { deviceId } = lastBleRef.current
    const bleGone = bleGoneRef.current || !deviceId
    if (bleGone) {
      setShowRestartHelp(true)
      toast.info(RESTART_HELP_COPY)
      return
    }
    setRestarting(true)
    try {
      const resp = await withTimeout(getProvisionManager().restart(), 45000, 'RESTART_TIMEOUT')
      if (resp.RC === 0) toast.success('Device is restarting.')
      else toast.error(`Restart failed (code ${resp.RC}).`)
    } catch (e) {
      console.warn('[Provisioning] restart failed:', e)
      const m = e instanceof Error ? e.message : 'Restart failed'
      if (m === 'RESTART_TIMEOUT' || /disconnect|GATT|not connected/i.test(m)) {
        bleGoneRef.current = true
        setShowRestartHelp(true)
        toast.info(RESTART_HELP_COPY)
      } else {
        toast.error('Restart failed. Please try again.')
      }
    } finally {
      setRestarting(false)
    }
  }, [bindRetrying, restarting, lastBleRef, bleGoneRef, setShowRestartHelp, setRestarting])

  return { handleBindToCloud, handleConfig, handleRetryCurrentStage, handleCheckStatus, handleRestart }
}
