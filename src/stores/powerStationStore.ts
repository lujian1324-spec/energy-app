import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PowerStation, OperatingMode, Device, AppSettings, PeakShavingSettings, PeakShavingStatus, TOURateInfo, DeviceRealtimeFields } from '../types'

interface PowerStationState {
  // 电源站数据
  powerStation: PowerStation;
  devices: Device[];
  settings: AppSettings;
  selectedDeviceId: string | null;
  
  // 削峰填谷
  peakShavingSettings: PeakShavingSettings;
  peakShavingStatus: PeakShavingStatus;
  
  // 动作
  setMode: (mode: OperatingMode) => void;
  togglePort: (portId: string) => void;
  updateBatteryLevel: (level: number) => void;
  updatePowerData: (input: number, output: number) => void;
  toggleDevice: (deviceId: string) => void;
  toggleDevices: (deviceIds: string[], isOn: boolean) => void;
  deleteDevices: (deviceIds: string[]) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  setChargeLimit: (limit: number) => void;
  updateDeviceName: (name: string) => void;
  activateFounderBadge: (code: string) => { success: boolean; message: string };
  selectDevice: (deviceId: string) => void;
  updateDeviceNameById: (deviceId: string, name: string) => void;
  updateDeviceSpecs: (specs: Partial<PowerStation['specs']>) => void;

  // ── T7: API 实时状态更新 ──
  /**
   * 更新指定设备的实时状态（对齐 /remote/device/state/latest 字段）
   * 自动驱动本地 UI 字段：batteryLevel ← soc, isOn ← acOut1Enable, power ← outputPower
   */
  updateDeviceRealtime: (deviceId: string, fields: Partial<DeviceRealtimeFields>) => void;
  
  // 削峰填谷动作
  updatePeakShavingSettings: (settings: Partial<PeakShavingSettings>) => void;
  addPeakShavingSchedule: (schedule: Omit<PeakShavingSettings['schedules'][0], 'id'>) => void;
  updatePeakShavingSchedule: (id: string, schedule: Partial<PeakShavingSettings['schedules'][0]>) => void;
  deletePeakShavingSchedule: (id: string) => void;
  togglePeakShaving: (enabled: boolean) => void;
  lookupTOURate: (zipCode: string) => TOURateInfo | null;
  
  // 重置全部设置
  resetAll: () => void;
}

const initialPowerStation: PowerStation = {
  name: 'Sierro2000',
  model: 'Sierro 2000',
  serialNumber: 'SN26102503Z6104955',
  batteryLevel: 90,
  remainingWh: 1800,
  totalWh: 2000,
  inputPower: 1000,
  outputPower: 231,
  temperature: 28,
  cycleCount: 286,
  batteryHealth: 98,
  isCharging: true,
  timeToFull: '2h 00min',
  mode: 'home-backup',
  ports: [
{ id: 'ac-out-1', name: 'AC Out', type: 'ac-out', status: 'active', power: 231 },
{ id: 'ac-out-2', name: 'AC Out 2', type: 'ac-out', status: 'inactive', power: 0 },
{ id: 'ac-in', name: 'AC Input', type: 'ac-in', status: 'active', power: 1000 },
{ id: 'dc-in', name: 'DC Input', type: 'dc-in', status: 'inactive', deviceName: 'Solar Panel', power: 0 },
  ],
  specs: {
    batteryCapacity: '2000 Wh',
    batteryType: 'LiFePO₄',
    maxOutputPower: '1000 W',
    maxOutputSurge: '2000 W',
    outputType: 'Pure Sine Wave AC Output',
    maxChargePower: '1000 W',
    chargeMode: 'AC + Solar Simultaneous',
    chargeTime: '0-80% in 1.5 hours',
    operatingTemp: '-10°C ~ 40°C',
    optimalTemp: '20°C ~ 30°C',
    hardwareVersion: 'V1.0.0',
    firmwareVersion: 'V1.0.0',
  }
}

const initialDevices: Device[] = [
  { id: '1', name: 'CPAP', type: 'cpap', status: 'online', batteryLevel: 92, isOn: true, power: 45 },
  { id: '2', name: 'Fridge', type: 'fridge', status: 'online', batteryLevel: 48, isOn: true, power: 120 },
  { id: '3', name: 'Sierro2000', type: 'powerstation', status: 'online', batteryLevel: 90, isOn: true, power: 0 },
]

