import { decodePowerU16, INVALID_POWER_U16 } from './powerU16'
export { decodePowerU16, INVALID_POWER_U16 } from './powerU16'
/**
 * FYK3001000W Modbus RTU 透传协议
 * 文档版本：2025.12.29
 *
 * 串口参数：9600 baud · 8 data bits · No parity · 1 stop bit
 * Slave ID (默认)：0x01
 * CRC：标准 MODBUS CRC-16（LSB 在前，MSB 在后）
 *
 * 使用方式：
 *   const frame = buildReadFrame(0x0100, 0x12)   // 读取 18 个寄存器（运行参数）
 *   const hex   = toHexString(frame)              // "01 03 01 00 00 12 XX XX"
 *   await passthroughDevice(deviceId, { data: hex, protocol: 'modbus' })
 */

// ─────────────────────────────────────────────
// CRC-16 (MODBUS)
// ─────────────────────────────────────────────

export function crc16modbus(buf: Uint8Array): number {
  let crc = 0xffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      if (crc & 0x0001) crc = (crc >> 1) ^ 0xa001
      else crc >>= 1
    }
  }
  return crc
}

/** 将字节数组转为带空格的十六进制字符串，如 "01 03 00 00 00 12 C5 C7" */
export function toHexString(buf: Uint8Array): string {
  return Array.from(buf)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}

/** 解析十六进制字符串为 Uint8Array */
export function fromHexString(hex: string): Uint8Array {
  const bytes = hex.replace(/\s+/g, '').match(/.{2}/g) ?? []
  return new Uint8Array(bytes.map(b => parseInt(b, 16)))
}

/**
 * 在字节流中定位一个「合法」的 FC03 读响应帧并返回其寄存器数组。
 *
 * 真机透传返回的载荷未必从第 0 字节就是响应帧本体——可能带回显的请求帧、
 * 网关包裹头或多余尾字节。这里从每个偏移量尝试解析 FC03 帧，只有 CRC 校验
 * 通过且寄存器数量达到 minRegisters 的帧才被接受（损坏/错位帧绝不当真数据用）。
 */
export function locateReadResponse(bytes: Uint8Array, minRegisters = 1): number[] | null {
  for (let off = 0; off + 5 <= bytes.length; off++) {
    if (bytes[off + 1] !== FC.READ) continue          // 功能码必须是 0x03
    const byteCount = bytes[off + 2]
    if (byteCount === 0 || byteCount % 2 !== 0) continue
    const frameLen = 3 + byteCount + 2
    if (off + frameLen > bytes.length) continue
    const parsed = parseReadResponse(bytes.slice(off, off + frameLen))
    if (parsed && parsed.crcOk && parsed.registers.length >= minRegisters) {
      return parsed.registers
    }
  }
  return null
}

