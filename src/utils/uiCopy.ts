/** Map known backend/device Chinese phrases to English UI copy. */
const CJK_RE = /[㐀-鿿]/

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
  '已绑定': 'Device already added to another account.',
}

/**
 * SW-15: text shapes that must never reach a user-facing surface — exception
 * class names, stack frames, JVM package paths, raw backend/Modbus debug
 * strings. Engineering logs keep the original text (AC-15-7); only the copy
 * that is rendered gets replaced with reviewed or generic wording.
 *
 * This is a blacklist, not a whitelist, so already-reviewed English copy keeps
 * flowing through `sanitizeUiCopy` unchanged (AC-15-9).
 */
const UNSAFE_UI_COPY_PATTERNS: RegExp[] = [
  // The reported offender, in every casing/spacing the backend has used.
  /illegal[\s_-]*argument/i,
  // Exception / error class names, with or without a package prefix.
  /\b[A-Za-z_$][\w$]*(?:Exception|Throwable)\b/,
  /\bexceptions?\b/i,
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError|AggregateError|InternalError)\b/,
  /\bnull\s*pointer\b/i,
  // Package-qualified symbols: java.lang.String, com.sierro.Foo, org.spring…
  /\b(?:java|javax|jakarta|sun|org|com|io|net)\.[a-z0-9_]+\.[A-Za-z0-9_$.]+/,
  // Stack frames: "\tat com.foo.Bar.baz(Bar.java:42)", "at Object.<anonymous>".
  /(?:^|\n)\s*at\s+[\w$<>.[\]]+\s*\(/,
  /\bstack\s*trace\b/i,
  // The SW-11 family of raw product-model strings, including its misspellings.
  /\bconfig(?:uration)?\s+(?:attribute|contribute)\b/i,
  /\battributes?\s+not\s+exists?\b/i,
  // Raw dumps and bare debug return codes.
  /^[[{][\s\S]*[\]}]$/,
  /\[object\s+\w+\]/i,
  /\b(?:rc|ret|errno|errcode)\s*[=:]\s*-?\d+/i,
  /\bERR_[A-Z0-9_]+\b/,
  /\bECONN\w*\b/i,
  /\bstatus\s*code\b/i,
  // Plumbing text that is never product copy.
  /\b(?:internal error|internal server error|bad gateway|service unavailable|gateway timeout)\b/i,
  /\b(?:sql|constraint violation|validation (?:error|failed))\b/i,
  /\bundefined\b/i,
  // Transport failures the browser phrases for itself.
  /\bfailed to fetch\b/i,
  /\bnetwork\s*error\s*(?:when|:)/i,
  /\bload failed\b/i,
  // Reviewed copy is a single line; anything multi-line is a dump.
  /\n/,
]

/** Reviewed strings in this app top out around 135 characters. */
const MAX_UI_COPY_LENGTH = 180

export function containsCjk(text: string | undefined | null): boolean {
  if (!text) return false
  return CJK_RE.test(String(text))
}

/**
 * True when `text` looks like raw exception / backend output rather than copy a
 * user should read. Callers that want the original for a log should read it
 * before calling any of the sanitizers here.
 */
export function isUnsafeUiCopy(text: string | undefined | null): boolean {
  if (text == null) return false
  const raw = String(text)
  if (raw.length > MAX_UI_COPY_LENGTH) return true
  return UNSAFE_UI_COPY_PATTERNS.some((re) => re.test(raw))
}

/**
 * Translate a backend/device string for display.
 * Known phrases map to English; raw exception/backend text and leftover CJK
 * become a generic English fallback ("Request timed out" when the text looks
 * like a timeout, otherwise the given fallback).
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
  const timeoutish = /超时|timeout|timed\s*out/i.test(raw)
  if (isUnsafeUiCopy(raw)) {
    // A timeout is still a timeout even when the backend wrapped it in a class
    // name, and "Request timed out" is existing reviewed copy.
    if (timeoutish && !/\n/.test(raw)) return 'Request timed out'
    return fallback
  }
  if (containsCjk(raw)) {
    if (timeoutish) return 'Request timed out'
    return fallback
  }
  return raw
}

/**
 * The single entry point for a `catch (e)` whose result is rendered. Never
 * returns `e.message` verbatim when it looks like exception output (SW-15).
 * Pass `''` as the fallback to get `''` for "show no secondary line".
 */
export function toUserFacingError(
  err: unknown,
  fallback = 'Something went wrong',
): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return sanitizeUiCopy(raw, fallback)
}
