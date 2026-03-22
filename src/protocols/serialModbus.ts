/**
 * Web Serial API + Modbus RTU 通讯层
 * 实现通过 RS485/串口与 Sierro 1000 储能站通信
 *
 * 协议规格：
 *   - Modbus RTU，设备地址 0x01
 *   - 波特率：9600（默认）/ 19200 可选
 *   - 帧格式：8N1（8位数据，无校验，1位停止位）
 *   - CRC-16/Modbus 校验
 */

import {
  ModbusFunctionCode,
  MODBUS_REGISTERS,
  type ModbusFrame,
  type ConnectionInfo,
} from '../types/protocol'
import { logConnection, logCommand, addAlert } from '../db/powerflowDB'

// ----------------------------------------------------------------
// Modbus RTU CRC-16 计算（查表法，性能最优）
// ----------------------------------------------------------------
const CRC_TABLE: Uint16Array = (() => {
  const table = new Uint16Array(256)
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xA001 : crc >>> 1
    }
    table[i] = crc
  }
  return table
})()

function calcCRC16(data: Uint8Array): number {
  let crc = 0xFFFF
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xFF]
  }
  return crc
}

function appendCRC(data: Uint8Array): Uint8Array {
  const crc = calcCRC16(data)
  const out = new Uint8Array(data.length + 2)
  out.set(data)
  out[data.length]     = crc & 0xFF          // CRC-Low
  out[data.length + 1] = (crc >>> 8) & 0xFF  // CRC-High
  return out
}

function validateCRC(frame: Uint8Array): boolean {
  if (frame.length < 4) return false
  const payload = frame.slice(0, -2)
  const expected = calcCRC16(payload)
  const received  = frame[frame.length - 2] | (frame[frame.length - 1] << 8)
  return expected === received
}

// ----------------------------------------------------------------
// 构建请求帧
// ----------------------------------------------------------------

/** FC03/FC04：读多个寄存器 */
function buildReadRequest(
  deviceAddr: number,
  fc: ModbusFunctionCode.READ_HOLDING_REGISTERS | ModbusFunctionCode.READ_INPUT_REGISTERS,
  startReg: number,
  count: number,
): Uint8Array {
  const frame = new Uint8Array([
    deviceAddr,
    fc,
    (startReg >> 8) & 0xFF, startReg & 0xFF,
    (count >> 8) & 0xFF,    count & 0xFF,
  ])
  return appendCRC(frame)
}

/** FC06：写单个保持寄存器 */
function buildWriteSingleRequest(
  deviceAddr: number,
  register: number,
  value: number,
): Uint8Array {
  const frame = new Uint8Array([
    deviceAddr,
    ModbusFunctionCode.WRITE_SINGLE_REGISTER,
    (register >> 8) & 0xFF, register & 0xFF,
    (value >> 8) & 0xFF,    value & 0xFF,
  ])
  return appendCRC(frame)
}

/** FC10：写多个保持寄存器（预留，供批量写场景使用） */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildWriteMultiRequest(
  deviceAddr: number,
  startReg: number,
  values: number[],
): Uint8Array {
  const byteCount = values.length * 2
  const frame = new Uint8Array(7 + byteCount)
  frame[0] = deviceAddr
  frame[1] = ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS
  frame[2] = (startReg >> 8) & 0xFF
  frame[3] = startReg & 0xFF
  frame[4] = (values.length >> 8) & 0xFF
  frame[5] = values.length & 0xFF
  frame[6] = byteCount
  for (let i = 0; i < values.length; i++) {
    frame[7 + i * 2]     = (values[i] >> 8) & 0xFF
    frame[7 + i * 2 + 1] = values[i] & 0xFF
  }
  return appendCRC(frame)
}

// ----------------------------------------------------------------
// 解析响应帧
// ----------------------------------------------------------------
function parseFrame(data: Uint8Array): ModbusFrame | null {
  if (data.length < 4) return null
  const isValid = validateCRC(data)
  const crc     = data[data.length - 2] | (data[data.length - 1] << 8)
  return {
    deviceAddress: data[0],
    functionCode:  data[1] as ModbusFunctionCode,
    data:          data.slice(2, -2),
    crc,
    isValid,
  }
}

