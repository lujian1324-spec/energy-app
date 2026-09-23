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
        const scale = desc.scale ?? 1
        const numVal = desc.signed ? toInt16(raw) * scale : raw * scale
        value = Number.isInteger(numVal) ? String(numVal) : numVal.toFixed(scale < 0.1 ? 3 : scale < 1 ? 1 : 0)
      }
      result.push({ addr, name: desc.name, value, unit, raw, group: desc.group })
    }
    return result
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────
// 工作模式设置（0x02，FC06，对应 §4.2）
// ─────────────────────────────────────────────

/**
 * 工作模式寄存器 0x0002
 * 示例 (默认 0x0019 = 25):
 *   01 06 00 02 00 19 E9 C0
 */
export function buildSetWorkMode(modeValue: number): string {
  return toHexString(buildWriteSingleFrame(0x0002, modeValue))
}

// ─────────────────────────────────────────────
// 错误码说明
// ─────────────────────────────────────────────

export const MODBUS_ERROR_CODES: Record<number, string> = {
  0x01: 'Invalid function code',
  0x02: 'Invalid register address',
  0x03: 'Invalid data',
  0x04: 'CRC check error',
  0x05: 'Invalid write command',
  0x06: 'Invalid record serial number (stored records only)',
}
