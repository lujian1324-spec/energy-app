import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PowerStation, OperatingMode, Device, AppSettings } from '../types'

interface PowerStationState {
  // 电源站数据
  powerStation: PowerStation;
  devices: Device[];
  settings: AppSettings;
  selectedDeviceId: string | null;
  
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
}

const initialPowerStation: PowerStation = {
  name: 'Sierro 1000',
  model: 'SR-1000',
  serialNumber: 'SR-2024-08842',
  batteryLevel: 90,
  remainingWh: 900,
  totalWh: 1000,
  inputPower: 400,
  outputPower: 200,
  temperature: 28,
  cycleCount: 286,
  batteryHealth: 98,
  isCharging: true,
  timeToFull: '0h 15min',
  mode: 'solar',
  ports: [
{ id: 'ac-out-1', name: 'AC Out', type: 'ac-out', status: 'active', power: 200 },
{ id: 'ac-out-2', name: 'AC Out 2', type: 'ac-out', status: 'inactive', power: 0 },
{ id: 'ac-in', name: 'AC Input', type: 'ac-in', status: 'active', power: 400 },
{ id: 'dc-in', name: 'DC Input', type: 'dc-in', status: 'inactive', deviceName: 'Solar Panel', power: 0 },
  ],
  specs: {
    batteryCapacity: '1000Wh',
    batteryType: 'LiFePO₄ Lithium Iron Phosphate',
    maxOutputPower: '1000W',
    maxOutputSurge: '2000W',
    outputType: 'Pure Sine Wave AC Output',
    maxChargePower: '500W',
    chargeMode: 'AC + Solar Simultaneous',
    chargeTime: '0-80% in 1.5 hours',
    operatingTemp: '-10°C ~ 40°C',
    optimalTemp: '20°C ~ 30°C',
  }
}

const initialDevices: Device[] = [
  { id: '1', name: 'CPAP', type: 'cpap', status: 'online', batteryLevel: 92, isOn: true, power: 45 },
  { id: '2', name: 'Fridge', type: 'fridge', status: 'online', batteryLevel: 48, isOn: true, power: 120 },
  { id: '3', name: 'Sierro 1000', type: 'powerstation', status: 'online', batteryLevel: 90, isOn: true, power: 0 },
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
    name: 'Sierro 1000',
    model: 'SR-1000',
    serialNumber: 'SR-2024-08842',
    batteryLevel: 90,
    remainingWh: 900,
    totalWh: 1000,
    inputPower: 400,
    outputPower: 200,
    temperature: 28,
    cycleCount: 286,
    batteryHealth: 98,
    isCharging: true,
    timeToFull: '0h 15min',
    mode: 'solar',
    specs: {
      batteryCapacity: '1000Wh',
      batteryType: 'LiFePO₄ Lithium Iron Phosphate',
      maxOutputPower: '1000W',
      maxOutputSurge: '2000W',
      outputType: 'Pure Sine Wave AC Output',
      maxChargePower: '500W',
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

export const usePowerStationStore = create<PowerStationState>()(
  persist(
 (set) => ({
powerStation: initialPowerStation,
devices: initialDevices,
settings: initialSettings,
selectedDeviceId: '3', // 默认选中 Sierro 1000

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
}),
{
name: 'powerflow-storage',
partialize: (state) => ({ 
  settings: state.settings, 
  selectedDeviceId: state.selectedDeviceId,
  devices: state.devices,
}),
}
  )
)
