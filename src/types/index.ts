// 设备类型
export interface Device {
  id: string;
  name: string;
  type: 'cpap' | 'fridge' | 'powerstation' | 'laptop' | 'phone' | 'lighting' | 'other';
  status: 'online' | 'offline';
  batteryLevel: number;
  isOn: boolean;
  power?: number;
}

// 端口类型
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
