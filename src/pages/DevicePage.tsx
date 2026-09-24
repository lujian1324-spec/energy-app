import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { requestCamera } from '../utils/permissions'
import { toast } from '../components/Toast'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
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
import { QR_ENTRY_ENABLED } from '../config/qrEntry'
import LowBatteryBanner from './device/LowBatteryBanner'
import DeviceSignInGate from './device/DeviceSignInGate'
import EnableNotiSheet, { ENABLE_NOTI_SEEN_KEY } from './device/EnableNotiSheet'
import { refreshNotificationPermission } from '../utils/pushNotification'
import PullToRefresh from '../components/PullToRefresh'
import ManualAddDeviceModal from '../components/ManualAddDeviceModal'
import { useDeviceStore } from '../stores/deviceStore'
import { useAuthStore } from '../stores/authStore'
import { useAlarmDismissStore } from '../stores/alarmDismissStore'
import { useFiringAlarmsStore, recordFiringAlarms, recordFiringAlarmsFailed, unreadAlarmCount } from '../stores/firingAlarmsStore'
import { usePowerStationStore } from '../stores/powerStationStore'
import { mapFieldsToRealtime, fetchDeviceState } from '../api/deviceApi'
import { setAcOutput } from '../api/acOutputControl'
import { resolveAcOutput, commandSuperseded, type AcCommand, type AcSample } from '../utils/acOutputState'
import { parseDeviceStateTime } from '../utils/deviceStateTime'
import { batteryTimeLabel } from '../utils/batteryTime'
import { hapticMedium } from '../utils/haptics'
import { loadRatedParams } from '../db/powerflowDB'
import type { DeviceListItem, DeviceStateField } from '../api/deviceApi'
import { getDemoDeviceState } from '../data/demoData'
import { useBleLiveStatusStore, lookupBleLiveStatus } from '../stores/bleLiveStatusStore'
import { useLivePassthroughStore, lookupLivePassthrough, resolveLiveValues, saveLivePassthrough } from '../stores/livePassthroughStore'
import { useLivePassthrough } from '../hooks/useLivePassthrough'
import { useSmartScheduleFlush } from '../hooks/useSmartScheduleFlush'
import { toUserFacingError } from '../utils/uiCopy'
import { useOnline } from '../hooks/useOnline'
import OfflineBanner from '../components/OfflineBanner'

interface DeviceRealtimeCache {
  [deviceId: string]: {
    fields: Record<string, DeviceStateField>
    raw: ReturnType<typeof mapFieldsToRealtime>
    firingAlarms?: unknown[]
    loading: boolean
    lastUpdated: number
    /** When the device took this cloud sample (its `time`), not when we fetched it. */
    sampleAt?: number
  }
}

