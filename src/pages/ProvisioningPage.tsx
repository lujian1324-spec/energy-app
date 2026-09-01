/**
 * BLE provisioning UI — PRD-aligned redesign.
 * All store/API/protocol logic preserved from original.
 */
import { useState, useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import { toast } from '../components/Toast'
import { useProvisionStore } from '../stores/provisionStore'
import { getProvisionManager, destroyProvisionManager, stopProvisionScan, supportsDeviceListScan } from '../protocols/bleProvision'
import { type SierroModel } from '../data/deviceModels'
import { useDeviceStore } from '../stores/deviceStore'
import { isDtuid } from '../utils/dtuidParser'
import { App } from '@capacitor/app'
import { checkBluetooth, resetBleInit } from '../utils/permissions'
import { type FailKind } from '../utils/provisionFailCopy'
import QrScanScreen from './provisioning/QrScanScreen'
import { NameDeviceScreen, ChooseIconScreen } from './provisioning/NameIconScreens'
import ProvisioningFlowScreen from './provisioning/ProvisioningFlowScreen'
import ScanDevicesScreen from './provisioning/ScanDevicesScreen'
import { useProvisionBind, type ConfigStage } from './provisioning/useProvisionBind'
import { useProvisionScan, displayTitleFromDtuid, type FoundDevice } from './provisioning/useProvisionScan'

// Local UI screens — the multi-step store flow lives inside 'provisioning'
type UiScreen = 'scan' | 'qr' | 'naming' | 'icon' | 'provisioning'

export default function ProvisioningPage({ onClose }: { onClose: () => void }) {
  const store = useProvisionStore()

  const [uiScreen, setUiScreen] = useState<UiScreen>('scan')
  const [deviceNameInput, setDeviceNameInput] = useState('')
  const [selectedModel, setSelectedModel] = useState<SierroModel>('Sierro 1000')
  const [nameError, setNameError] = useState('')
  const [bleKeyInput, setBleKeyInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedIcon, setSelectedIcon] = useState<string>('power')

  const [foundDevices, setFoundDevices] = useState<FoundDevice[]>([])
  const [showNotifSheet, setShowNotifSheet] = useState(false)
  const [configStage, setConfigStage] = useState<ConfigStage>('Sending Wi-Fi details')
  const [failKind, setFailKind] = useState<FailKind>(null)
  const [bindRetrying, setBindRetrying] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [showRestartHelp, setShowRestartHelp] = useState(false)
  const [bindReason, setBindReason] = useState<string | null>(null)
  const [bindErrorId, setBindErrorId] = useState<string | null>(null)

  type BleStatus = 'checking' | 'no_permission' | 'bt_off' | 'ready'
  const [bleStatus, setBleStatus] = useState<BleStatus>('checking')
  const bleStatusRef = useRef<BleStatus>(bleStatus)
  bleStatusRef.current = bleStatus
  const uiScreenRef = useRef(uiScreen)
  uiScreenRef.current = uiScreen
  const provisionStepRef = useRef(store.step)
  provisionStepRef.current = store.step
  const lastBleRef = useRef<{ deviceId?: string; bleName?: string }>({})
  const wifiConfiguredRef = useRef(false)
  const reconnectingRef = useRef(false)
  const configGuardRef = useRef(false)
  const bleGoneRef = useRef(false)

  const { handleBindToCloud, handleConfig, handleRetryCurrentStage, handleCheckStatus, handleRestart } = useProvisionBind({
    store,
    deviceNameInput,
    selectedModel,
    failKind,
    bindRetrying,
    restarting,
    configGuardRef,
    wifiConfiguredRef,
    lastBleRef,
    bleGoneRef,
    provisionStepRef: provisionStepRef as MutableRefObject<string>,
    setBindRetrying,
    setRestarting,
    setShowRestartHelp,
    setConfigStage,
    setFailKind,
    setBindReason,
    setBindErrorId,
  })

  const recheckBle = useCallback(async (): Promise<BleStatus> => {
    if (supportsDeviceListScan()) {
      try {
        const result = await checkBluetooth()
        if (result.state === 'granted') { setBleStatus('ready'); return 'ready' }
        else if (result.state === 'denied') { setBleStatus('no_permission'); return 'no_permission' }
        else { setBleStatus('ready'); return 'ready' }
      } catch {
        setBleStatus('ready')
        return 'ready'
      }
    }
    if (!('bluetooth' in navigator)) { setBleStatus('no_permission'); return 'no_permission' }
    setBleStatus('ready')
    return 'ready'
  }, [])

  useEffect(() => { void recheckBle() }, [recheckBle])

  const scanStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { handleScan } = useProvisionScan({
    store,
    setFoundDevices,
    setFailKind,
    setBleStatus,
    wifiConfiguredRef,
    lastBleRef,
    bleGoneRef,
    provisionStepRef: provisionStepRef as MutableRefObject<string>,
    reconnectingRef,
    configGuardRef,
    scanStopRef,
  })

  useEffect(() => () => {
    if (scanStopRef.current) clearTimeout(scanStopRef.current)
    stopProvisionScan()
  }, [])

  useEffect(() => {
    let removed = false
    let handle: { remove: () => Promise<void> } | undefined
    const setup = async () => {
      handle = await App.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) {
          setShowPassword(false)
          if (removed) return
          return
        }
        if (removed) return
        const wasNoPermission = bleStatusRef.current === 'no_permission'
        const onScan = uiScreenRef.current === 'scan'
        resetBleInit()
        if (onScan) setBleStatus('checking')
        const status = await recheckBle()
        if (removed) return
        if (status === 'ready' && (onScan || wasNoPermission) && uiScreenRef.current === 'scan') {
          void handleScan()
        }
      })
    }
    void setup()
    return () => {
      removed = true
      void handle?.remove()
    }
  }, [recheckBle, handleScan])

  const handleVerify = useCallback(async () => {
    if (!store.dtuid) return
    store.setIsOperating(true)
    store.setErrorMessage(null)
    try {
      const manager = getProvisionManager()
      const resp = await manager.getVersion()
      if (resp.RC === 9000) {
        store.setNeedBleKey(true)
        return
      }
      if (resp.RC === 0 && resp.PL) {
        const pl = resp.PL as { SV: string; HV: string }
        store.setVersionInfo(pl.SV, pl.HV)
        store.setStep('wifi')
      } else {
        store.setErrorMessage(`Verification failed: RC=${resp.RC}`)
      }
    } catch (err) {
      store.setErrorMessage(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      store.setIsOperating(false)
    }
  }, [store])

  const handleConfirmBleKey = useCallback(async () => {
    if (!store.dtuid || !bleKeyInput.trim()) return
    store.setIsOperating(true)
    store.setErrorMessage(null)
    try {
      const manager = getProvisionManager()
      const resp = await manager.confirmBleKey(bleKeyInput.trim())
      if (resp.RC === 0) {
        store.setBleKeyVerified(true)
        store.setNeedBleKey(false)
        await handleVerify()
      } else {
        store.setErrorMessage(resp.RC === 9001 ? 'Incorrect BLE key, please retry' : `Key error: RC=${resp.RC}`)
      }
    } catch (err) {
      store.setErrorMessage(err instanceof Error ? err.message : 'Key verification failed')
    } finally {
      store.setIsOperating(false)
    }
  }, [store, bleKeyInput, handleVerify])

  const handleScanWifi = useCallback(async () => {
    if (!store.dtuid) return
    store.setApLoading(true)
    store.setErrorMessage(null)
    try {
      const manager = getProvisionManager()
      let resp = await manager.scanAp()
      let list = resp.RC === 0 && Array.isArray(resp.PL) ? (resp.PL as typeof store.apList) : []
      if (resp.RC === 0 && list.length === 0) {
        await new Promise(r => setTimeout(r, 1500))
        resp = await manager.scanAp()
        list = resp.RC === 0 && Array.isArray(resp.PL) ? (resp.PL as typeof store.apList) : list
      }
      if (resp.RC === 0) {
        const seen = new Set<string>()
        const cleaned = list.filter(ap => ap.SSID && !seen.has(ap.SSID) && seen.add(ap.SSID))
        store.setApList(cleaned)
      } else {
        store.setErrorMessage(`WiFi scan failed: RC=${resp.RC}`)
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : 'WiFi scan failed'
      store.setErrorMessage(/disconnect|GATT/i.test(m)
        ? 'Bluetooth disconnected. Please reconnect the device and try again.'
        : m)
    } finally {
      store.setApLoading(false)
    }
  }, [store])

  const autoBleScanRef = useRef(false)
  useEffect(() => {
    if (uiScreen === 'scan' && bleStatus === 'ready' && supportsDeviceListScan()) {
      if (!autoBleScanRef.current && !store.isOperating) {
        autoBleScanRef.current = true
        handleScan()
      }
    } else if (uiScreen !== 'scan') {
      autoBleScanRef.current = false
    }
  }, [uiScreen, bleStatus, store.isOperating, handleScan])

  useEffect(() => {
    if (store.step !== 'password') setShowPassword(false)
  }, [store.step])

  const autoScannedRef = useRef(false)
  useEffect(() => {
    if (store.step === 'wifi') {
      if (!autoScannedRef.current && !store.apLoading) {
        autoScannedRef.current = true
        handleScanWifi()
      }
    } else {
      autoScannedRef.current = false
    }
  }, [store.step, store.apLoading, handleScanWifi])

  const handleClose = useCallback(() => {
    destroyProvisionManager()
    wifiConfiguredRef.current = false
    store.reset()
    onClose()
  }, [store, onClose])

  const goToNaming = useCallback(() => {
    setDeviceNameInput(store.deviceName ?? 'My Device')
    setNameError('')
    setUiScreen('naming')
  }, [store.deviceName])

  const handleSelectDevice = useCallback(async (device: FoundDevice) => {
    if (device.deviceId && supportsDeviceListScan()) {
      store.setIsOperating(true)
      store.setErrorMessage(null)
      try {
        const manager = getProvisionManager()
        const bleName = device.bleName ?? device.name
        lastBleRef.current = { deviceId: device.deviceId, bleName }
        await manager.connectTo(device.deviceId, bleName)
        bleGoneRef.current = false
        const duid = manager.getDuid() || (isDtuid(device.serial) ? device.serial : null)
        if (!duid) {
          const msg = "Couldn't read this device's ID. Move closer to the device and try again."
          store.setErrorMessage(msg); toast.error(msg)
          return
        }
        store.setDeviceInfo(device.name || displayTitleFromDtuid(duid), duid)
        goToNaming()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Connection failed'
        store.setErrorMessage(msg); toast.error(msg)
      } finally {
        store.setIsOperating(false)
      }
    } else {
      goToNaming()
    }
  }, [store, goToNaming])

  const handleNameNext = useCallback(() => {
    const trimmed = deviceNameInput.trim()
    if (!trimmed) { setNameError('Please enter a device name.'); return }
    const { devices } = useDeviceStore.getState()
    const duplicate = devices.some(d => d.name?.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) { setNameError('A device with this name already exists. Please choose a different name.'); return }
    setNameError('')
    setUiScreen('icon')
  }, [deviceNameInput])

  const handleIconNext = useCallback(() => {
    store.setStep('verify')
    setUiScreen('provisioning')
    handleVerify()
  }, [store, handleVerify])

  if (uiScreen === 'scan') {
    return (
      <ScanDevicesScreen
        bleStatus={bleStatus}
        setBleStatus={setBleStatus}
        foundDevices={foundDevices}
        handleClose={handleClose}
        handleScan={handleScan}
        handleSelectDevice={handleSelectDevice}
        setUiScreen={setUiScreen}
      />
    )
  }

  if (uiScreen === 'qr') {
    return <QrScanScreen
      onBack={() => setUiScreen('scan')}
      onScanned={(name, serial) => {
        store.setDeviceInfo(name, serial)
        setFoundDevices([{ name, serial }])
        setUiScreen('naming')
      }}
    />
  }

  if (uiScreen === 'naming') {
    return (
      <NameDeviceScreen
        deviceNameInput={deviceNameInput}
        setDeviceNameInput={setDeviceNameInput}
        nameError={nameError}
        setNameError={setNameError}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        onBack={() => setUiScreen('scan')}
        onNext={handleNameNext}
      />
    )
  }

  if (uiScreen === 'icon') {
    return (
      <ChooseIconScreen
        selectedIcon={selectedIcon}
        setSelectedIcon={setSelectedIcon}
        onBack={() => setUiScreen('naming')}
        onNext={handleIconNext}
      />
    )
  }

  return (
    <ProvisioningFlowScreen
      failKind={failKind}
      bindRetrying={bindRetrying}
      restarting={restarting}
      showRestartHelp={showRestartHelp}
      bindReason={bindReason}
      bindErrorId={bindErrorId}
      configStage={configStage}
      bleKeyInput={bleKeyInput}
      setBleKeyInput={setBleKeyInput}
      showPassword={showPassword}
      setShowPassword={setShowPassword}
      showNotifSheet={showNotifSheet}
      setShowNotifSheet={setShowNotifSheet}
      wifiConfiguredRef={wifiConfiguredRef}
      setUiScreen={setUiScreen}
      handleConfirmBleKey={handleConfirmBleKey}
      handleScanWifi={handleScanWifi}
      handleConfig={handleConfig}
      handleCheckStatus={handleCheckStatus}
      handleBindToCloud={handleBindToCloud}
      handleRetryCurrentStage={handleRetryCurrentStage}
      handleRestart={handleRestart}
      handleClose={handleClose}
    />
  )
}
