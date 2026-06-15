// ═══════════════════════════════════════════════════════════════
// T7: API 实时状态 — 对齐 /remote/device/state/latest 返回格式
// ═══════════════════════════════════════════════════════════════

/**
 * 设备实时状态字段（来自 /remote/device/state/latest → fields[key]）
 * 与 API 的 DeviceStateField.key 完全对齐
 */
export interface DeviceRealtimeFields {
  /** 电池 SOC 百分比 (0-100) */
  soc: number
  /** 电池功率 W（充电正，放电负） */
  batteryPower: number
  /** AC 功率 W（输入/输出） */
  acPower: number
  /** 光伏输入功率 W */
  solarPower: number
  /** 总输出功率 W */
  outputPower: number
  /** 电池温度 °C */
  batteryTemp: number
  /** AC 输出 1 使能 */
  acOut1Enable: boolean
  /** AC 输出 2 使能 */
  acOut2Enable: boolean
  /** USB 输出 1 使能 */
  usbOut1Enable: boolean
  /** 睡眠模式 */
  sleepMode: boolean
  /** 工作模式: 0=正常 1=备份 2=节能 */
  workMode: 0 | 1 | 2
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
 * - API 实时字段：deviceId, firmwareVersion, lastSeen, soc, acPower, solarPower...
 * - API 设备元数据：serialNumber, model, stationId, isOnline, isAlarmed
 */
export interface Device {
  /** 本地设备 ID（与 deviceId 对应） */
  id: string
  name: string
  type: 'cpap' | 'fridge' | 'powerstation' | 'laptop' | 'phone' | 'lighting' | 'other'
  status: 'online' | 'offline'
  /** 本地显示用电量百分比（可由 soc 驱动） */
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

  // ── API 实时状态字段（来自 /remote/device/state/latest） ──
  /** 精确 SOC 百分比 (0-100)，覆盖 batteryLevel */
  soc?: number
  /** 电池功率 W（充电正，放电负） */
  batteryPower?: number
  /** AC 功率 W */
  acPower?: number
  /** 光伏功率 W */
  solarPower?: number
  /** 总输出功率 W，覆盖 power */
  outputPower?: number
  /** 电池温度 °C */
  batteryTemp?: number
  /** AC 输出 1 使能，覆盖 isOn */
  acOut1Enable?: boolean
  /** AC 输出 2 使能 */
  acOut2Enable?: boolean
  /** USB 输出 1 使能 */
  usbOut1Enable?: boolean
  /** 睡眠模式 */
  sleepMode?: boolean
  /** 工作模式: 0=正常 1=备份 2=节能 */
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
