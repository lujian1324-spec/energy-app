/**
 * Sierro Inc. - 设备 API
 *
 * 设备列表:   POST /device/list              (page/count 分页)
 * 设备详情:   GET  /device/details?deviceId=
 * 添加设备:   POST /device/add/single
 * 添加设备+电站: POST /device/add/single/addStationTogether
 * 删除设备:   POST /device/delete
 * 更新设备:   POST /device/update
 * 置顶/取消:  POST /device/pin | /device/unpin
 *
 * 设备状态:   GET  /remote/device/state/latest?deviceId=
 * 设备控制:   POST /remote/device/config/write?deviceId=
 * 批量读取:   POST /remote/device/configs/read?deviceId=
 * 能量流动:   GET  /remote/device/energy/flow?deviceId=
 * 速报启动:   POST /remote/device/state/report/fast/start?deviceId=
 * 速报停止:   POST /remote/device/state/report/fast/stop?deviceId=
 *
 * 历史数据:   POST /deviceState/attribute/keys/history
 * 告警查询:   POST /alarm/query/list
 * 告警忽略:   POST /alarm/update/isProcessed
 *
 * 削峰填谷:   GET/POST /peakValley/device/...
 *
 * 电站列表:   POST /station/list
 * 电站详情:   GET  /station/details?stationId=
 * 电站创建:   POST /station/add
 */

import { api } from '../utils/apiClient'
import type { ApiResponse } from '../utils/apiClient'

// ═══════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════

// ─── 设备列表 ───

export interface DeviceListRequest {
  page: number          // *required* 页码（从1开始）
  count: number         // *required* 每页数量
  stationId?: number
  name?: string         // 设备名（模糊搜索）
  serialNumber?: string
  deviceSortKey?: string
  gatherProtocolNumber?: string
  dtuDtuid?: string
  dtuId?: number
  ownerUserId?: number
  ownerUserName?: string
  stationName?: string
  state?: string
  softwareVersion?: string
  applyModeCategory?: number
  orderByCreatedAtAsc?: boolean
  orderByInstalledAtAsc?: boolean
  orderByNameAsc?: boolean
  orderByProducingPowerAsc?: boolean
  orderBySerialNumberAsc?: boolean
  orderByStateAsc?: boolean
}

export interface DeviceListItem {
  id: number
  name: string
  serialNumber: string
  model: string
  deviceSortKey: string
  deviceSortLocaleText: string
  gatherProtocolNumber: string
  gatherProtocolNameDisplay: string
  softwareVersion: string
  stationId: number
  stationName: string
  dtuId: number
  dtuDtuid: string
  dtuName: string
  isOnline: boolean
  isAlarmed: boolean
  isPined: boolean
  isPeakValleyEnabled: boolean
  isUpgrading: boolean
  isFirmwareUpgradeEnabled: boolean
  isExternalDevice: boolean
  isMainMasterDevice: boolean
  applyMode: number
  state: string
  stateDict: string
  producingPower: number
  ratedPower: number
  dailyProducedQuantity: number
  totalProducedQuantity: number
  installedAt: string
  lastDataAt: string
  lastOnlineAt: string
  lastOfflineAt: string
  place: string
  iconResid: string
  ownerUserId: number
  ownerUserName: string
  stationTimezone: string
  stationCurrencyCode: string
  stationEnergyIncomePrice: number
  co2EmissionReduction: number
  noxEmissionReduction: number
  so2EmissionReduction: number
  savingStandardCarbon: number
  extraProperty: Record<string, unknown>
  summaryProperty: Record<string, unknown>
}

export interface DeviceListResponse {
  list: DeviceListItem[]
  total: number
  page: number
  count: number
}

// ─── 添加设备 ───

export interface AddDeviceRequest {
  deviceName: string        // *required*
  stationId: number         // *required*
  dtuDtuid: string          // *required* 采集器 ID
  deviceSerialNumber?: string
  ratedPower?: number
  place?: string
  installVendor?: string
  installedAt?: string      // ISO 8601
  isVirtualSerialNumber?: boolean
  isRestartAfterAdded?: boolean
  extraProperty?: Record<string, unknown>
}

