/**
 * BLE 配网蓝牙名称解析
 *
 * 采集器蓝牙名称格式: 前缀 + 连接状态 + base64(DTUID转成10字节HEX)
 * 例: SSL_0IIOTUJF3AgEpIA==
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

/**
 * 从蓝牙设备名称中解析 DTUID 和状态
 *
 * @param name 蓝牙设备名称 (如 "SSL_0IIOTUJF3AgEpIA==")
 * @returns 解析结果或 null
 */
export function parseBleName(name: string): ParsedBleName | null {
  // 名称格式: <prefix><status><base64_payload>
  // prefix 至少1字符（"SSL_" = 4字符），status 1字符，后面是 base64
  if (!name || name.length < 7) return null // 最短: 1+1+base64("AA==") = 4+1+4 = 至少需要类似 SSL_0AA== 但base64至少4字符

  // 从后往前找数字状态位 (0/1/2/3)
  // 格式: prefix + digit + base64string
  // prefix 包含 "_" 分隔符，我们尝试找最后一个 '_' 后的第一个字符作为状态
  const underscoreIdx = name.indexOf('_')
  if (underscoreIdx < 0) return null

  const prefix = name.substring(0, underscoreIdx + 1) // 包含 "_"
  const rest = name.substring(underscoreIdx + 1)

  if (rest.length < 2) return null // 至少: status(1) + base64(至少4)

  const statusChar = rest[0]
  const base64Part = rest.substring(1)

  if (!(statusChar in STATUS_MAP)) return null

  // base64 解码 DTUID
  let decoded: string
  try {
    decoded = atob(base64Part)
  } catch {
    return null
  }

  // DTUID 转回 20 位数字: 每 2 个字符是一个 byte 的 hex 表示
  // 例: 0x20 0x83 0x93 ... → "20839350917702012920"
  let dtuid = ''
  for (let i = 0; i < decoded.length; i++) {
    const byte = decoded.charCodeAt(i)
    dtuid += byte.toString(16).padStart(2, '0')
  }

  // 验证 DTUID 是 20 位纯数字（hex 字符串，每 byte 产生 2 个 hex 字符）
  // 10 bytes * 2 = 20 个 hex 字符
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

/** 连接状态描述 */
export function getStatusText(status: number): string {
  switch (status) {
    case 0: return 'WiFi 未连接'
    case 1: return 'WiFi 已连接'
    case 3: return 'MQTT 已连接'
    default: return '未知'
  }
}
