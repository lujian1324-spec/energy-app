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

/** 解析有符号 Int16（高位为 1 表示负数，取反+1） */
export function toInt16(raw: number): number {
  return raw > 0x7fff ? raw - 0x10000 : raw
}

// ─────────────────────────────────────────────
// 寄存器地址表（4.3 Information）
// ─────────────────────────────────────────────

/**
 * 读写寄存器（RWF：掉电不丢失）
 * 0x00 ~ 0x3B：设备配置参数（AC/Battery/PV 门限、校准值等）
 */
export const REG_CONFIG = {
  // AC 输入门限
  AC_IN_LOW_CUT:           0x0000,  // 额定交流输入低压切出点  默认 900 (×0.1V)
  AC_IN_LOW_RESTORE:       0x0001,  // 额定交流输入低压回复点  默认 1000
  AC_IN_HIGH_CUT:          0x0002,  // 额定交流输入高压切出点  默认 2800
  AC_IN_HIGH_RESTORE:      0x0003,  // 额定交流输入高压回复点  默认 2700
  AC_FREQ_LOW_CUT:         0x0004,  // 额定交流输入频率低切出点 默认 450 (×0.1Hz)
  AC_FREQ_LOW_RESTORE:     0x0005,  // 450→460
  AC_FREQ_HIGH_CUT:        0x0006,  // 默认 650
  AC_FREQ_HIGH_RESTORE:    0x0007,  // 默认 640

  // 逆变输出
  INV_OUTPUT_VOLTAGE:      0x0008,  // 额定逆变输出电压  默认 2300 (×0.1V)
  AC_BYPASS_POWER:         0x0009,  // 额定交流旁路输出功率 默认 600W
  AC_INV_OUTPUT_POWER:     0x000A,  // 额定交流逆变输出功率 默认 300W

  // 电芯保护门限
  CELL_LOW_WARN:           0x0010,  // 额定电芯输入电压低报警点 默认 3000 (×1mV)
  CELL_LOW_SHUTDOWN:       0x0011,  // 额定电芯输入电压低关机点 默认 2900
  CELL_LOW_WARN_RESTORE:   0x0012,  // 低报警回复点  默认 3100
  CELL_HIGH_WARN:          0x0013,  // 高报警点      默认 3700
  CELL_HIGH_WARN_RESTORE:  0x0014,  // 高报警回复点  默认 3550
  CELL_LOW_TEMP_PROTECT:   0x0015,  // 低温保护 Int16 默认 -10℃
  CELL_LOW_TEMP_WARN:      0x0016,  // 低温告警 Int16 默认 -7℃
  CELL_LOW_TEMP_RESTORE:   0x0017,  // 低温告警恢复 默认 -5℃
  CELL_HIGH_TEMP_PROTECT:  0x0018,  // 高温保护 默认 +60℃
  CELL_HIGH_TEMP_WARN:     0x0019,  // 高温告警 默认 +57℃
  CELL_HIGH_TEMP_RESTORE:  0x001A,  // 高温告警恢复 默认 +55℃

  // 电池容量（标红重点寄存器）
  BATTERY_RATED_CAPACITY:  0x001B,  // 电池额定容量 Uint16 默认 3140
  BATTERY_CURRENT_CAPACITY:0x001C,  // 电池当前容量 Uint16 默认 1000
  BATTERY_CALC_CAPACITY:   0x001D,  // 电池计算容量 Uint16 默认 2140
  BATTERY_DISCHARGE_CAP:   0x001E,  // 电池放电容量 默认 0
  BATTERY_CYCLE_COUNT:     0x001F,  // 电池循环次数 默认 0

  // 光伏（PV）门限
  PV_MIN_VOLTAGE:          0x0020,  // 光伏输入最低电压点 默认 100 (×0.1V)
  PV_MAX_VOLTAGE:          0x0021,  // 光伏输入最高电压点 默认 600
  CHARGE_EQ_VOLTAGE:       0x0022,  // 额定充电均衡电压点 默认 3600mV
  CHARGE_FLOAT_VOLTAGE:    0x0023,  // 额定充电浮充电压点 默认 3500mV
  AC_CHARGE_POWER:         0x0024,  // 额定交流充电功率    默认 300W
  PV_CHARGE_POWER:         0x0025,  // 额定光伏充电功率    默认 300W
  AC_PV_CHARGE_POWER:      0x0026,  // 额定交流+光伏充电功率 默认 400W

  // 光伏发电累计
  PV_TODAY_ENERGY_LO:      0x0027,  // 光伏当日累计发电量 (Uint32, 高16位)
  PV_TODAY_ENERGY_HI:      0x0028,
  PV_TOTAL_ENERGY_LO:      0x0029,  // 光伏累计发电量 (Uint32)
  PV_TOTAL_ENERGY_HI:      0x002A,

  BATTERY_RATED_CAP2:      0x002B,  // 电池额定容量（另一处）默认 3140
  CHARGE_ACCUM_TIME:       0x002C,  // 充电累计时间
  DISCHARGE_ACCUM_TIME:    0x002D,  // 放电累计时间
  WAKE_AFTER_FULL:         0x002E,  // 充满再唤醒时间 默认 2

  // 校准值（0x30~0x3B）
  GRID_VOLT_CAL:           0x0030,  // 电网电压校准值
  INV_VOLT_CAL:            0x0031,  // 逆变电压校准值
  INV_CURR_CAL:            0x0032,  // 逆变电流校准值
  LOAD_CURR_CAL:           0x0033,  // 负载电流校准值
  INV_BATT_VOLT_CAL:       0x0034,  // 逆变电池电压校准值
  INV_CHARGE_CURR_CAL:     0x0035,  // 逆变充电电流校准值 Int16
  INV_BUS_VOLT_CAL:        0x0036,  // 逆变母线电压校准值
  BATT_CURR_CAL:           0x0037,  // 电池电流校准值 Int16
  PV_VOLT_CAL:             0x0038,  // PV 电压校准值
  PV_CURR_CAL:             0x0039,  // PV 电流校准值
  BATT_PCB_VOLT_CAL:       0x003A,  // 电池 PCB 电压校准值
  BATT_BODY_VOLT_CAL:      0x003B,  // 电池本体电压校准值

  // 产品序列号
  SERIAL_NUMBER:           0x0040,  // 产品生产序列号（16/RWF，2Char = 2Bytes）

  // 特殊控制
  COMPLETE_FULL_CHARGE:    0x0050,  // 完成一次完整充电（写 1 触发）
  DISABLE_POWER_ON:        0x0051,  // 禁止开机（写 1）
} as const