// 设备参数模板（用于不同设备的模拟数据）
const deviceProfiles: Record<string, Partial<PowerStation>> = {
  '1': {
    name: 'CPAP',
    model: 'CPAP-500',
    serialNumber: 'CP-2024-001',
    batteryLevel: 92,
    remainingWh: 460,
    totalWh: 500,
    inputPower: 0,
    outputPower: 45,
    temperature: 25,
    cycleCount: 120,
    batteryHealth: 95,
    isCharging: false,
    timeToFull: '0h 0min',
    mode: 'backup',
    specs: {
      batteryCapacity: '500Wh',
      batteryType: 'Li-ion Battery',
      maxOutputPower: '100W',
      maxOutputSurge: '150W',
      outputType: 'DC Output',
      maxChargePower: '60W',
      chargeMode: 'AC Adapter',
      chargeTime: '0-80% in 3 hours',
      operatingTemp: '0°C ~ 35°C',
      optimalTemp: '15°C ~ 25°C',
    }
  },
  '2': {
    name: 'Fridge',
    model: 'FR-1200',
    serialNumber: 'FR-2024-002',
    batteryLevel: 48,
    remainingWh: 576,
    totalWh: 1200,
    inputPower: 0,
    outputPower: 120,
    temperature: 32,
    cycleCount: 45,
    batteryHealth: 98,
    isCharging: false,
    timeToFull: '0h 0min',
    mode: 'backup',
    specs: {
      batteryCapacity: '1200Wh',
      batteryType: 'LiFePO₄ Battery',
      maxOutputPower: '1500W',
      maxOutputSurge: '3000W',
      outputType: 'Pure Sine Wave AC Output',
      maxChargePower: '800W',
      chargeMode: 'AC + Solar Simultaneous',
      chargeTime: '0-80% in 1 hour',
      operatingTemp: '-10°C ~ 45°C',
      optimalTemp: '20°C ~ 30°C',
    }
  },
  '3': {
    name: 'Sierro2000',
    model: 'Sierro 2000',
    serialNumber: 'SN26102503Z6104955',
    batteryLevel: 90,
    remainingWh: 1800,
    totalWh: 2000,
    inputPower: 1000,
    outputPower: 231,
    temperature: 28,
    cycleCount: 286,
    batteryHealth: 98,
    isCharging: true,
    timeToFull: '2h 00min',
    mode: 'home-backup',
    specs: {
      batteryCapacity: '2000 Wh',
      batteryType: 'LiFePO₄',
      maxOutputPower: '1000 W',
      maxOutputSurge: '2000 W',
      outputType: 'Pure Sine Wave AC Output',
      maxChargePower: '1000 W',
      chargeMode: 'AC + Solar Simultaneous',
      chargeTime: '0-80% in 1.5 hours',
      operatingTemp: '-10°C ~ 40°C',
      optimalTemp: '20°C ~ 30°C',
    }
  },
}

const initialSettings: AppSettings = {
  notifications: true,
  pushNotifications: false,
  doNotDisturb: true,
  doNotDisturbStart: '22:00',
  doNotDisturbEnd: '08:00',
  language: 'zh-CN',
  units: 'metric',
  cloudSync: true,
  bluetooth: true,
  chargeLimit: 80,
  ecoMode: false,
  overTempProtection: true,
  overDischargeProtection: true,
}

// 北美 TOU 费率数据库（模拟）
const touRateDatabase: Record<string, TOURateInfo> = {
  '94025': { provider: 'PG&E E-TOU-C', peakPrice: 0.42, offPeakPrice: 0.12, partPeakPrice: 0.28, peakHours: { start: '16:00', end: '21:00' }, offPeakHours: { start: '21:00', end: '16:00' }, partPeakHours: { start: '07:00', end: '16:00' } },
  '90210': { provider: 'SCE TOU-D-PRIME', peakPrice: 0.38, offPeakPrice: 0.14, partPeakPrice: 0.25, peakHours: { start: '17:00', end: '20:00' }, offPeakHours: { start: '21:00', end: '08:00' }, partPeakHours: { start: '08:00', end: '17:00' } },
  '10001': { provider: 'ConEdison TOU', peakPrice: 0.35, offPeakPrice: 0.10, peakHours: { start: '08:00', end: '22:00' }, offPeakHours: { start: '22:00', end: '08:00' } },
  '77001': { provider: 'CenterPoint Energy TOU', peakPrice: 0.30, offPeakPrice: 0.09, peakHours: { start: '15:00', end: '19:00' }, offPeakHours: { start: '22:00', end: '06:00' } },
  '60601': { provider: 'ComEd TOU', peakPrice: 0.28, offPeakPrice: 0.08, peakHours: { start: '11:00', end: '19:00' }, offPeakHours: { start: '21:00', end: '07:00' } },
}

