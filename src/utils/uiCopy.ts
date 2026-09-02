/** Map known backend/device Chinese phrases to English UI copy. */
const CJK_RE = /[\u3400-\u9FFF]/

/** Known Chinese (and mixed) phrases → English. Exact match first, then substring. */
export const UI_COPY_MAP: Record<string, string> = {
  '等待设备应答超时': 'Timed out waiting for the device.',
  'BLE 未连接或 DTUID 未知': 'Bluetooth is not connected or the device ID is unknown.',
  'BLE 未连接，请重新连接设备': 'Bluetooth is not connected. Reconnect the device.',
  '应答解密失败': 'Failed to decrypt the device response.',
  '电芯过压': 'Cell overvoltage',
  '电芯欠压': 'Cell undervoltage',
  '市电故障': 'Mains power failure',
  '市电断电': 'Mains power failure',
  '电网故障': 'Grid fault',
  '过载': 'Output overload',
  '过温': 'Over-temperature',
  '通信故障': 'Communication fault',
  '通讯故障': 'Communication fault',
  '设备离线': 'The device is offline.',
  '已绑定': 'This device is already added to an account.',
}

export function containsCjk(text: string | undefined | null): boolean {
  if (!text) return false
  return CJK_RE.test(String(text))
}

/**
 * Translate a backend/device string for display.
 * Known phrases map to English; leftover CJK becomes a generic English fallback
 * ("Request timed out" when the text looks like a timeout, otherwise the given fallback).
 */
export function sanitizeUiCopy(
  text: string | undefined | null,
  fallback = 'Something went wrong',
): string {
  if (text == null) return fallback
  const raw = String(text).trim()
  if (!raw) return fallback
  if (UI_COPY_MAP[raw]) return UI_COPY_MAP[raw]
  for (const [zh, en] of Object.entries(UI_COPY_MAP)) {
    if (zh && raw.includes(zh)) return en
  }
  if (containsCjk(raw)) {
    if (/超时|timeout|timed\s*out/i.test(raw)) return 'Request timed out'
    return fallback
  }
  return raw
}