/** 从响应帧提取寄存器值数组 */
function extractRegisters(frame: ModbusFrame): number[] {
  if (!frame.isValid) return []
  const byteCount = frame.data[0]
  const values: number[] = []
  for (let i = 1; i < byteCount; i += 2) {
    values.push((frame.data[i] << 8) | frame.data[i + 1])
  }
  return values
}

// ----------------------------------------------------------------
// 事件回调
// ----------------------------------------------------------------
export interface SerialCallbacks {
  onStatusChange: (info: ConnectionInfo) => void
  onStationData:  (data: SerialStationData) => void
  onError:        (message: string) => void
}

/** 从 Modbus 读出的电站完整数据 */
export interface SerialStationData {
  batteryLevel:    number
  remainingWh:     number
  totalWh:         number
  inputPower:      number
  outputPower:     number
  temperature:     number
  cycleCount:      number
  batteryHealth:   number
  isCharging:      boolean
  portStatusBitmap: number
  operatingMode:   string
  chargeLimit:     number
}

// ----------------------------------------------------------------
// Modbus RTU over Web Serial
// ----------------------------------------------------------------
export class SerialModbusManager {
  private port:   SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private cb: SerialCallbacks
  private deviceAddr = 0x01
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private readonly POLL_INTERVAL_MS = 2000
  private isReading = false
  private readBuffer = new Uint8Array(0)

  constructor(callbacks: SerialCallbacks, deviceAddr = 0x01) {
    this.cb = callbacks
    this.deviceAddr = deviceAddr
  }

  // ---- 公开 API ------------------------------------------------

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  /** 请求并打开串口 */
  async connect(baudRate: 9600 | 19200 = 9600): Promise<void> {
    if (!SerialModbusManager.isSupported()) {
      this.cb.onStatusChange({ protocol: 'serial', status: 'error', errorMessage: '当前浏览器不支持 Web Serial API（请使用 Chrome 89+ 或 Edge 89+）' })
      return
    }

    this.cb.onStatusChange({ protocol: 'serial', status: 'scanning' })

    try {
      this.port = await navigator.serial.requestPort({
        filters: [],  // 不过滤，让用户选择
      })

      this.cb.onStatusChange({ protocol: 'serial', status: 'connecting' })

      await this.port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity:   'none',
        flowControl: 'none',
      })

      this.writer = this.port.writable!.getWriter()
      this.reader = this.port.readable!.getReader()

      this.cb.onStatusChange({
        protocol: 'serial',
        status:   'connected',
        lastConnectedAt: Date.now(),
      })

      void logConnection({
        timestamp: Date.now(),
        protocol:  'serial',
        deviceName: `COM Port (${baudRate} bps)`,
        deviceId:   String(baudRate),
        action:     'connected',
      })

      void addAlert({
        timestamp: Date.now(),
        type:      'connection_restored',
        severity:  'info',
        message:   `串口已连接（${baudRate} bps）`,
        resolved:  false,
      })

