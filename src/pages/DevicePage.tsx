import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { openAppSettings } from '../utils/openAppSettings'
import { requestCamera } from '../utils/permissions'
import { toast } from '../components/Toast'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import jsQR from 'jsqr'
import ProvisioningPage from './ProvisioningPage'
import { supportsDeviceListScan } from '../protocols/bleProvision'
import {
  AlertTriangle,
  Plus,
  X,
} from 'lucide-react'
import Icon from '../components/Icon'
import DeviceEmptyState from './device/DeviceEmptyState'
import DeviceListCard from './device/DeviceListCard'
import DeviceQrScanOverlay from './device/DeviceQrScanOverlay'
import LowBatteryBanner from './device/LowBatteryBanner'
import DeviceSignInGate from './device/DeviceSignInGate'
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
  const [blePermissionType, setBlePermissionType] = useState<'unsupported' | 'denied' | null>(null)
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

  const handleBleScan = useCallback(async () => {
    if (supportsDeviceListScan()) {
      setShowProvisioning(true)
      return
    }
    if (!('bluetooth' in navigator)) {
      setBlePermissionType('unsupported')
      return
    }
    setShowProvisioning(true)
  }, [])
