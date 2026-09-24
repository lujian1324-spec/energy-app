import { describe, it, expect } from 'vitest'
import { sanitizeUiCopy, containsCjk, isUnsafeUiCopy, toUserFacingError } from './uiCopy'

describe('sanitizeUiCopy', () => {
  it('maps the known device timeout phrase', () => {
    expect(sanitizeUiCopy('等待设备应答超时')).toBe('Timed out waiting for the device.')
  })

  it('maps a timeout phrase embedded in a longer backend message', () => {
    expect(sanitizeUiCopy('错误: 等待设备应答超时 (rc=1)')).toBe('Timed out waiting for the device.')
  })

  it('uses Request timed out for unknown CJK timeout text', () => {
    expect(sanitizeUiCopy('操作超时，请重试')).toBe('Request timed out')
  })

  it('uses the generic fallback for other unknown CJK', () => {
    expect(sanitizeUiCopy('未知的内部错误')).toBe('Something went wrong')
    expect(sanitizeUiCopy('未知的内部错误', 'Request timed out')).toBe('Request timed out')
  })

  it('passes through English unchanged', () => {
    expect(sanitizeUiCopy('Failed to save name')).toBe('Failed to save name')
  })

  it('falls back on empty input', () => {
    expect(sanitizeUiCopy('')).toBe('Something went wrong')
    expect(sanitizeUiCopy(null)).toBe('Something went wrong')
  })
})

describe('containsCjk', () => {
  it('detects Han characters', () => {
    expect(containsCjk('电芯过压')).toBe(true)
    expect(containsCjk('Cell overvoltage')).toBe(false)
    expect(containsCjk('')).toBe(false)
  })
})


// ─── SW-15: raw exception / backend text must never reach a rendered surface ───

/** Every one of these has been seen, or is the same shape as one that has. */
const RAW_EXCEPTION_TEXT = [
  'IllegalArgument',
  'IllegalArgumentException',
  'java.lang.IllegalArgumentException: deviceId must not be null',
  'IllegalArgumentException: id',
  'illegal argument',
  'Illegal Argument',
  'illegal_argument',
  'config attribute not exist',
  'config attribute not exists',
  'config contribute not exist',
  'configuration attribute not exist',
  'attribute not exist',
  'NullPointerException',
  'java.lang.NullPointerException',
  'null pointer',
  'TypeError: Cannot read properties of undefined',
  'org.springframework.web.HttpMediaTypeNotSupportedException',
  'com.solarofthings.iot.DeviceService.bind failed',
  'Internal Server Error',
  'Bad Gateway',
  'sql syntax error near line 3',
  'ECONNREFUSED',
  'ERR_NETWORK_CHANGED',
  'Failed to fetch',
  'Load failed',
  'unexpected status code 500',
  'rc=-1',
  'RC=9001',
  'errno: 110',
  '[object Object]',
  '{"code":20101,"msg":"illegal argument"}',
  'x is undefined',
  'stack trace follows',
]

/** A real multi-line stack, the way a backend 500 body arrives. */
const STACK = [
  'java.lang.IllegalArgumentException: deviceId',
  '\tat com.solarofthings.DeviceController.bind(DeviceController.java:88)',
  '\tat java.base/java.lang.Thread.run(Thread.java:840)',
].join('\n')

describe('sanitizeUiCopy — SW-15 exception blacklist (AC-15-6)', () => {
  it.each(RAW_EXCEPTION_TEXT)('never returns %j verbatim', (raw) => {
    const out = sanitizeUiCopy(raw)
    expect(out).not.toBe(raw)
    expect(out).toBe('Something went wrong')
  })

  it('replaces a multi-line stack trace', () => {
    expect(sanitizeUiCopy(STACK)).toBe('Something went wrong')
    expect(sanitizeUiCopy(STACK)).not.toContain('IllegalArgument')
    expect(sanitizeUiCopy(STACK)).not.toContain('at com.')
  })

  it('uses the caller fallback rather than a generic one (AC-15-12)', () => {
    expect(sanitizeUiCopy('IllegalArgumentException: id', 'Could not save to the device'))
      .toBe('Could not save to the device')
    expect(sanitizeUiCopy('config attribute not exist', 'Failed to save name'))
      .toBe('Failed to save name')
  })

  it('returns an empty secondary line when the caller asked for one', () => {
    expect(sanitizeUiCopy('IllegalArgumentException: id', '')).toBe('')
  })

  it('still reports a timeout wrapped in a class name as a timeout', () => {
    expect(sanitizeUiCopy('java.net.SocketTimeoutException: read timed out'))
      .toBe('Request timed out')
  })

  it('rejects anything longer than reviewed copy ever runs', () => {
    expect(sanitizeUiCopy('a'.repeat(400))).toBe('Something went wrong')
  })

  it('leaves reviewed English copy alone (AC-15-9)', () => {
    for (const ok of [
      'Failed to save name',
      'Could not save to the device',
      "Couldn't add device",
      'Device already added to another account.',
      'Incorrect BLE key, please retry',
      'Bluetooth disconnected. Please reconnect the device and try again.',
      'The device is offline. Keep it powered on and close to the router.',
      'Power off the device, wait 10 seconds, then power it on again and search once more.',
      'Camera access was denied. Please enable camera permission in Settings to scan QR codes.',
    ]) {
      expect(sanitizeUiCopy(ok)).toBe(ok)
    }
  })
})

describe('isUnsafeUiCopy', () => {
  it('flags raw exception text', () => {
    for (const raw of RAW_EXCEPTION_TEXT) expect(isUnsafeUiCopy(raw)).toBe(true)
    expect(isUnsafeUiCopy(STACK)).toBe(true)
  })

  it('does not flag reviewed copy', () => {
    expect(isUnsafeUiCopy('Failed to switch power')).toBe(false)
    expect(isUnsafeUiCopy("Couldn't load today's history")).toBe(false)
    expect(isUnsafeUiCopy(null)).toBe(false)
  })
})

describe('toUserFacingError (AC-15-5)', () => {
  it('never surfaces an Error message that looks like exception output', () => {
    const e = new Error('java.lang.IllegalArgumentException: deviceId must not be null')
    expect(toUserFacingError(e, 'Failed to load devices')).toBe('Failed to load devices')
  })

  it('keeps a reviewed message the API layer already mapped', () => {
    expect(toUserFacingError(new Error('The device is offline.'), 'Network error'))
      .toBe('The device is offline.')
  })

  it('falls back for a thrown non-Error', () => {
    expect(toUserFacingError({ code: 20101 }, 'Network error')).toBe('Network error')
    expect(toUserFacingError(undefined, 'Network error')).toBe('Network error')
    expect(toUserFacingError('IllegalArgument', 'Network error')).toBe('Network error')
  })

  it('maps device CJK the same way sanitizeUiCopy does', () => {
    expect(toUserFacingError(new Error('等待设备应答超时'), 'x'))
      .toBe('Timed out waiting for the device.')
  })
})

describe('sanitizeUiCopy — length gate headroom (SW-15)', () => {
  it('keeps scheduleOutcome body+relayDetail under the raised gate', () => {
    const body =
      'The restore-power command was accepted, but the background stop was not confirmed. An earlier schedule may still switch this device.'
    const detail =
      'Background session is missing. Sign in again and retry Save. If it still fails, contact support.'
    const combined = `${body} ${detail}`
    expect(combined.length).toBeGreaterThan(180)
    expect(combined.length).toBeLessThanOrEqual(280)
    expect(sanitizeUiCopy(combined, '')).toBe(combined)
  })
})
