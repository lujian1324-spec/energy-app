// ═══════════════════════════════════════════════════════════════
// T7: API 实时状态 — 对齐 /remote/device/state/latest 返回格式
// ═══════════════════════════════════════════════════════════════

/**
 * 设备实时状态字段（来自 /remote/device/state/latest → fields[key]）
 * 与 API 的 DeviceStateField.key 完全对齐
 */
export interface DeviceRealtimeFields {
  // ── 电量 ──
  /** 电芯剩余容量百分比 (0-100)，API: remainingBatteryCapacity */
  remainingBatteryCapacity: number
  /** 电芯容量 Ah，API: batteryCapacity */
  batteryCapacity: number
  /** 电芯电流 A，API: batteryCurrent */
  batteryCurrent: number
  /** 电芯充放电循环次数，API: numberOfBatteryUsageCycles */
  numberOfBatteryUsageCycles: number

  // ── 功率 ──
  /** 交流充电功率 W，API: exchangeChargingPower */
  acPower: number
  /** 光伏充电功率 W，API: generationPower */
  solarPower: number
  /** 交流输出功率 W，API: outputPower */
  outputPower: number
  /** 计算电池功率 W（充正放负），API: batteryCurrent × voltage */
  batteryPower: number

  // ── 电压 / 频率 ──
  /** 交流输入电压 V，API: l1AcInputVoltage */
  acInputVoltage: number
  /** 交流输入频率 Hz，API: acInputFrequency */
  acInputFrequency: number
  /** 交流输出电压 V，API: acOutputVoltage */
  acOutputVoltage: number
  /** 交流输出频率 Hz，API: acOutputFrequency */
  acOutputFrequency: number
  /** 光伏输入电压 V，API: solarInputVoltage */
  solarInputVoltage: number

  // ── 温度 ──
  /** 电芯 1 温度 °C，API: cellTemperature1 */
  batteryTemp: number
  /** 电芯 2 温度 °C，API: cellTemperature2 */
  cellTemperature2: number
  /** 电芯 3 温度 °C，API: cellTemperature3 */
  cellTemperature3: number
  /** MPPT 散热器温度 °C，API: mpptTemperature */
  mpptTemperature: number
  /** DCDC 散热器温度 °C，API: dcdcTemperature */
  dcdcTemperature: number

  // ── 能量统计 ──
  /** 光伏当日发电量 kWh，API: pvGeneratedEnergyOfDay */
  pvGeneratedEnergyOfDay: number
  /** 光伏累计发电量 kWh，API: totalPVGeneratedEnergy */
  totalPVGeneratedEnergy: number
  /** 充电累计时间 分钟，API: accumulatedChargingTime */
  accumulatedChargingTime: number
  /** 放电累计时间 分钟，API: accumulatedDischargeTime */
  accumulatedDischargeTime: number

  // ── 开关状态（布尔，API 返回 "0"/"1" 字符串） ──
  /** 逆变状态（AC输出1），API: inversionState */
  acOut1Enable: boolean
  /** AC 输出 2 使能，API: acOut2Enable */
  acOut2Enable: boolean
  /** USB 输出 1 使能，API: usbOut1Enable */
  usbOut1Enable: boolean
  /** 光伏充电中，API: photovoltaicCharging */
  photovoltaicCharging: boolean
  /** 市电充电中，API: mainsCharging */
  mainsCharging: boolean
  /** 交流输出，API: acOutputs */
  acOutputs: boolean
  /** 旁路状态，API: bypassStatus */
  bypassStatus: boolean
  /** 无负载关机，API: noLoadShutdown */
  noLoadShutdown: boolean
  /** 睡眠模式，API: sleepMode */
  sleepMode: boolean

  // ── 模式 ──
  /** 工作模式: 0=正常 1=备份 2=节能，API: workMode */
  workMode: 0 | 1 | 2

