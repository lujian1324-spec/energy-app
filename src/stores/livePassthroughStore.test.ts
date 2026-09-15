/**
 * Two jumps are pinned here.
 *
 * The first: the Device list had two writers into one slot — the 60s
 * /state/latest poll replaced the whole raw object, erasing the passthrough
 * numbers written into it seconds earlier — so the battery percentage swung
 * between two measurements of two different ages once a minute.
 *
 * The second: entering a page painted the cloud number, then replaced it with
 * the passthrough number a second or two later, because every screen's cloud
 * cache is rebuilt on mount and a cloud GET beats a Modbus round trip. The
 * layer is durable and knows whether a read is outstanding, so a page either
 * paints the carried-over sample or waits — it never paints a number that is
 * about to be contradicted.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { LiveStatus } from '../protocols/modbusProtocol'
import {
  LIVE_SAMPLE_MAX_AGE_MS,
  clearLivePassthrough,
  lookupLivePassthrough,
  markLivePassthroughFailed,
  markLivePassthroughPending,
  mergeWithPassthrough,
  resolveLiveValues,
  saveLivePassthrough,
  useLivePassthroughStore,
  type LivePassthroughEntry,
} from './livePassthroughStore'

const pass: LiveStatus = {
  soc: 72.4, acPower: 210, solarPower: 35, outputPower: 90,
  batteryPower: 155, batteryTemp: 24.6,
}
const ble: LiveStatus = {
  soc: 86.5, acPower: 120, solarPower: 40, outputPower: 80,
  batteryPower: 80, batteryTemp: 27.1,
}
const cloud = {
  remainingBatteryCapacity: 61, acPower: 0, solarPower: 0,
  outputPower: 12, batteryPower: -12, batteryTemp: 22,
  // A field only the cloud carries, to prove the overlay does not drop it.
  totalGeneration: 1234,
}
const DEV = '491513787113766912'

const ready = (live: LiveStatus): LivePassthroughEntry =>
  ({ live, phase: 'ready', source: 'passthrough', updatedAt: Date.now() })
const pending: LivePassthroughEntry =
  { live: null, phase: 'pending', source: 'passthrough', updatedAt: Date.now() }
const failed: LivePassthroughEntry =
  { live: null, phase: 'failed', source: 'passthrough', updatedAt: Date.now() }

beforeEach(() => { clearLivePassthrough() })

describe('mergeWithPassthrough', () => {
  it('overlays all six decoded fields, and leaves everything else alone', () => {
    expect(mergeWithPassthrough(cloud, pass)).toEqual({
      remainingBatteryCapacity: 72.4, acPower: 210, solarPower: 35,
      outputPower: 90, batteryPower: 155, batteryTemp: 24.6,
      totalGeneration: 1234,
    })
  })

  it('returns the base untouched when there is no sample', () => {
    expect(mergeWithPassthrough(cloud, null)).toEqual(cloud)
    expect(mergeWithPassthrough(null, null)).toEqual({})
  })
})

describe('resolveLiveValues', () => {
  it('reads cloud → BLE → passthrough, passthrough on top', () => {
    const v = resolveLiveValues(cloud, ble, ready(pass))
    expect(v.remainingBatteryCapacity).toBe(pass.soc)
    expect(v.acPower).toBe(pass.acPower)
    expect(v.outputPower).toBe(pass.outputPower)
  })

  it('lets passthrough win over a real cloud SOC — the value that used to clobber it', () => {
    // BLE deliberately stands aside when cloud has a real SOC; passthrough does
    // not, because it is the fresher read and the one being polled.
    expect(resolveLiveValues(cloud, ble, ready(pass)).remainingBatteryCapacity).toBe(72.4)
    expect(resolveLiveValues(cloud, ble, null).remainingBatteryCapacity).toBe(61)
  })

  it('falls through to BLE, then to cloud, when there is no sample', () => {
    // First paint on a freshly bound device: cloud SOC is still 0/empty.
    const empty = { ...cloud, remainingBatteryCapacity: 0 }
    expect(resolveLiveValues(empty, ble, null).remainingBatteryCapacity).toBe(ble.soc)
    expect(resolveLiveValues(cloud, null, null).remainingBatteryCapacity).toBe(61)
  })
})

describe('entering a page', () => {
  it('reads the six fields as unknown while the first read is outstanding', () => {
    // The entry jump: the cloud value is here and would paint instantly, but a
    // passthrough reply is seconds away and will contradict it. Unknown lets
    // the ring draw its muted state and then show the real figure once.
    const v = resolveLiveValues(cloud, null, pending)
    expect(v.remainingBatteryCapacity).toBeUndefined()
    expect(v.acPower).toBeUndefined()
    expect(v.solarPower).toBeUndefined()
    expect(v.outputPower).toBeUndefined()
    expect(v.batteryPower).toBeUndefined()
    expect(v.batteryTemp).toBeUndefined()
    // Everything the live layer does not own is still there.
    expect(v.totalGeneration).toBe(1234)
  })

  it('paints a carried-over sample immediately instead of waiting', () => {
    // The ordinary case: the list has been polling, so entering the monitor has
    // a real sample to show and there is no cloud value on screen to jump from.
    expect(resolveLiveValues(cloud, null, ready(pass)).remainingBatteryCapacity).toBe(72.4)
  })

  it('hands a device that has never answered back to cloud, once', () => {
    expect(resolveLiveValues(cloud, null, failed).remainingBatteryCapacity).toBe(61)
  })

  it('still shows a BLE reading rather than waiting — it is a direct read', () => {
    const empty = { ...cloud, remainingBatteryCapacity: 0 }
    expect(resolveLiveValues(empty, ble, pending).remainingBatteryCapacity).toBe(ble.soc)
  })
})

describe('the live layer', () => {
  it('keeps the last good sample when a read fails, rather than dropping back', () => {
    expect(saveLivePassthrough(DEV, pass)).toBe(true)
    // A failed read must not erase what is already there: falling back to the
    // older cloud value is the jump this exists to prevent.
    expect(saveLivePassthrough(DEV, null)).toBe(false)
    markLivePassthroughFailed(DEV)
    expect(lookupLivePassthrough(DEV)?.live).toEqual(pass)
    expect(lookupLivePassthrough(DEV)?.phase).toBe('ready')
  })

  it('does not mark a device with a sample as pending mid-refresh', () => {
    saveLivePassthrough(DEV, pass)
    markLivePassthroughPending(DEV)
    // Otherwise the figure would blank out on every tick while the next read flies.
    expect(lookupLivePassthrough(DEV)?.live).toEqual(pass)
  })

  it('marks a device with nothing to show as pending, then failed', () => {
    markLivePassthroughPending(DEV)
    expect(lookupLivePassthrough(DEV)?.phase).toBe('pending')
    markLivePassthroughFailed(DEV)
    expect(lookupLivePassthrough(DEV)?.phase).toBe('failed')
  })

  it('never puts a settled device back to pending', () => {
    // A device that never answers would otherwise alternate between the cloud
    // value and the -- placeholder on every tick: a slower jump, harder to spot.
    markLivePassthroughPending(DEV)
    markLivePassthroughFailed(DEV)
    markLivePassthroughPending(DEV)
    expect(lookupLivePassthrough(DEV)?.phase).toBe('failed')

    saveLivePassthrough(DEV, pass)
    markLivePassthroughPending(DEV)
    expect(lookupLivePassthrough(DEV)?.phase).toBe('ready')
    expect(lookupLivePassthrough(DEV)?.live).toEqual(pass)
  })

  it('does not rewrite a failed entry on every later failure', () => {
    markLivePassthroughFailed(DEV)
    const before = useLivePassthroughStore.getState().epoch
    markLivePassthroughFailed(DEV)
    expect(useLivePassthroughStore.getState().epoch).toBe(before)
  })

  it('stops treating a sample as live once it has aged out', () => {
    useLivePassthroughStore.setState({
      byDevice: {
        [DEV]: {
          live: pass, phase: 'ready', source: 'passthrough',
          updatedAt: Date.now() - LIVE_SAMPLE_MAX_AGE_MS - 1000,
        },
      },
      epoch: 1,
    })
    const e = lookupLivePassthrough(DEV)
    // Not painted, and not 'pending' either — the screen falls back to cloud
    // rather than waiting on a read that is not coming.
    expect(e?.live).toBeNull()
    expect(e?.phase).toBe('failed')
    expect(resolveLiveValues(cloud, null, e).remainingBatteryCapacity).toBe(61)
  })

  it('keys by device, so one device cannot paint another', () => {
    saveLivePassthrough(DEV, pass)
    expect(lookupLivePassthrough('491513787113766913')).toBeNull()
    expect(lookupLivePassthrough(null)).toBeNull()
  })

  it('is emptied on sign-out, so the next account starts blank', () => {
    saveLivePassthrough(DEV, pass)
    clearLivePassthrough()
    expect(lookupLivePassthrough(DEV)).toBeNull()
  })
})
