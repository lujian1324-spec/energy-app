/**
 * Centralized permission handling — single source of truth for requesting and
 * testing every permission the app relies on:
 *
 *   notifications · camera · bluetooth · wifi/network · storage
 *
 * Each permission exposes a `request()` (prompt the user) and a `check()`
 * (test the current state without prompting, where possible). Both return a
 * normalized PermissionResult so the UI can render a consistent status badge.
 *
 * Designed PWA-first (Web APIs) with graceful fallbacks; on Capacitor the same
 * Web APIs are bridged to native, and unsupported queries degrade to a probe.
 */

import { Capacitor } from '@capacitor/core'
import { NATIVE_PUSH_READY } from '../config/webPush'

/** True when running inside the native Capacitor shell (Android/iOS app). */
const isNative = (): boolean => Capacitor.isNativePlatform()

/** Map a Capacitor plugin permission string to our PermissionState. */
function mapCapState(s: string | undefined): PermissionState {
  switch (s) {
    case 'granted': return 'granted'
    case 'denied': return 'denied'
    case 'prompt':
    case 'prompt-with-rationale': return 'prompt'
    default: return 'prompt'
  }
}

export type PermissionId = 'notifications' | 'camera' | 'bluetooth' | 'wifi' | 'storage'

export type PermissionState =
  | 'granted'      // user has allowed it
  | 'denied'       // user has blocked it
  | 'prompt'       // not yet decided — will ask on request
  | 'unsupported'  // API not available in this environment

export interface PermissionResult {
  state: PermissionState
  /** Human-readable extra context (e.g. "Persisted, 12MB used"). */
  detail?: string
}

const ok = (detail?: string): PermissionResult => ({ state: 'granted', detail })
const no = (detail?: string): PermissionResult => ({ state: 'denied', detail })
const ask = (detail?: string): PermissionResult => ({ state: 'prompt', detail })
const na = (detail?: string): PermissionResult => ({ state: 'unsupported', detail })