  // ── 版本 ──
  /** 硬件版本号，API: hardwareVersion */
  hardwareVersion: string
  /** 主控软件版本号，API: softwareVersionNumber */
  softwareVersionNumber: string
  /** 逆变软件版本号，API: inverterSoftwareVersionNumber */
  inverterSoftwareVersionNumber: string
}

/** 设备告警（来自 firingAlarms） */
export interface DeviceAlert {
  alarmId: string
  alarmCode: string
  alarmMessage: string
  severity: 'critical' | 'major' | 'minor' | 'info'
  timestamp: string
  isProcessed?: boolean
}

// ─── 设备类型（统一 UI + API） ───

/**
 * 设备类型（混合本地 UI 字段 + 云端 API 字段）
 * - UI 本地字段：id, name, type, status, batteryLevel, isOn, power
 * - API 实时字段：deviceId, firmwareVersion, lastSeen, remainingBatteryCapacity, acPower, solarPower...
 * - API 设备元数据：serialNumber, model, stationId, isOnline, isAlarmed
 */
export interface Device {
  /** 本地设备 ID（与 deviceId 对应） */
  id: string
  name: string
  type: 'cpap' | 'fridge' | 'powerstation' | 'laptop' | 'phone' | 'lighting' | 'other'
  status: 'online' | 'offline'
  /** 本地显示用电量百分比（可由 remainingBatteryCapacity 驱动） */
  batteryLevel: number
  /** 本地开关状态（可由 acOut1Enable 等驱动） */
  isOn: boolean
  /** 本地功率显示 W（可由 outputPower 驱动） */
  power?: number

  // ── API 设备元数据（来自 /device/list → DeviceListItem） ──
  /** 云端设备 ID（与 id 对应）；本地 mock 设备可无此字段 */
  deviceId?: string
  /** 设备序列号 */
  serialNumber?: string
  /** 设备型号 */
  model?: string
  /** 固件版本 */
  firmwareVersion?: string
  /** 所属电站 ID */
  stationId?: number
  /** 是否在线（对应 isOnline） */
  isOnline?: boolean
  /** 是否有告警（对应 isAlarmed） */
  isAlarmed?: boolean
  /** 是否已置顶 */
  isPinned?: boolean
  /** 最后在线时间（Unix ms） */
  lastOnlineAt?: number

  // ── API 实时状态字段（来自 /remote/device/state/latest，经 mapFieldsToRealtime 映射） ──
  remainingBatteryCapacity?: number               // remainingBatteryCapacity
  batteryPower?: number
  acPower?: number           // exchangeChargingPower
  solarPower?: number        // generationPower
  outputPower?: number
  batteryTemp?: number       // cellTemperature1
  acOut1Enable?: boolean     // inversionState
  acOut2Enable?: boolean
  usbOut1Enable?: boolean
  sleepMode?: boolean
  workMode?: 0 | 1 | 2
}

// ─── 端口类型 ───
export interface Port {
  id: string;
  name: string;
  type: 'ac-out' | 'ac-in' | 'dc-in' | 'usb-out';
  status: 'active' | 'inactive';
  deviceName?: string;
  power: number;
}

// 设备规格
export interface DeviceSpecs {
  batteryCapacity: string;
  batteryType: string;
  maxOutputPower: string;
  maxOutputSurge: string;
  outputType: string;
  maxChargePower: string;
  chargeMode: string;
  chargeTime: string;
  operatingTemp: string;
  optimalTemp: string;
}

// 电源站状态
export interface PowerStation {
  name: string;
  model: string;
  serialNumber: string;
  batteryLevel: number;
  remainingWh: number;
  totalWh: number;
  inputPower: number;
  outputPower: number;
  temperature: number;
  ports: Port[];
  mode: 'solar' | 'backup' | 'car' | 'outdoor' | 'home-backup';
  isCharging: boolean;
  timeToFull: string;
  cycleCount: number;
  batteryHealth: number;
  specs: DeviceSpecs;
}

