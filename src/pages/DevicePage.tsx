import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { requestCamera } from '../utils/permissions'
import { toast } from '../components/Toast'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import jsQR from 'jsqr'
import ProvisioningPage from './ProvisioningPage'
import {
  AlertTriangle,
  X,
} from 'lucide-react'
import Icon from '../components/Icon'
import DeviceEmptyState from './device/DeviceEmptyState'
import DeviceListCard from './device/DeviceListCard'
import DeviceQrScanOverlay from './device/DeviceQrScanOverlay'
import LowBatteryBanner from './device/LowBatteryBanner'
import DeviceSignInGate from './device/DeviceSignInGate'
import EnableNotiSheet, { ENABLE_NOTI_SEEN_KEY } from './device/EnableNotiSheet'
import { refreshNotificationPermission } from '../utils/pushNotification'
import PullToRefresh from '../components/PullToRefresh'
import ManualAddDeviceModal from '../components/ManualAddDeviceModal'
import { useDeviceStore } from '../stores/deviceStore'
import { useAuthStore } from '../stores/authStore'
import { useAlarmDismissStore, alarmKey } from '../stores/alarmDismissStore'
import { usePowerStationStore } from '../stores/powerStationStore'
import { dedupeAndFilterAlarms } from '../utils/alarmText'
import type { FiringAlarm } from '../utils/powerOutageNotification'
import { mapFieldsToRealtime, fetchDeviceState, passthroughDevice } from '../api/deviceApi'
import { FRAMES, decodePassthroughBase64, decodeLiveStatus } from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'
import { batteryTimeLabel } from '../utils/batteryTime'
import { hapticMedium } from '../utils/haptics'
import { loadRatedParams } from '../db/powerflowDB'
import type { DeviceListItem, DeviceStateField } from '../api/deviceApi'
import { getDemoDeviceState } from '../data/demoData'
import { useBleLiveStatusStore, lookupBleLiveStatus, mergeCloudWithBle } from '../stores/bleLiveStatusStore'

interface DeviceRealtimeCache {
  [deviceId: string]: {
    fields: Record<string, DeviceStateField>
    raw: ReturnType<typeof mapFieldsToRealtime>
    firingAlarms?: unknown[]
    loading: boolean
    lastUpdated: number
  }
}