// 削峰填谷默认设置（北美参数）
const initialPeakShavingSettings: PeakShavingSettings = {
  enabled: false,
  schedules: [
    {
      id: '1',
      name: 'Off-Peak Charging',
      startTime: '23:00',
      endTime: '07:00',
      type: 'charge',
      enabled: true,
    },
    {
      id: '2',
      name: 'Peak Discharging',
      startTime: '08:00',
      endTime: '22:00',
      type: 'discharge',
      enabled: true,
    },
  ],
  peakHours: { start: '16:00', end: '21:00' },
  offPeakHours: { start: '21:00', end: '16:00' },
  peakPrice: 0.42,
  offPeakPrice: 0.12,
  partPeakPrice: 0.28,
  maxChargePower: 1000,
  maxDischargePower: 1000,
  minBatteryLevel: 10,
  maxBatteryLevel: 95,
  zipCode: '',
  chargingEfficiency: 0.95,
  depthOfDischarge: 0.90,
  executionRate: 0.85,
}

const initialPeakShavingStatus: PeakShavingStatus = {
  isActive: false,
  currentMode: 'idle',
  currentScheduleId: null,
  estimatedSavings: 0,
  todaySavings: 0,
  monthlySavings: 0,
}

export const usePowerStationStore = create<PowerStationState>()(
  persist(
 (set) => ({
powerStation: initialPowerStation,
devices: initialDevices,
settings: initialSettings,
selectedDeviceId: '3', // 默认选中 Sierro2000
peakShavingSettings: initialPeakShavingSettings,
peakShavingStatus: initialPeakShavingStatus,

 setMode: (mode) => {
 set((state) => ({
 powerStation: { ...state.powerStation, mode }
 }))
 },

 togglePort: (portId) => {
 set((state) => ({
 powerStation: {
 ...state.powerStation,
 ports: state.powerStation.ports.map(port =>
 port.id === portId
 ? { ...port, status: port.status === 'active' ? 'inactive' : 'active' as const }
 : port
 )
 }
 }))
 },

 updateBatteryLevel: (level) => {
 set((state) => ({
 powerStation: {
 ...state.powerStation,
 batteryLevel: level,
 remainingWh: Math.round(state.powerStation.totalWh * level / 100)
 }
 }))
 },

 updatePowerData: (input, output) => {
 set((state) => ({
 powerStation: {
 ...state.powerStation,
 inputPower: input,
 outputPower: output
 }
 }))
 },

 toggleDevice: (deviceId) => {
 set((state) => ({
 devices: state.devices.map(device =>
 device.id === deviceId
 ? { ...device, isOn: !device.isOn }
 : device
 )
 }))
 },

 updateSettings: (newSettings) => {
 set((state) => ({
 settings: { ...state.settings, ...newSettings }
 }))
 },

setChargeLimit: (limit) => {
set((state) => ({
settings: { ...state.settings, chargeLimit: limit }
}))
},

updateDeviceName: (name) => {
set((state) => ({
powerStation: { ...state.powerStation, name }
}))
},

activateFounderBadge: (code: string) => {
  // 有效的兑换码列表（实际项目中应该从服务器验证）
  const validCodes = ['FOUNDER2024', 'SIERROVIP', 'EARLYBIRD', 'POWERFLOW'];
  
  if (validCodes.includes(code.toUpperCase())) {
    // 生成 0-100 之间的唯一身份编码
    const generateUniqueNumber = (): number => {
      // 使用当前时间戳和随机数生成唯一编码
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      const combined = (timestamp + random) % 101; // 0-100
      return combined;
    };
    
    const badgeNumber = generateUniqueNumber();
    
    set((state) => ({
      settings: {
        ...state.settings,
        founderBadge: true,
        founderBadgeActivatedAt: new Date().toISOString(),
        founderBadgeNumber: badgeNumber,
      }
    }));
    return { success: true, message: `Founder Badge activated! Your member number is #${badgeNumber}` };
  }
  
  return { success: false, message: 'Invalid code. Please try again.' };
},

selectDevice: (deviceId: string) => {
  set((state) => {
    const profile = deviceProfiles[deviceId] || deviceProfiles['3'];
    return {
      selectedDeviceId: deviceId,
      powerStation: { ...state.powerStation, ...profile },
    };
  });
},

updateDeviceNameById: (deviceId: string, name: string) => {
  set((state) => ({
    devices: state.devices.map(device =>
      device.id === deviceId ? { ...device, name } : device
    ),
    // 如果修改的是当前选中的设备，同时更新 powerStation 的名称
    powerStation: state.selectedDeviceId === deviceId
      ? { ...state.powerStation, name }
      : state.powerStation,
  }));
},

updateDeviceSpecs: (specs) => {
  set((state) => ({
    powerStation: {
      ...state.powerStation,
      specs: { ...state.powerStation.specs, ...specs }
    }
  }));
},

// ── T7: API 实时状态更新 ──
updateDeviceRealtime: (deviceId, fields) => {
  set((state) => {
    const device = state.devices.find(d => d.id === deviceId || d.deviceId === deviceId)
    if (!device) return state

    // 驱动 UI 字段：soc → batteryLevel, outputPower → power, acOut1Enable → isOn
    const uiUpdates: Partial<Device> = {}
    if (fields.soc !== undefined) uiUpdates.batteryLevel = fields.soc
    if (fields.outputPower !== undefined) uiUpdates.power = fields.outputPower
    if (fields.acOut1Enable !== undefined) uiUpdates.isOn = fields.acOut1Enable

    return {
      devices: state.devices.map(d =>
        (d.id === deviceId || d.deviceId === deviceId)
          ? { ...d, ...fields, ...uiUpdates, status: d.status } // 保留本地 status
          : d
      ),
    }
  })
},

toggleDevices: (deviceIds: string[], isOn: boolean) => {
  set((state) => ({
    devices: state.devices.map(device =>
      deviceIds.includes(device.id) ? { ...device, isOn } : device
    )
  }));
},

deleteDevices: (deviceIds: string[]) => {
  set((state) => ({
    devices: state.devices.filter(device => !deviceIds.includes(device.id))
  }));
},

// 削峰填谷动作
updatePeakShavingSettings: (settings) => {
  set((state) => ({
    peakShavingSettings: { ...state.peakShavingSettings, ...settings }
  }));
},

addPeakShavingSchedule: (schedule) => {
  set((state) => ({
    peakShavingSettings: {
      ...state.peakShavingSettings,
      schedules: [
        ...state.peakShavingSettings.schedules,
        { ...schedule, id: Date.now().toString() }
      ]
    }
  }));
},

updatePeakShavingSchedule: (id, schedule) => {
  set((state) => ({
    peakShavingSettings: {
      ...state.peakShavingSettings,
      schedules: state.peakShavingSettings.schedules.map(s =>
        s.id === id ? { ...s, ...schedule } : s
      )
    }
  }));
},

deletePeakShavingSchedule: (id) => {
  set((state) => ({
    peakShavingSettings: {
      ...state.peakShavingSettings,
      schedules: state.peakShavingSettings.schedules.filter(s => s.id !== id)
    }
  }));
},

togglePeakShaving: (enabled) => {
  set((state) => ({
    peakShavingSettings: {
      ...state.peakShavingSettings,
      enabled
    },
    peakShavingStatus: {
      ...state.peakShavingStatus,
      isActive: enabled
    }
  }));
},

lookupTOURate: (zipCode) => {
  const rateInfo = touRateDatabase[zipCode] || null;
  if (rateInfo) {
    set((state) => ({
      peakShavingSettings: {
        ...state.peakShavingSettings,
        zipCode,
        touRateInfo: rateInfo,
        peakPrice: rateInfo.peakPrice,
        offPeakPrice: rateInfo.offPeakPrice,
        partPeakPrice: rateInfo.partPeakPrice,
        peakHours: rateInfo.peakHours,
        offPeakHours: rateInfo.offPeakHours,
      }
    }));
  }
  return rateInfo;
},

resetAll: () => {
  set({
    powerStation: initialPowerStation,
    devices: initialDevices,
    settings: initialSettings,
    selectedDeviceId: '3',
    peakShavingSettings: initialPeakShavingSettings,
    peakShavingStatus: initialPeakShavingStatus,
  });
},

}),
{
name: 'powerflow-storage',
partialize: (state) => ({ 
  settings: state.settings, 
  selectedDeviceId: state.selectedDeviceId,
  devices: state.devices,
  peakShavingSettings: state.peakShavingSettings,
}),
}
  )
)