/**
 * 控制寄存器（RW：掉电丢失）
 */
export const REG_CTRL = {
  // 0x80：交流输出开关机
  //   高字节写 0x01→AC 开机；低字节写 0x01→AC 关机
  //   高字节写 0x02→DC 开机；低字节写 0x02→DC 关机
  AC_DC_POWER:             0x0080,

  // 0x81：风扇控制
  //   高字节 bit0：1=风扇使能，0=关闭
  //   低字节：转速
  FAN_CTRL:                0x0081,

  DC_TEMPERATURE:          0x0082,  // DC 温度
} as const

/** 0x80 高字节：开机标志 */
export const POWER_ON_MASK  = 0x01AA   // AC 开机
export const POWER_OFF_MASK = 0x00AA01 // AC 关机（写 0x00_01）

/**
 * 只读寄存器（R：实时运行参数）
 * 地址范围 0x100 ~ 0x139
 */
export const REG_STATUS = {
  AC_IN_VOLTAGE:           0x0100,  // 交流输入电压 Uint16 (×0.1V)
  AC_IN_FREQ:              0x0101,  // 交流输入频率 (×0.1Hz)
  AC_OUT_VOLTAGE:          0x0102,  // 交流输出电压
  AC_OUT_FREQ:             0x0103,  // 交流输出频率
  AC_OUT_POWER:            0x0104,  // 交流输出功率 W
  PV_IN_VOLTAGE:           0x0105,  // 光伏输入电压 (×0.1V)
  PV_CHARGE_POWER:         0x0106,  // 光伏充电功率 W
  AC_CHARGE_POWER:         0x0107,  // 交流充电功率 W

  // 电芯极柱电压（16节，0x108~0x117）
  CELL1_VOLTAGE:           0x0108,  // 电芯 1 极柱电压 (×1mV)
  CELL2_VOLTAGE:           0x0109,
  CELL3_VOLTAGE:           0x010A,
  CELL4_VOLTAGE:           0x010B,
  CELL5_VOLTAGE:           0x010C,
  CELL6_VOLTAGE:           0x010D,
  CELL7_VOLTAGE:           0x010E,
  CELL8_VOLTAGE:           0x010F,
  CELL9_VOLTAGE:           0x0110,
  CELL10_VOLTAGE:          0x0111,
  CELL11_VOLTAGE:          0x0112,
  CELL12_VOLTAGE:          0x0113,
  CELL13_VOLTAGE:          0x0114,
  CELL14_VOLTAGE:          0x0115,
  CELL15_VOLTAGE:          0x0116,
  CELL16_VOLTAGE:          0x0117,

  CELL_CAP_VOLTAGE:        0x0118,  // 电芯电解电容电压
  CELL_CAPACITY_AH:        0x0119,  // 电芯容量 Ah
  CELL_SOC_PCT:            0x011A,  // 电芯剩余容量百分比 (×0.1%) e.g. 1000=100.0%
  CELL_CYCLE_COUNT:        0x011B,  // 电芯充放电循环次数
  PV_TODAY_ENERGY:         0x011C,  // 光伏当日累计发电量 Uint32（4字节，跨 0x11C+0x11D）
  PV_TOTAL_ENERGY:         0x011E,  // 光伏累计发电量 Uint32

  CELL_CURRENT:            0x0120,  // 电芯电流 Int16 (充电为正，放电为负，×0.01A)
  MPPT_TEMP:               0x0121,  // MPPT 散热器温度 Int16 (×0.1℃)
  DCDC_TEMP:               0x0122,  // DCDC 散热器温度 Int16
  CELL1_TEMP:              0x0123,  // 电芯 1 温度 Int16 (×0.1℃)
  CELL2_TEMP:              0x0124,  // 电芯 2 温度
  CELL3_TEMP:              0x0125,  // 电芯 3 温度

  RUN_STATE:               0x0126,  // 运行状态（详见列表 1）
  WARN_CODE1:              0x0127,  // 告警代码 1（详见列表 2）
  WARN_CODE2:              0x0128,  // 告警代码 2（详见列表 3）
  GRID_FAULT:              0x0129,  // 市电故障（详见列表 4）
  INV_FAULT:               0x012A,  // 逆变器整机故障（列表 5）
  OFFGRID_FAULT:           0x012B,  // 离网故障（列表 6）
  CELL_COUNT:              0x012C,  // 电芯数量
  CELL_TEMP_SENSOR:        0x012D,  // 电芯温度传感器数量
  CHARGE_ACCUM_TIME:       0x012E,  // 充电累计时间（只读实时）
  DISCHARGE_ACCUM_TIME:    0x012F,  // 放电累计时间

  BATTERY_STATE:           0x0130,  // 电池状态（列表 7）
  INV_LOGIC_WORD:          0x0131,  // 逆变逻辑字（列表 8）
  INV_STATE:               0x0132,  // 逆变状态（列表 8 第二组）
  SYS_STATE_MACHINE:       0x0133,  // 逆变状态机（列表 10）
  PV_FAULT:                0x0134,  // PV 故障字（列表 11）
} as const

