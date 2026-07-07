/**
 * 设备 Store — 连接真实 API
 *
 * 管理设备列表、当前设备状态、实时数据轮询等
 *
 * Demo 模式：当 authStore.isGuest === true 时，
 *   自动加载 demo 数据（见 src/data/demoData.ts）
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  fetchDeviceList,
  fetchDeviceDetails,
  fetchDeviceState,
  fetchHistoryData,
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
  fetchSimpleEnergyFlow,
  type DeviceListItem,
  type DeviceStateResponse,
  type HistoryDataResponse,
  type AddDeviceRequest,
  type AddDeviceWithStationRequest,
  type UpdateDeviceRequest,
  type AlarmItem,
  type StationItem,
  type StationAddRequest,
  type PeakValleyGeneralConfig,
  type PeakValleyBundleResponse,
  type EnergyFlowData,
} from '../api/deviceApi'
import type { ApiResponse } from '../utils/apiClient'
import { isApiSuccess } from '../utils/apiClient'
import { useAuthStore } from './authStore'
import { checkAndNotifyPowerOutage } from '../utils/powerOutageNotification'
import {
  demoDevices,
  getDemoDeviceState,
  getDemoEnergyFlow,
  getDemoHistoryData,
} from '../data/demoData'
import { passthroughDevice } from '../api/deviceApi'
import { FRAMES, decodePassthroughBase64 } from '../protocols/modbusProtocol'
import { saveRatedParams, loadRatedParams } from '../db/powerflowDB'

/** 透传读取设备额定参数并缓存到 IndexedDB（24h TTL，fire-and-forget）*/
async function fetchAndCacheRatedParams(deviceId: string): Promise<void> {
  try {
    const cached = await loadRatedParams(deviceId)
    if (cached && Date.now() - cached.fetchedAt < 86_400_000) return  // 24h cache
    const res = await passthroughDevice(deviceId, { data: FRAMES.READ_ALL_PARAMS })
    const b64 = res.data?.base64Output ?? res.data?.content ?? res.data?.data
    const registers = decodePassthroughBase64(b64, 11)
    if (!registers) return
    const acInvOutputPower = registers[10]  // offset 10 = register 0x000A
    if (acInvOutputPower === undefined || acInvOutputPower === 0) return
    // 合并保存：保留新增设备时写入的型号默认参数（model/ratedPower/等），仅更新实测容量
    await saveRatedParams({ ...(cached ?? {}), deviceId, acInvOutputPower, fetchedAt: Date.now() })
  } catch {
    // non-critical — silently ignore
  }
}

// ═══════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════

interface DeviceStoreState {
  // ─── Demo 模式 ───
  isDemoMode: boolean

  // 设备列表
  devices: DeviceListItem[]
  deviceTotal: number
  devicePage: number
  deviceLoading: boolean
  deviceError: string | null

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

  // 能量流动（/deviceState/simple/energy/flow/v1）
  energyFlow: EnergyFlowData | null
  energyFlowLoading: boolean
  energyFlowError: string | null

  // 削峰填谷
  peakValleyConfig: PeakValleyBundleResponse | null
  peakValleyLoading: boolean
  peakValleySaving: boolean
  peakValleyError: string | null

  // 历史数据（StatsPage）
  historyData: HistoryDataResponse | null
  historyLoading: boolean
  historyError: string | null

  // ─── 操作 ───
  loadDevices: (page?: number, count?: number, filters?: Record<string, unknown>) => Promise<void>
  loadDeviceDetails: (deviceId: string | number) => Promise<void>
  loadDeviceState: (deviceId: string | number) => Promise<void>
  selectDevice: (deviceId: string | null) => void
  addNewDevice: (data: AddDeviceRequest) => Promise<ApiResponse<unknown>>
  addNewDeviceWithStation: (data: AddDeviceWithStationRequest) => Promise<ApiResponse<unknown>>
  removeDevice: (ids: Array<string | number>) => Promise<ApiResponse<unknown>>
  updateDeviceInfo: (data: UpdateDeviceRequest) => Promise<ApiResponse<unknown>>
  togglePin: (ids: number[], pin: boolean) => Promise<ApiResponse<unknown>>
  controlDevice: (deviceId: string | number, key: string, value: unknown) => Promise<ApiResponse<unknown>>
  startRealtimeReport: (deviceId: string | number, clientId: string) => Promise<void>
  stopRealtimeReport: (deviceId: string | number, clientId: string) => Promise<void>
  loadAlarms: (deviceId?: string | number, page?: number, count?: number, append?: boolean) => Promise<void>
  dismissAlarm: (alarmId: string | number) => Promise<void>
  loadStations: (page?: number, count?: number) => Promise<void>
  createStation: (data: StationAddRequest) => Promise<ApiResponse<unknown>>
  loadPeakValley: (deviceId: string | number) => Promise<PeakValleyBundleResponse | null>
  enablePeakValley: (deviceId: string | number, enabled: boolean) => Promise<ApiResponse<unknown>>
  savePeakValleyGeneral: (data: PeakValleyGeneralConfig) => Promise<ApiResponse<unknown>>
  loadEnergyFlow: (deviceId: string | number) => Promise<void>
  loadHistoryData: (deviceId: string | number, fromTime: string | number, toTime: string | number, keys?: string[], count?: number, orderByTimeAsc?: boolean) => Promise<void>

