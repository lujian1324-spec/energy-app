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
  X,
  RefreshCw,
  Wifi,
  WifiOff,
  Thermometer,
  Activity,
  Info,
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
  Refrigerator,
  Lamp,
  Fish,
  PlugZap,
  BookOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Icon from '../components/Icon'
import PullToRefresh from '../components/PullToRefresh'
import ManualAddDeviceModal from '../components/ManualAddDeviceModal'
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
import { formatTemp } from '../utils/localization'
import { batteryTimeLabel } from '../utils/batteryTime'
import { hapticMedium } from '../utils/haptics'
import { loadRatedParams } from '../db/powerflowDB'
import type { DeviceListItem, DeviceStateField } from '../api/deviceApi'
import { getDemoDeviceState } from '../data/demoData'
import { useBleLiveStatusStore, lookupBleLiveStatus, mergeCloudWithBle } from '../stores/bleLiveStatusStore'
