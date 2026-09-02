import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Share2, Loader2, WifiOff, Zap, ChevronLeft, ChevronRight, Leaf, RefreshCw } from 'lucide-react'
import html2canvas from 'html2canvas'
import { toast } from '../components/Toast'
import { CalcAudit } from '../components/DataTrust'
import { useDeviceStore } from '../stores/deviceStore'
import { fetchDeviceRecordHistory, type DeviceAttributeRecord } from '../api/deviceApi'
import { isApiSuccess } from '../utils/apiClient'
import { useCountUp } from '../hooks/useCountUp'

const periods = ['Day', 'Week', 'Month', 'Range'] as const
type Period = typeof periods[number]

function weekStart(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const s = new Date(d)
  s.setDate(d.getDate() + diff)
  s.setHours(0, 0, 0, 0)
  return s
}

function toIsoTz(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const tz = sign + String(Math.floor(Math.abs(off) / 60)).padStart(2, '0') + ':' + String(Math.abs(off) % 60).padStart(2, '0')
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
    'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0') + tz
}

function fieldVal(rec: DeviceAttributeRecord, key: string): number {
  const f = rec.fields?.[key]
  if (f === undefined || f === null) return 0
  const raw = typeof f === 'object' && f !== null && 'value' in f ? (f as { value?: unknown }).value : f
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}
