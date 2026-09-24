/**
 * APP-008: the cached device list is only trustworthy on a cold start if the
 * store also remembers that it was a real answer. Otherwise an account with no
 * devices (cached `[]`) paints device-card skeletons on every launch.
 */
import { describe, it, expect, vi } from 'vitest'

// persist() only wires itself up when storage exists; install it before the store module loads.
vi.hoisted(() => {
  const m = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => m.clear(),
  }
})

import { useDeviceStore } from './deviceStore'

describe('deviceStore persistence', () => {
  const partialize = useDeviceStore.persist.getOptions().partialize!

  it('persists devicesListReady together with the list it describes', () => {
    const saved = partialize({ ...useDeviceStore.getState(), devices: [], devicesListReady: true }) as Record<string, unknown>
    expect(saved.devices).toEqual([])
    expect(saved.devicesListReady).toBe(true)
  })

  it('exitDemoMode (sign-in / sign-out / demo switch) clears both, so no account inherits another\'s', () => {
    useDeviceStore.setState({ devices: [{ id: '1' } as never], devicesListReady: true })
    useDeviceStore.getState().exitDemoMode()
    const s = useDeviceStore.getState()
    expect(s.devices).toEqual([])
    expect(s.devicesListReady).toBe(false)
  })
})
