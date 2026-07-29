// Minimal Modbus RTU helpers for the server-side Sleep Mode executor.
// Mirrors src/protocols/modbusProtocol.ts (SLAVE_ID 0x01, FC06 write-single-register,
// CRC16/Modbus). Produces the base64 the /remote/device/passthrough endpoint expects.

const SLAVE_ID = 0x01
const FC_WRITE_SINGLE = 0x06

/**
 * AC realtime charge-power register (0x0085, AC_CHARGE_POWER_RT). Writing this via
 * Modbus passthrough actually changes the live charge power — unlike the rated
 * `ratedACChargingPower` config/write path (≈0x0024), which the backend accepts
 * ("Success") but the device treats as a no-op.
 */
export const REG_AC_CHARGE_POWER_RT = 0x0085

/** CRC16/Modbus (poly 0xA001, init 0xFFFF). */
export function crc16modbus(buf) {
  let crc = 0xffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      if (crc & 0x0001) crc = (crc >> 1) ^ 0xa001
      else crc >>= 1
    }
  }
  return crc & 0xffff
}

/** FC06 write-single-register frame: [id][06][addr_hi][addr_lo][val_hi][val_lo][crc_lo][crc_hi]. */
export function buildWriteSingleFrame(addr, value) {
  const buf = Buffer.alloc(8)
  buf[0] = SLAVE_ID
  buf[1] = FC_WRITE_SINGLE
  buf[2] = (addr >> 8) & 0xff
  buf[3] = addr & 0xff
  buf[4] = (value >> 8) & 0xff
  buf[5] = value & 0xff
  const crc = crc16modbus(buf.subarray(0, 6))
  buf[6] = crc & 0xff        // CRC low byte first (Modbus RTU order)
  buf[7] = (crc >> 8) & 0xff
  return buf
}

/** base64 of the FC06 frame writing `watts` (W) to the realtime AC charge-power register. */
export function acChargePowerBase64(watts) {
  return buildWriteSingleFrame(REG_AC_CHARGE_POWER_RT, watts & 0xffff).toString('base64')
}
