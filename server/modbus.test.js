import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crc16modbus, buildWriteSingleFrame, acChargePowerBase64, REG_AC_CHARGE_POWER_RT } from './modbus.js'

// CRC16/Modbus property: the CRC computed over the ENTIRE frame (data + appended
// CRC) is 0. This proves the appended CRC bytes + byte order are correct without a
// magic constant.
test('CRC16/Modbus invariant: CRC over the full frame is 0', () => {
  const f = buildWriteSingleFrame(0x0085, 150)
  assert.equal(f.length, 8)
  assert.equal(crc16modbus(f), 0)
})

test('FC06 write-single frame structure (0x0085 / big-endian value)', () => {
  const f = buildWriteSingleFrame(REG_AC_CHARGE_POWER_RT, 800) // 0x0320
  assert.equal(f[0], 0x01) // slave id
  assert.equal(f[1], 0x06) // write single register
  assert.equal(f[2], 0x00) // addr hi
  assert.equal(f[3], 0x85) // addr lo (0x0085)
  assert.equal(f[4], 0x03) // value hi
  assert.equal(f[5], 0x20) // value lo (800)
})

test('acChargePowerBase64 → valid FC06 0x0085 frame for every model power', () => {
  for (const w of [150, 400, 300, 800]) {
    const buf = Buffer.from(acChargePowerBase64(w), 'base64')
    assert.equal(buf.length, 8)
    assert.equal(crc16modbus(buf), 0)                 // valid CRC
    assert.equal(buf[2], 0x00)
    assert.equal(buf[3], 0x85)                         // register 0x0085
    assert.equal((buf[4] << 8) | buf[5], w)            // watts, big-endian
  }
})