/** base64 字符串 → 字节数组；解码失败返回 null。 */
function base64ToBytes(s: string): Uint8Array | null {
  try {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/**
 * 把一个「可能是 base64、也可能是 hex」的字符串解释成候选字节数组。
 * 两种解释都尝试——真正的 FC03 帧由 CRC 校验来甄别，绝不会误判。
 * hex 优先（真机常见的是纯十六进制串），其次 base64。
 */
function candidateByteArrays(raw: string): Uint8Array[] {
  const clean = raw.replace(/\s+/g, '')
  if (!clean) return []
  const out: Uint8Array[] = []
  if (clean.length >= 2 && clean.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(clean)) {
    out.push(fromHexString(clean))
  }
  const b64 = base64ToBytes(clean)
  if (b64 && b64.length) out.push(b64)
  return out
}

/**
 * 从透传接口响应的 `data` 字段里挑出承载 modbus 载荷的字符串。
 * 真机的形态不统一：`res.data` 可能直接就是字符串，也可能是对象——载荷藏在
 * `base64Output` / `data` / `content` 之一。PassthroughPage 能收到 RX 正是因为
 * 它容忍了这些形态，而实时页此前只认「对象 + base64」这一种，于是永远解不出。
 */
function pickPayloadString(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>
    const v = o.base64Output ?? o.data ?? o.content
    return typeof v === 'string' ? v : undefined
  }
  return undefined
}

/**
 * 透传响应 → Modbus 寄存器数组的加固入口。
 *
 * 直接吃 `res.data`（字符串或对象皆可），容忍 base64 / hex 值、回显请求帧或
 * 网关包裹头，内部用 CRC 校验定位真正的 FC03 帧。CRC 不过或寄存器不足返回 null。
 * DeviceMonitorPage 5s 轮询与下拉刷新、DevicePage 列表透传、deviceStore 额定参数
 * 读取都走这里，保证列表和监控页拿到的是同一套「真机实时值」。
 */
export function extractPassthroughRegisters(payload: unknown, minRegisters = 1): number[] | null {
  const raw = pickPayloadString(payload)
  if (!raw) return null
  for (const bytes of candidateByteArrays(raw)) {
    const registers = locateReadResponse(bytes, minRegisters)
    if (registers) return registers
  }
  return null
}

/**
 * 解码透传接口返回的 base64 载荷 → Modbus 寄存器数组（向后兼容入口）。
 * 现委托给 {@link extractPassthroughRegisters}，因此同样容忍 hex 值与回显/包裹帧。
 * CRC 校验失败或帧不完整时返回 null（损坏帧绝不能当真数据用）。
 */
export function decodePassthroughBase64(b64: string | undefined, minRegisters = 1): number[] | null {
  return extractPassthroughRegisters(b64, minRegisters)
}

// ─────────────────────────────────────────────
// 功能码
// ─────────────────────────────────────────────

export const FC = {
  READ:        0x03,  // 读寄存器
  WRITE_SINGLE: 0x06, // 写单个寄存器
  WRITE_MULTI:  0x10, // 写多个寄存器
} as const

// ─────────────────────────────────────────────
// 帧构造
// ─────────────────────────────────────────────

const SLAVE_ID = 0x01

/**
 * 构造读取帧（FC 03）
 * @param startAddr 起始寄存器地址（如 0x0100）
 * @param count     读取寄存器数量（每个寄存器 2 字节）
 */
export function buildReadFrame(startAddr: number, count: number): Uint8Array {
  const buf = new Uint8Array(8)
  buf[0] = SLAVE_ID
  buf[1] = FC.READ
  buf[2] = (startAddr >> 8) & 0xff
  buf[3] = startAddr & 0xff
  buf[4] = (count >> 8) & 0xff
  buf[5] = count & 0xff
  const crc = crc16modbus(buf.slice(0, 6))
  buf[6] = crc & 0xff         // CRC LSB
  buf[7] = (crc >> 8) & 0xff  // CRC MSB
  return buf
}

/**
 * 构造写单寄存器帧（FC 06）
 * @param addr  寄存器地址
 * @param value 16-bit 值
 */
export function buildWriteSingleFrame(addr: number, value: number): Uint8Array {
  const buf = new Uint8Array(8)
  buf[0] = SLAVE_ID
  buf[1] = FC.WRITE_SINGLE
  buf[2] = (addr >> 8) & 0xff
  buf[3] = addr & 0xff
  buf[4] = (value >> 8) & 0xff
  buf[5] = value & 0xff
  const crc = crc16modbus(buf.slice(0, 6))
  buf[6] = crc & 0xff
  buf[7] = (crc >> 8) & 0xff
  return buf
}

/**
 * 构造写多寄存器帧（FC 10）
 * @param startAddr 起始寄存器地址
 * @param values    16-bit 值数组
 */
export function buildWriteMultiFrame(startAddr: number, values: number[]): Uint8Array {
  const regCount = values.length
  const byteCount = regCount * 2
  const frameLen = 9 + byteCount
  const buf = new Uint8Array(frameLen)
  buf[0] = SLAVE_ID
  buf[1] = FC.WRITE_MULTI
  buf[2] = (startAddr >> 8) & 0xff
  buf[3] = startAddr & 0xff
  buf[4] = (regCount >> 8) & 0xff
  buf[5] = regCount & 0xff
  buf[6] = byteCount
  for (let i = 0; i < regCount; i++) {
    buf[7 + i * 2] = (values[i] >> 8) & 0xff
    buf[8 + i * 2] = values[i] & 0xff
  }
  const crc = crc16modbus(buf.slice(0, frameLen - 2))
  buf[frameLen - 2] = crc & 0xff
  buf[frameLen - 1] = (crc >> 8) & 0xff
  return buf
}

// ─────────────────────────────────────────────
// 响应解析
// ─────────────────────────────────────────────

export interface ReadResponse {
  slaveId: number
  funcCode: number
  byteCount: number
  registers: number[]   // 每个元素为 Uint16 原始值
  crcOk: boolean
}

export interface ErrorResponse {
  slaveId: number
  errorCode: number     // funcCode | 0x80
  exceptionCode: number
  crcOk: boolean
}

export type ModbusResponse = ReadResponse | ErrorResponse | null

/** 解析 FC03 读响应帧 */
export function parseReadResponse(buf: Uint8Array): ReadResponse | null {
  if (buf.length < 5) return null
  const dataLen = buf[2]
  if (buf.length < 3 + dataLen + 2) return null
  const payload = buf.slice(0, 3 + dataLen)
  const crcCalc = crc16modbus(payload)
  const crcRecv = buf[3 + dataLen] | (buf[4 + dataLen] << 8)
  const registers: number[] = []
  for (let i = 0; i < dataLen; i += 2) {
    registers.push((buf[3 + i] << 8) | buf[4 + i])
  }
  return {
    slaveId: buf[0],
    funcCode: buf[1],
    byteCount: dataLen,
    registers,
    crcOk: crcCalc === crcRecv,
  }
}

/** READ_ALL_STATUS(0x0100 起) 解析出的实时功率/电量子集 */
export interface LiveStatus {
  /** 交流充电功率 W (0x0107); omitted when raw === 0xFFFF (invalid sentinel) */
  acPower?: number
  /** 光伏充电功率 W (0x0106); omitted when raw === 0xFFFF */
  solarPower?: number
  /** 交流输出功率 W (0x0104); omitted when raw === 0xFFFF */
  outputPower?: number
  soc: number           // 电量 % (0x011A, ×0.1%)
  batteryTemp: number   // 电芯温度 ℃ (0x0123, Int16 ×0.1)
  /** 电池功率 W = AC + Solar − Output（充电为正）; omitted if any power input is invalid */
  batteryPower?: number
}

/**
 * 将 READ_ALL_STATUS 的寄存器数组（基址 0x0100）解析为实时参数子集。
 * registers[i] 对应寄存器 0x0100+i。长度不足时对应项为 0。
 * Power registers with raw === 0xFFFF are omitted (not shown as 65535 W).
 */
export function decodeLiveStatus(registers: number[]): LiveStatus {
  const at = (offset: number) => registers[offset] ?? 0
  const outputPower = decodePowerU16(at(0x04))
  const solarPower = decodePowerU16(at(0x06))
  const acPower = decodePowerU16(at(0x07))
  const soc = at(0x1A) / 10
  const batteryTemp = toInt16(at(0x23)) / 10
  const batteryPower =
    outputPower !== undefined && solarPower !== undefined && acPower !== undefined
      ? acPower + solarPower - outputPower
      : undefined
  return {
    acPower, solarPower, outputPower, soc, batteryTemp, batteryPower,
  }
}

/** 解析有符号 Int16（高位为 1 表示负数，取反+1） */
export function toInt16(raw: number): number {
  return raw > 0x7fff ? raw - 0x10000 : raw
}
