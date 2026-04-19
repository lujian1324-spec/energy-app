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
  type: 'charge' | 'discharge' | 'grid' | 'battery'; // 充电、放电、市电、电池
  enabled: boolean;
}

// 削峰填谷设置
export interface PeakShavingSettings {
  enabled: boolean;
  schedules: PeakShavingSchedule[];
  peakHours: { start: string; end: string }; // 高峰电价时段
  offPeakHours: { start: string; end: string }; // 低谷电价时段
  peakPrice: number; // 高峰电价 (元/kWh)
  offPeakPrice: number; // 低谷电价 (元/kWh)
  maxChargePower: number; // 最大充电功率 (W)
  maxDischargePower: number; // 最大放电功率 (W)
  minBatteryLevel: number; // 最小电池电量 (%)
  maxBatteryLevel: number; // 最大电池电量 (%)
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