export default function DevicePage() {
  const navigate = useNavigate()
  const location = useLocation()
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
  const passthroughEpoch = useLivePassthroughStore(s => s.epoch)
  const isDemoMode = useDeviceStore(s => s.isDemoMode)
  const deviceIds = useMemo(() => devices.map(d => String(d.id)), [devices])
  const { settings } = usePowerStationStore()

  const [showManualAdd, setShowManualAdd] = useState(false)
  const [showQrScan, setShowQrScan] = useState(false)
  const [showProvisioning, setShowProvisioning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // AC switch commands the user just flipped; what the switch shows is decided
  // by resolveAcOutput from these and what the device reported.
  const [acCommands, setAcCommands] = useState<Record<string, AcCommand>>({})
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
          sampleAt: parseDeviceStateTime(state.time),
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
    // SW-10: the legacy QR overlay has no entry point left. If anything still
    // flips this on, it closes again without the camera ever being opened.
    if (showQrScan && !QR_ENTRY_ENABLED) setShowQrScan(false)
    else if (showQrScan) startQrScan()
    return () => { stopQrScan() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQrScan])

  useEffect(() => {
    let removed = false
    let handle: { remove: () => Promise<void> } | undefined
    const setup = async () => {
      handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive || removed) return
        if (QR_ENTRY_ENABLED && cameraDeniedRef.current && showQrScanRef.current) {
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
      console.error('[DevicePage] load failed:', err)
      setError(toUserFacingError(err, 'Failed to load devices'))
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
          [idStr]: { fields: state.fields, raw: mapFieldsToRealtime(state.fields), firingAlarms: state.firingAlarms ?? [], loading: false, lastUpdated: Date.now(), sampleAt: parseDeviceStateTime(state.time) },
        }))
        recordFiringAlarms(idStr, state.firingAlarms)
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
            sampleAt: parseDeviceStateTime(result.data!.time),
          },
        }))
        recordFiringAlarms(idStr, result.data.firingAlarms)
      } else {
        setRealtimeCache(prev => ({ ...prev, [idStr]: { ...prev[idStr], loading: false } }))
        recordFiringAlarmsFailed(idStr)
      }
    } catch {
      setRealtimeCache(prev => ({
        ...prev,
        [idStr]: { ...prev[idStr], loading: false },
      }))
      recordFiringAlarmsFailed(idStr)
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
          sampleAt: parseDeviceStateTime(selectedDeviceState.time),
        },
      }))
    }
  }, [selectedDeviceState])

  /*
   * The live layer: passthrough once a minute, filed on its own rather than
   * written into the cloud cache below.
   *
   * It used to be written into `realtimeCache[id].raw`, which the 60s
   * /state/latest poll replaces wholesale — two writers into one slot, so the
   * battery percentage swung between a fresh Modbus read and a cloud sample
   * minutes older, once a minute, forever. The two are layered now and merged
   * at read time in getDeviceNum.
   */
  const { refresh: refreshLive } = useLivePassthrough(deviceIds, isAuthenticated && !isDemoMode)

  /* SW-13: this list is where a device coming back is noticed first — every
     `loadDevices` (entering the page, pull-to-refresh) re-reads each device's
     `isOnline`. A Smart Schedule save the user made while a device was
     unreachable is replayed here as soon as that device answers, whether or not
     the Smart Schedule screen is open. The shared hook reports device refusals
     and relay failures here as well, rather than silently discarding them. */
  useSmartScheduleFlush({ devices, active: isAuthenticated && !isDemoMode })

  // The phone's network (APP-20260923-002). Losing it locks the AC switches and
  // says so; getting it back re-reads everything rather than trusting what was
  // on screen when it dropped.
  const online = useOnline(() => {
    if (!isAuthenticated || useDeviceStore.getState().isDemoMode) return
    void fetchDevices()
    devices.forEach(d => fetchDeviceRealtime(d.id))
    void refreshLive()
  })

  useEffect(() => {
    if (devices.length === 0 || !isAuthenticated) return
    const refreshAll = () => devices.forEach(d => fetchDeviceRealtime(d.id))
    refreshAll()
    const timer = setInterval(refreshAll, 60000)
    // Back from the background (or another phone switched the outlets meanwhile):
    // re-read now rather than showing up to a minute of stale state — the cloud
    // sample, and the device itself, whose reading is timed on this phone's clock
    // and so settles the AC switch without waiting on the cloud-skew allowance.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      refreshAll()
      if (!useDeviceStore.getState().isDemoMode) void refreshLive()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [devices, isAuthenticated, fetchDeviceRealtime, refreshLive])

  const getDeviceNum = (deviceId: string | number, key: string): number | null => {
    void bleEpoch
    void passthroughEpoch
    const cache = realtimeCache[String(deviceId)]
    const ble = lookupBleLiveStatus({ deviceId, dtuDtuid: (devices.find(d => String(d.id) === String(deviceId)) as { dtuDtuid?: string } | undefined)?.dtuDtuid })?.live
    // cloud → BLE → passthrough, the same order the monitor page reads in.
    const merged = resolveLiveValues(cache?.raw, ble, lookupLivePassthrough(deviceId))
    const val = merged[key as keyof typeof merged]
    return val !== undefined && val !== null ? Number(val) : null
  }

  const handleBleScan = useCallback(() => {
    setShowProvisioning(true)
  }, [])

  /* Add Device elsewhere in the app (Insights' empty state) routes here, because
     provisioning is this page's own overlay rather than a route of its own. Open
     it straight away and drop the flag, so going back or reloading lands on the
     plain list instead of reopening the scan. */
  useEffect(() => {
    if ((location.state as { addDevice?: boolean } | null)?.addDevice) {
      setShowProvisioning(true)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, navigate])
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

  /** Every report of this device's AC output state, for resolveAcOutput. */
  const acSources = (device: DeviceListItem) => {
    void bleEpoch
    void passthroughEpoch
    const idStr = String(device.id)
    const cache = realtimeCache[idStr]
    const cloudOn = cache?.raw?.acOutputs
    const cloud: AcSample | null = typeof cloudOn === 'boolean' ? { on: cloudOn, at: cache?.sampleAt } : null
    const pass = lookupLivePassthrough(idStr)
    const ble = lookupBleLiveStatus({ deviceId: device.id, dtuDtuid: (device as { dtuDtuid?: string }).dtuDtuid })
    const passLive: AcSample | null = pass?.live?.acOutput !== undefined ? { on: pass.live.acOutput, at: pass.updatedAt } : null
    const bleLive: AcSample | null = ble?.live?.acOutput !== undefined ? { on: ble.live.acOutput, at: ble.updatedAt } : null
    const live = passLive && bleLive ? ((bleLive.at ?? 0) > (passLive.at ?? 0) ? bleLive : passLive) : (passLive ?? bleLive)
    return { connected: device.isOnline === true, cloud, live }
  }

  const acView = (device: DeviceListItem) =>
    resolveAcOutput({ ...acSources(device), command: acCommands[String(device.id)] })

  // Once the device has reported a sample taken after a command, the command has
  // nothing left to say; drop it so an aged-out live sample can never bring it back.
  useEffect(() => {
    const stale = devices.filter(d => commandSuperseded(acCommands[String(d.id)], acSources(d)))
    if (stale.length === 0) return
    setAcCommands(prev => {
      const next = { ...prev }
      for (const d of stale) delete next[String(d.id)]
      return next
    })
    // acSources reads the live stores through their epochs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, realtimeCache, passthroughEpoch, bleEpoch, acCommands])

  const dropAcCommand = (idStr: string) =>
    setAcCommands(prev => {
      const next = { ...prev }
      delete next[idStr]
      return next
    })

  const togglePower = async (deviceId: string | number, e: React.MouseEvent) => {
    e.stopPropagation()
    const idStr = String(deviceId)
    const device = devices.find(d => String(d.id) === idStr)
    if (!device) return
    const view = acView(device)
    if (view.pending || !online) return
    hapticMedium()
    const next = !view.on
    setAcCommands(prev => ({ ...prev, [idStr]: { on: next, at: Date.now(), status: 'sending' } }))

    if (isDemoMode) {
      setAcCommands(prev => ({ ...prev, [idStr]: { on: next, at: Date.now(), status: 'sent' } }))
      return
    }

    const r = await setAcOutput(idStr, next)
    if (r.live) saveLivePassthrough(idStr, r.live)
    if (r.ok && r.confirmed) {
      // The read-back just saved is the device saying so; nothing to hold on to.
      dropAcCommand(idStr)
    } else if (r.ok) {
      // Sent, but no read-back decoded: show what was asked until the device
      // reports a sample taken after this point.
      setAcCommands(prev => ({ ...prev, [idStr]: { on: next, at: Date.now(), status: 'sent' } }))
    } else {
      dropAcCommand(idStr)
      console.error('[DevicePage] AC output switch failed:', r.reason, r.detail)
      setError(r.reason === 'not_switched'
        ? "The device didn't switch its AC output. Try again."
        : 'Failed to switch power')
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
  const seenAlarms = useAlarmDismissStore(s => s.seen)
  // Unread count: every device's firing alarms, minus dismissed, minus seen —
  // the same rows Notifications lists (visibleAlarmEntries), from the same store,
  // over the same devices. Opening Notifications marks those rows seen, so the dot
  // clears once the user has looked and relights only for a genuinely new alert.
  const alarmsByDevice = useFiringAlarmsStore(s => s.byDevice)
  const activeAlarmCount = useMemo(
    () => unreadAlarmCount(alarmsByDevice, deviceIds, dismissedAlarms, seenAlarms),
    [alarmsByDevice, deviceIds, dismissedAlarms, seenAlarms],
  )

  if (!isAuthenticated && !isGuest) {
    return <DeviceSignInGate onSignIn={() => navigate('/login')} />
  }

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={`px-4 pb-5 safe-area-top-header ${devices.length > 0 ? 'bg-ink-10' : ''}`}
      >
        <div className="flex justify-between items-center">
          <h1 className="text-display font-display text-white">Device</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBleScan}
              aria-label="Add device"
              className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center text-white hover:bg-ink-8 transition-colors active:scale-95"
            >
              <Icon name="add" size={24} />
            </button>
            <button
              onClick={() => navigate('/notifications')}
              aria-label="Notifications"
              className="relative w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center text-white hover:bg-ink-8 transition-colors active:scale-95"
            >
              <Icon name="bell" size={24} />
              {activeAlarmCount > 0 && (
                <span className="absolute top-px right-px w-2.5 h-2.5 rounded-full bg-danger-dot" />
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Banners under the header ("Failed to switch power", "The device didn't
          switch…", offline). Each carries its own 16px top gap — the same gutter
          the card list keeps below — inside the wrapper that animates its height.
          They sat flush against the header with a 4px gap below, so the banner
          read as overlapping the header's lower edge (v4.17.4). */}
      <div className="px-4">
        <OfflineBanner show={!online && !isDemoMode} className="pt-4" />
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden pt-4"
            >
              <div
                role="alert"
                className="bg-danger/[0.08] border border-danger/[0.15] rounded-l px-4 py-2.5 flex items-center gap-2"
              >
                <AlertTriangle size={14} className="text-danger flex-shrink-0" />
                <span className="text-label text-danger flex-1">{error}</span>
                <button onClick={() => setError(null)} aria-label="Dismiss" className="text-danger">
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <PullToRefresh onRefresh={async () => { await loadDevices(1, 50) }}>
      <div className="px-4 pb-4">
        <AnimatePresence>
          {lowBatteryDevice && !bannerDismissed && (
            <LowBatteryBanner
              name={lowBatteryDevice.name}
              durationStr={lowBatteryTimeStr}
              threshold={lowBatteryThreshold}
              onOpen={() => navigate('/notifications')}
              onDismiss={() => setBannerDismissed(true)}
            />
          )}
        </AnimatePresence>

        {deviceLoading && devices.length === 0 && !devicesListReady ? (
          <div className="flex flex-col gap-4 pt-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-l p-5 bg-ink-10 animate-pulse h-[150px]" />
            ))}
          </div>
        ) : devices.length > 0 ? (
          <div className="flex flex-col gap-4 pt-4">
            {devices.map((device, index) => {
              const remainingBatteryCapacityRaw = getDeviceNum(device.id, 'remainingBatteryCapacity')
              const remainingBatteryCapacity = remainingBatteryCapacityRaw ?? 0
              const remainingBatteryCapacityKnown = remainingBatteryCapacityRaw !== null
              const batteryPower = getDeviceNum(device.id, 'batteryPower')
              const isCharging = batteryPower !== null && batteryPower > 0
              const connected = device.isOnline
              const ac = acView(device)
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
                  powerOn={ac.on}
                  toggling={ac.pending}
                  controlsLocked={!online && !isDemoMode}
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
        {QR_ENTRY_ENABLED && showQrScan && (
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
      // SW-15: the raw getUserMedia message is classified, never displayed.
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[DevicePage] camera start failed:', err)
      if (/denied|permission|notallowed/i.test(msg)) {
        setCameraDenied(true)
        setQrError('Camera access was denied. Please enable camera permission in Settings to scan QR codes.')
      } else {
        setQrError('Camera error')
      }
      setQrScanning(false)
      setQrVideoReady(false)
    }
  }
}