export interface AddDeviceWithStationRequest extends AddDeviceRequest {
  stationName?: string
  country?: string
  province?: string
  city?: string
  area?: string
  address?: string
  latitude?: number
  longitude?: number
  stationType?: number
  connectedGridType?: number
  installedCapacity?: number
  timezone?: string
  currencyCode?: string
}

// ─── 删除设备 ───

export interface DeleteDeviceRequest {
  ids: number[]
}

// ─── 更新设备 ───

export interface UpdateDeviceRequest {
  id: number
  name: string
  place?: string
  installVendor?: string
  installedAt?: string
  ratedPower?: number
  extraProperty?: Record<string, unknown>
}

// ─── 置顶设备 ───

export interface PinDeviceRequest {
  ids: number[]
}

// ─── 设备实时状态 ───

export interface DeviceStateField {
  key: string
  name: string
  value: unknown
  valueDisplay: string
  unit: string
  valueType: string
  category: string
}

export interface DeviceStateGroup {
  id: number
  key: string
  name: string
  category: string
  stateItems: DeviceStateField[]
}

export interface DeviceStateResponse {
  deviceId: string
  dtuID: string
  time: string
  stationId: string
  gatherProtocolNumber: string
  gatherProtocolVersionCode: string
  fields: Record<string, DeviceStateField>
  groups: DeviceStateGroup[]
  firingAlarms: Array<{
    alarmId: string
    alarmCode: string
    alarmMessage: string
    severity: string
    timestamp: string
  }>
}

// ─── 设备控制写入 ───

export interface WriteConfigRequest {
  key: string
  value: unknown
}

export interface ReadConfigRequest {
  key: string
}

export interface ReadConfigsRequest {
  keys: string[]
}

// ─── 速报 ───

export interface FastReportStartRequest {
  clientID: string
  scene: string
}

export interface FastReportStopRequest {
  clientID: string
}

// ─── 历史数据 ───

export interface HistoryDataRequest {
  deviceId: number
  keys: string[]
  fromTime: string
  toTime: string
  page: number
  count: number
  orderByTimeAsc?: boolean
}

export interface HistoryDataPoint {
  time: string
  value: unknown
}

export interface HistoryDataResponse {
  [key: string]: HistoryDataPoint[]
}

// ─── 告警 ───

export interface AlarmSearchRequest {
  page: number
  count: number
  deviceId?: number
  stationId?: number
  dtuId?: number
  deviceSerialNumber?: string
  certificateDtuID?: string
  fromTime?: string
  toTime?: string
  isProcessed?: boolean
  level?: string
  orderByCreatedTimeDesc?: boolean
}

export interface AlarmItem {
  id: number
  deviceId: number
  deviceName: string
  deviceSerialNumber: string
  alarmCode: string
  alarmMessage: string
  alarmLevel: string
  isProcessed: boolean
  createdAt: string
  processedAt?: string
}

export interface AlarmListResponse {
  list: AlarmItem[]
  total: number
  page: number
  count: number
}

export interface UpdateAlarmRequest {
  iotAlarmId: number
}

// ─── 削峰填谷 ───

export interface PeakValleyGeneralConfig {
  deviceId: number
  isEnabled: boolean
  items: Array<{
    startTime: string
    endTime: string
    chargeOrDischarge: number
    power: number
    socMin?: number
    socMax?: number
  }>
}

export interface PeakValleyCustomizedConfig {
  deviceId: number
  isEnabled: boolean
  defaultItem: Record<string, unknown>
  items: Array<Record<string, unknown>>
}

export interface PeakValleyEnableRequest {
  deviceId: number
  isEnabled: boolean
  category?: string
}

// ─── 电站 ───

export interface StationListRequest {
  page: number
  count: number
  name?: string
  stationType?: number
  connectedGridType?: number
  state?: string
  ownerUserName?: string
  groupId?: number
  ids?: number[]
  orderByCreatedAtAsc?: boolean
  orderByInstalledAtAsc?: boolean
  orderByInstalledCapacityAsc?: boolean
  orderByNameAsc?: boolean
  orderByStateAsc?: boolean
  orderByStationTypeAsc?: boolean
  orderByConnectedGridTypeAsc?: boolean
  userMeta?: Record<string, unknown>
}

