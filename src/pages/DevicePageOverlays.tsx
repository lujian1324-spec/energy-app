import React, { useState, useRef, useEffect, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { openAppSettings } from '../utils/openAppSettings'
import { requestCamera } from '../utils/permissions'
import { toast } from '../components/Toast'
import { motion, AnimatePresence } from 'framer-motion'
import jsQR from 'jsqr'
import ProvisioningPage from './ProvisioningPage'
import { supportsDeviceListScan } from '../protocols/bleProvision'
import {
  X,
  RefreshCw,
  Wifi,
  Thermometer,
  Activity,
  Clock,
  MapPin,
  Hash,
  Cpu,
  Server,
  TrendingUp,
  TrendingDown,
  Zap,
  Battery,
  Sun,
} from 'lucide-react'
import Icon from '../components/Icon'
import ManualAddDeviceModal from '../components/ManualAddDeviceModal'
import { formatTemp } from '../utils/localization'
import type { DeviceListItem, DeviceStateField } from '../api/deviceApi'
import { mapFieldsToRealtime } from '../api/deviceApi'

interface BleDevice {
  id: string
  name: string
  rssi?: number
}

interface DeviceRealtimeCache {
  [deviceId: string]: {
    fields: Record<string, DeviceStateField>
    raw: ReturnType<typeof mapFieldsToRealtime>
    firingAlarms?: unknown[]
    loading: boolean
    lastUpdated: number
  }
}

export interface DevicePageOverlaysProps {
  showAddModal: boolean
  setShowAddModal: (v: boolean) => void
  navigate: (path: string) => void
  realtimeCache: DeviceRealtimeCache
  fetchDeviceRealtime: (deviceId: number | string) => Promise<void>
  getDeviceNum: (deviceId: string | number, key: string) => number | null
  getDeviceField: (deviceId: string | number, key: string) => string
  getWorkModeLabel: (mode: number | null | undefined) => string
  getDeviceImage: (sortKey?: string) => string
}

export default function DevicePageOverlays({
  showAddModal,
  setShowAddModal,
  navigate,
  realtimeCache,
  fetchDeviceRealtime,
  getDeviceNum,
  getDeviceField,
  getWorkModeLabel,
  getDeviceImage,
}: DevicePageOverlaysProps) {
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [showQrScan, setShowQrScan] = useState(false)
  const [showBleScan, setShowBleScan] = useState(false)
  const [showProvisioning, setShowProvisioning] = useState(false)
  const [showDeviceParams, setShowDeviceParams] = useState<DeviceListItem | null>(null)

  const [isScanning, setIsScanning] = useState(false)
  const [scannedDevices, setScannedDevices] = useState<BleDevice[]>([])
  const [scanError, setScanError] = useState<string | null>(null)
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

  const handleBleScan = useCallback(async () => {
    setShowAddModal(false)
    if (supportsDeviceListScan()) {
      setShowProvisioning(true)
      return
    }
    if (!('bluetooth' in navigator)) {
      setBlePermissionType('unsupported')
      return
    }
    setShowProvisioning(true)
  }, [setShowAddModal])
