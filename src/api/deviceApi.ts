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
  // ── 设备标识 ──
  id: string                          // Long as string
  name: string
  serialNumber: string
  isVirtualSerialNumber?: boolean
  model: string | null
  deviceSortKey: string
  deviceSortLocaleText: string
  deviceTypeId?: string
  deviceTypeNumber?: string
  iconResid: string

  // ── 制造商与协议 ──
  deviceManufacturerId?: string
  deviceManufacturerName?: string
  gatherProtocolId?: string
  gatherProtocolNumber: string
  gatherProtocolNameDisplay: string | null
  gatherProtocolInfoMissing?: boolean
  gatherProtocolVersionId?: string    // 详情独有
  gatherProtocolVersionCode?: number  // 详情独有

  // ── 采集器/DTU ──
  dtuId: string                       // Long as string
  dtuDtuid: string
  dtuName: string

  // ── 电站 ──
  stationId: string                   // Long as string
  stationName: string
  stationTimezone: string
  stationUtcTimezoneOffsetId?: string
  stationCurrencyCode: string
  stationCurrencyName?: string
  stationCurrencyLocaleName?: string
  stationEnergyIncomePrice: number

  // ── 设备状态 ──
  state: number                       // 10=Alarm 20=Online 30=Offline 40=Fault
  stateDict: string                   // "Alarm" / "Online" / "Offline"
  isOnline: boolean
  isAlarmed: boolean
  isPined: boolean
  isUpgrading: boolean
  isExternalDevice: boolean
  isMainMasterDevice: boolean

  // ── 功率与发电量 ──
  applyMode: string
  producingPower: number | null
  nonNullableProducingPower?: number
  ratedPower: number
  dailyProducedQuantity: number
  dailyProducedTime?: number
  totalProducedQuantity: number
  totalProducedQuantityExcludeToday?: number
  summaryProperty: Record<string, unknown>
  extraProperty: Record<string, unknown>
  todayPvGenerationReadDirectly?: number | null
  totalPvGenerationReadDirectly?: number | null
  loadPowerReadDirectly?: number | null

  // ── 时间 ──
  installedAt: string | null
  lastDataAt: string
  lastOnlineAt: string
  lastOfflineAt: string
  createdAt?: string
  updateAt?: string
  installVendor?: string | null
  place: string | null

  // ── 用户/审计 ──
  ownerUserId: string                 // Long as string
  ownerUserName: string
  createdByUserId?: string
  createdByUserAccount?: string
  updateByUserId?: string
  updateByUserAccount?: string
  isDeleted?: boolean

  // ── 功能开关 ──
  isExternalLoadDevice?: boolean
  isShowPvGenerationReadDirectly?: boolean
  readDirectlyAssginBit?: number
  pinedOrderNumber?: number | null
  isPeakValleyEnabled?: boolean       // 详情独有
  isTimeSyncEnabled?: boolean         // 详情独有
  isExternalLoadDeviceSupported?: boolean // 详情独有
  isFirmwareUpgradeEnabled?: boolean  // 详情独有
  peakValleyAttributeGroupKey?: string // 详情独有

  // ── 环保指标 ──
  savingStandardCarbon: number
  co2EmissionReduction: number
  so2EmissionReduction: number
  noxEmissionReduction: number

  // ── 其他 ──
  softwareVersion: string | null
  deviceUpgradeId?: string | null
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

// ─── 设备实时状态（API 原始格式） ───

export interface DeviceStateField {
  key: string
  name: string
  value: unknown
  valueDisplay: string
  unit: string
  valueType: string
  category: string
  isHidden?: boolean
  nameDisplay?: string
}