export default function DevicePage() {
  const navigate = useNavigate()
  const {
    devices,
    deviceLoading,
    devicesListReady,
    loadDevices,
    loadStations,
    selectedDeviceState,
  } = useDeviceStore()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const isGuest = useAuthStore(s => s.isGuest)
  const bleEpoch = useBleLiveStatusStore(s => s.epoch)
  const { settings } = usePowerStationStore()

  const [showManualAdd, setShowManualAdd] = useState(false)
  const [showQrScan, setShowQrScan] = useState(false)
  const [showProvisioning, setShowProvisioning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [powerStates, setPowerStates] = useState<Record<string, boolean>>({})
  const [realtimeCache, setRealtimeCache] = useState<DeviceRealtimeCache>(() => {
    const store = useDeviceStore.getState()
    if (!store.isDemoMode) return {}
    const seed: DeviceRealtimeCache = {}
    for (const d of store.devices) {
      const state = getDemoDeviceState(d.id)
      if (state) {
        seed[String(d.id)] = {
          fields: state.fields,
          raw: mapFieldsToRealtime(state.fields),
          loading: false,
          lastUpdated: Date.now(),
        }
      }
    }
    return seed
  })
  const [showEnableNoti, setShowEnableNoti] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [, setQrScanning] = useState(false)
  const [qrResult, setQrResult] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [cameraDenied, setCameraDenied] = useState(false)
  const [qrVideoReady, setQrVideoReady] = useState(false)
  const qrStreamRef = useRef<MediaStream | null>(null)
  const cameraDeniedRef = useRef(cameraDenied)
  cameraDeniedRef.current = cameraDenied
  const showQrScanRef = useRef(showQrScan)
  showQrScanRef.current = showQrScan
  const [scannedSerial, setScannedSerial] = useState('')
  const [scannedName, setScannedName] = useState('')
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (showQrScan) {
      startQrScan()
    }
    return () => { stopQrScan() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQrScan])

  useEffect(() => {
    let removed = false
    let handle: { remove: () => Promise<void> } | undefined
    const setup = async () => {
      handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive || removed) return
        if (cameraDeniedRef.current && showQrScanRef.current) {
          void startQrScan()
        }
      })
    }
    void setup()
    return () => {
      removed = true
      void handle?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchDevices = useCallback(async () => {
    setError(null)
    try {
      await loadDevices(1, 50)
      const loadError = useDeviceStore.getState().deviceError
      if (loadError) throw new Error(loadError)
      await loadStations(1, 50)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices')
    }
  }, [loadDevices, loadStations])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  const fetchDeviceRealtime = useCallback(async (deviceId: number | string) => {
    const idStr = String(deviceId)
    if (useDeviceStore.getState().isDemoMode) {
      const state = getDemoDeviceState(deviceId)
      if (state) {
        setRealtimeCache(prev => ({
          ...prev,
          [idStr]: { fields: state.fields, raw: mapFieldsToRealtime(state.fields), firingAlarms: state.firingAlarms ?? [], loading: false, lastUpdated: Date.now() },
        }))
      }
      return
    }
    setRealtimeCache(prev => ({
      ...prev,
      [idStr]: { ...prev[idStr], loading: true },
    }))
    try {
      const result = await fetchDeviceState(idStr)
      if ((result.code === 0 || result.code === '0') && result.data) {
        setRealtimeCache(prev => ({
          ...prev,
          [idStr]: {
            fields: result.data!.fields,
            raw: mapFieldsToRealtime(result.data!.fields),
            firingAlarms: result.data!.firingAlarms ?? [],
            loading: false,
            lastUpdated: Date.now(),
          },
        }))
      } else {
        setRealtimeCache(prev => ({ ...prev, [idStr]: { ...prev[idStr], loading: false } }))
      }
    } catch {
      setRealtimeCache(prev => ({
        ...prev,
        [idStr]: { ...prev[idStr], loading: false },
      }))
    }
  }, [])

  useEffect(() => {
    if (selectedDeviceState && selectedDeviceState.deviceId) {
      const idStr = String(selectedDeviceState.deviceId)
      const mapped = mapFieldsToRealtime(selectedDeviceState.fields)
      setRealtimeCache(prev => ({
        ...prev,
        [idStr]: {
          fields: selectedDeviceState.fields,
          raw: mapped,
          firingAlarms: selectedDeviceState.firingAlarms ?? [],
          loading: false,
          lastUpdated: Date.now(),
        },
      }))
    }
  }, [selectedDeviceState])

  const fetchBatteryPassthrough = useCallback(async (deviceId: string | number) => {
    const idStr = String(deviceId)
    if (useDeviceStore.getState().isDemoMode) return
    try {
      const res = await passthroughDevice(idStr, { data: FRAMES.READ_ALL_STATUS })
      if (!isApiSuccess(res.code)) return
      const b64 = res.data?.base64Output ?? res.data?.content ?? res.data?.data
      const registers = decodePassthroughBase64(b64, 8)
      if (!registers) return
      const live = decodeLiveStatus(registers)
      setRealtimeCache(prev => {
        const existing = prev[idStr]
        return {
          ...prev,
          [idStr]: {
            fields: existing?.fields ?? {},
            raw: {
              ...existing?.raw,
              remainingBatteryCapacity: live.soc,
              batteryPower: live.batteryPower,
              acPower: live.acPower,
              solarPower: live.solarPower,
              outputPower: live.outputPower,
              batteryTemp: live.batteryTemp,
            },
            loading: false,
            lastUpdated: Date.now(),
          },
        }
      })
    } catch {
      // passthrough can fail silently
    }
  }, [])

  useEffect(() => {
    if (devices.length === 0 || !isAuthenticated) return
    const pollBattery = () => devices.forEach(d => fetchBatteryPassthrough(d.id))
    pollBattery()
    const timer = setInterval(pollBattery, 10_000)
    return () => clearInterval(timer)
  }, [devices, isAuthenticated, fetchBatteryPassthrough])

  useEffect(() => {
    if (devices.length === 0 || !isAuthenticated) return
    const refreshAll = () => devices.forEach(d => fetchDeviceRealtime(d.id))
    refreshAll()
    const timer = setInterval(refreshAll, 60000)
    return () => clearInterval(timer)
  }, [devices, isAuthenticated, fetchDeviceRealtime])

  const getDeviceNum = (deviceId: string | number, key: string): number | null => {
    void bleEpoch
    const cache = realtimeCache[String(deviceId)]
    const ble = lookupBleLiveStatus({ deviceId, dtuDtuid: (devices.find(d => String(d.id) === String(deviceId)) as { dtuDtuid?: string } | undefined)?.dtuDtuid })?.live
    const merged = mergeCloudWithBle(cache?.raw, ble)
    const val = merged[key as keyof typeof merged]
    return val !== undefined && val !== null ? Number(val) : null
  }

  const handleBleScan = useCallback(() => {
    setShowProvisioning(true)
  }, [])
  useEffect(() => {
    if (!isAuthenticated || isGuest || !devicesListReady || devices.length < 1) return
    try {
      if (localStorage.getItem(ENABLE_NOTI_SEEN_KEY)) return
    } catch {
      return
    }
    let cancelled = false
    void (async () => {
      const perm = await refreshNotificationPermission()
      if (!cancelled && perm !== 'granted') setShowEnableNoti(true)
    })()
    return () => { cancelled = true }
  }, [isAuthenticated, isGuest, devicesListReady, devices.length])


  const handleDeviceClick = (device: DeviceListItem) => {
    useDeviceStore.getState().selectDevice(String(device.id))
    navigate(`/device/${device.id}`)
  }

  const getDeviceModel = (device: DeviceListItem): string => {
    if (device.model) return device.model
    if (device.gatherProtocolNameDisplay) return device.gatherProtocolNameDisplay
    if (device.ratedPower) return device.ratedPower >= 750 ? 'Sierro 2000' : 'Sierro 1000'
    return 'Sierro'
  }

  const [togglingPower, setTogglingPower] = useState<Set<string>>(new Set())

  const togglePower = async (deviceId: string | number, e: React.MouseEvent) => {
    e.stopPropagation()
    const idStr = String(deviceId)
    if (togglingPower.has(idStr)) return
    hapticMedium()
    const current = powerStates[idStr] ?? true
    const next = !current
    setPowerStates(prev => ({ ...prev, [idStr]: next }))
    setTogglingPower(prev => new Set(prev).add(idStr))
    try {
      const res = await passthroughDevice(idStr, {
        data: next ? FRAMES.AC_POWER_ON : FRAMES.AC_POWER_OFF,
        noOutput: true,
      })
      if (!isApiSuccess(res.code)) {
        throw new Error(res.message ?? res.msg ?? 'Power command rejected')
      }
    } catch (err) {
      setPowerStates(prev => ({ ...prev, [idStr]: current }))
      setError(err instanceof Error ? err.message : 'Failed to switch power')
    } finally {
      setTogglingPower(prev => { const s = new Set(prev); s.delete(idStr); return s })
    }
  }

  const lowBatteryThreshold = settings.lowBatteryThreshold ?? 30
  const lowBatteryDevice = devices.find(d => {
    const remainingBatteryCapacity = getDeviceNum(d.id, 'remainingBatteryCapacity')
    return remainingBatteryCapacity !== null && remainingBatteryCapacity < lowBatteryThreshold
  })

  const [lowBatteryCapacityWh, setLowBatteryCapacityWh] = useState<number | undefined>(undefined)
  useEffect(() => {
    const lid = lowBatteryDevice ? String(lowBatteryDevice.id) : null
    if (!lid) { setLowBatteryCapacityWh(undefined); return }
    loadRatedParams(lid)
      .then(p => setLowBatteryCapacityWh(p ? p.acInvOutputPower * 2 : undefined))
      .catch(() => setLowBatteryCapacityWh(undefined))
  }, [lowBatteryDevice?.id])
  const lowBatteryTimeStr = lowBatteryDevice
    ? batteryTimeLabel({
        acPower: getDeviceNum(lowBatteryDevice.id, 'acPower') ?? 0,
        solarPower: getDeviceNum(lowBatteryDevice.id, 'solarPower') ?? 0,
        outputPower: getDeviceNum(lowBatteryDevice.id, 'outputPower') ?? 0,
        soc: getDeviceNum(lowBatteryDevice.id, 'remainingBatteryCapacity') ?? 0,
        capacityWh: lowBatteryCapacityWh,
        isCharging: (getDeviceNum(lowBatteryDevice.id, 'batteryPower') ?? 0) > 0,
      })
    : null

  const dismissedAlarms = useAlarmDismissStore(s => s.dismissed)
  const activeAlarmCount = useMemo(() => {
    let count = 0
    for (const [idStr, entry] of Object.entries(realtimeCache)) {
      const firing = dedupeAndFilterAlarms((entry.firingAlarms ?? []) as FiringAlarm[])
      for (const a of firing) {
        if (!dismissedAlarms.includes(alarmKey(idStr, a.title))) count++
      }
    }
    return count
  }, [realtimeCache, dismissedAlarms])

  if (!isAuthenticated && !isGuest) {
    return <DeviceSignInGate onSignIn={() => navigate('/login')} />
  }

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="px-5 pt-4 pb-3 safe-area-top"
      >
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-display font-display text-white">Device</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBleScan}
              aria-label="Add device"
              className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center text-white hover:bg-ink-9 transition-colors active:scale-95"
            >
              <Icon name="add" size={24} />
            </button>
            <button
              onClick={() => navigate('/notifications')}
              aria-label="Notifications"
              className="relative w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center text-white hover:bg-ink-9 transition-colors active:scale-95"
            >
              <Icon name="bell" size={24} />
              {activeAlarmCount > 0 && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-danger border-2 border-ink-12" />
              )}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-danger/[0.08] border border-danger/[0.15] rounded-l px-4 py-2.5 flex items-center gap-2 mb-1"
            >
              <AlertTriangle size={14} className="text-danger flex-shrink-0" />
              <span className="text-label text-danger flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-danger">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <PullToRefresh onRefresh={async () => { await loadDevices(1, 50) }}>
      <div className="px-4 pb-4">
        <AnimatePresence>
          {lowBatteryDevice && !bannerDismissed && (
            <LowBatteryBanner
              name={lowBatteryDevice.name}
              durationStr={lowBatteryTimeStr}
              onOpen={() => navigate('/notifications')}
              onDismiss={() => setBannerDismissed(true)}
            />
          )}
        </AnimatePresence>

        {deviceLoading && devices.length === 0 && !devicesListReady ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-l p-5 bg-ink-10 animate-pulse h-[176px]" />
            ))}
          </div>
        ) : devices.length > 0 ? (
          <div className="flex flex-col gap-3">
            {devices.map((device, index) => {
              const remainingBatteryCapacityRaw = getDeviceNum(device.id, 'remainingBatteryCapacity')
              const remainingBatteryCapacity = remainingBatteryCapacityRaw ?? 0
              const remainingBatteryCapacityKnown = remainingBatteryCapacityRaw !== null
              const batteryPower = getDeviceNum(device.id, 'batteryPower')
              const isCharging = batteryPower !== null && batteryPower > 0
              const connected = device.isOnline
              const powerOn = powerStates[String(device.id)] ?? device.isOnline
              return (
                <DeviceListCard
                  key={device.id}
                  device={device}
                  index={index}
                  model={getDeviceModel(device)}
                  remainingBatteryCapacity={remainingBatteryCapacity}
                  remainingBatteryCapacityKnown={remainingBatteryCapacityKnown}
                  isCharging={isCharging}
                  connected={connected}
                  powerOn={powerOn}
                  toggling={togglingPower.has(String(device.id))}
                  onClick={() => handleDeviceClick(device)}
                  onTogglePower={togglePower}
                />
              )
            })}
          </div>
        ) : (
          <DeviceEmptyState
            error={error}
            onRetry={fetchDevices}
            onAddDevice={handleBleScan}
          />
        )}
      </div>
      </PullToRefresh>

      <AnimatePresence>
        {showQrScan && (
          <DeviceQrScanOverlay
            qrVideoReady={qrVideoReady}
            videoRef={videoRef}
            canvasRef={canvasRef}
            qrResult={qrResult}
            qrError={qrError}
            cameraDenied={cameraDenied}
            scannedSerial={scannedSerial}
            scannedName={scannedName}
            stopQrScan={stopQrScan}
            startQrScan={startQrScan}
            setQrVideoReady={setQrVideoReady}
            setShowQrScan={setShowQrScan}
            setQrResult={setQrResult}
            setQrError={setQrError}
            setShowManualAdd={setShowManualAdd}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showManualAdd && (
          <ManualAddDeviceModal
            onClose={() => { setShowManualAdd(false); setScannedSerial(''); setScannedName('') }}
            initialSerialNumber={scannedSerial}
            initialName={scannedName}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProvisioning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ProvisioningPage onClose={() => setShowProvisioning(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEnableNoti && (
          <EnableNotiSheet onClose={() => setShowEnableNoti(false)} />
        )}
      </AnimatePresence>
    </div>
  )

  function stopQrScan() {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null }
    const stream = qrStreamRef.current || (videoRef.current?.srcObject as MediaStream | null)
    stream?.getTracks().forEach(t => t.stop())
    qrStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setQrScanning(false)
    setQrVideoReady(false)
  }

  function parseQrPayload(text: string): { serial: string; name: string } {
    const raw = text.trim()
    if (/^SIERRO:/i.test(raw)) {
      const parts = raw.split(':')
      const serial = parts[2]?.trim() || parts[1]?.trim() || raw
      const name = parts.length >= 3 ? parts[1]?.trim() : ''
      return { serial, name: name || '' }
    }
    if (raw.startsWith('{')) {
      try {
        const obj = JSON.parse(raw)
        const serial = String(obj.sn ?? obj.serialNumber ?? obj.deviceSerialNumber ?? obj.deviceId ?? obj.id ?? '').trim()
        const name = String(obj.name ?? obj.deviceName ?? obj.model ?? '').trim()
        if (serial) return { serial, name }
      } catch { /* ignore */ }
    }
    if (/^https?:\/\//i.test(raw) || raw.includes('?')) {
      try {
        const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : ''
        const params = new URLSearchParams(qs)
        const serial = (params.get('sn') ?? params.get('serialNumber') ?? params.get('deviceId') ?? params.get('id') ?? '').trim()
        const name = (params.get('name') ?? params.get('model') ?? '').trim()
        if (serial) return { serial, name }
      } catch { /* ignore */ }
    }
    return { serial: raw, name: '' }
  }

  function tickQrDecode() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(tickQrDecode)
      return
    }
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) {
      animationFrameRef.current = requestAnimationFrame(tickQrDecode)
      return
    }
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) { animationFrameRef.current = requestAnimationFrame(tickQrDecode); return }
    ctx.drawImage(video, 0, 0, w, h)
    const imageData = ctx.getImageData(0, 0, w, h)
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
    if (code && code.data) {
      const { serial, name } = parseQrPayload(code.data)
      setScannedSerial(serial)
      setScannedName(name)
      setQrResult(code.data)
      stopQrScan()
      return
    }
    animationFrameRef.current = requestAnimationFrame(tickQrDecode)
  }

  async function startQrScan() {
    setQrScanning(true)
    setQrError(null)
    setQrResult(null)
    setCameraDenied(false)
    setQrVideoReady(false)
    setScannedSerial('')
    setScannedName('')
    try {
      if (Capacitor.isNativePlatform()) {
        const cam = await requestCamera()
        if (cam.state === 'denied') {
          setCameraDenied(true)
          setQrError('Camera access was denied. Please enable camera permission in Settings to scan QR codes.')
          setQrScanning(false)
          return
        }
      }
      qrStreamRef.current?.getTracks().forEach(tr => tr.stop())
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      qrStreamRef.current = stream
      flushSync(() => setQrVideoReady(true))
      if (videoRef.current) {
        videoRef.current.setAttribute('playsinline', 'true')
        videoRef.current.setAttribute('webkit-playsinline', 'true')
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = requestAnimationFrame(tickQrDecode)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/denied|permission|notallowed/i.test(msg)) {
        setCameraDenied(true)
        setQrError('Camera access was denied. Please enable camera permission in Settings to scan QR codes.')
      } else {
        setQrError(`Camera error: ${msg}`)
      }
      setQrScanning(false)
      setQrVideoReady(false)
    }
  }
}