// 运行模式
export type OperatingMode = 'solar' | 'backup' | 'car' | 'outdoor';

export interface ModeConfig {
  id: OperatingMode;
  name: string;
  description: string;
  icon: string;
}

// 统计数据
export interface StatsData {
  solarCharged: number;
  totalOutput: number;
  costSaved: number;
  carbonReduced: number;
  weeklyCharge: number[];
  weeklyDischarge: number[];
  deviceUsage: DeviceUsage[];
}

export interface DeviceUsage {
  deviceId: string;
  deviceName: string;
  kwh: number;
  percentage: number;
  icon: string;
}

// 设置项
export interface AppSettings {
  notifications: boolean;
  pushNotifications: boolean;
  doNotDisturb: boolean;
  doNotDisturbStart: string;
  doNotDisturbEnd: string;
  language: string;
  units: 'metric' | 'imperial';
  cloudSync: boolean;
  bluetooth: boolean;
  chargeLimit: number;
  ecoMode: boolean;
  overTempProtection: boolean;
  overDischargeProtection: boolean;
  founderBadge?: boolean;
  founderBadgeActivatedAt?: string;
  founderBadgeNumber?: number; // 0-100 之间的唯一身份编码
  /** Low battery notification threshold: 10 | 20 | 30 (default: 30) */
  lowBatteryThreshold?: number;
  /** PRD v1.1 §4.3: Device display icon color */
  deviceIconColor?: string;
  /** PRD v1.1 §4.3: Sleep Mode (turn off display) */
  sleepMode?: boolean;
  /** PRD v1.1 §4.3: Battery Mode (0=Normal, 1=Backup, 2=Eco) */
  batteryMode?: number;
  /** PRD v1.1 §4.6: Solar Status push notification */
  pushSolarStatus?: boolean;
}

// 削峰填谷时间段配置
export interface PeakShavingSchedule {
  id: string;
  name: string;
  startTime: string; // HH:mm 格式
  endTime: string;   // HH:mm 格式
  type: 'charge' | 'discharge' | 'grid' | 'battery';
  enabled: boolean;
}

// TOU 费率信息（北美电力公司）
export interface TOURateInfo {
  provider: string;       // 电力公司名称，e.g. "PG&E E-TOU-C"
  peakPrice: number;      // $/kWh
  offPeakPrice: number;   // $/kWh
  partPeakPrice?: number; // $/kWh (部分电力公司有 part-peak)
  peakHours: { start: string; end: string };
  offPeakHours: { start: string; end: string };
  partPeakHours?: { start: string; end: string };
}

// 削峰填谷设置
export interface PeakShavingSettings {
  enabled: boolean;
  schedules: PeakShavingSchedule[];
  peakHours: { start: string; end: string };
  offPeakHours: { start: string; end: string };
  peakPrice: number;       // $/kWh (北美默认)
  offPeakPrice: number;    // $/kWh
  maxChargePower: number;  // W
  maxDischargePower: number; // W
  minBatteryLevel: number; // %
  maxBatteryLevel: number; // %
  // v1.1 新增
  partPeakPrice?: number;  // $/kWh
  zipCode?: string;        // 邮编（北美 TOU 匹配）
  touRateInfo?: TOURateInfo; // 自动匹配的费率信息
  chargingEfficiency?: number; // 充电效率 (0.95)
  depthOfDischarge?: number;   // 放电深度 (0.90)
  executionRate?: number;      // 执行率 (0.85)
}

// 削峰填谷实时状态
export interface PeakShavingStatus {
  isActive: boolean;
  currentMode: 'idle' | 'charging' | 'discharging' | 'grid_power' | 'battery_power';
  currentScheduleId: string | null;
  estimatedSavings: number; // 预计节省金额
  todaySavings: number; // 今日节省金额
  monthlySavings: number; // 本月节省金额
}