      // 启动读取循环 + 轮询
      void this._startReading()
      this._startPolling()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('No port selected')) {
        this.cb.onStatusChange({ protocol: 'serial', status: 'disconnected' })
        return
      }
      this.cb.onStatusChange({ protocol: 'serial', status: 'error', errorMessage: msg })
    }
  }

  /** 主动断开 */
  async disconnect(): Promise<void> {
    this._stopPolling()
    this.isReading = false

    try {
      this.reader?.releaseLock()
      this.writer?.releaseLock()
      await this.port?.close()
    } catch { /* 忽略关闭错误 */ }

    this.reader = null
    this.writer = null
    this.port   = null

    this.cb.onStatusChange({ protocol: 'serial', status: 'disconnected' })

    void logConnection({
      timestamp:  Date.now(),
      protocol:   'serial',
      deviceName: 'Serial Port',
      deviceId:   '',
      action:     'disconnected',
    })
  }

  /** 读取所有输入寄存器（一次读完全部关键数据） */
  async readStationData(): Promise<SerialStationData | null> {
    // 读 INPUT 寄存器 0x0000~0x0009（10 个）
    const inputRegs = await this._readRegisters(
      ModbusFunctionCode.READ_INPUT_REGISTERS,
      MODBUS_REGISTERS.INPUT.BATTERY_LEVEL,
      10,
      'readInputRegisters',
    )
    if (!inputRegs) return null

    // 读 HOLDING 寄存器 0x0100~0x0101（模式+充电限额）
    const holdingRegs = await this._readRegisters(
      ModbusFunctionCode.READ_HOLDING_REGISTERS,
      MODBUS_REGISTERS.HOLDING.OPERATING_MODE,
      2,
      'readHoldingRegisters',
    )

    const MODE_MAP: Record<number, string> = { 0: 'solar', 1: 'backup', 2: 'car', 3: 'outdoor' }

    return {
      batteryLevel:     inputRegs[0] ?? 0,
      remainingWh:      inputRegs[1] ?? 0,
      totalWh:          inputRegs[2] ?? 1000,
      inputPower:       inputRegs[3] ?? 0,
      outputPower:      inputRegs[4] ?? 0,
      temperature:      ((inputRegs[5] ?? 0) & 0x8000 ? (inputRegs[5]! - 65536) : (inputRegs[5] ?? 0)) / 10,
      cycleCount:       inputRegs[6] ?? 0,
      batteryHealth:    inputRegs[7] ?? 100,
      isCharging:       (inputRegs[8] ?? 0) === 1,
      portStatusBitmap: inputRegs[9] ?? 0,
      operatingMode:    MODE_MAP[holdingRegs?.[0] ?? 0] ?? 'solar',
      chargeLimit:      holdingRegs?.[1] ?? 80,
    }
  }

  /** 写运行模式 */
  async setMode(mode: string): Promise<boolean> {
    const MODE_ENCODE: Record<string, number> = { solar: 0, backup: 1, car: 2, outdoor: 3 }
    return this._writeSingle(MODBUS_REGISTERS.HOLDING.OPERATING_MODE, MODE_ENCODE[mode] ?? 0, `setMode(${mode})`)
  }

  /** 写充电限额 */
  async setChargeLimit(limit: number): Promise<boolean> {
    return this._writeSingle(MODBUS_REGISTERS.HOLDING.CHARGE_LIMIT, Math.max(50, Math.min(100, limit)), `setChargeLimit(${limit})`)
  }

  /** 写端口使能 */
  async setPortEnable(portRegister: number, enable: boolean): Promise<boolean> {
    return this._writeSingle(portRegister, enable ? 1 : 0, `setPort(${portRegister.toString(16)},${enable})`)
  }

  /** 写 eco 模式 */
  async setEcoMode(enable: boolean): Promise<boolean> {
    return this._writeSingle(MODBUS_REGISTERS.HOLDING.ECO_MODE, enable ? 1 : 0, `setEcoMode(${enable})`)
  }

  get isConnected(): boolean {
    return this.port?.readable != null
  }

  // ---- 内部方法 ------------------------------------------------

  private async _readRegisters(
    fc: ModbusFunctionCode.READ_HOLDING_REGISTERS | ModbusFunctionCode.READ_INPUT_REGISTERS,
    startReg: number,
    count: number,
    commandName: string,
  ): Promise<number[] | null> {
    if (!this.writer) return null
    const req = buildReadRequest(this.deviceAddr, fc, startReg, count)
    const t0  = Date.now()

    try {
      await this.writer.write(req)
      const resp = await this._waitResponse(count * 2 + 5, 500)
      if (!resp) return null

      const frame = parseFrame(resp)
      if (!frame?.isValid) return null

      const regs = extractRegisters(frame)

      void logCommand({
        timestamp: t0,
        source:    'auto',
        protocol:  'serial',
        command:   commandName,
        payload:   `reg=0x${startReg.toString(16)} count=${count}`,
        success:   true,
        responseMs: Date.now() - t0,
      })

      return regs
    } catch (err) {
      void logCommand({ timestamp: t0, source: 'auto', protocol: 'serial', command: commandName, success: false })
      return null
    }
  }

  private async _writeSingle(register: number, value: number, commandName: string): Promise<boolean> {
    if (!this.writer) return false
    const req = buildWriteSingleRequest(this.deviceAddr, register, value)
    const t0  = Date.now()

    try {
      await this.writer.write(req)
      const resp = await this._waitResponse(8, 500)
      const success = resp != null && validateCRC(resp)

      void logCommand({
        timestamp: t0,
        source:    'user',
        protocol:  'serial',
        command:   commandName,
        payload:   `reg=0x${register.toString(16)} val=${value}`,
        success,
        responseMs: Date.now() - t0,
      })

      return success
    } catch {
      void logCommand({ timestamp: t0, source: 'user', protocol: 'serial', command: commandName, success: false })
      return false
    }
  }

  /** 从 buffer 等待指定字节数的响应（带超时） */
  private _waitResponse(expectedBytes: number, timeoutMs: number): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs
      const check = () => {
        if (this.readBuffer.length >= expectedBytes) {
          const resp = this.readBuffer.slice(0, expectedBytes)
          this.readBuffer = this.readBuffer.slice(expectedBytes)
          resolve(resp)
        } else if (Date.now() >= deadline) {
          resolve(null)
        } else {
          setTimeout(check, 10)
        }
      }
      check()
    })
  }

  /** 连续读取串口数据，追加到 buffer */
  private async _startReading(): Promise<void> {
    this.isReading = true
    while (this.isReading && this.reader) {
      try {
        const { value, done } = await this.reader.read()
        if (done) break
        if (value) {
          const merged = new Uint8Array(this.readBuffer.length + value.length)
          merged.set(this.readBuffer)
          merged.set(value, this.readBuffer.length)
          this.readBuffer = merged
        }
      } catch {
        break
      }
    }

    if (this.isReading) {
      // 意外断开
      this.cb.onStatusChange({ protocol: 'serial', status: 'disconnected' })
      void this.disconnect()
    }
  }

  private _startPolling(): void {
    this.pollTimer = setInterval(async () => {
      if (!this.isConnected) {
        this._stopPolling()
        return
      }
      const data = await this.readStationData()
      if (data) this.cb.onStationData(data)
    }, this.POLL_INTERVAL_MS)
  }

  private _stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }
}

