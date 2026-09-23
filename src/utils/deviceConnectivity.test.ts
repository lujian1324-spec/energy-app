/**
 * SW-13 — the offline gate, and the one thing it must never be.
 *
 * AC-13-0a: offline is a connection state, not a phrase in a reply. The test
 * that matters most here is the negative one: a device the cloud reports online
 * stays online no matter what its refusal says, so a firmware reject cannot be
 * laundered into "saved, will send later" (AC-13-0b).
 */
import { describe, it, expect } from 'vitest'
import {
  deviceOnlineFlag,
  isSaveOffline,
  offlineReason,
  type SaveConnectivity,
} from './deviceConnectivity'

const connected: SaveConnectivity = { clientOnline: true, hasSession: true, deviceOnline: true }

describe('offlineReason — clear connection signals only', () => {
  it('a connected device with a session is not offline', () => {
    expect(offlineReason(connected)).toBeNull()
    expect(isSaveOffline(connected)).toBe(false)
  })

  it('the phone having no network is offline', () => {
    expect(offlineReason({ ...connected, clientOnline: false })).toBe('client-offline')
  })

  it('no session means no channel to write over', () => {
    expect(offlineReason({ ...connected, hasSession: false })).toBe('no-session')
  })

  it('the cloud reporting the device down is offline', () => {
    expect(offlineReason({ ...connected, deviceOnline: false })).toBe('device-offline')
  })

  it('an unknown device flag is treated as connected, so a failure stays a failure', () => {
    expect(offlineReason({ clientOnline: true, hasSession: true })).toBeNull()
    expect(offlineReason({ clientOnline: true, hasSession: true, deviceOnline: undefined })).toBeNull()
  })

  it('the phone is checked before the device: its cached flag means nothing offline', () => {
    expect(offlineReason({ clientOnline: false, hasSession: true, deviceOnline: true }))
      .toBe('client-offline')
  })

  it('takes no interest in any response text — there is no seam to pass one', () => {
    // The gate's whole input is the three booleans above. A refusal's wording
    // (`can not set charge power`, the exact string Jason saw) cannot reach it,
    // which is the point of AC-13-0a.
    const withText = { ...connected, detail: 'can not set charge power' } as SaveConnectivity
    expect(isSaveOffline(withText)).toBe(false)
  })
})

describe('deviceOnlineFlag', () => {
  const list = [{ id: '1', isOnline: true }, { id: '2', isOnline: false }]

  it('reads the list entry for the device', () => {
    expect(deviceOnlineFlag('1', null, list)).toBe(true)
    expect(deviceOnlineFlag('2', null, list)).toBe(false)
  })

  it('prefers details when they are for the same device', () => {
    expect(deviceOnlineFlag('1', { id: '1', isOnline: false }, list)).toBe(false)
  })

  it('ignores details for a different device instead of reading them as this one', () => {
    expect(deviceOnlineFlag('2', { id: '9', isOnline: true }, list)).toBe(false)
  })

  it('is undefined when nothing holds the flag', () => {
    expect(deviceOnlineFlag('3', null, list)).toBeUndefined()
    expect(deviceOnlineFlag('', null, list)).toBeUndefined()
    expect(deviceOnlineFlag('1', null, null)).toBeUndefined()
  })

  it('compares ids as strings, so a numeric id still matches', () => {
    // A real platform id is an 18-digit *string* precisely because it does not
    // survive a JS number; demo ids are small enough to arrive as numbers.
    expect(deviceOnlineFlag('10001', null, [{ id: 10001, isOnline: true }])).toBe(true)
    expect(deviceOnlineFlag(10001, null, [{ id: '10001', isOnline: true }])).toBe(true)
  })
})