/**
 * Resolve a promise but never hang: if it doesn't settle within `ms`, fall back.
 * Critical for WebView (Capacitor) where getUserMedia / requestPermission can
 * hang forever when the native bridge isn't wired up.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

// ─── Permissions API helper (not supported everywhere, esp. iOS Safari) ───────

async function queryPermission(name: PermissionName): Promise<PermissionState | null> {
  try {
    if (!('permissions' in navigator) || !navigator.permissions?.query) return null
    const status = await navigator.permissions.query({ name })
    if (status.state === 'granted') return 'granted'
    if (status.state === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return null // name not queryable in this browser
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Notifications
// ═══════════════════════════════════════════════════════════════════════════

export async function checkNotifications(): Promise<PermissionResult> {
  if (isNative()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const { receive } = await PushNotifications.checkPermissions()
      const st = mapCapState(receive)
      return st === 'granted' ? ok('Allowed') : st === 'denied' ? no('Blocked — enable in system settings') : ask('Not requested yet')
    } catch {
      return na('Notifications plugin unavailable')
    }
  }
  if (!('Notification' in window)) return na('Notifications API unavailable')
  switch (Notification.permission) {
    case 'granted': return ok('Allowed')
    case 'denied': return no('Blocked — enable in system settings')
    default: return ask('Not requested yet')
  }
}

export async function requestNotifications(): Promise<PermissionResult> {
  if (isNative()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const { receive } = await PushNotifications.requestPermissions()
      const st = mapCapState(receive)
      // 授权后注册 APNs/FCM，使后端 Web/原生推送可达 — 仅在真实凭据就绪时调用,
      // 否则 FirebaseMessaging.getInstance() 会因 FirebaseApp 未初始化而失败/崩溃
      if (st === 'granted' && NATIVE_PUSH_READY) { try { await PushNotifications.register() } catch { /* ignore */ } }
      return st === 'granted' ? ok('Allowed') : st === 'denied' ? no('Blocked') : ask('Dismissed')
    } catch {
      return na('Notifications plugin unavailable')
    }
  }
  if (!('Notification' in window)) return na('Notifications API unavailable')
  if (Notification.permission === 'denied') return no('Blocked — enable in system settings')
  try {
    const perm = await withTimeout(
      Notification.requestPermission(),
      8000,
      Notification.permission,
    )
    return perm === 'granted' ? ok('Allowed') : perm === 'denied' ? no('Blocked') : ask('Dismissed')
  } catch {
    return no('Request failed')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Camera
// ═══════════════════════════════════════════════════════════════════════════

export async function checkCamera(): Promise<PermissionResult> {
  if (isNative()) {
    try {
      const { Camera } = await import('@capacitor/camera')
      const { camera } = await Camera.checkPermissions()
      const st = mapCapState(camera)
      return st === 'granted' ? ok('Allowed') : st === 'denied' ? no('Blocked — enable in system settings') : ask('Not requested yet')
    } catch {
      return na('Camera plugin unavailable')
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) return na('Camera API unavailable')
  const q = await queryPermission('camera' as PermissionName)
  if (q === 'granted') return ok('Allowed')
  if (q === 'denied') return no('Blocked — enable in system settings')
  return ask('Not requested yet')
}

export async function requestCamera(): Promise<PermissionResult> {
  if (isNative()) {
    try {
      const { Camera } = await import('@capacitor/camera')
      const { camera } = await Camera.requestPermissions({ permissions: ['camera'] })
      const st = mapCapState(camera)
      return st === 'granted' ? ok('Allowed') : st === 'denied' ? no('Blocked') : ask('Dismissed')
    } catch {
      return na('Camera plugin unavailable')
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) return na('Camera API unavailable')
  try {
    const stream = await withTimeout(
      navigator.mediaDevices.getUserMedia({ video: true }),
      10000,
      null as MediaStream | null,
    )
    if (!stream) return no('Timed out or blocked')
    stream.getTracks().forEach(t => t.stop())
    return ok('Allowed')
  } catch (e) {
    const err = e as DOMException
    if (err?.name === 'NotAllowedError') return no('Blocked by user')
    if (err?.name === 'NotFoundError') return na('No camera found')
    return no('Request failed')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Bluetooth (Web Bluetooth)
// ═══════════════════════════════════════════════════════════════════════════

export async function checkBluetooth(): Promise<PermissionResult> {
  if (isNative()) {
    try {
      const { BleClient } = await import('@capacitor-community/bluetooth-le')
      // initialize() is the permission gate on both platforms:
      // - Android: triggers BLUETOOTH_SCAN / BLUETOOTH_CONNECT prompts (API 31+)
      // - iOS: triggers the CoreBluetooth authorization dialog
      await BleClient.initialize({ androidNeverForLocation: true })
      // After init, check radio state — separate from permission state
      const enabled = await withTimeout(BleClient.isEnabled(), 4000, false)
      if (!enabled) return no('Bluetooth is off')
      return ok('Bluetooth ready')
    } catch {
      // initialize() throws when permission is denied at the OS level
      return no('Blocked — enable in system settings')
    }
  }
  const bt = (navigator as any).bluetooth
  if (!bt) return na('Web Bluetooth unavailable')
  try {
    // getAvailability() tells us whether a radio exists & is on — not whether
    // the user granted a device, but it's the only non-prompting signal.
    const available = await withTimeout(bt.getAvailability?.() ?? Promise.resolve(true), 4000, false)
    return available ? ask('Adapter ready — pick a device to pair') : no('Bluetooth is off')
  } catch {
    return ask('Adapter status unknown')
  }
}

export async function requestBluetooth(): Promise<PermissionResult> {
  if (isNative()) {
    try {
      const { BleClient } = await import('@capacitor-community/bluetooth-le')
      // initialize() triggers the OS Bluetooth permission dialog on both platforms.
      // Android: BLUETOOTH_SCAN + BLUETOOTH_CONNECT (API 31+)
      // iOS: CoreBluetooth authorization
      await BleClient.initialize({ androidNeverForLocation: true })
      const enabled = await withTimeout(BleClient.isEnabled(), 6000, false)
      if (!enabled) return no('Bluetooth is off — enable it in system settings')
      return ok('Bluetooth ready')
    } catch {
      // initialize() throws when user denies the OS permission dialog
      return no('Bluetooth permission denied — enable in system settings')
    }
  }
  const bt = (navigator as any).bluetooth
  if (!bt) return na('Web Bluetooth unavailable')
  try {
    // Opens the browser device picker — user can cancel.
    const device = await withTimeout(
      bt.requestDevice({ acceptAllDevices: true }),
      30000,
      null,
    )
    return device ? ok('Device paired') : no('Cancelled')
  } catch (e) {
    const err = e as DOMException
    if (err?.name === 'NotFoundError') return no('Cancelled — no device chosen')
    return no('Request failed')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WiFi / Network
//   The web has no "WiFi permission"; the meaningful signal is network
//   reachability (online + connection type). On iOS native this maps to the
//   Local Network permission, requested implicitly during BLE provisioning.
// ═══════════════════════════════════════════════════════════════════════════

export async function checkWifi(): Promise<PermissionResult> {
  const online = navigator.onLine
  const conn = (navigator as any).connection || (navigator as any).webkitConnection
  const type: string | undefined = conn?.type || conn?.effectiveType
  if (!online) return no('Offline')
  return ok(type ? `Online (${type})` : 'Online')
}

export async function requestWifi(): Promise<PermissionResult> {
  // Nothing to prompt for on the web — verify reachability instead.
  return checkWifi()
}

// ═══════════════════════════════════════════════════════════════════════════
// Storage (persistent storage so the OS won't evict our data)
// ═══════════════════════════════════════════════════════════════════════════

function bytesToHuman(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function storageDetail(): Promise<string | undefined> {
  try {
    if (!navigator.storage?.estimate) return undefined
    const { usage } = await navigator.storage.estimate()
    return usage != null ? `${bytesToHuman(usage)} used` : undefined
  } catch {
    return undefined
  }
}

export async function checkStorage(): Promise<PermissionResult> {
  // localStorage is the baseline; if it works, basic storage is granted.
  let basic = false
  try {
    const k = '__sierro_storage_test__'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    basic = true
  } catch {
    basic = false
  }
  if (!basic) return no('localStorage blocked')

  const detail = await storageDetail()
  if (navigator.storage?.persisted) {
    try {
      const persisted = await navigator.storage.persisted()
      return persisted
        ? ok(detail ? `Persistent · ${detail}` : 'Persistent')
        : ask(detail ? `Best-effort · ${detail}` : 'Best-effort (may be evicted)')
    } catch {
      /* fall through */
    }
  }
  return ok(detail ?? 'Available')
}

export async function requestStorage(): Promise<PermissionResult> {
  // Confirm baseline localStorage first.
  const base = await checkStorage()
  if (base.state === 'denied' || base.state === 'unsupported') return base

  if (navigator.storage?.persist) {
    try {
      const granted = await withTimeout(navigator.storage.persist(), 5000, false)
      const detail = await storageDetail()
      return granted
        ? ok(detail ? `Persistent · ${detail}` : 'Persistent')
        : ask(detail ? `Best-effort · ${detail}` : 'Best-effort (may be evicted)')
    } catch {
      return base
    }
  }
  return base
}

// ═══════════════════════════════════════════════════════════════════════════
// BLE 错误分类（ProvisioningPage & OverviewPage 共用）
// ═══════════════════════════════════════════════════════════════════════════

export type BLErrorKind = 'permission' | 'bluetooth_off' | 'generic'

export interface ClassifiedBLError {
  kind: BLErrorKind
  msg: string
}

/** 从 BLE 错误消息/对象中提取错误类型，驱动 UI：
 *  - 'permission' → 显示 "Open Settings" 引导去系统设置
 *  - 'bluetooth_off' → 显示 "Enable Bluetooth" 重试按钮
 *  - 'generic' → 显示错误文本
 */
export function classifyBleError(err: unknown): ClassifiedBLError {
  const msg = err instanceof Error ? err.message : 'Connection failed'
  const low = msg.toLowerCase()
  if (low.includes('permission') || low.includes('denied')) return { kind: 'permission', msg }
  if (low.includes('not available') || low.includes('not enabled') ||
      low.includes('disabled') || low.includes('bluetooth is off') || low.includes('adapter')) {
    return { kind: 'bluetooth_off', msg }
  }
  return { kind: 'generic', msg }
}

// ═══════════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════════

export interface PermissionDef {
  id: PermissionId
  title: string
  description: string
  request: () => Promise<PermissionResult>
  check: () => Promise<PermissionResult>
}

export const PERMISSION_DEFS: PermissionDef[] = [
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Get alerted instantly when a power outage or device alarm occurs.',
    request: requestNotifications,
    check: checkNotifications,
  },
  {
    id: 'camera',
    title: 'Camera',
    description: 'Scan QR codes to add devices and update your profile photo.',
    request: requestCamera,
    check: checkCamera,
  },
  {
    id: 'bluetooth',
    title: 'Bluetooth',
    description: 'Connect directly to your SIERRO device for setup and control.',
    request: requestBluetooth,
    check: checkBluetooth,
  },
  {
    id: 'wifi',
    title: 'Wi-Fi / Network',
    description: 'Send Wi-Fi credentials to your device and stay in sync over the network.',
    request: requestWifi,
    check: checkWifi,
  },
  {
    id: 'storage',
    title: 'Local Storage',
    description: 'Save your profile, settings, and history on this device.',
    request: requestStorage,
    check: checkStorage,
  },
]

/** Run every permission's check() in parallel. */
export async function checkAllPermissions(): Promise<Record<PermissionId, PermissionResult>> {
  const entries = await Promise.all(
    PERMISSION_DEFS.map(async d => [d.id, await d.check()] as const),
  )
  return Object.fromEntries(entries) as Record<PermissionId, PermissionResult>
}

/** Request every permission sequentially (so prompts don't overlap). */
export async function requestAllPermissions(): Promise<Record<PermissionId, PermissionResult>> {
  const out = {} as Record<PermissionId, PermissionResult>
  for (const d of PERMISSION_DEFS) {
    out[d.id] = await d.request()
  }
  return out
}
