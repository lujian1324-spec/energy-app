/**
 * 设备 Store — 连接真实 API
 *
 * 管理设备列表、当前设备状态、实时数据轮询等
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  fetchDeviceList,
  fetchDeviceDetails,
  fetchDeviceState,
  addDevice,
  addDeviceWithStation,
  deleteDevice,
  updateDevice,
  pinDevice,
  unpinDevice,
  writeDeviceConfig,
  startFastReport,
  stopFastReport,
  fetchAlarms,
  ignoreAlarm,
  fetchPeakValleyConfig,
  setPeakValleyEnabled,
  setPeakValleyGeneral,
  fetchStationList,
  addStation,
  type DeviceListItem,
  type DeviceStateResponse,
  type AddDeviceRequest,
  type AddDeviceWithStationRequest,
  type UpdateDeviceRequest,
  type AlarmItem,
  type StationItem,
  type StationAddRequest,
  type PeakValleyGeneralConfig,
} from '../api/deviceApi'
import type { ApiResponse } from '../utils/apiClient'

// ═══════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════

interface DeviceStoreState {
  // 设备列表
  devices: DeviceListItem[]
  deviceTotal: number
  devicePage: number
  deviceLoading: boolean

  // 当前选中设备
  selectedDeviceId: string | null
  selectedDeviceDetails: DeviceListItem | null
  selectedDeviceState: DeviceStateResponse | null
  stateLoading: boolean

  // 电站列表
  stations: StationItem[]
  stationTotal: number

  // 告警
  alarms: AlarmItem[]
  alarmTotal: number
  alarmLoading: boolean

  // 操作
  loadDevices: (page?: number, count?: number, filters?: Record<string, unknown>) => Promise<void>
  loadDeviceDetails: (deviceId: string | number) => Promise<void>
  loadDeviceState: (deviceId: string | number) => Promise<void>
  selectDevice: (deviceId: string | null) => void
  addNewDevice: (data: AddDeviceRequest) => Promise<ApiResponse<unknown>>
  addNewDeviceWithStation: (data: AddDeviceWithStationRequest) => Promise<ApiResponse<unknown>>
  removeDevice: (ids: number[]) => Promise<ApiResponse<unknown>>
  updateDeviceInfo: (data: UpdateDeviceRequest) => Promise<ApiResponse<unknown>>
  togglePin: (ids: number[], pin: boolean) => Promise<ApiResponse<unknown>>
  controlDevice: (deviceId: string | number, key: string, value: unknown) => Promise<ApiResponse<unknown>>
  startRealtimeReport: (deviceId: string | number, clientId: string) => Promise<void>
  stopRealtimeReport: (deviceId: string | number, clientId: string) => Promise<void>
  loadAlarms: (deviceId?: number, page?: number, count?: number) => Promise<void>
  dismissAlarm: (alarmId: number) => Promise<void>
  loadStations: (page?: number, count?: number) => Promise<void>
  createStation: (data: StationAddRequest) => Promise<ApiResponse<unknown>>
  loadPeakValley: (deviceId: string | number) => Promise<void>
  enablePeakValley: (deviceId: number, enabled: boolean) => Promise<ApiResponse<unknown>>
  savePeakValleyGeneral: (data: PeakValleyGeneralConfig) => Promise<ApiResponse<unknown>>
}

// ═══════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════

export const useDeviceStore = create<DeviceStoreState>()(
  persist(
    (set, get) => ({
      devices: [],
      deviceTotal: 0,
      devicePage: 1,
      deviceLoading: false,

      selectedDeviceId: null,
      selectedDeviceDetails: null,
      selectedDeviceState: null,
      stateLoading: false,

      stations: [],
      stationTotal: 0,

      alarms: [],
      alarmTotal: 0,
      alarmLoading: false,

      // ─── 设备列表 ───

      loadDevices: async (page = 1, count = 20, filters) => {
        set({ deviceLoading: true })
        try {
          const result = await fetchDeviceList(page, count, filters)
          if ((result.code === 0 || result.code === '0') && result.data) {
            set({
              devices: result.data.list ?? [],
              deviceTotal: result.data.total ?? 0,
              devicePage: page,
              deviceLoading: false,
            })
          } else {
            set({ deviceLoading: false })
          }
        } catch {
          set({ deviceLoading: false })
        }
      },

      // ─── 设备详情 ───

      loadDeviceDetails: async (deviceId) => {
        try {
          const result = await fetchDeviceDetails(deviceId)
          if ((result.code === 0 || result.code === '0') && result.data) {
            set({ selectedDeviceDetails: result.data })
          }
        } catch {
          // ignore
        }
      },

      // ─── 设备实时状态 ───

      loadDeviceState: async (deviceId) => {
        set({ stateLoading: true })
        try {
          const result = await fetchDeviceState(deviceId)
          if ((result.code === 0 || result.code === '0') && result.data) {
            set({ selectedDeviceState: result.data, stateLoading: false })
          } else {
            set({ stateLoading: false })
          }
        } catch {
          set({ stateLoading: false })
        }
      },

      // ─── 选中设备 ───

      selectDevice: (deviceId) => {
        set({ selectedDeviceId: deviceId })
        if (deviceId) {
          get().loadDeviceDetails(deviceId)
          get().loadDeviceState(deviceId)
        }
      },

      // ─── 添加设备 ───

      addNewDevice: async (data) => {
        const result = await addDevice(data)
        if (result.code === 0 || result.code === '0') {
          // 刷新设备列表
          get().loadDevices()
        }
        return result
      },

      addNewDeviceWithStation: async (data) => {
        const result = await addDeviceWithStation(data)
        if (result.code === 0 || result.code === '0') {
          get().loadDevices()
          get().loadStations()
        }
        return result
      },

      // ─── 删除设备（解绑/登出） ───

      removeDevice: async (ids) => {
        const result = await deleteDevice(ids)
        if (result.code === 0 || result.code === '0') {
          // 刷新设备列表
          const { selectedDeviceId } = get()
          if (selectedDeviceId && ids.includes(Number(selectedDeviceId))) {
            set({ selectedDeviceId: null, selectedDeviceDetails: null, selectedDeviceState: null })
          }
          get().loadDevices()
        }
        return result
      },

      // ─── 更新设备 ───

      updateDeviceInfo: async (data) => {
        const result = await updateDevice(data)
        if (result.code === 0 || result.code === '0') {
          get().loadDevices()
          if (get().selectedDeviceId === String(data.id)) {
            get().loadDeviceDetails(data.id)
          }
        }
        return result
      },

      // ─── 置顶/取消置顶 ───

      togglePin: async (ids, pin) => {
        const result = pin ? await pinDevice(ids) : await unpinDevice(ids)
        if (result.code === 0 || result.code === '0') {
          get().loadDevices()
        }
        return result
      },

      // ─── 设备控制 ───

      controlDevice: async (deviceId, key, value) => {
        return writeDeviceConfig(deviceId, key, value)
      },

      // ─── 速报 ───

      startRealtimeReport: async (deviceId, clientId) => {
        try {
          await startFastReport(deviceId, clientId)
        } catch {
          // ignore
        }
      },

      stopRealtimeReport: async (deviceId, clientId) => {
        try {
          await stopFastReport(deviceId, clientId)
        } catch {
          // ignore
        }
      },

      // ─── 告警 ───

      loadAlarms: async (deviceId, page = 1, count = 20) => {
        set({ alarmLoading: true })
        try {
          const result = await fetchAlarms({
            page,
            count,
            deviceId,
            orderByCreatedTimeDesc: true,
          })
          if ((result.code === 0 || result.code === '0') && result.data) {
            set({
              alarms: result.data.list ?? [],
              alarmTotal: result.data.total ?? 0,
              alarmLoading: false,
            })
          } else {
            set({ alarmLoading: false })
          }
        } catch {
          set({ alarmLoading: false })
        }
      },

      dismissAlarm: async (alarmId) => {
        try {
          await ignoreAlarm(alarmId)
          // 刷新告警列表
          const { selectedDeviceId } = get()
          get().loadAlarms(selectedDeviceId ? Number(selectedDeviceId) : undefined)
        } catch {
          // ignore
        }
      },

      // ─── 电站 ───

      loadStations: async (page = 1, count = 20) => {
        try {
          const result = await fetchStationList(page, count)
          if ((result.code === 0 || result.code === '0') && result.data) {
            set({
              stations: result.data.list ?? [],
              stationTotal: result.data.total ?? 0,
            })
          }
        } catch {
          // ignore
        }
      },

      createStation: async (data) => {
        const result = await addStation(data)
        if (result.code === 0 || result.code === '0') {
          get().loadStations()
        }
        return result
      },

      // ─── 削峰填谷 ───

      loadPeakValley: async (deviceId) => {
        try {
          await fetchPeakValleyConfig(deviceId)
        } catch {
          // ignore
        }
      },

      enablePeakValley: async (deviceId, enabled) => {
        const result = await setPeakValleyEnabled({ deviceId, isEnabled: enabled })
        return result
      },

      savePeakValleyGeneral: async (data) => {
        return setPeakValleyGeneral(data)
      },
    }),
    {
      name: 'powerflow-device-store',
      partialize: (state) => ({
        selectedDeviceId: state.selectedDeviceId,
      }),
    }
  )
)
