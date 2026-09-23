/** Register maps + FRAMES (split for MCP push size). */
import {
  buildReadFrame,
  buildWriteSingleFrame,
  toHexString,
} from './modbusProtocolCore'

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

  // PV/电池优先操作最小 SOC（0x54，2/RWF，Uint16，默认 30=0x1E，单位 %）
  PV_BATT_PRIORITY_MIN_SOC: 0x0054,
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

  // 0x85：AC 实时充电功率 Uint16（2/RW，默认 400=0x0190，单位 1W）
  AC_CHARGE_POWER_RT:      0x0085,

  // 0x86：PV/电池优先操作（2/RW）
  //   高字节开机 turn on / 低字节关机 turn off
  //   0x01AA = PV/电池优先使能；0xAA01 = PV/电池优先禁止
  PV_BATT_PRIORITY:        0x0086,
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

  /** PV/电池优先使能（0x86，写 0x01AA） */
  PV_BATT_PRIORITY_ON: toHexString(buildWriteSingleFrame(0x0086, 0x01AA)),

  /** PV/电池优先禁止（0x86，写 0xAA01） */
  PV_BATT_PRIORITY_OFF: toHexString(buildWriteSingleFrame(0x0086, 0xAA01)),

  /** 设置 AC 实时充电功率（0x85，单位 1W，默认 400=0x0190） */
  setAcChargePowerRt: (watts: number): string =>
    toHexString(buildWriteSingleFrame(0x0085, Math.max(0, Math.min(0xFFFF, Math.round(watts))))),

  /** 设置 PV/电池优先操作最小 SOC（0x54，单位 %，默认 30） */
  setPvBattPriorityMinSoc: (soc: number): string =>
    toHexString(buildWriteSingleFrame(0x0054, Math.max(0, Math.min(100, Math.round(soc))))),
} as const