  /** 本地重命名设备（不调用后端，同步更新列表/详情，demo 模式同样生效） */
  renameDeviceLocal: (deviceId: string | number, name: string) => void

  // ─── Demo 模式操作 ───
  /** 加载 demo 设备列表（guest 模式调用） */
  loadDemoDevices: () => void
  /** 退出 demo 模式，清除 demo 数据 */
  exitDemoMode: () => void
}

// ═══════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════

// 竞态保护：请求序号
let stateRequestSeq = 0
let alarmRequestSeq = 0
let energyFlowRequestSeq = 0

export const useDeviceStore = create<DeviceStoreState>()(
  persist(
    (set, get) => ({
      // ─── Demo 模式 ───
      isDemoMode: false,

      devices: [],
      deviceTotal: 0,
      devicePage: 1,
      deviceLoading: false,
      deviceError: null,

      selectedDeviceId: null,
      selectedDeviceDetails: null,
      selectedDeviceState: null,
      stateLoading: false,

      stations: [],
      stationTotal: 0,

      alarms: [],
      alarmTotal: 0,
      alarmLoading: false,

      // 能量流动
      energyFlow: null,
      energyFlowLoading: false,
      energyFlowError: null,

      // 削峰填谷
      peakValleyConfig: null,
      peakValleyLoading: false,
      peakValleySaving: false,
      peakValleyError: null,

      // 历史数据（StatsPage）
      historyData: null,
      historyLoading: false,
      historyError: null,

      // ─── 设备列表 ───

      loadDevices: async (page = 1, count = 20, filters) => {
        // Demo 模式：直接返回 demo 设备列表
        if (get().isDemoMode) {
          set({ deviceLoading: false })
          return
        }

        set({ deviceLoading: true, deviceError: null })
        try {
          const result = await fetchDeviceList(page, count, filters)
          if (isApiSuccess(result.code) && result.data) {
            const list = result.data.list ?? []
            set({
              devices: list,
              deviceTotal: result.data.total ?? 0,
              devicePage: page,
              deviceLoading: false,
              deviceError: null,
            })
            // Fire-and-forget: fetch rated params for each device via passthrough
            list.forEach(d => fetchAndCacheRatedParams(String(d.id)))
          } else {
            set({ deviceLoading: false, deviceError: result.message || 'Failed to load devices' })
          }
        } catch (err) {
          set({ deviceLoading: false, deviceError: err instanceof Error ? err.message : 'Failed to load devices' })
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
        // Demo 模式：返回模拟设备状态
        if (get().isDemoMode) {
          const state = getDemoDeviceState(deviceId)
          if (state) {
            set({ selectedDeviceState: state, stateLoading: false })
          }
          return
        }

        const seq = ++stateRequestSeq
        set({ stateLoading: true })
        try {
          const result = await fetchDeviceState(deviceId)
          if (seq !== stateRequestSeq) return
          if ((result.code === 0 || result.code === '0') && result.data) {
            set({ selectedDeviceState: result.data, stateLoading: false })
            // Power outage push notification
            const details = get().selectedDeviceDetails
            if (details?.isOnline) {
              checkAndNotifyPowerOutage(
                details.name,
                true,
                result.data.firingAlarms ?? []
              )
            }
          } else {
            set({ stateLoading: false })
          }
        } catch {
          if (seq !== stateRequestSeq) return
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
      // API /device/delete 仅接受单个 id，故逐个删除

      removeDevice: async (ids) => {
        // Demo 模式：本地移除，不调用真实接口
        if (get().isDemoMode) {
          const idSet = new Set(ids.map(String))
          const { selectedDeviceId } = get()
          set(state => ({
            devices: state.devices.filter(d => !idSet.has(String(d.id))),
            ...(selectedDeviceId && idSet.has(String(selectedDeviceId))
              ? { selectedDeviceId: null, selectedDeviceDetails: null, selectedDeviceState: null }
              : {}),
          }))
          return { code: 0, message: 'OK', data: null }
        }

        let result: ApiResponse<unknown> = { code: 0, message: 'OK', data: null }
        for (const id of ids) {
          result = await deleteDevice(id)
          if (!(result.code === 0 || result.code === '0')) break
        }
        if (result.code === 0 || result.code === '0') {
          // 刷新设备列表
          const { selectedDeviceId } = get()
          if (selectedDeviceId && ids.map(String).includes(String(selectedDeviceId))) {
            set({ selectedDeviceId: null, selectedDeviceDetails: null, selectedDeviceState: null })
          }
          get().loadDevices()
        }
        return result
      },

      // ─── 更新设备 ───

      updateDeviceInfo: async (data) => {
        // Demo 模式：本地更新名称，不调用真实接口
        if (get().isDemoMode) {
          get().renameDeviceLocal(data.id, data.name)
          return { code: 0, message: 'OK', data: null }
        }
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

      loadAlarms: async (deviceId, page = 1, count = 20, append = false) => {
        const seq = ++alarmRequestSeq
        set({ alarmLoading: true })
        try {
          const result = await fetchAlarms({
            page,
            count,
            deviceId: deviceId !== undefined ? String(deviceId) : undefined,
            orderByCreatedTimeDesc: true,
          })
          if (seq !== alarmRequestSeq) return
          if ((result.code === 0 || result.code === '0') && result.data) {
            set(state => ({
              alarms: append
                ? [...state.alarms, ...(result.data?.list ?? [])]
                : (result.data?.list ?? []),
              alarmTotal: result.data?.total ?? 0,
              alarmLoading: false,
            }))
          } else {
            set({ alarmLoading: false })
          }
        } catch {
          if (seq !== alarmRequestSeq) return
          set({ alarmLoading: false })
        }
      },

      dismissAlarm: async (alarmId) => {
        try {
          await ignoreAlarm(alarmId)
          // 刷新告警列表
          const { selectedDeviceId } = get()
          get().loadAlarms(selectedDeviceId ?? undefined)
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
        set({ peakValleyLoading: true, peakValleyError: null })
        try {
          const result = await fetchPeakValleyConfig(deviceId)
          if ((result.code === 0 || result.code === '0') && result.data) {
            set({ peakValleyConfig: result.data, peakValleyLoading: false })
            return result.data
          }
          set({ peakValleyLoading: false, peakValleyError: result.message || 'Failed to load peak/valley config' })
          return null
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          set({ peakValleyLoading: false, peakValleyError: msg })
          return null
        }
      },

      enablePeakValley: async (deviceId, enabled) => {
        set({ peakValleySaving: true })
        try {
          const result = await setPeakValleyEnabled({ deviceId, isEnabled: enabled })
          if ((result.code === 0 || result.code === '0') && get().peakValleyConfig) {
            // 乐观更新本地缓存
            set({ peakValleyConfig: { ...get().peakValleyConfig!, isEnabled: enabled } })
          }
          set({ peakValleySaving: false })
          return result
        } catch (e: unknown) {
          set({ peakValleySaving: false, peakValleyError: String(e) })
          throw e
        }
      },

      savePeakValleyGeneral: async (data) => {
        set({ peakValleySaving: true, peakValleyError: null })
        try {
          const result = await setPeakValleyGeneral(data)
          if ((result.code === 0 || result.code === '0') && get().peakValleyConfig) {
            // 乐观更新本地缓存
            const existing = get().peakValleyConfig!
            set({
              peakValleyConfig: {
                ...existing,
                isEnabled: data.isEnabled,
                generalItem: data,
              },
            })
          }
          set({ peakValleySaving: false })
          return result
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          set({ peakValleySaving: false, peakValleyError: msg })
          throw e
        }
      },

      // ─── 能量流动（每分钟轮询）───
      loadEnergyFlow: async (deviceId: string | number) => {
        if (!deviceId) return

        // Demo 模式：返回模拟能量流动数据
        if (get().isDemoMode) {
          const flow = getDemoEnergyFlow(deviceId)
          if (flow.data) {
            set({ energyFlow: flow.data, energyFlowLoading: false, energyFlowError: null })
          }
          return
        }

        const seq = ++energyFlowRequestSeq
        set({ energyFlowLoading: true, energyFlowError: null })
        try {
          const result = await fetchSimpleEnergyFlow(deviceId, 1)
          if (seq !== energyFlowRequestSeq) return
          if ((result.code === 0 || result.code === '0') && result.data) {
            set({ energyFlow: result.data, energyFlowLoading: false })
          } else {
            set({
              energyFlowLoading: false,
              energyFlowError: result.message || 'Failed to load energy flow',
            })
          }
        } catch (e: unknown) {
          if (seq !== energyFlowRequestSeq) return
          const msg = e instanceof Error ? e.message : String(e)
          set({ energyFlowLoading: false, energyFlowError: msg })
        }
      },

      // ─── 历史数据（StatsPage）───
      loadHistoryData: async (deviceId: string | number, fromTime: string | number, toTime: string | number, keys?: string[], count?: number, orderByTimeAsc = true) => {
        if (!deviceId) return

        // Normalize to millisecond timestamps
        const fromMs = typeof fromTime === 'number' ? fromTime : new Date(fromTime).getTime()
        const toMs = typeof toTime === 'number' ? toTime : new Date(toTime).getTime()

        // Demo 模式：返回模拟历史数据
        if (get().isDemoMode) {
          const hoursRange = Math.round((toMs - fromMs) / (1000 * 3600)) || 24
          const demoData = getDemoHistoryData(deviceId, hoursRange)
          set({ historyData: demoData.data, historyLoading: false, historyError: null })
          return
        }

        set({ historyLoading: true, historyError: null })
        try {
          const result = await fetchHistoryData({
            deviceId: String(deviceId),
            keys: keys || ['generationPower', 'outputPower', 'remainingBatteryCapacity', 'batteryTemp'],
            fromTime: fromMs,
            toTime: toMs,
            page: 1,
            count: count || 288,
            orderByTimeAsc: orderByTimeAsc ?? true,
          })
          if ((result.code === 0 || result.code === '0') && result.data) {
            set({ historyData: result.data, historyLoading: false })
          } else {
            set({ historyLoading: false, historyError: result.message || 'Failed to load history data' })
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          set({ historyLoading: false, historyError: msg })
        }
      },

      // ─── 本地重命名设备 ───
      renameDeviceLocal: (deviceId, name) => {
        const idStr = String(deviceId)
        set((state) => ({
          devices: state.devices.map(d =>
            String(d.id) === idStr ? { ...d, name } : d
          ),
          selectedDeviceDetails:
            state.selectedDeviceDetails && String(state.selectedDeviceDetails.id) === idStr
              ? { ...state.selectedDeviceDetails, name }
              : state.selectedDeviceDetails,
        }))
      },

      // ─── Demo 模式：加载 demo 设备列表 ───
      loadDemoDevices: () => {
        set({
          isDemoMode: true,
          devices: demoDevices,
          deviceTotal: demoDevices.length,
          deviceLoading: false,
          // 自动选中第一个设备
          selectedDeviceId: '10001',
        })
        // 加载第一个设备的状态和能量流动
        const firstDevice = demoDevices[0]
        if (firstDevice) {
          const state = getDemoDeviceState(firstDevice.id)
          if (state) {
            set({ selectedDeviceState: state, stateLoading: false })
          }
          const flow = getDemoEnergyFlow(firstDevice.id)
          if (flow.data) {
            set({ energyFlow: flow.data, energyFlowLoading: false })
          }
        }
      },

      // ─── Demo 模式：退出 demo 模式 ───
      exitDemoMode: () => {
        set({
          isDemoMode: false,
          devices: [],
          deviceTotal: 0,
          selectedDeviceId: null,
          selectedDeviceDetails: null,
          selectedDeviceState: null,
          stateLoading: false,
          energyFlow: null,
          energyFlowLoading: false,
          energyFlowError: null,
          historyData: null,
          historyLoading: false,
          historyError: null,
          alarms: [],
          alarmTotal: 0,
          alarmLoading: false,
        })
      },
    }),
    {
      name: 'powerflow-device-store',
      partialize: (state) => ({
        selectedDeviceId: state.selectedDeviceId,
        // 设备列表本地缓存：避免每次重新打开 App 时设备列表先短暂清空再请求，
        // 也避免在网络请求完成前误显示“No devices yet / Add Device”空状态。
        devices: state.devices,
        deviceTotal: state.deviceTotal,
        isDemoMode: state.isDemoMode,
      }),
    }
  )
)