// ----------------------------------------------------------------
// 单例
// ----------------------------------------------------------------
let _serialInstance: SerialModbusManager | null = null

export function getSerialManager(callbacks: SerialCallbacks): SerialModbusManager {
  if (!_serialInstance) {
    _serialInstance = new SerialModbusManager(callbacks)
  }
  return _serialInstance
}

export function destroySerialManager(): void {
  _serialInstance = null
}

// ----------------------------------------------------------------
// Web Serial API 类型补全
// ----------------------------------------------------------------
declare global {
  interface Navigator {
    readonly serial: Serial
  }

  interface Serial {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>
    getPorts(): Promise<SerialPort[]>
  }

  interface SerialPortRequestOptions {
    filters?: SerialPortFilter[]
  }

  interface SerialPortFilter {
    usbVendorId?: number
    usbProductId?: number
  }

  interface SerialPort {
    readonly readable: ReadableStream<Uint8Array> | null
    readonly writable: WritableStream<Uint8Array> | null
    open(options: SerialOptions): Promise<void>
    close(): Promise<void>
    getInfo(): SerialPortInfo
  }

  interface SerialOptions {
    baudRate:     number
    dataBits?:    number
    stopBits?:    number
    parity?:      'none' | 'even' | 'odd'
    bufferSize?:  number
    flowControl?: 'none' | 'hardware'
  }

  interface SerialPortInfo {
    usbVendorId?:  number
    usbProductId?: number
  }
}
