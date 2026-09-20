/** parseResponseToParams + helpers (split for MCP push size). */
import {
  fromHexString,
  toHexString,
  parseReadResponse,
  buildWriteSingleFrame,
  toInt16,
} from './modbusProtocolCore'
import { REG_DESC, type ParsedParam } from './modbusProtocolParams'

export function parseResponseToParams(requestHex: string, responseHex: string): ParsedParam[] {
  try {
    const reqBuf = fromHexString(requestHex)
    const resBuf = fromHexString(responseHex)
    if (reqBuf.length < 6) return []
    const fc = reqBuf[1]
    if (fc !== 0x03) return []  // only handle read responses
    const startAddr = (reqBuf[2] << 8) | reqBuf[3]

    const parsed = parseReadResponse(resBuf)
    if (!parsed || parsed.registers.length === 0) return []

    const result: ParsedParam[] = []
    for (let i = 0; i < parsed.registers.length; i++) {
      const addr = startAddr + i
      const desc = REG_DESC[addr]
      if (!desc) continue
      const raw = parsed.registers[i]
      let value: string
      let unit = desc.unit ?? ''
      if (desc.fmt) {
        value = desc.fmt(raw)
        unit = ''
      } else {
        const n = desc.signed ? toInt16(raw) : raw
        const scaled = desc.scale != null ? n * desc.scale : n
        value = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(2)
      }
      result.push({ addr, name: desc.name, value, unit, raw, group: desc.group })
    }
    return result
  } catch {
    return []
  }
}

export function buildSetWorkMode(modeValue: number): string {
  return toHexString(buildWriteSingleFrame(0x0086, modeValue))
}

export const MODBUS_ERROR_CODES: Record<number, string> = {
  0x01: 'Invalid function code',
  0x02: 'Invalid register address',
  0x03: 'Invalid data',
  0x04: 'CRC check error',
  0x05: 'Invalid write command',
  0x06: 'Invalid record serial number (stored records only)',
}
