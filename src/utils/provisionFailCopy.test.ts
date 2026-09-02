import { describe, it, expect } from 'vitest'
import { bindFailTitle, isJunkError, mapBindFailReason } from './provisionFailCopy'

describe('bindFailTitle', () => {
  it('uses Couldn\'t add device for bind fail even if wifiConfigured is false', () => {
    expect(bindFailTitle('bind', false)).toBe("Couldn't add device")
  })

  it('uses Couldn\'t add device when Wi-Fi is already configured', () => {
    expect(bindFailTitle(null, true)).toBe("Couldn't add device")
    expect(bindFailTitle('wifi', true)).toBe("Couldn't add device")
  })

  it('keeps Setup Failed for wifi / disconnect / timeout without wifiConfigured', () => {
    expect(bindFailTitle('wifi', false)).toBe('Setup Failed')
    expect(bindFailTitle('disconnect', false)).toBe('Setup Failed')
    expect(bindFailTitle('timeout', false)).toBe('Setup Failed')
    expect(bindFailTitle(null, false)).toBe('Setup Failed')
  })
})

describe('mapBindFailReason', () => {
  it('maps already_bound / device_offline / timeout / invalid', () => {
    expect(mapBindFailReason(409, 'already_bound').kind).toBe('already_bound')
    expect(mapBindFailReason('device_offline', 'Device is offline').kind).toBe('device_offline')
    expect(mapBindFailReason(null, 'BIND_TIMEOUT').kind).toBe('timeout')
    expect(mapBindFailReason(400, 'invalid serial').kind).toBe('invalid')
  })

  it('maps Chinese timeout / offline / already-bound phrases', () => {
    expect(mapBindFailReason(null, '等待设备应答超时').kind).toBe('timeout')
    expect(mapBindFailReason(null, '设备离线').kind).toBe('device_offline')
    expect(mapBindFailReason(null, '设备已绑定').kind).toBe('already_bound')
  })

  it('keeps isJunkError filter so stack traces are not shown as invalid', () => {
    expect(isJunkError('Illegal argument: null pointer')).toBe(true)
    expect(mapBindFailReason(500, 'Illegal argument: null pointer').kind).toBeUndefined()
  })

  it('exposes a copyable error id from code or message when present', () => {
    expect(mapBindFailReason(10024, 'fail').errorId).toBe('10024')
    expect(mapBindFailReason(0, 'ERR_BIND_42 device').errorId).toBe('ERR_BIND_42')
  })
})