export interface StationItem {
  id: number
  name: string
  stationType: number
  connectedGridType: number
  state: string
  installedCapacity: number
  country: string
  province: string
  city: string
  address: string
  latitude: number
  longitude: number
  timezone: string
  currencyCode: string
  energyIncomePrice: number
  ownerUserId: number
  ownerUserName: string
  isPined: boolean
  deviceCount: number
  producingPower: number
  dailyProducedQuantity: number
  totalProducedQuantity: number
  installedAt: string
  imageResid: string
}

export interface StationListResponse {
  list: StationItem[]
  total: number
  page: number
  count: number
}

export interface StationAddRequest {
  name: string
  country: string
  province?: string
  city?: string
  area?: string
  address?: string
  latitude: number
  longitude: number
  stationType: number
  connectedGridType: number
  installedCapacity: number
  installedAt: string
  timezone: string
  currencyCode: string
  energyIncomePrice?: number
  totalCost?: number
  imageResid?: string
}

// ═══════════════════════════════════════════════════════
// 设备管理 API
// ═══════════════════════════════════════════════════════

/** 获取设备列表（分页） */
export async function fetchDeviceList(
  page = 1,
  count = 20,
  filters?: Omit<DeviceListRequest, 'page' | 'count'>
): Promise<ApiResponse<DeviceListResponse>> {
  return api.post<DeviceListResponse>('/device/list', {
    page,
    count,
    ...filters,
  })
}

/** 获取设备详情 */
export async function fetchDeviceDetails(
  deviceId: string | number
): Promise<ApiResponse<DeviceListItem>> {
  return api.get<DeviceListItem>(`/device/details?deviceId=${deviceId}`)
}

/** 添加单个设备 */
export async function addDevice(
  data: AddDeviceRequest
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/device/add/single', data)
}

/** 添加设备同时创建电站 */
export async function addDeviceWithStation(
  data: AddDeviceWithStationRequest
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/device/add/single/addStationTogether', data)
}

/** 删除设备（解绑/登出） */
export async function deleteDevice(
  ids: number[]
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/device/delete', { ids })
}

/** 更新设备信息 */
export async function updateDevice(
  data: UpdateDeviceRequest
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/device/update', data)
}

/** 置顶设备 */
export async function pinDevice(ids: number[]): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/device/pin', { ids })
}

/** 取消置顶设备 */
export async function unpinDevice(ids: number[]): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/device/unpin', { ids })
}

/** 获取设备采集器信息 */
export async function fetchDtuInfo(dtuDtuid: string): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(`/device/dtu/info?dtuDtuid=${encodeURIComponent(dtuDtuid)}`)
}

/** 查询设备属性分组列表 */
export async function fetchDeviceAttributeGroups(
  deviceId: string | number,
  category?: string,
  renderIn?: string
): Promise<ApiResponse<unknown>> {
  let path = `/device/query/attribute/group?deviceId=${deviceId}`
  if (category) path += `&category=${encodeURIComponent(category)}`
  if (renderIn) path += `&renderIn=${encodeURIComponent(renderIn)}`
  return api.get<unknown>(path)
}

// ═══════════════════════════════════════════════════════
// 设备实时状态 API
// ═══════════════════════════════════════════════════════

/** 获取设备最新实时状态 */
export async function fetchDeviceState(
  deviceId: string | number
): Promise<ApiResponse<DeviceStateResponse>> {
  return api.get<DeviceStateResponse>(
    `/remote/device/state/latest?deviceId=${deviceId}`
  )
}

/** 获取设备能量流动 */
export async function fetchDeviceEnergyFlow(
  deviceId: string | number
): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(`/remote/device/energy/flow?deviceId=${deviceId}`)
}

// ═══════════════════════════════════════════════════════
// 设备控制 API
// ═══════════════════════════════════════════════════════

/** 远程写入设备配置 */
export async function writeDeviceConfig(
  deviceId: string | number,
  key: string,
  value: unknown
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>(
    `/remote/device/config/write?deviceId=${deviceId}`,
    { key, value }
  )
}

/** 读取单个设备配置项 */
export async function readDeviceConfig(
  deviceId: string | number,
  key: string
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>(
    `/remote/device/config/read?deviceId=${deviceId}`,
    { key }
  )
}

