/**
 * Bind/setup fail copy helpers (APP-20260831-001).
 * Kept separate so vitest can cover titles without loading the BLE page.
 */

export type FailKind = 'wifi' | 'bind' | 'disconnect' | 'timeout' | null

export const BIND_FAIL_COPY = "Device connected to Wi-Fi, but couldn't be added to your account"
export const BIND_WIFI_HELPER = "Wi-Fi is already connected. You don't need to re-enter the password."
export const BIND_FAIL_TITLE = "Couldn't add device"
export const SETUP_FAILED_TITLE = 'Setup Failed'
export const RESTART_HELP_COPY = 'Power off the device, wait 10 seconds, then power on and wait for the pairing light.'

export function bindFailTitle(failKind: FailKind, wifiConfigured: boolean): string {
  if (failKind === 'bind' || wifiConfigured) return BIND_FAIL_TITLE
  return SETUP_FAILED_TITLE
}

export function isJunkError(msg?: string | null): boolean {
  if (!msg) return true
  return /illegal argument|internal error|internal\/validation|validation|null pointer|stack trace|exception|sql|constraint|undefined|econn|status code|rc=/i.test(msg)
}

export type BindFailReasonKind = 'already_bound' | 'device_offline' | 'timeout' | 'invalid'

const REASON_COPY: Record<BindFailReasonKind, string> = {
  already_bound: 'This device is already added to an account.',
  device_offline: 'The device is offline. Keep it powered on and close to the router.',
  timeout: 'Adding the device timed out. Try adding again.',
  invalid: "Couldn't add this device. Check the details and try again.",
}

export function mapBindFailReason(
  code?: number | string | null,
  message?: string | null,
): { kind?: BindFailReasonKind; reason?: string; errorId?: string } {
  const blob = `${code ?? ''} ${message ?? ''}`
  let kind: BindFailReasonKind | undefined
  if (/already[_\s-]?bound|already[_\s-]?add|already[_\s-]?exist|bound[_\s-]?to|duplicate|已绑定|已经绑定/i.test(blob)) {
    kind = 'already_bound'
  } else if (/offline|not[_\s-]?online|device[_\s-]?offline|离线/i.test(blob)) {
    kind = 'device_offline'
  } else if (/timeout|timed[_\s-]?out|应答超时|等待设备/i.test(blob)) {
    kind = 'timeout'
  } else if (/invalid|bad[_\s-]?request/i.test(blob) && !isJunkError(message)) {
    kind = 'invalid'
  }

  return {
    kind,
    reason: kind ? REASON_COPY[kind] : undefined,
    errorId: extractErrorId(code, message),
  }
}

function extractErrorId(code?: number | string | null, message?: string | null): string | undefined {
  if (code != null && String(code) !== '' && String(code) !== '0') {
    const s = String(code)
    if (/^[A-Za-z][\w.-]{1,39}$/.test(s) || /^\d{3,}$/.test(s)) return s
  }
  // ERR_* ids may contain extra underscores (ERR_BIND_42); match those first.
  const m = String(message ?? '').match(/\b(ERR[_-][A-Z0-9_]+|[A-Z]{2,}[-_]\d{2,}|\d{5,})\b/)
  return m?.[1]
}
