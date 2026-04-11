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
  mode: 'solar' | 'backup' | 'car' | 'outdoor';
  isCharging: boolean;
  timeToFull: string;
  cycleCount: number;
  batteryHealth: number;
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
}
