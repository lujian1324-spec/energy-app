// ============================================================
// 硬件通讯协议 & 数据库 类型定义
// ============================================================

// -------------------- 连接层 --------------------

/** 通讯协议类型 */
export type ProtocolType = 'bluetooth' | 'serial' | 'none'

/** 连接状态 */
export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'error'

/** 连接信息 */
export interface ConnectionInfo {
  protocol: ProtocolType
  status: ConnectionStatus
  deviceName?: string
  deviceId?: string
  rssi?: number // 蓝牙信号强度 dBm
  errorMessage?: string
  lastConnectedAt?: number
}

// -------------------- BLE GATT 服务定义 --------------------
// Sierro 1000 BLE Profile（自定义 UUID）

/** BLE 服务 & 特征 UUID（与固件对齐，16-bit short form） */
export const BLE_UUIDS = {
  // 主服务：电源管理服务
  POWER_SERVICE: '0000FFE0-0000-1000-8000-00805F9B34FB',
  // 电量 (uint8, 0-100%)
  CHAR_BATTERY_LEVEL: '0000FFE1-0000-1000-8000-00805F9B34FB',
  // 功率数据 (little-endian: int16 input_w, int16 output_w, int16 temp_c*10)
  CHAR_POWER_DATA: '0000FFE2-0000-1000-8000-00805F9B34FB',
  // 端口状态位图 (uint8, bit0=ac-out1, bit1=ac-out2, bit2=usb-out1, bit3=usb-out2)
  CHAR_PORT_STATUS: '0000FFE3-0000-1000-8000-00805F9B34FB',
  // 运行模式 (uint8: 0=solar, 1=backup, 2=car, 3=outdoor)
  CHAR_OPERATING_MODE: '0000FFE4-0000-1000-8000-00805F9B34FB',
  // 充电限额 (uint8, 50-100%)
  CHAR_CHARGE_LIMIT: '0000FFE5-0000-1000-8000-00805F9B34FB',
  // 设备信息服务（标准 BLE）
  DEVICE_INFO_SERVICE: '0000180A-0000-1000-8000-00805F9B34FB',
  CHAR_MANUFACTURER: '00002A29-0000-1000-8000-00805F9B34FB',
  CHAR_MODEL_NUMBER: '00002A24-0000-1000-8000-00805F9B34FB',
  CHAR_SERIAL_NUMBER: '00002A25-0000-1000-8000-00805F9B34FB',
  CHAR_FIRMWARE_VERSION: '00002A26-0000-1000-8000-00805F9B34FB',
} as const

/** BLE 解码后的原始功率数据包 */
export interface BlePowerPacket {
  inputPower: number // W
  outputPower: number // W
  temperature: number // °C（精度 0.1）
}

// -------------------- Modbus RTU 协议 --------------------
// RS485 串口，波特率 9600/19200，8N1
// 设备地址：0x01（默认）

/** Modbus 功能码 */
export enum ModbusFunctionCode {
  READ_HOLDING_REGISTERS  = 0x03,
  READ_INPUT_REGISTERS = 0x04,
  WRITE_SINGLE_REGISTER = 0x06,
  WRITE_MULTIPLE_REGISTERS= 0x10,
}

/** Modbus 寄存器地址表（Sierro 1000 自定义寄存器映射） */
export const MODBUS_REGISTERS = {
  // 只读输入寄存器 (FC04)
  INPUT: {
 BATTERY_LEVEL: 0x0000, // uint16, 0-100 %
 REMAINING_WH: 0x0001, // uint16, Wh
 TOTAL_WH: 0x0002, // uint16, Wh
 INPUT_POWER: 0x0003, // uint16, W
 OUTPUT_POWER: 0x0004, // uint16, W
 TEMPERATURE: 0x0005, // int16, °C × 10
 CYCLE_COUNT: 0x0006, // uint16
 BATTERY_HEALTH: 0x0007, // uint16, 0-100 %
 IS_CHARGING: 0x0008, // uint16, 0/1
 PORT_STATUS: 0x0009, // uint16, bit mask
  },
  // 读写保持寄存器 (FC03/FC06)
  HOLDING: {
 OPERATING_MODE: 0x0100, // uint16, 0=solar,1=backup,2=car,3=outdoor
 CHARGE_LIMIT: 0x0101, // uint16, 50-100 %
 AC_OUT1_ENABLE: 0x0102, // uint16, 0/1
 AC_OUT2_ENABLE: 0x0103, // uint16, 0/1
 USB_OUT1_ENABLE:  0x0104, // uint16, 0/1
 USB_OUT2_ENABLE:  0x0105, // uint16, 0/1
 ECO_MODE: 0x0106, // uint16, 0/1
 OVER_TEMP_PROT: 0x0107, // uint16, 0/1
  },
} as const

/** Modbus 帧（解析后） */
export interface ModbusFrame {
  deviceAddress: number
  functionCode: ModbusFunctionCode
  data: Uint8Array
  crc: number
  isValid: boolean
}

// -------------------- 数据库 Schema --------------------

/** 功率历史记录（每 10 秒一条） */
export interface PowerHistoryRecord {
  id?: number
  timestamp: number // Unix ms
  batteryLevel: number
  inputPower: number
  outputPower: number
  temperature: number
  mode: string
}

/** 告警事件记录 */
export interface AlertRecord {
  id?: number
  timestamp: number
  type: AlertType
  severity: 'info' | 'warning' | 'critical'
  message: string
  deviceId?: string
  resolved: boolean
  resolvedAt?: number
}

export type AlertType =
  | 'over_temp'
  | 'over_charge'
  | 'over_discharge'
  | 'port_fault'
  | 'battery_low'
  | 'connection_lost'
  | 'connection_restored'
  | 'mode_changed'
  | 'charge_complete'

/** 连接历史记录 */
export interface ConnectionRecord {
  id?: number
  timestamp: number
  protocol: ProtocolType
  deviceName: string
  deviceId: string
  action: 'connected' | 'disconnected' | 'error'
  errorMessage?: string
}

/** 设备命令日志（审计） */
export interface CommandRecord {
  id?: number
  timestamp: number
  source: 'user' | 'auto'
  protocol: ProtocolType
  command: string
  payload?: string
  success: boolean
  responseMs?: number
}

// -------------------- 数据查询 --------------------

export interface PowerHistoryQuery {
  from?: number // Unix ms
  to?: number // Unix ms
  limit?: number
}

export interface AlertQuery {
  resolved?: boolean
  severity?: AlertRecord['severity']
  limit?: number
}

// -------------------- 用户资料 --------------------

export interface UserProfile {
  name: string
  email: string
  phone: string
  avatar: string | null // base64 编码的图片数据
  memberSince: string // ISO 8601 date string
  updatedAt?: number // Unix ms
}
