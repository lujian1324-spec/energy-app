import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PowerStation, OperatingMode, Device, AppSettings } from '../types'

interface PowerStationState {
  // 电源站数据
  powerStation: PowerStation;
  devices: Device[];
  settings: AppSettings;
  
  // 动作
  setMode: (mode: OperatingMode) => void;
  togglePort: (portId: string) => void;
  updateBatteryLevel: (level: number) => void;
  updatePowerData: (input: number, output: number) => void;
  toggleDevice: (deviceId: string) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  setChargeLimit: (limit: number) => void;
}

const initialPowerStation: PowerStation = {
  name: 'Sierro 1000',
  model: 'SR-1000',
  serialNumber: 'SR-2024-08842',
  batteryLevel: 76,
  remainingWh: 760,
  totalWh: 1000,
  inputPower: 280,
  outputPower: 92,
  temperature: 28,
  cycleCount: 286,
  batteryHealth: 98,
  isCharging: true,
  timeToFull: '1h 24m',
  mode: 'solar',
  ports: [
    { id: 'ac-out-1', name: 'AC Out 1', type: 'ac-out', status: 'active', deviceName: 'Laptop', power: 65 },
    { id: 'ac-out-2', name: 'AC Out 2', type: 'ac-out', status: 'inactive', power: 0 },
    { id: 'ac-in', name: 'AC Input', type: 'ac-in', status: 'active', deviceName: 'Wall Charger', power: 450 },
    { id: 'dc-in', name: 'DC Input', type: 'dc-in', status: 'active', deviceName: 'Solar Panel', power: 280 },
  ]
}

const initialDevices: Device[] = [
  { id: '1', name: 'CPAP', type: 'cpap', status: 'online', batteryLevel: 92, isOn: true, power: 45 },
  { id: '2', name: 'Fridge', type: 'fridge', status: 'online', batteryLevel: 48, isOn: true, power: 120 },
  { id: '3', name: 'Sierro 1000', type: 'powerstation', status: 'online', batteryLevel: 76, isOn: true, power: 0 },
]

const initialSettings: AppSettings = {
  notifications: true,
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
    }),
    {
      name: 'powerflow-storage',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
)
