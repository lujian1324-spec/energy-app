/**
 * BLE 配网蓝牙名称解析
 *
 * 采集器蓝牙名称格式: 前缀 + 连接状态 + base64(DTUID转成10字节HEX)
 * 例: SSL_0IIOTUJF3AgEpIA==  →  DTUID 20839350917702012920
 *
 * 前缀: 出厂默认 "SSL_" (可修改，1~8字符)
 * 连接状态: 0=WiFi未连接, 1=WiFi已连接, 2=保留, 3=已连接MQTT
 * DTUID: 20位纯数字，采集器唯一标识
 */
import { type ParsedBleName } from '../types/protocol'

const STATUS_MAP: Record<string, number> = {
  '0': 0, // WiFi 未连接
  '1': 1, // WiFi 已连接
  '2': 2, // 保留
  '3': 3, // 已连接 MQTT
}

/** Strip iOS/CoreBluetooth junk and pad standard or URL-safe base64. */
function normalizeBleName(name: string): string {
  return name.replace(/\0/g, '').trim()
}

function decodeBase64(input: string): string | null {
  const s = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  try {
    return atob(padded)
  } catch {
    return null
  }
}

/**
 * 从蓝牙设备名称中解析 DTUID 和状态
 *
 * @param name 蓝牙设备名称 (如 "SSL_0IIOTUJF3AgEpIA==")
 * @returns 解析结果或 null
 */
export function parseBleName(name: string): ParsedBleName | null {
  if (!name) return null
  const cleaned = normalizeBleName(name)
  if (cleaned.length < 7) return null // 最短: 1+1+base64("AA==")

  // 格式: prefix + digit + base64string ；prefix 以 '_' 结尾
  const underscoreIdx = cleaned.indexOf('_')
  if (underscoreIdx < 0) return null

  const prefix = cleaned.substring(0, underscoreIdx + 1) // 包含 "_"
  const rest = cleaned.substring(underscoreIdx + 1)
  if (rest.length < 2) return null

  const statusChar = rest[0]
  const base64Part = rest.substring(1)
  if (!(statusChar in STATUS_MAP)) return null

  const decoded = decodeBase64(base64Part)
  if (decoded == null) return null

  // DTUID: 10 bytes → 20 hex chars (factory IDs are 20 decimal digits)
  let dtuid = ''
  for (let i = 0; i < decoded.length; i++) {
    dtuid += decoded.charCodeAt(i).toString(16).padStart(2, '0')
  }
  if (dtuid.length !== 20) return null

  return {
    prefix,
    status: STATUS_MAP[statusChar],
    dtuid,
  }
}

/**
 * 从蓝牙名称中快速提取 DTUID（简化版）
 */
export function extractDtuid(name: string): string | null {
  const parsed = parseBleName(name)
  return parsed?.dtuid ?? null
}

/** True when a string is the 20-digit collector ID. */
export function isDtuid(value: string | null | undefined): boolean {
  return !!value && /^\d{20}$/.test(value)
}

/** 连接状态描述 */
export function getStatusText(status: number): string {
  switch (status) {
    case 0: return 'WiFi 未连接'
    case 1: return 'WiFi 已连接'
    case 3: return 'MQTT 已连接'
    default: return '未知'
  }
}