/** 批量读取设备配置项 */
export async function readDeviceConfigs(
  deviceId: string | number,
  keys: string[]
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>(
    `/remote/device/configs/read?deviceId=${deviceId}`,
    { keys }
  )
}

/** 获取设备配置项缓存 */
export async function getDeviceConfigCache(
  deviceId: string | number,
  keys: string[]
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>(
    `/remote/device/configs/cache/get?deviceId=${deviceId}`,
    { keys }
  )
}

// ─── 便捷控制方法 ───

/** 切换 AC 输出 1 */
export const toggleAcOut1 = (deviceId: string | number, enable: boolean) =>
  writeDeviceConfig(deviceId, 'acOut1Enable', enable)

/** 切换 AC 输出 2 */
export const toggleAcOut2 = (deviceId: string | number, enable: boolean) =>
  writeDeviceConfig(deviceId, 'acOut2Enable', enable)

/** 切换 USB 输出 */
export const toggleUsbOut1 = (deviceId: string | number, enable: boolean) =>
  writeDeviceConfig(deviceId, 'usbOut1Enable', enable)

/** 切换睡眠模式 */
export const toggleSleepMode = (deviceId: string | number, enable: boolean) =>
  writeDeviceConfig(deviceId, 'sleepMode', enable)

/** 切换工作模式 (0=正常 1=备份 2=节能) */
export const setWorkMode = (deviceId: string | number, mode: 0 | 1 | 2) =>
  writeDeviceConfig(deviceId, 'workMode', mode)

/** 设置充电限制 SOC */
export const setChargeLimit = (deviceId: string | number, socLimit: number) =>
  writeDeviceConfig(deviceId, 'chargeSocLimit', socLimit)

// ═══════════════════════════════════════════════════════
// 速报 API
// ═══════════════════════════════════════════════════════

/** 启动设备速报 */
export async function startFastReport(
  deviceId: string | number,
  clientID: string,
  scene = 'app'
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>(
    `/remote/device/state/report/fast/start?deviceId=${deviceId}`,
    { clientID, scene }
  )
}

/** 停止速报 */
export async function stopFastReport(
  deviceId: string | number,
  clientID: string
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>(
    `/remote/device/state/report/fast/stop?deviceId=${deviceId}`,
    { clientID }
  )
}

/** 检查是否支持速报 */
export async function checkFastReportSupported(
  deviceId: string | number
): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(
    `/remote/device/state/report/fast/supported?deviceId=${deviceId}`
  )
}

// ═══════════════════════════════════════════════════════
// 历史数据 API
// ═══════════════════════════════════════════════════════

/** 获取设备指定属性历史数据 */
export async function fetchHistoryData(
  req: HistoryDataRequest
): Promise<ApiResponse<HistoryDataResponse>> {
  return api.post<HistoryDataResponse>(
    '/deviceState/attribute/keys/history',
    req
  )
}

/** 便捷：获取最近 N 小时的指定属性历史 */
export function fetchRecentHistory(
  deviceId: number,
  keys: string[],
  hoursAgo = 24
) {
  const now = new Date()
  const from = new Date(now.getTime() - hoursAgo * 3600 * 1000)
  return fetchHistoryData({
    deviceId,
    keys,
    fromTime: from.toISOString(),
    toTime: now.toISOString(),
    page: 1,
    count: 288,
    orderByTimeAsc: true,
  })
}

// ═══════════════════════════════════════════════════════
// 告警 API
// ═══════════════════════════════════════════════════════

/** 查询告警列表 */
export async function fetchAlarms(
  req: Partial<AlarmSearchRequest> = {}
): Promise<ApiResponse<AlarmListResponse>> {
  return api.post<AlarmListResponse>('/alarm/query/list', {
    page: req.page ?? 1,
    count: req.count ?? 20,
    ...req,
  })
}

/** 获取最近一条告警 */
export async function fetchLatestAlarm(
  req: Partial<AlarmSearchRequest> = {}
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/alarm/getLatestAlarm', {
    page: 1,
    count: 1,
    ...req,
  })
}

/** 忽略/处理告警 */
export async function ignoreAlarm(
  iotAlarmId: number
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/alarm/update/isProcessed', { iotAlarmId })
}