export interface DeviceStateGroup {
  id: number
  key: string
  name: string
  category: string
  isHidden?: boolean
  stateItems: Array<DeviceStateField & { isHidden: boolean; nameDisplay: string }>
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

// ─── API 字段 → Device 实时状态映射类型 ───
import type { DeviceRealtimeFields, DeviceAlert } from '../types'

/** 将 API fields Record<string, DeviceStateField> 映射为 DeviceRealtimeFields
 *  字段 key 来自 /remote/device/state/latest 实测值
 */
export function mapFieldsToRealtime(
  fields: Record<string, DeviceStateField>
): Partial<DeviceRealtimeFields> {
  const getNum = (key: string): number | undefined => {
    const f = fields[key]
    if (!f) return undefined
    const v = Number(f.value)
    return isNaN(v) ? undefined : v
  }
  // API 返回布尔字段为 "0"/"1" 字符串
  const getBool = (key: string): boolean | undefined => {
    const f = fields[key]
    if (!f) return undefined
    const v = f.value
    if (v === '1' || v === 1 || v === true) return true
    if (v === '0' || v === 0 || v === false) return false
    return Boolean(v)
  }
  const getInt = (key: string): 0 | 1 | 2 | undefined => {
    const v = getNum(key)
    if (v === undefined) return undefined
    if (v === 0 || v === 1 || v === 2) return v
    return undefined
  }
  const getStr = (key: string): string | undefined => {
    const f = fields[key]
    if (!f) return undefined
    return String(f.value ?? '')
  }

  return {
    // 电量 — API: remainingBatteryCapacity
    remainingBatteryCapacity: getNum('remainingBatteryCapacity'),
    batteryCapacity: getNum('batteryCapacity'),
    batteryCurrent: getNum('batteryCurrent'),
    numberOfBatteryUsageCycles: getNum('numberOfBatteryUsageCycles'),

    // 功率 — API: exchangeChargingPower / generationPower / outputPower
    acPower: getNum('exchangeChargingPower'),
    solarPower: getNum('generationPower'),
    outputPower: getNum('outputPower'),
    batteryPower: getNum('batteryPower'),

    // 电压 / 频率
    acInputVoltage: getNum('l1AcInputVoltage'),
    acInputFrequency: getNum('acInputFrequency'),
    acOutputVoltage: getNum('acOutputVoltage'),
    acOutputFrequency: getNum('acOutputFrequency'),
    solarInputVoltage: getNum('solarInputVoltage'),

    // 温度 — API: cellTemperature1/2/3, mpptTemperature, dcdcTemperature
    batteryTemp: getNum('cellTemperature1'),
    cellTemperature2: getNum('cellTemperature2'),
    cellTemperature3: getNum('cellTemperature3'),
    mpptTemperature: getNum('mpptTemperature'),
    dcdcTemperature: getNum('dcdcTemperature'),

    // 能量统计
    pvGeneratedEnergyOfDay: getNum('pvGeneratedEnergyOfDay'),
    totalPVGeneratedEnergy: getNum('totalPVGeneratedEnergy'),
    accumulatedChargingTime: getNum('accumulatedChargingTime'),
    accumulatedDischargeTime: getNum('accumulatedDischargeTime'),

    // 开关状态 — API 返回 "0"/"1" 字符串
    acOut1Enable: getBool('inversionState'),  // 逆变状态 = AC输出1
    acOut2Enable: getBool('acOut2Enable'),
    usbOut1Enable: getBool('usbOut1Enable'),
    photovoltaicCharging: getBool('photovoltaicCharging'),
    mainsCharging: getBool('mainsCharging'),
    acOutputs: getBool('acOutputs'),
    bypassStatus: getBool('bypassStatus'),
    noLoadShutdown: getBool('noLoadShutdown'),
    sleepMode: getBool('sleepMode'),

    // 模式
    workMode: getInt('workMode'),

    // 版本
    hardwareVersion: getStr('hardwareVersion'),
    softwareVersionNumber: getStr('softwareVersionNumber'),
    inverterSoftwareVersionNumber: getStr('inverterSoftwareVersionNumber'),
  }
}

/** 将 firingAlarms 映射为 DeviceAlert[] */
export function mapFiringAlarms(
  alarms: DeviceStateResponse['firingAlarms']
): DeviceAlert[] {
  return alarms.map(a => ({
    alarmId: a.alarmId,
    alarmCode: a.alarmCode,
    alarmMessage: a.alarmMessage,
    severity: (a.severity as DeviceAlert['severity']) ?? 'info',
    timestamp: a.timestamp,
    isProcessed: false,
  }))
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
  deviceId?: string | number
  stationId?: string | number
  dtuId?: string | number
  deviceSerialNumber?: string
  certificateDtuID?: string
  fromTime?: string
  toTime?: string
  isProcessed?: boolean
  level?: number | string
  orderByCreatedTimeDesc?: boolean
}

export interface AlarmItem {
  id: string                        // 告警 ID (Long as string)
  deviceId: string                  // 设备 ID
  deviceName: string
  deviceSerialNumber: string
  deviceSortKey?: string            // 设备类型标识
  category?: number                 // 1=设备告警
  level?: number                    // 2=Medium, 3=High
  levelDict?: string                // "Medium" / "High"
  status?: number                   // 0=活跃, 1=已消失, 2=已处理
  isProcessed: boolean
  processedDict?: string            // "Processed" / "Unprocessed"
  key?: string                      // 告警键名，如 "lineLoss"
  name?: string                     // 告警名称(英文)
  nameI18n?: Record<string, string> // 多语言名称
  description?: string
  descriptionI18n?: Record<string, string>
  firedValue?: string               // 触发时值
  disappearedValue?: string         // 恢复时值
  firedTaskNumber?: string
  disappearedTaskNumber?: string | null
  firedDtuPayload?: string
  disappearedDtuPayload?: string | null
  createdAt: string                 // 触发时间 (UTC ISO)
  disappearedAt?: string | null     // 恢复时间
  updateAt?: string | null
  isRead?: boolean
  processedByUserId?: string
  processedByUserAccount?: string
  stationId?: string
  stationName?: string
  dtuId?: string
  certificateDtuID?: string
  gatherProtocolNumber?: string
  ownerUserId?: string
  ownerUserName?: string
  // Legacy compat
  alarmCode?: string                // = key
  alarmMessage?: string             // = name / description
  alarmLevel?: string               // = levelDict
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

export interface PeakValleyItem {
  startTime: string         // HH:mm
  endTime: string           // HH:mm
  chargeOrDischarge: number // 0=charge, 1=discharge
  power: number             // W
  socMin?: number
  socMax?: number
}

export interface PeakValleyGeneralConfig {
  deviceId: number
  isEnabled: boolean
  items: PeakValleyItem[]
  peakPrice?: number
  offPeakPrice?: number
  partPeakPrice?: number
  maxChargePower?: number
  maxDischargePower?: number
  minBatteryLevel?: number
  maxBatteryLevel?: number
}

/** GET /peakValley/device/get 返回的完整配置 */
export interface PeakValleyBundleResponse {
  deviceId: number
  isEnabled: boolean
  category?: string           // 'general' | 'customized'
  generalItem?: PeakValleyGeneralConfig
  customizedItem?: PeakValleyItem[]
  peakPrice?: number
  offPeakPrice?: number
  partPeakPrice?: number
  maxChargePower?: number
  maxDischargePower?: number
  minSoc?: number
  maxSoc?: number
  chargeSocLimit?: number
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

/** 删除设备（解绑）— 参数为单个 id（非数组） */
export async function deleteDevice(
  id: string | number
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/device/delete', { id: Number(id) })
}

/** 设备状态统计 — state: 10=Alarm 20=Online 30=Offline 40=Fault */
export async function fetchDeviceStateCount(): Promise<ApiResponse<Array<{ state: number; count: number; stateDict: string }>>> {
  return api.get('/device/state/count')
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

/** 忽略/处理告警 — iotAlarmId 必须为数字类型 */
export async function ignoreAlarm(
  iotAlarmId: string | number,
  isProcessed = true
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/alarm/update/isProcessed', {
    iotAlarmId: Number(iotAlarmId),
    isProcessed,
  })
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
): Promise<ApiResponse<PeakValleyGeneralConfig>> {
  return api.get<PeakValleyGeneralConfig>(`/peakValley/device/general/get?deviceId=${deviceId}`)
}

/** 设置设备常规削峰填谷 */
export async function setPeakValleyGeneral(
  data: PeakValleyGeneralConfig
): Promise<ApiResponse<unknown>> {
  return api.post<unknown>('/peakValley/device/general/set', data)
}

/** 获取设备削峰填谷配置（完整 bundle） */
export async function fetchPeakValleyConfig(
  deviceId: string | number
): Promise<ApiResponse<PeakValleyBundleResponse>> {
  return api.get<PeakValleyBundleResponse>(`/peakValley/device/get?deviceId=${deviceId}`)
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

/**
 * 获取设备简单能量流动（/deviceState/simple/energy/flow/v1）
 * 返回 deviceAttributeState（全量字段 + 分组）+ pvPanelFlow / gridFlow / batteryFlow / loadFlow
 */
export async function fetchSimpleEnergyFlow(
  deviceId: string | number,
  dataSource = 1
): Promise<ApiResponse<EnergyFlowData>> {
  return api.get<EnergyFlowData>(
    `/deviceState/simple/energy/flow/v1?deviceId=${deviceId}&dataSource=${dataSource}`
  )
}

/** 能量流动数据类型 */
export interface EnergyFlowData {
  deviceAttributeState: {
    time: string
    fields: Record<string, DeviceStateField>
    groups: Array<{
      key: string
      name: string
      isHidden?: boolean
      stateItems: Array<DeviceStateField & { isHidden: boolean; nameDisplay: string }>
    }>
  }
  pvPanelFlow: EnergyFlowNode | null
  gridFlow: EnergyFlowNode | null
  batteryFlow: EnergyFlowNode | null
  loadFlow: EnergyFlowNode | null
  generatorFlow: EnergyFlowNode | null
  upsFlow: EnergyFlowNode | null
  ctFlow: EnergyFlowNode | null
}

export interface EnergyFlowNode {
  key: string
  localeTitle: string
  iconResid: string
  value: {
    key: string
    unit: string
    value: number | string
    valueDisplay: string
    isHidden: boolean
    nameDisplay: string
  } | null
  extraValues: Array<unknown>
  isLight: boolean | null
  flowDirection: number | null   // 1=流入电池, -1=流出电池, null=无方向
  gatherDeviceAttributeGroupKey: string
  isEnabled: boolean
}

// ═══════════════════════════════════════════════════════
// 削峰填谷 — API ←→ UI 映射函数
// ═══════════════════════════════════════════════════════

import type { PeakShavingSchedule, PeakShavingSettings } from '../types'

/** 将 API 的 chargeOrDischarge 映射为 UI type */
function chargeOrDischargeToType(cod: number): PeakShavingSchedule['type'] {
  switch (cod) {
    case 0: return 'charge'
    case 1: return 'discharge'
    case 2: return 'grid'
    case 3: return 'battery'
    default: return 'charge'
  }
}

/** 将 UI type 映射为 API 的 chargeOrDischarge */
function typeToChargeOrDischarge(type: PeakShavingSchedule['type']): number {
  switch (type) {
    case 'charge': return 0
    case 'discharge': return 1
    case 'grid': return 2
    case 'battery': return 3
    default: return 0
  }
}

/**
 * 将 API BundleResponse 映射为 UI PeakShavingSchedule[]
 * 用于从服务器加载配置后填充本地 UI
 */
export function mapBundleToSchedules(
  bundle: PeakValleyBundleResponse
): PeakShavingSchedule[] {
  const items = bundle.generalItem?.items ?? []
  return items.map((item, index) => ({
    id: `api-${index}`,
    name: chargeOrDischargeToType(item.chargeOrDischarge) === 'charge'
      ? `Charge ${item.startTime}-${item.endTime}`
      : chargeOrDischargeToType(item.chargeOrDischarge) === 'discharge'
      ? `Discharge ${item.startTime}-${item.endTime}`
      : `Schedule ${item.startTime}-${item.endTime}`,
    startTime: item.startTime,
    endTime: item.endTime,
    type: chargeOrDischargeToType(item.chargeOrDischarge),
    enabled: true,
  }))
}

/**
 * 将 API BundleResponse 映射为 UI PeakShavingSettings（部分字段）
 */
export function mapBundleToSettings(
  bundle: PeakValleyBundleResponse
): Partial<PeakShavingSettings> {
  return {
    enabled: bundle.isEnabled,
    peakPrice: bundle.peakPrice ?? bundle.generalItem?.peakPrice ?? 0.42,
    offPeakPrice: bundle.offPeakPrice ?? bundle.generalItem?.offPeakPrice ?? 0.12,
    partPeakPrice: bundle.partPeakPrice ?? bundle.generalItem?.partPeakPrice,
    maxChargePower: bundle.generalItem?.maxChargePower ?? 500,
    maxDischargePower: bundle.generalItem?.maxDischargePower ?? 1000,
    minBatteryLevel: bundle.generalItem?.minBatteryLevel ?? 10,
    maxBatteryLevel: bundle.generalItem?.maxBatteryLevel ?? 95,
    schedules: mapBundleToSchedules(bundle),
  }
}

/**
 * 将 UI PeakShavingSettings + schedules 映射为 API PeakValleyGeneralConfig
 * 用于保存时生成 API 请求体
 */
export function mapSettingsToGeneralConfig(
  deviceId: number,
  settings: PeakShavingSettings
): PeakValleyGeneralConfig {
  return {
    deviceId,
    isEnabled: settings.enabled,
    items: settings.schedules.map(s => ({
      startTime: s.startTime,
      endTime: s.endTime,
      chargeOrDischarge: typeToChargeOrDischarge(s.type),
      power: s.type === 'charge' ? settings.maxChargePower : settings.maxDischargePower,
      socMin: settings.minBatteryLevel,
      socMax: settings.maxBatteryLevel,
    })),
    peakPrice: settings.peakPrice,
    offPeakPrice: settings.offPeakPrice,
    partPeakPrice: settings.partPeakPrice,
    maxChargePower: settings.maxChargePower,
    maxDischargePower: settings.maxDischargePower,
    minBatteryLevel: settings.minBatteryLevel,
    maxBatteryLevel: settings.maxBatteryLevel,
  }
}