/**
 * 版本信息寄存器（只读）
 */
export const REG_VERSION = {
  HARDWARE_VER:            0x0200,  // 硬件版本号（8/R，2char × 4寄存器）
  MCU_SW_VER:              0x0204,  // 主控软件版本号
  INV_SW_VER:              0x0208,  // 逆变软件版本号
} as const

// ─────────────────────────────────────────────
// 运行状态位解析（寄存器 0x126，列表 1）
// ─────────────────────────────────────────────

export interface RunState {
  pvCharging:    boolean  // bit 0 L: 有光伏充电中
  acCharging:    boolean  // bit 1 L: 有交流充电中
  acOutput:      boolean  // bit 2 L: 交流输出开启
  bypass:        boolean  // bit 3 L: 旁路状态
  inverter:      boolean  // bit 4 L: 逆变状态
  noLoadShutdown:boolean  // bit 5 L: 倒计时 30 分钟
  dcRunning:     boolean  // bit 6 L: DC 运行状态
  lcdOff:        boolean  // bit 7 L: LCD 关闭背光
  fanRunning:    boolean  // bit 0 H: 风扇运行状态
}

export function parseRunState(raw: number): RunState {
  const lo = raw & 0xff
  const hi = (raw >> 8) & 0xff
  return {
    pvCharging:     !!(lo & (1 << 0)),
    acCharging:     !!(lo & (1 << 1)),
    acOutput:       !!(lo & (1 << 2)),
    bypass:         !!(lo & (1 << 3)),
    inverter:       !!(lo & (1 << 4)),
    noLoadShutdown: !!(lo & (1 << 5)),
    dcRunning:      !!(lo & (1 << 6)),
    lcdOff:         !!(lo & (1 << 7)),
    fanRunning:     !!(hi & (1 << 0)),
  }
}

