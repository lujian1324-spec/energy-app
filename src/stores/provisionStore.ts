/**
 * BLE 配网状态管理
 */
import { create } from 'zustand'
import type { BleWifiAp, BleProvisionResponse, BleWifiStatus } from '../types/protocol'

export type ProvisionStep = 'scan' | 'verify' | 'wifi' | 'password' | 'configuring' | 'result'

export interface ProvisionStoreState {
  // 当前步骤
  step: ProvisionStep
  setStep: (step: ProvisionStep) => void

  // 设备信息
  deviceName: string | null
  dtuid: string | null
  deviceVersion: string | null
  hardwareVersion: string | null
  setDeviceInfo: (name: string | null, dtuid: string | null) => void
  setVersionInfo: (sv: string | null, hv: string | null) => void

  // WiFi AP 列表
  apList: BleWifiAp[]
  apLoading: boolean
  setApList: (list: BleWifiAp[]) => void
  setApLoading: (loading: boolean) => void

  // 选中的 WiFi 和密码
  selectedSsid: string | null
  wifiPassword: string
  setSelectedSsid: (ssid: string | null) => void
  setWifiPassword: (pwd: string) => void

  // 配网结果
  configResult: 'success' | 'fail' | null
  wifiStatus: BleWifiStatus | null
  errorMessage: string | null
  setConfigResult: (result: 'success' | 'fail' | null) => void
  setWifiStatus: (status: BleWifiStatus | null) => void
  setErrorMessage: (msg: string | null) => void

  // 蓝牙密码验证
  needBleKey: boolean
  bleKeyVerified: boolean
  setNeedBleKey: (need: boolean) => void
  setBleKeyVerified: (verified: boolean) => void

  // 操作中标志
  isOperating: boolean
  setIsOperating: (op: boolean) => void

  // 日志
  logs: string[]
  addLog: (msg: string) => void

  // 重置
  reset: () => void
}

const initialState = {
  step: 'scan' as ProvisionStep,
  deviceName: null as string | null,
  dtuid: null as string | null,
  deviceVersion: null as string | null,
  hardwareVersion: null as string | null,
  apList: [] as BleWifiAp[],
  apLoading: false,
  selectedSsid: null as string | null,
  wifiPassword: '',
  configResult: null as 'success' | 'fail' | null,
  wifiStatus: null as BleWifiStatus | null,
  errorMessage: null as string | null,
  needBleKey: false,
  bleKeyVerified: false,
  isOperating: false,
  logs: [] as string[],
}

export const useProvisionStore = create<ProvisionStoreState>()((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setDeviceInfo: (deviceName, dtuid) => set({ deviceName, dtuid }),
  setVersionInfo: (deviceVersion, hardwareVersion) => set({ deviceVersion, hardwareVersion }),

  setApList: (apList) => set({ apList }),
  setApLoading: (apLoading) => set({ apLoading }),

  setSelectedSsid: (selectedSsid) => set({ selectedSsid }),
  setWifiPassword: (wifiPassword) => set({ wifiPassword }),

  setConfigResult: (configResult) => set({ configResult }),
  setWifiStatus: (wifiStatus) => set({ wifiStatus }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),

  setNeedBleKey: (needBleKey) => set({ needBleKey }),
  setBleKeyVerified: (bleKeyVerified) => set({ bleKeyVerified }),

  setIsOperating: (isOperating) => set({ isOperating }),

  addLog: (msg) => set((state) => ({
    logs: [...state.logs.slice(-50), msg], // 保留最近 50 条日志
  })),

  reset: () => set(initialState),
}))
