import { expect, it } from 'vitest'
import { canConfigureWifi } from './provisionWifi'
import { buildPackets } from './blePacket'

it('allows an open AP without a password but does not bypass security for an unknown AP', () => {
  const aps = [{ SSID: 'open', Secu: 0 }, { SSID: 'secure', Secu: 1 }]
  expect(canConfigureWifi(aps, 'open', '')).toBe(true)
  expect(canConfigureWifi(aps, 'secure', '')).toBe(false)
  expect(canConfigureWifi(aps, 'secure', 'password')).toBe(true)
  expect(canConfigureWifi(aps, 'unknown', '')).toBe(false)
  expect(canConfigureWifi(aps, null, 'password')).toBe(false)
})

it('honors a 17-byte payload budget without silently increasing it', () => {
  expect(buildPackets('A'.repeat(60), 17).map(packet => packet.length)).toEqual([20, 20, 20, 12])
})
