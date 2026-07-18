import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  withTimeout,
  checkNotifications,
  requestNotifications,
  checkCamera,
  requestCamera,
  checkBluetooth,
  requestBluetooth,
  checkWifi,
  requestWifi,
  checkStorage,
  requestStorage,
} from './permissions'

/**
 * Web/PWA-branch coverage for the permission helpers. In the vitest node env the
 * real Capacitor.isNativePlatform() returns false, so every helper takes its web
 * branch — we only need to stub the browser globals (navigator/window/Notification/
 * localStorage) it reads. This is the PWA path the user explicitly cares about.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ── withTimeout ──────────────────────────────────────────────────────────────
describe('withTimeout', () => {
  it('resolves with the promise value when it settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'fallback')).resolves.toBe('ok')
  })

  it('resolves with the fallback when the promise hangs past the timeout', async () => {
    const never = new Promise<string>(() => {})
    await expect(withTimeout(never, 10, 'fallback')).resolves.toBe('fallback')
  })
})

// ── Notifications (web) ──────────────────────────────────────────────────────
describe('checkNotifications (web)', () => {
  it('returns unsupported when the Notification API is absent', async () => {
    vi.stubGlobal('window', {})
    expect((await checkNotifications()).state).toBe('unsupported')
  })

  it('maps Notification.permission granted/denied/default', async () => {
    for (const [perm, expected] of [
      ['granted', 'granted'],
      ['denied', 'denied'],
      ['default', 'prompt'],
    ] as const) {
      const N = { permission: perm }
      vi.stubGlobal('window', { Notification: N })
      vi.stubGlobal('Notification', N)
      expect((await checkNotifications()).state).toBe(expected)
    }
  })
})

describe('requestNotifications (web)', () => {
  it('short-circuits to denied when already blocked (no prompt)', async () => {
    const requestPermission = vi.fn()
    const N = { permission: 'denied', requestPermission }
    vi.stubGlobal('window', { Notification: N })
    vi.stubGlobal('Notification', N)
    expect((await requestNotifications()).state).toBe('denied')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('returns granted when the user allows the prompt', async () => {
    const N = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') }
    vi.stubGlobal('window', { Notification: N })
    vi.stubGlobal('Notification', N)
    expect((await requestNotifications()).state).toBe('granted')
  })

  it('returns prompt (dismissed) when the user dismisses', async () => {
    const N = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('default') }
    vi.stubGlobal('window', { Notification: N })
    vi.stubGlobal('Notification', N)
    expect((await requestNotifications()).state).toBe('prompt')
  })
})

// ── Camera (web) ─────────────────────────────────────────────────────────────
describe('checkCamera (web)', () => {
  it('returns unsupported when getUserMedia is unavailable', async () => {
    vi.stubGlobal('navigator', { mediaDevices: undefined })
    expect((await checkCamera()).state).toBe('unsupported')
  })

  it('maps the Permissions API camera state', async () => {
    for (const [state, expected] of [
      ['granted', 'granted'],
      ['denied', 'denied'],
      ['prompt', 'prompt'],
    ] as const) {
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn() },
        permissions: { query: vi.fn().mockResolvedValue({ state }) },
      })
      expect((await checkCamera()).state).toBe(expected)
    }
  })

  it('falls back to prompt when Permissions API cannot answer', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn() },
      permissions: { query: vi.fn().mockRejectedValue(new Error('not queryable')) },
    })
    expect((await checkCamera()).state).toBe('prompt')
  })
})

describe('requestCamera (web)', () => {
  it('grants and stops the tracks when getUserMedia succeeds', async () => {
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] }
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } })
    expect((await requestCamera()).state).toBe('granted')
    expect(stop).toHaveBeenCalled() // camera released immediately after the permission grant
  })

  it('maps NotAllowedError to denied', async () => {
    const err = Object.assign(new Error('x'), { name: 'NotAllowedError' })
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(err) } })
    expect((await requestCamera()).state).toBe('denied')
  })

  it('maps NotFoundError to unsupported (no camera hardware)', async () => {
    const err = Object.assign(new Error('x'), { name: 'NotFoundError' })
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(err) } })
    expect((await requestCamera()).state).toBe('unsupported')
  })

  it('returns unsupported when getUserMedia is unavailable', async () => {
    vi.stubGlobal('navigator', { mediaDevices: undefined })
    expect((await requestCamera()).state).toBe('unsupported')
  })
})

// ── Bluetooth (web) ──────────────────────────────────────────────────────────
describe('checkBluetooth (web)', () => {
  it('returns unsupported when Web Bluetooth is absent', async () => {
    vi.stubGlobal('navigator', {})
    expect((await checkBluetooth()).state).toBe('unsupported')
  })

  it('returns prompt when an adapter is available', async () => {
    vi.stubGlobal('navigator', { bluetooth: { getAvailability: vi.fn().mockResolvedValue(true) } })
    expect((await checkBluetooth()).state).toBe('prompt')
  })

  it('returns denied when the adapter reports off', async () => {
    vi.stubGlobal('navigator', { bluetooth: { getAvailability: vi.fn().mockResolvedValue(false) } })
    expect((await checkBluetooth()).state).toBe('denied')
  })
})

describe('requestBluetooth (web)', () => {
  it('grants when the user picks a device', async () => {
    vi.stubGlobal('navigator', { bluetooth: { requestDevice: vi.fn().mockResolvedValue({ id: 'dev' }) } })
    expect((await requestBluetooth()).state).toBe('granted')
  })

  it('denies when the user cancels the chooser (NotFoundError)', async () => {
    const err = Object.assign(new Error('x'), { name: 'NotFoundError' })
    vi.stubGlobal('navigator', { bluetooth: { requestDevice: vi.fn().mockRejectedValue(err) } })
    expect((await requestBluetooth()).state).toBe('denied')
  })

  it('returns unsupported when Web Bluetooth is absent', async () => {
    vi.stubGlobal('navigator', {})
    expect((await requestBluetooth()).state).toBe('unsupported')
  })
})

// ── Wi-Fi / Network ──────────────────────────────────────────────────────────
describe('checkWifi / requestWifi', () => {
  it('reports granted when online', async () => {
    vi.stubGlobal('navigator', { onLine: true, connection: { effectiveType: '4g' } })
    expect((await checkWifi()).state).toBe('granted')
    expect((await requestWifi()).state).toBe('granted')
  })

  it('reports denied when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect((await checkWifi()).state).toBe('denied')
  })
})

// ── Storage ──────────────────────────────────────────────────────────────────
function stubLocalStorage(working: boolean) {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', working
    ? {
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        getItem: (k: string) => store.get(k) ?? null,
      }
    : {
        setItem: () => { throw new Error('blocked') },
        removeItem: () => {},
        getItem: () => null,
      })
}

describe('checkStorage', () => {
  it('returns granted (persistent) when storage is persisted', async () => {
    stubLocalStorage(true)
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(true), estimate: vi.fn().mockResolvedValue({ usage: 2048 }) } })
    expect((await checkStorage()).state).toBe('granted')
  })

  it('returns prompt (best-effort) when not persisted', async () => {
    stubLocalStorage(true)
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(false), estimate: vi.fn().mockResolvedValue({ usage: 0 }) } })
    expect((await checkStorage()).state).toBe('prompt')
  })

  it('returns denied when localStorage is blocked', async () => {
    stubLocalStorage(false)
    vi.stubGlobal('navigator', {})
    expect((await checkStorage()).state).toBe('denied')
  })
})

describe('requestStorage', () => {
  it('grants persistent storage when persist() succeeds', async () => {
    stubLocalStorage(true)
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(true), estimate: vi.fn().mockResolvedValue({ usage: 1024 }) } })
    expect((await requestStorage()).state).toBe('granted')
  })

  it('falls back to best-effort (prompt) when persist() is refused', async () => {
    stubLocalStorage(true)
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(false), estimate: vi.fn().mockResolvedValue({ usage: 1024 }) } })
    expect((await requestStorage()).state).toBe('prompt')
  })

  it('propagates denied when localStorage is blocked', async () => {
    stubLocalStorage(false)
    vi.stubGlobal('navigator', {})
    expect((await requestStorage()).state).toBe('denied')
  })
})