// ─────────────────────────────────────────────
// 告警代码 1 位解析（寄存器 0x127，列表 2）
// ─────────────────────────────────────────────

export interface WarnCode1 {
  // 高字节（1H）
  cell3TempLow:   boolean  // bit 7
  cell2TempLow:   boolean  // bit 6
  cell1TempLow:   boolean  // bit 5
  cell3TempHigh:  boolean  // bit 4
  cell2TempHigh:  boolean  // bit 3
  cell1TempHigh:  boolean  // bit 2
  dcdcTempHigh:   boolean  // bit 1
  mpptTempHigh:   boolean  // bit 0
  // 低字节（1L）
  pvOverVoltage:  boolean  // bit 7
  gridUnderVolt:  boolean  // bit 6
  gridOverVolt:   boolean  // bit 5
  busOverVolt:    boolean  // bit 4
  busUnderVolt:   boolean  // bit 3
  cellUnder3V:    boolean  // bit 2
  cellFuseBroken: boolean  // bit 1
  cellConnLoose:  boolean  // bit 0
}

export function parseWarnCode1(raw: number): WarnCode1 {
  const lo = raw & 0xff
  const hi = (raw >> 8) & 0xff
  return {
    cell3TempLow:   !!(hi & (1 << 7)),
    cell2TempLow:   !!(hi & (1 << 6)),
    cell1TempLow:   !!(hi & (1 << 5)),
    cell3TempHigh:  !!(hi & (1 << 4)),
    cell2TempHigh:  !!(hi & (1 << 3)),
    cell1TempHigh:  !!(hi & (1 << 2)),
    dcdcTempHigh:   !!(hi & (1 << 1)),
    mpptTempHigh:   !!(hi & (1 << 0)),
    pvOverVoltage:  !!(lo & (1 << 7)),
    gridUnderVolt:  !!(lo & (1 << 6)),
    gridOverVolt:   !!(lo & (1 << 5)),
    busOverVolt:    !!(lo & (1 << 4)),
    busUnderVolt:   !!(lo & (1 << 3)),
    cellUnder3V:    !!(lo & (1 << 2)),
    cellFuseBroken: !!(lo & (1 << 1)),
    cellConnLoose:  !!(lo & (1 << 0)),
  }
}

// ─────────────────────────────────────────────
// 预构造常用报文（开箱即用）
// ─────────────────────────────────────────────

/**
 * 常用透传报文，值为十六进制字符串，可直接传给 passthroughDevice。
 *
 * 示例：
 *   await passthroughDevice(deviceId, { data: FRAMES.READ_ALL_STATUS, protocol: 'modbus' })
 */
export const FRAMES = {
  /** 读取全部运行参数（0x0000 起 18 个寄存器，对应 §4.1） */
  READ_ALL_PARAMS: toHexString(buildReadFrame(0x0000, 0x0012)),
  // 01 03 00 00 00 12 C5 C7

  /** 读取实时状态（0x0100 起 56 个寄存器，覆盖电压/功率/SOC/温度） */
  READ_ALL_STATUS: toHexString(buildReadFrame(0x0100, 0x0038)),
  // 01 03 01 00 00 38 XX XX

  /** 读取运行状态字 + 告警代码 1/2 + 市电/逆变/离网故障（0x126 起 9 寄存器） */
  READ_FAULT_BLOCK: toHexString(buildReadFrame(0x0126, 0x0009)),

  /** 读取电芯电流 + MPPT/DCDC/电芯温度（0x120 起 6 寄存器） */
  READ_TEMP_CURR: toHexString(buildReadFrame(0x0120, 0x0006)),

  /** 读取 16 节电芯极柱电压（0x108 起 16 寄存器） */
  READ_CELL_VOLTAGES: toHexString(buildReadFrame(0x0108, 0x0010)),

  /** 读取硬件版本号（0x200，4 寄存器） */
  READ_HW_VERSION: toHexString(buildReadFrame(0x0200, 0x0004)),

  /** 读取主控软件版本号（0x204，4 寄存器） */
  READ_MCU_VERSION: toHexString(buildReadFrame(0x0204, 0x0004)),

  /** AC 开机（0x80，写 0x01AA） */
  AC_POWER_ON: toHexString(buildWriteSingleFrame(0x0080, 0x01AA)),
  // 01 06 00 80 01 AA XX XX

  /** AC 关机（0x80，写 0xAA01） */
  AC_POWER_OFF: toHexString(buildWriteSingleFrame(0x0080, 0xAA01)),

  /** DC 开机（0x80，写 0x02AA） */
  DC_POWER_ON: toHexString(buildWriteSingleFrame(0x0080, 0x02AA)),

  /** DC 关机（0x80，写 0xAA02） */
  DC_POWER_OFF: toHexString(buildWriteSingleFrame(0x0080, 0xAA02)),

  /** 触发一次完整充电（0x50，写 1） */
  TRIGGER_FULL_CHARGE: toHexString(buildWriteSingleFrame(0x0050, 0x0001)),

  /** 禁止开机（0x51，写 1） */
  DISABLE_POWER_ON: toHexString(buildWriteSingleFrame(0x0051, 0x0001)),

  /** 允许开机（0x51，写 0） */
  ENABLE_POWER_ON: toHexString(buildWriteSingleFrame(0x0051, 0x0000)),
} as const