/** 删除告警 */
export async function deleteAlarm(
  id: number
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>(`/alarm/delete/alarm?id=${id}`)
}

// ═══════════════════════════════════════════════════════
// 削峰填谷 / Smart Schedule API
// ═══════════════════════════════════════════════════════

/** 获取设备削峰填谷采集属性分组 */
export async function fetchPeakValleyAttributeGroup(
  deviceId: string | number
): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(`/peakValley/device/attribute/group?deviceId=${deviceId}`)
}

/** 获取设备常规削峰填谷配置 */
export async function fetchPeakValleyGeneral(
  deviceId: string | number
): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(`/peakValley/device/general/get?deviceId=${deviceId}`)
}

/** 设置设备常规削峰填谷 */
export async function setPeakValleyGeneral(
  data: PeakValleyGeneralConfig
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/peakValley/device/general/set', data)
}

/** 获取设备削峰填谷配置（完整） */
export async function fetchPeakValleyConfig(
  deviceId: string | number
): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(`/peakValley/device/get?deviceId=${deviceId}`)
}

/** 设置自定义削峰填谷 */
export async function setPeakValleyCustomized(
  data: PeakValleyCustomizedConfig
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/peakValley/device/customized/set', data)
}

/** 启用/禁用削峰填谷 */
export async function setPeakValleyEnabled(
  data: PeakValleyEnableRequest
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/peakValley/device/enable', data)
}

/** 获取设备支持的削峰填谷类型 */
export async function fetchPeakValleyTypes(
  deviceId: string | number,
  includeDefault = true
): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(
    `/peakValley/types/device?deviceId=${deviceId}&includeDefault=${includeDefault}`
  )
}

/** 获取所有削峰填谷类型 */
export async function fetchAllPeakValleyTypes(): Promise<ApiResponse<unknown>> {
  return api.get<unknown>('/peakValley/types/all')
}

// ═══════════════════════════════════════════════════════
// 电站 API
// ═══════════════════════════════════════════════════════

/** 获取电站列表 */
export async function fetchStationList(
  page = 1,
  count = 20,
  filters?: Omit<StationListRequest, 'page' | 'count'>
): Promise<ApiResponse<StationListResponse>> {
  return api.post<StationListResponse>('/station/list', {
    page,
    count,
    ...filters,
  })
}

/** 获取电站详情 */
export async function fetchStationDetails(
  stationId: string | number
): Promise<ApiResponse<StationItem>> {
  return api.get<StationItem>(`/station/details?stationId=${stationId}`)
}

/** 创建电站 */
export async function addStation(
  data: StationAddRequest
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/station/add', data)
}

/** 更新电站 */
export async function updateStation(
  data: Partial<StationItem> & { id: number }
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/station/update', data)
}

/** 删除电站 */
export async function deleteStation(
  stationId: number
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>(`/station/delete?stationId=${stationId}`)
}

/** 获取电站能量流动 */
export async function fetchStationEnergyFlow(
  stationId: string | number
): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(`/station/energy/flow?stationId=${stationId}`)
}

// ═══════════════════════════════════════════════════════
// 设备应用模式 API
// ═══════════════════════════════════════════════════════

/** 获取设备主应用模式列表 */
export async function fetchMainApplyModes(): Promise<ApiResponse<unknown>> {
  return api.get<unknown>('/deviceApplyMode/modes/main')
}

/** 获取设备外挂应用模式列表 */
export async function fetchExternalApplyModes(): Promise<ApiResponse<unknown>> {
  return api.get<unknown>('/deviceApplyMode/modes/external')
}

// ═══════════════════════════════════════════════════════
// 简化状态 API（更轻量的数据结构）
// ═══════════════════════════════════════════════════════

/** 获取设备最新状态简单数据 */
export async function fetchSimpleState(
  deviceId: string | number
): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(
    `/deviceState/simple/state/latest/v1?deviceId=${deviceId}`
  )
}

/** 获取设备简单能量流动 */
export async function fetchSimpleEnergyFlow(
  deviceId: string | number
): Promise<ApiResponse<unknown>> {
  return api.get<unknown>(
    `/deviceState/simple/energy/flow/v1?deviceId=${deviceId}`
  )
}
