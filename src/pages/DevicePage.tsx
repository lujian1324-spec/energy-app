import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  X,
  RefreshCw,
  Wifi,
  WifiOff,
  Server,
  Zap,
  Battery,
  Refrigerator,
  Lamp,
  Fish,
  PlugZap,
  BookOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Icon from '../components/Icon'
import PullToRefresh from '../components/PullToRefresh'
import DevicePageOverlays from './DevicePageOverlays'
import { useDeviceStore } from '../stores/deviceStore'
import { useAuthStore } from '../stores/authStore'
import { useAlarmDismissStore, alarmKey } from '../stores/alarmDismissStore'
import { usePowerStationStore } from '../stores/powerStationStore'
import { dedupeAndFilterAlarms } from '../utils/alarmText'
import type { FiringAlarm } from '../utils/powerOutageNotification'
import sierroProductImg from '../assets/sierro-product.webp'
import { mapFieldsToRealtime, fetchDeviceState, passthroughDevice } from '../api/deviceApi'
import { FRAMES, decodePassthroughBase64, decodeLiveStatus } from '../protocols/modbusProtocol'
import { isApiSuccess } from '../utils/apiClient'
import { batteryTimeLabel } from '../utils/batteryTime'
import { hapticMedium } from '../utils/haptics'
import { loadRatedParams } from '../db/powerflowDB'
import type { DeviceListItem, DeviceStateField } from '../api/deviceApi'
import { getDemoDeviceState } from '../data/demoData'

const deviceIcons: Record<string, string> = {
  cpap: '💤',
  fridge: '🧊',
  fish_tank: '🐟',
  nas: '💾',
  wifi_router: '📶',
  powerstation: '⚡',
  default: '🔌',
}

const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  zap: Zap,
  refrigerator: Refrigerator,
  server: Server,
  lamp: Lamp,
  fish: Fish,
  plugzap: PlugZap,
  wifi: Wifi,
  cpap: BookOpen,
}

const getSavedDisplayIconId = (deviceId: string): string | null =>
  localStorage.getItem(`sierro-display-icon-${deviceId}`)

export default function DevicePage() {
  const navigate = useNavigate()
  const {
    devices,
    deviceLoading,
    devicesListReady,
    loadDevices,
    loadStations,
    selectedDeviceState,
    isDemoMode,
  } = useDeviceStore()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const isGuest = useAuthStore(s => s.isGuest)
  const { settings } = usePowerStationStore()

  const [showAddModal, setShowAddModal] = useState(false)
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

  interface DeviceRealtimeCache {
    [deviceId: string]: {
      fields: Record<string, DeviceStateField>
      raw: ReturnType<typeof mapFieldsToRealtime>
      firingAlarms?: unknown[]
      loading: boolean
      lastUpdated: number
    }
  }
