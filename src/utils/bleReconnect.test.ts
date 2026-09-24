import { describe, it, expect, vi } from 'vitest'
import { reconnectWithRetry, isDisconnectError, reconnectingStage, RECONNECT_ATTEMPTS } from './bleReconnect'

const noSleep = async () => {}

describe('reconnectWithRetry (APP-20260826-003)', () => {
  it('succeeds on a later attempt and reports each one', async () => {
    const connect = vi.fn().mockRejectedValueOnce(new Error('GATT 133')).mockResolvedValueOnce(undefined)
    const seen: string[] = []
    const ok = await reconnectWithRetry(connect, { sleep: noSleep, onAttempt: (i, n) => seen.push(`${i}/${n}`) })
    expect(ok).toBe(true)
    expect(connect).toHaveBeenCalledTimes(2)
    expect(seen).toEqual(['1/3', '2/3'])
  })

  it('gives up after the configured attempts without throwing', async () => {
    const connect = vi.fn().mockRejectedValue(new Error('disconnected'))
    expect(await reconnectWithRetry(connect, { sleep: noSleep })).toBe(false)
    expect(connect).toHaveBeenCalledTimes(RECONNECT_ATTEMPTS)
  })

  it('waits the growing delays between attempts', async () => {
    const waits: number[] = []
    await reconnectWithRetry(vi.fn().mockRejectedValue(new Error('x')), { sleep: async (ms) => { waits.push(ms) } })
    expect(waits).toEqual([1000, 2000, 4000])
  })

  it('stops as soon as the caller abandons the flow', async () => {
    const connect = vi.fn().mockRejectedValue(new Error('x'))
    let stop = false
    const ok = await reconnectWithRetry(connect, { sleep: async () => { stop = true }, shouldStop: () => stop })
    expect(ok).toBe(false)
    expect(connect).not.toHaveBeenCalled()
  })
})

describe('isDisconnectError / reconnectingStage', () => {
  it('recognises the BLE drop messages the flow sees', () => {
    for (const m of ['Device disconnected', 'GATT error 133', 'not connected']) expect(isDisconnectError(m)).toBe(true)
    expect(isDisconnectError('WIFI_TIMEOUT')).toBe(false)
  })
  it('labels the attempt', () => {
    expect(reconnectingStage(2)).toBe('Reconnecting to device (2/3)')
  })
})