// ─────────────────────────────────────────────
// 完整寄存器描述表 + 响应解析为参数列表
// ─────────────────────────────────────────────

export interface ParsedParam {
  addr: number
  name: string
  value: string  // formatted display
  unit: string
  raw: number
  group: string
}

type RegDesc = {
  name: string
  group: string
  scale?: number          // raw × scale = display value
  unit?: string
  signed?: boolean        // Int16
  fmt?: (raw: number) => string   // overrides scale/unit
}

function bitStr(raw: number, bits: Record<number, string>, lo = false): string {
  const byte = lo ? (raw & 0xff) : ((raw >> 8) & 0xff)
  const active = Object.entries(bits)
    .filter(([bit]) => byte & (1 << Number(bit)))
    .map(([, label]) => label)
  return active.length ? active.join(' | ') : 'Normal'
}

const REG_DESC: Record<number, RegDesc> = {
  // ── Config 0x00-0x0A ────────────────────────
  0x0000: { name: 'AC Input Low-V Cutout',   group: 'AC Config',  scale: 0.1,  unit: 'V' },
  0x0001: { name: 'AC Input Low-V Restore',   group: 'AC Config',  scale: 0.1,  unit: 'V' },
  0x0002: { name: 'AC Input High-V Cutout',   group: 'AC Config',  scale: 0.1,  unit: 'V' },
  0x0003: { name: 'AC Input High-V Restore',   group: 'AC Config',  scale: 0.1,  unit: 'V' },
  0x0004: { name: 'AC Freq Low Cutout',     group: 'AC Config',  scale: 0.1,  unit: 'Hz' },
  0x0005: { name: 'AC Freq Low Restore',     group: 'AC Config',  scale: 0.1,  unit: 'Hz' },
  0x0006: { name: 'AC Freq High Cutout',     group: 'AC Config',  scale: 0.1,  unit: 'Hz' },
  0x0007: { name: 'AC Freq High Restore',     group: 'AC Config',  scale: 0.1,  unit: 'Hz' },
  0x0008: { name: 'Inverter Output Voltage',   group: 'AC Config',  scale: 0.1,  unit: 'V' },
  0x0009: { name: 'AC Bypass Output Power',     group: 'AC Config',  scale: 1,    unit: 'W' },
  0x000A: { name: 'AC Inverter Output Power',     group: 'AC Config',  scale: 1,    unit: 'W' },
  // ── Config 0x10-0x1F ────────────────────────
  0x0010: { name: 'Cell Low-V Alarm',       group: 'Battery Config', scale: 1,   unit: 'mV' },
  0x0011: { name: 'Cell Low-V Shutdown',       group: 'Battery Config', scale: 1,   unit: 'mV' },
  0x0012: { name: 'Cell Low-V Alarm Restore',   group: 'Battery Config', scale: 1,   unit: 'mV' },
  0x0013: { name: 'Cell High-V Alarm',       group: 'Battery Config', scale: 1,   unit: 'mV' },
  0x0014: { name: 'Cell High-V Alarm Restore',   group: 'Battery Config', scale: 1,   unit: 'mV' },
  0x0015: { name: 'Cell Low-Temp Protect',       group: 'Battery Config', scale: 1,   unit: '℃', signed: true },
  0x0016: { name: 'Cell Low-Temp Alarm',       group: 'Battery Config', scale: 1,   unit: '℃', signed: true },
  0x0017: { name: 'Cell Low-Temp Alarm Restore',   group: 'Battery Config', scale: 1,   unit: '℃', signed: true },
  0x0018: { name: 'Cell High-Temp Protect',       group: 'Battery Config', scale: 1,   unit: '℃', signed: true },
  0x0019: { name: 'Cell High-Temp Alarm',       group: 'Battery Config', scale: 1,   unit: '℃', signed: true },
  0x001A: { name: 'Cell High-Temp Alarm Restore',   group: 'Battery Config', scale: 1,   unit: '℃', signed: true },
  0x001B: { name: 'Battery Rated Capacity',         group: 'Battery Config', scale: 0.1, unit: 'Ah' },
  0x001C: { name: 'Battery Current Capacity',         group: 'Battery Config', scale: 0.1, unit: 'Ah' },
  0x001D: { name: 'Battery Calc Capacity',         group: 'Battery Config', scale: 0.1, unit: 'Ah' },
  0x001E: { name: 'Battery Discharge Capacity',         group: 'Battery Config', scale: 0.1, unit: 'Ah' },
  0x001F: { name: 'Battery Cycle Count',         group: 'Battery Config', scale: 1,   unit: 'cyc' },
  // ── Config 0x20-0x2E ────────────────────────
  0x0020: { name: 'PV Input Min Voltage',       group: 'PV Config',   scale: 0.1, unit: 'V' },
  0x0021: { name: 'PV Input Max Voltage',       group: 'PV Config',   scale: 0.1, unit: 'V' },
  0x0022: { name: 'Charge Equalize Voltage',       group: 'PV Config',   scale: 1,   unit: 'mV' },
  0x0023: { name: 'Charge Float Voltage',       group: 'PV Config',   scale: 1,   unit: 'mV' },
  0x0024: { name: 'AC Charge Power',     group: 'PV Config',   scale: 1,   unit: 'W' },
  0x0025: { name: 'PV Charge Power',     group: 'PV Config',   scale: 1,   unit: 'W' },
  0x0026: { name: 'AC+PV Charge Power',group: 'PV Config',   scale: 1,   unit: 'W' },
  0x002B: { name: 'Battery Rated Capacity (2)',      group: 'Battery Config', scale: 0.1, unit: 'Ah' },
  0x002C: { name: 'Charge Total Time',         group: 'Battery Config', scale: 1,   unit: 'h' },
  0x002D: { name: 'Discharge Total Time',         group: 'Battery Config', scale: 1,   unit: 'h' },
  0x002E: { name: 'Re-Wake After Full',       group: 'Battery Config', scale: 1,   unit: 'h' },
  // ── Status 0x100-0x107 ──────────────────────
  0x0100: { name: 'AC Input Voltage',         group: 'AC Live',   scale: 0.1, unit: 'V' },
  0x0101: { name: 'AC Input Frequency',         group: 'AC Live',   scale: 0.1, unit: 'Hz' },
  0x0102: { name: 'AC Output Voltage',         group: 'AC Live',   scale: 0.1, unit: 'V' },
  0x0103: { name: 'AC Output Frequency',         group: 'AC Live',   scale: 0.1, unit: 'Hz' },
  0x0104: { name: 'AC Output Power',         group: 'AC Live',   scale: 1,   unit: 'W' },
  0x0105: { name: 'PV Input Voltage',           group: 'PV Live',   scale: 0.1, unit: 'V' },
  0x0106: { name: 'PV Charge Power',           group: 'PV Live',   scale: 1,   unit: 'W' },
  0x0107: { name: 'AC Charge Power',         group: 'AC Live',   scale: 1,   unit: 'W' },
  // ── Cell voltages 0x108-0x118 ───────────────
  0x0108: { name: 'Cell 1 Voltage',        group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x0109: { name: 'Cell 2 Voltage',        group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x010A: { name: 'Cell 3 Voltage',        group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x010B: { name: 'Cell 4 Voltage',        group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x010C: { name: 'Cell 5 Voltage',        group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x010D: { name: 'Cell 6 Voltage',        group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x010E: { name: 'Cell 7 Voltage',        group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x010F: { name: 'Cell 8 Voltage',        group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x0110: { name: 'Cell 9 Voltage',        group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x0111: { name: 'Cell 10 Voltage',       group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x0112: { name: 'Cell 11 Voltage',       group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x0113: { name: 'Cell 12 Voltage',       group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x0114: { name: 'Cell 13 Voltage',       group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x0115: { name: 'Cell 14 Voltage',       group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x0116: { name: 'Cell 15 Voltage',       group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x0117: { name: 'Cell 16 Voltage',       group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  0x0118: { name: 'Cell Cap Voltage',     group: 'Cell Voltage', scale: 1,   unit: 'mV' },
  // ── Cell stats 0x119-0x11F ──────────────────
  0x0119: { name: 'Cell Capacity',             group: 'Battery Live', scale: 0.1, unit: 'Ah' },
  0x011A: { name: 'Cell SOC',         group: 'Battery Live', scale: 0.1, unit: '%' },
  0x011B: { name: 'Cell Cycle Count',   group: 'Battery Live', scale: 1,   unit: 'cyc' },
  // ── Current / temperature 0x120-0x125 ───────
  0x0120: { name: 'Cell Current',             group: 'Temp/Current', scale: 0.01, unit: 'A', signed: true },
  0x0121: { name: 'MPPT Heatsink Temp',       group: 'Temp/Current', scale: 0.1,  unit: '℃', signed: true },
  0x0122: { name: 'DCDC Heatsink Temp',       group: 'Temp/Current', scale: 0.1,  unit: '℃', signed: true },
  0x0123: { name: 'Cell 1 Temp',            group: 'Temp/Current', scale: 0.1,  unit: '℃', signed: true },
  0x0124: { name: 'Cell 2 Temp',            group: 'Temp/Current', scale: 0.1,  unit: '℃', signed: true },
  0x0125: { name: 'Cell 3 Temp',            group: 'Temp/Current', scale: 0.1,  unit: '℃', signed: true },
  // ── Run state / faults 0x126-0x134 ──────────
  0x0126: {
    name: 'Run State', group: 'Run State',
    fmt: (raw) => {
      const lo = raw & 0xff
      const hi = (raw >> 8) & 0xff
      const flags: string[] = []
      if (lo & 0x01) flags.push('PV Charging')
      if (lo & 0x02) flags.push('AC Charging')
      if (lo & 0x04) flags.push('AC Output')
      if (lo & 0x08) flags.push('Bypass')
      if (lo & 0x10) flags.push('Inverting')
      if (lo & 0x20) flags.push('Countdown Off')
      if (lo & 0x40) flags.push('DC Running')
      if (lo & 0x80) flags.push('LCD Backlight Off')
      if (hi & 0x01) flags.push('Fan Running')
      return flags.length ? flags.join(' | ') : 'Standby'
    },
  },
  0x0127: {
    name: 'Alarm Code 1', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const hi = (raw >> 8) & 0xff
      const w: string[] = []
      if (hi & 0x80) w.push('Cell 3 Temp Low')
      if (hi & 0x40) w.push('Cell 2 Temp Low')
      if (hi & 0x20) w.push('Cell 1 Temp Low')
      if (hi & 0x10) w.push('Cell 3 Temp High')
      if (hi & 0x08) w.push('Cell 2 Temp High')
      if (hi & 0x04) w.push('Cell 1 Temp High')
      if (hi & 0x02) w.push('DCDC Overtemp')
      if (hi & 0x01) w.push('MPPT Overtemp')
      if (lo & 0x80) w.push('PV Input Overvoltage')
      if (lo & 0x40) w.push('Grid Undervoltage')
      if (lo & 0x20) w.push('Grid Overvoltage')
      if (lo & 0x10) w.push('BUS Overvoltage')
      if (lo & 0x08) w.push('BUS Undervoltage')
      if (lo & 0x04) w.push('Cell <3.0V')
      if (lo & 0x02) w.push('Cell Fuse Open')
      if (lo & 0x01) w.push('Busbar Loose')
      return w.length ? w.join(' | ') : 'No Alarm'
    },
  },
  0x0128: {
    name: 'Alarm Code 2', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const w: string[] = []
      if (lo & 0x04) w.push('Temp Sampling Fault')
      if (lo & 0x02) w.push('Main Relay Fault')
      if (lo & 0x01) w.push('Output Short')
      return w.length ? w.join(' | ') : 'No Alarm'
    },
  },
  0x0129: {
    name: 'Grid Fault', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const hi = (raw >> 8) & 0xff
      const w: string[] = []
      if (hi & 0x80) w.push('Charge HW Overcurrent')
      if (hi & 0x40) w.push('LLC Charge Overcurrent')
      if (hi & 0x20) w.push('Grid Relay Fault')
      if (hi & 0x10) w.push('Grid Overload')
      if (hi & 0x08) w.push('PLL Fault')
      if (hi & 0x04) w.push('Islanding Fault')
      if (hi & 0x02) w.push('Grid Outage Fast Detect')
      if (hi & 0x01) w.push('Bypass Underfreq')
      if (lo & 0x80) w.push('Grid Underfreq')
      if (lo & 0x40) w.push('Bypass Underfreq 2')
      if (lo & 0x20) w.push('Grid Overfreq')
      if (lo & 0x10) w.push('Bypass Undervoltage')
      if (lo & 0x08) w.push('Grid Undervoltage 2')
      if (lo & 0x04) w.push('Bypass Overvoltage')
      if (lo & 0x02) w.push('Grid Overvoltage')
      return w.length ? w.join(' | ') : 'No Fault'
    },
  },
  0x012A: {
    name: 'Inverter Fault', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const hi = (raw >> 8) & 0xff
      const w: string[] = []
      if (hi & 0x04) w.push('Software Lockout')
      if (hi & 0x02) w.push('Software Lockout 2')
      if (hi & 0x01) w.push('DC Overload')
      if (lo & 0x80) w.push('DC SW Overcurrent')
      if (lo & 0x40) w.push('DC HW Overcurrent')
      if (lo & 0x20) w.push('System Overtemp')
      if (lo & 0x10) w.push('Bus Soft Start')
      if (lo & 0x08) w.push('Bus Undervoltage')
      if (lo & 0x04) w.push('Bus Overvoltage')
      if (lo & 0x02) w.push('Bus Overvoltage Fast Detect')
      if (lo & 0x01) w.push('System Fault')
      return w.length ? w.join(' | ') : 'No Fault'
    },
  },
  0x012B: {
    name: 'Off-Grid Fault', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const w: string[] = []
      if (lo & 0x80) w.push('Half-Wave Overload')
      if (lo & 0x40) w.push('Output Undervoltage')
      if (lo & 0x20) w.push('SW Overcurrent')
      if (lo & 0x10) w.push('HW Overcurrent')
      if (lo & 0x08) w.push('SW Overcurrent Fast Detect')
      if (lo & 0x04) w.push('Output Overload')
      if (lo & 0x02) w.push('Output Short')
      if (lo & 0x01) w.push('Off-Grid Inverter Fault')
      return w.length ? w.join(' | ') : 'No Fault'
    },
  },
  0x012C: { name: 'Cell Count',             group: 'Run State', scale: 1, unit: 'cells' },
  0x012D: { name: 'Temp Sensor Count',       group: 'Run State', scale: 1, unit: 'pcs' },
  0x012E: { name: 'Charge Total Time',         group: 'Run State', scale: 1, unit: 'h' },
  0x012F: { name: 'Discharge Total Time',         group: 'Run State', scale: 1, unit: 'h' },
  0x0130: {
    name: 'Battery State', group: 'Run State',
    fmt: (raw) => {
      const lo = raw & 0xff
      const w: string[] = []
      if (lo & 0x08) w.push('Battery Severe Overvoltage')
      if (lo & 0x04) w.push('Battery Undervoltage')
      if (lo & 0x02) w.push('Battery Disconnected')
      if (lo & 0x01) w.push('Battery Overvoltage')
      return w.length ? w.join(' | ') : 'Normal'
    },
  },
  0x0133: {
    name: 'System State Machine', group: 'Run State',
    fmt: (raw) => {
      const states: Record<number, string> = {
        0: 'System Init', 1: 'Power-Up', 2: 'Standby',
        3: 'Grid Relay Closing Wait', 4: 'Grid Relay Closed', 5: 'Grid LLC Soft Start',
        6: 'Charging', 7: 'Discharge LLC Soft Start', 8: 'Discharging',
        9: 'Fault', 10: 'Shutdown', 11: 'Online Upgrade',
      }
      const bit = Math.log2(raw & -raw)  // lowest set bit
      return states[bit] ?? `State 0x${raw.toString(16).toUpperCase()}`
    },
  },
  0x0134: {
    name: 'PV Fault', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const hi = (raw >> 8) & 0xff
      const w: string[] = []
      if (hi & 0x80) w.push('PV Reverse Overcurrent')
      if (hi & 0x40) w.push('PV Bus Overvoltage Fast Detect')
      if (hi & 0x20) w.push('PV Overvoltage Fast Detect')
      if (hi & 0x10) w.push('PV Overtemp')
      if (hi & 0x08) w.push('PV Bus Overvoltage')
      if (hi & 0x04) w.push('PV Short Fast Detect')
      if (lo & 0x80) w.push('PV Disconnected')
      if (lo & 0x40) w.push('PV Short')
      if (lo & 0x20) w.push('PV Overcurrent')
      if (lo & 0x10) w.push('PV Output Undervoltage')
      if (lo & 0x08) w.push('PV Output Overvoltage')
      return w.length ? w.join(' | ') : 'No Fault'
    },
  },
}

/** 根据请求帧 + 响应帧解析寄存器值，返回带名称和单位的参数列表 */
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
