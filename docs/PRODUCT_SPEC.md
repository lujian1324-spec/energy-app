# Sierro Energy App — 完整产品说明文档（详细版）

> 版本日期：2026-06-25
> 适用代码库：`lujian1324-spec/energy-app`（分支 `main`）
> 本文档在原版基础上进一步展开，列出每个页面的所有状态字段、表单域、按钮条件、useEffect 依赖、API 请求/响应类型、Store 操作逻辑、IndexedDB schema 及权限判断。

---

## 目录

1. [产品概述](#1-产品概述)
2. [技术架构](#2-技术架构)
3. [API 客户端与签名机制](#3-api-客户端与签名机制)
4. [TypeScript 类型定义](#4-typescript-类型定义)
5. [Zustand 状态管理](#5-zustand-状态管理)
6. [IndexedDB 数据库](#6-indexeddb-数据库)
7. [页面详解](#7-页面详解)
8. [路由结构](#8-路由结构)
9. [权限体系](#9-权限体系)
10. [本地存储汇总](#10-本地存储汇总)

---

## 1. 产品概述

Sierro Energy App 是一款用于管理 Sierro 储能设备（便携式/家用电源站）的 PWA 应用。

**核心功能：**
- 设备管理：添加/删除/重命名，BLE & Wi-Fi 配网，二维码扫描
- 实时监控：电量、功率流（光伏/市电/电池/负载）、温度、告警
- 历史与洞察：日/周/月/区间能量统计，CO₂减排，分享
- 智能调度：峰谷电价（TOU）充放电计划，睡眠模式
- 告警中心：实时 + 历史告警，推送通知
- 账户体系：邮箱/用户名登录，注册，找回密码，资料编辑
- 调试工具：BLE 调试、Modbus 透传（仅开发者）

**设计基调：** 深色主题（`bg-ink-12` = `#141414`），iOS 原生质感，teal 品牌色（`#01D6BE`）。

---

## 2. 技术架构

| 维度 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 |
| 样式 | Tailwind CSS 3（token 锁定于 `tailwind.config.js`） |
| 路由 | React Router 6（**HashRouter**） |
| 状态 | Zustand 4（含 `persist` 中间件） |
| 动画 | Framer Motion 11 |
| 本地数据库 | IndexedDB（`idb` 库封装，`powerflowDB.ts`） |
| 加密 | `crypto-js`（HMAC-SHA256 / MD5 / SHA256） |
| 原生能力 | Capacitor（iOS/Android，BLE、Camera、Notifications） |
| API 基地址 | `https://solar.siseli.com/apis` |
| WebSocket | `wss://solar.siseli.com/openapis/ws` |

---

## 3. API 客户端与签名机制

### 3.1 文件：`src/utils/apiClient.ts`

#### 常量与 Token 存储

```ts
const BASE_URL = 'https://solar.siseli.com/apis'
const TOKEN_KEY = 'iot_access_token'          // localStorage key
const REFRESH_TOKEN_KEY = 'iot_refresh_token' // localStorage key

export const tokenStore = {
  get(): string | null                         // localStorage.getItem(TOKEN_KEY)
  set(token: string): void                     // localStorage.setItem(TOKEN_KEY, token)
  clear(): void                                // 同时删除 ACCESS + REFRESH
  getRefresh(): string | null
  setRefresh(token: string): void
}
```

#### 响应类型

```ts
export interface ApiResponse<T = unknown> {
  code: number | string      // 0 / "0" = 成功；401/1001/1002 = Token 过期
  message?: string
  msg?: string               // 部分接口用 msg 而非 message
  localMessage?: string
  data?: T
}

export class ApiError extends Error {
  code: number | string
  status?: number            // HTTP 状态码
}
```

#### 请求选项

```ts
export interface RequestOptions {
  method?: string            // 默认 'GET'
  headers?: Record<string, string>
  body?: string              // 紧凑 JSON（无空格）
  skipAuth?: boolean         // true = 不添加 IOT-Token（登录/注册接口）
  skipSign?: boolean         // true = 不添加签名头
  maxRetries?: number        // 默认 2（仅网络错误重试）
  retryDelay?: number        // 默认 600ms，指数退避
  timeout?: number           // 默认 10000ms，使用 AbortSignal.timeout
  _isRefresh?: boolean       // 内部：防止刷新请求递归
  _retriedAfterRefresh?: boolean // 内部：防止无限刷新
}
```

#### 签名头（iotSign.ts 注入）

每次请求自动添加以下头：
- `IOT-Open-AppID` — 应用 ID
- `IOT-Open-Nonce` — 随机字符串（每次请求重新生成）
- `IOT-Open-Body-Hash` — SHA256(body) → Base64
- `IOT-Open-Sign` — HmacSHA256(base64BodyHash, AppSecret) → MD5 → 十六进制

Token 认证头：`IOT-Token: <accessToken>`（**不是** `Authorization: Bearer`）

#### Token 过期码

```ts
const AUTH_EXPIRED_CODES = new Set([401, '401', 1001, '1001', 1002, '1002'])
```

#### 刷新逻辑

1. 请求返回 code ∈ AUTH_EXPIRED_CODES 且不是刷新请求本身
2. 调用单例 `doRefreshToken()`：POST `/login/refresh/access/token` `{accessToken, refreshToken}`
3. 刷新成功：更新 token → 重试原请求（带 `_retriedAfterRefresh: true`）
4. 刷新失败：`window.dispatchEvent(new CustomEvent('auth:expired'))` → authStore 清除登录状态

#### 快捷方法

```ts
api.get<T>(path, headers?)              // GET，带签名，带 Token
api.post<T>(path, data?, headers?)      // POST，带签名，带 Token
api.postSkipAuth<T>(path, data?)        // POST，带签名，不带 Token（登录/注册）
api.postNoSign<T>(path, data?)          // POST，不签名，不带 Token
```

---

## 4. TypeScript 类型定义

### 4.1 文件：`src/api/authApi.ts`

```ts
interface LoginRequest {
  account: string      // 用户名或邮箱
  password: string     // MD5(明文密码).toLowerCase()
}

interface LoginData {
  accessToken?: string
  refreshToken?: string
  accessTokenWillExpiredAt?: string
  accessTokenWillExpiredInMillis?: number
  refreshTokenWillExpiredAt?: string
  refreshTokenWillExpiredInMillis?: number
  account?: string
  authId?: number
  userId?: number
  userType?: number
  isAdmin?: boolean
  isDealer?: boolean
  isDeviceManufacturer?: boolean
  isIntegrator?: boolean
  isOfficialStaff?: boolean
  isStationOwner?: boolean
  ticket?: string
  themeColor?: string
}

interface RegisterRequest {
  account: string              // 用户名（仅字母数字下划线）
  password: string             // MD5 加密
  email?: string               // 邮箱注册必填
  cellphone?: string           // 手机注册必填
  countryTelephoneCode?: string // 区号，不带 + 号（如 "1"）
  verifyCode?: string          // 验证码（API 字段名）
  captchaId?: string           // 验证码会话 ID
  nickname?: string
}

interface UserInfo {
  userId?: number
  account?: string
  nickname?: string
  email?: string
  cellphone?: string
  countryTelephoneCode?: string
  avatarUrl?: string
  userType?: number
  isAdmin?: boolean
  isStationOwner?: boolean
  isIntegrator?: boolean
  isDealer?: boolean
}

interface SendCaptchaRequest {
  address: string      // 注意：字段名是 address 不是 email
  intent: string       // "1"=注册 "2"=重置密码 "3"=登录 "4"=修改邮箱
}

interface SendCaptchaResponse {
  iotCaptchaId?: string   // 注意：字段名是 iotCaptchaId 不是 captchaId
}
```

#### Auth API 函数一览

| 函数 | 方法 | 路径 | 说明 |
|------|------|------|------|
| `loginByAccount(username, plainPassword)` | POST | `/login/account` | 账号密码登录，自动保存 token |
| `loginByEmail(email, iotCaptchaId, verifyCode)` | POST | `/login/email` | 邮箱验证码登录 |
| `loginBySms(cellphone, code, captchaId, verifyCode)` | POST | `/login/sms` | 短信验证码登录 |
| `registerByEmail(account, pwd, email, verifyCode?, captchaId?)` | POST | `/user/register/email` | 邮箱注册，密码 MD5 加密 |
| `registerByCellphone(account, pwd, phone, code, verifyCode?, captchaId?)` | POST | `/user/register/cellphone` | 手机注册 |
| `sendEmailCaptcha(email, intent?)` | POST | `/user/send/email/captcha` | 发送邮箱验证码，请求体字段 `address` |
| `sendSmsCaptcha(cellphone, countryCode, intent?)` | POST | `/user/send/sms/captcha` | 发送短信验证码 |
| `logout()` | POST | `/login/logout` | 退出，需 `{accessToken, userId}` |
| `refreshAccessToken()` | POST | `/login/refresh/access/token` | 刷新，需 `{accessToken, refreshToken}` |
| `fetchUserInfo()` | POST | `/user/select/iotUserInfo` | 获取个人信息 |
| `updateUserInfo(data)` | POST | `/user/update/iotUserInfo` | 修改个人信息 |
| `updatePassword(oldPwd, newPwd)` | POST | `/user/update/authPassword` | 修改密码，两个密码都 MD5 |
| `resetPassword(account, newPwd, verifyCode?, captchaId?, email?)` | POST | `/user/reset/password` | 找回密码，新密码 MD5 |
| `updateUserEmail(email, captchaId, verifyCode)` | POST | `/user/update/iotUserEmail` | 修改绑定邮箱 |
| `checkAccountExists(account)` | GET | `/user/account/check?account=` | 校验用户名是否存在 |
| `checkEmailExists(email)` | GET | `/user/email/check?email=` | 校验邮箱是否存在 |
| `deleteAccount()` | POST | `/user/logout/account` | 注销账户 |
| `verifySession()` | — | 调用 `fetchUserInfo` | App 启动时验证 token 有效性 |

### 4.2 文件：`src/api/deviceApi.ts`

```ts
interface DeviceListRequest {
  page: number          // 从 1 开始
  count: number         // 每页数量
  stationId?: number
  name?: string         // 模糊搜索
  serialNumber?: string
  state?: string        // 10=Alarm 20=Online 30=Offline 40=Fault
  orderByCreatedAtAsc?: boolean
  orderByNameAsc?: boolean
  // ... 更多排序/过滤参数
}

interface DeviceListItem {
  id: string                    // Java Long → 字符串（防止 JS Number 精度丢失）
  name: string
  serialNumber: string
  model: string | null
  deviceSortKey: string         // 设备类型 key
  iconResid: string             // 图标资源 ID
  dtuId: string                 // 采集器 ID（Long as string）
  dtuDtuid: string              // 采集器唯一标识
  dtuName: string
  stationId: string             // 电站 ID（Long as string）
  stationName: string
  state: number                 // 10/20/30/40
  stateDict: string             // "Alarm"/"Online"/"Offline"/"Fault"
  isOnline: boolean
  isAlarmed: boolean
  isPined: boolean
  producingPower: number | null // 当前功率（W）
  ratedPower: number            // 额定功率（W）
  dailyProducedQuantity: number // 今日发电量（kWh）
  totalProducedQuantity: number // 累计发电量（kWh）
  savingStandardCarbon: number  // 节省标准煤（kg）
  co2EmissionReduction: number  // CO₂ 减排（kg）
  lastDataAt: string            // 最后数据时间
  lastOnlineAt: string          // 最后在线时间
  softwareVersion: string | null
  isPeakValleyEnabled?: boolean // 峰谷功能是否启用（详情接口返回）
}

interface DeviceListResponse {
  list: DeviceListItem[]
  total: number
  page: number
  count: number
}

interface AddDeviceRequest {
  deviceName: string       // 设备名称（必填）
  stationId: number        // 所属电站 ID（必填）
  dtuDtuid: string         // 采集器 ID（必填）
  deviceSerialNumber?: string
  ratedPower?: number
  place?: string
  installedAt?: string     // ISO 8601
  extraProperty?: Record<string, unknown>
}

interface AddDeviceWithStationRequest extends AddDeviceRequest {
  stationName?: string
  country?: string
  province?: string
  city?: string
  address?: string
  latitude?: number
  longitude?: number
  timezone?: string
  currencyCode?: string
}

interface UpdateDeviceRequest {
  id: string | number
  name: string
  place?: string
  ratedPower?: number
  extraProperty?: Record<string, unknown>
}

// ─── 设备实时状态（/remote/device/state/latest）───

interface DeviceStateField {
  key: string
  name: string
  value: unknown           // 数值字段为 number，布尔字段为 "0"/"1" 字符串
  valueDisplay: string     // 带单位的显示字符串
  unit: string
  valueType: string        // "number" | "boolean" | "string"
  category: string
}

interface DeviceStateResponse {
  deviceId: string
  dtuID: string
  time: string             // ISO 8601 时间戳
  stationId: string
  gatherProtocolNumber: string
  fields: Record<string, DeviceStateField>  // 所有字段的 map
  groups: DeviceStateGroup[]                // 分组后的字段（UI 用）
  firingAlarms: AlarmSummary[]              // 当前触发中的告警
}

// ─── 字段 key → DeviceRealtimeFields 映射 ───

interface DeviceRealtimeFields {
  // 电量
  remainingBatteryCapacity: number  // API key: remainingBatteryCapacity (0-100)
  batteryCapacity: number           // API key: batteryCapacity (Ah)
  batteryCurrent: number            // API key: batteryCurrent (A)
  numberOfBatteryUsageCycles: number// API key: numberOfBatteryUsageCycles

  // 功率
  acPower: number          // API key: exchangeChargingPower (市电充电功率 W)
  solarPower: number       // API key: generationPower (光伏功率 W)
  outputPower: number      // API key: outputPower (输出功率 W)
  batteryPower: number     // 计算值：batteryCurrent × voltage（充正放负）

  // 电压/频率
  acInputVoltage: number   // API key: l1AcInputVoltage (V)
  acInputFrequency: number // API key: acInputFrequency (Hz)
  acOutputVoltage: number  // API key: acOutputVoltage (V)
  acOutputFrequency: number// API key: acOutputFrequency (Hz)
  solarInputVoltage: number// API key: solarInputVoltage (V)

  // 温度
  batteryTemp: number      // API key: cellTemperature1 (°C)
  cellTemperature2: number // API key: cellTemperature2
  cellTemperature3: number // API key: cellTemperature3
  mpptTemperature: number  // API key: mpptTemperature
  dcdcTemperature: number  // API key: dcdcTemperature

  // 能量统计
  pvGeneratedEnergyOfDay: number   // API key: pvGeneratedEnergyOfDay (kWh)
  totalPVGeneratedEnergy: number   // API key: totalPVGeneratedEnergy (kWh)
  accumulatedChargingTime: number  // API key: accumulatedChargingTime (分钟)
  accumulatedDischargeTime: number // API key: accumulatedDischargeTime (分钟)

  // 开关状态（API 返回 "0"/"1" 字符串，转换为 boolean）
  acOut1Enable: boolean    // API key: inversionState
  acOut2Enable: boolean    // API key: acOut2Enable
  usbOut1Enable: boolean   // API key: usbOut1Enable
  photovoltaicCharging: boolean  // API key: photovoltaicCharging
  mainsCharging: boolean         // API key: mainsCharging
  acOutputs: boolean             // API key: acOutputs
  bypassStatus: boolean          // API key: bypassStatus
  noLoadShutdown: boolean        // API key: noLoadShutdown
  sleepMode: boolean             // API key: sleepMode

  // 工作模式
  workMode: 0 | 1 | 2    // API key: workMode (0=正常 1=备份 2=节能)

  // 版本
  hardwareVersion: string
  softwareVersionNumber: string
  inverterSoftwareVersionNumber: string
}

// ─── 历史数据（/deviceState/attribute/keys/history）───

interface HistoryDataRequest {
  deviceId: string
  keys: string[]           // 字段 key 列表，如 ['generationPower', 'outputPower']
  fromTime: number         // Unix ms
  toTime: number           // Unix ms
  page: number
  count: number            // 最大单次 288 条
  orderByTimeAsc?: boolean
}

interface HistoryDataPoint {
  key: string
  value: number
  timestamp: number        // Unix ms
}

interface HistoryDataResponse {
  list: HistoryDataPoint[]
  total: number
}

// ─── 告警（/alarm/query/list）───

interface AlarmQueryRequest {
  page: number
  count: number
  deviceId?: string
  orderByCreatedTimeDesc?: boolean
  isProcessed?: boolean    // true=已处理 false=未处理
}

interface AlarmItem {
  alarmId: string
  deviceId: string
  deviceName: string
  alarmCode: string
  alarmMessage: string
  severity: 'critical' | 'major' | 'minor' | 'info'
  timestamp: string        // ISO 8601
  isProcessed: boolean
  createdAt: string
}

interface AlarmListResponse {
  list: AlarmItem[]
  total: number
}

// ─── 能量流动（/remote/device/energy/flow 或 /deviceState/simple/energy/flow/v1）───

interface EnergyFlowData {
  solarPower: number       // 光伏输入（W）
  gridPower: number        // 市电输入（W）
  batteryPower: number     // 电池（正=充 负=放，W）
  loadPower: number        // 负载输出（W）
  batteryLevel: number     // 电量百分比（0-100）
  batteryCharging: boolean
  solarActive: boolean
  gridActive: boolean
}

// ─── 削峰填谷（/peakValley）───

interface PeakValleyGeneralConfig {
  deviceId: string | number
  isEnabled: boolean
  chargingSocLowerLimit: number   // 充电下限 SOC %
  chargingSocUpperLimit: number   // 充电上限 SOC %
  dischargeSocLowerLimit: number  // 放电下限 SOC %
  dischargeSocUpperLimit: number  // 放电上限 SOC %
  chargingPower?: number          // 充电功率 W
  dischargePower?: number         // 放电功率 W
}

interface PeakValleyTimeSlot {
  id?: string
  startTime: string     // "HH:mm"
  endTime: string       // "HH:mm"
  type: 'charge' | 'discharge' | 'idle'
  enabled: boolean
}

interface PeakValleyBundleResponse {
  isEnabled: boolean
  generalItem: PeakValleyGeneralConfig
  timeSlots: PeakValleyTimeSlot[]
}

// ─── 电站（/station）───

interface StationItem {
  id: string            // Long as string
  name: string
  address: string
  latitude?: number
  longitude?: number
  timezone: string
  currencyCode: string
  deviceCount: number
  totalProducedQuantity: number
  createdAt: string
}

interface StationAddRequest {
  name: string
  address?: string
  latitude?: number
  longitude?: number
  timezone?: string
  currencyCode?: string
  stationType?: number
  installedCapacity?: number
}
```

#### Device API 函数一览

| 函数 | 方法 | 路径 | 参数 |
|------|------|------|------|
| `fetchDeviceList(page, count, filters?)` | POST | `/device/list` | `DeviceListRequest` |
| `fetchDeviceDetails(deviceId)` | GET | `/device/details?deviceId=` | — |
| `addDevice(data)` | POST | `/device/add/single` | `AddDeviceRequest` |
| `addDeviceWithStation(data)` | POST | `/device/add/single/addStationTogether` | `AddDeviceWithStationRequest` |
| `deleteDevice(id)` | POST | `/device/delete` | `{ids: [id]}` |
| `updateDevice(data)` | POST | `/device/update` | `UpdateDeviceRequest` |
| `pinDevice(ids)` | POST | `/device/pin` | `{ids}` |
| `unpinDevice(ids)` | POST | `/device/unpin` | `{ids}` |
| `fetchDeviceState(deviceId)` | GET | `/remote/device/state/latest?deviceId=` | — |
| `writeDeviceConfig(deviceId, key, value)` | POST | `/remote/device/config/write?deviceId=` | `{key, value}` |
| `passthroughDevice(deviceId, hexData)` | POST | `/remote/device/passthrough?deviceId=` | `{data: base64(hexToBytes)}` |
| `readDeviceConfigs(deviceId, keys)` | POST | `/remote/device/configs/read?deviceId=` | `{keys}` |
| `startFastReport(deviceId, clientId)` | POST | `/remote/device/state/report/fast/start?deviceId=` | `{clientId}` |
| `stopFastReport(deviceId, clientId)` | POST | `/remote/device/state/report/fast/stop?deviceId=` | `{clientId}` |
| `fetchHistoryData(params)` | POST | `/deviceState/attribute/keys/history` | `HistoryDataRequest` |
| `fetchAlarms(params)` | POST | `/alarm/query/list` | `AlarmQueryRequest` |
| `ignoreAlarm(alarmId)` | POST | `/alarm/update/isProcessed` | `{alarmId, isProcessed: true}` |
| `fetchPeakValleyConfig(deviceId)` | GET | `/peakValley/device/generalConfig?deviceId=` | — |
| `setPeakValleyEnabled(params)` | POST | `/peakValley/device/enable` | `{deviceId, isEnabled}` |
| `setPeakValleyGeneral(data)` | POST | `/peakValley/device/generalConfig` | `PeakValleyGeneralConfig` |
| `fetchStationList(page, count)` | POST | `/station/list` | `{page, count}` |
| `addStation(data)` | POST | `/station/add` | `StationAddRequest` |
| `fetchSimpleEnergyFlow(deviceId, version)` | GET | `/deviceState/simple/energy/flow/v1?deviceId=` | — |

---

## 5. Zustand 状态管理

### 5.1 authStore（`src/stores/authStore.ts`）

**persist key：** `'iot-auth'`
**持久化字段：** `isAuthenticated`, `user`（`isGuest` 不持久化）

```ts
interface AuthState {
  isAuthenticated: boolean    // 初始值：tokenStore.get() !== null
  isGuest: boolean            // 初始值：false
  user: LoginData | null      // 初始值：null
  loading: boolean            // 初始值：false
  error: string | null        // 初始值：null
  sessionReady: boolean       // 初始值：false（防首次渲染闪烁）
}
```

#### Actions

**`login(username, password): Promise<boolean>`**
1. `set({ loading: true, error: null })`
2. 调用 `loginByAccount(username, password)`（内部 MD5 密码）
3. 成功（code 0/200）：`localStorage.setItem('iot_user_id', userId)` → `set({ isAuthenticated: true, isGuest: false, user: data, loading: false })`
4. 失败：`set({ loading: false, error: msg, isAuthenticated: false })`

**`logout(): Promise<void>`**
1. 调用 `apiLogout()`（POST `/login/logout {accessToken, userId}`）
2. `useDeviceStore.getState().exitDemoMode()`
3. `set({ isAuthenticated: false, isGuest: false, user: null, sessionReady: true })`

**`setGuestMode()`**
1. `set({ isGuest: true, isAuthenticated: false, sessionReady: true })`
2. `useDeviceStore.getState().loadDemoDevices()`

**`restoreSession(): Promise<void>`（App 启动时调用）**
1. 检查 `tokenStore.get()` — 无 token 则 `set({ isAuthenticated: false, sessionReady: true })` 返回
2. 调用 `verifySession()`（fetchUserInfo）
3. 成功：`set({ isAuthenticated: true, sessionReady: true })`
4. 失败：调用 `refreshAccessToken()`（POST `/login/refresh/access/token`）
5. 刷新成功再次 `verifySession()`
6. 全部失败：`tokenStore.clear()` → `set({ isAuthenticated: false, sessionReady: true })`

**全局 auth:expired 监听**
```ts
window.addEventListener('auth:expired', () => {
  tokenStore.clear()
  localStorage.removeItem('iot_user_id')
  useAuthStore.setState({ isAuthenticated: false, user: null, sessionReady: true })
})
```

---

### 5.2 deviceStore（`src/stores/deviceStore.ts`）

**persist key：** `'powerflow-device-store'`
**持久化字段：** `selectedDeviceId`, `devices`, `deviceTotal`, `isDemoMode`

```ts
interface DeviceStoreState {
  // Demo 模式
  isDemoMode: boolean               // 初始值：false

  // 设备列表
  devices: DeviceListItem[]         // 初始值：[]
  deviceTotal: number               // 初始值：0
  devicePage: number                // 初始值：1
  deviceLoading: boolean            // 初始值：false

  // 当前选中设备
  selectedDeviceId: string | null   // 初始值：null
  selectedDeviceDetails: DeviceListItem | null  // 初始值：null
  selectedDeviceState: DeviceStateResponse | null // 初始值：null
  stateLoading: boolean             // 初始值：false

  // 电站
  stations: StationItem[]           // 初始值：[]
  stationTotal: number              // 初始值：0

  // 告警
  alarms: AlarmItem[]               // 初始值：[]
  alarmTotal: number                // 初始值：0
  alarmLoading: boolean             // 初始值：false

  // 能量流动
  energyFlow: EnergyFlowData | null // 初始值：null
  energyFlowLoading: boolean        // 初始值：false
  energyFlowError: string | null    // 初始值：null

  // 削峰填谷
  peakValleyConfig: PeakValleyBundleResponse | null
  peakValleyLoading: boolean
  peakValleySaving: boolean
  peakValleyError: string | null

  // 历史数据
  historyData: HistoryDataResponse | null
  historyLoading: boolean
  historyError: string | null
}
```

**竞态保护（模块级变量）：**
```ts
let stateRequestSeq = 0        // loadDeviceState 请求序号
let alarmRequestSeq = 0        // loadAlarms 请求序号
let energyFlowRequestSeq = 0   // loadEnergyFlow 请求序号
```

#### Actions 详解

**`loadDevices(page=1, count=20, filters?)`**
- Demo 模式：直接 `set({ deviceLoading: false })` 返回
- POST `/device/list {page, count, ...filters}`
- 成功：`set({ devices: list, deviceTotal: total, devicePage: page })`

**`loadDeviceState(deviceId)`**
- Demo 模式：`getDemoDeviceState(deviceId)` → `set({ selectedDeviceState })`
- `seq = ++stateRequestSeq`（竞态保护）
- GET `/remote/device/state/latest?deviceId=`
- `if (seq !== stateRequestSeq) return`（过时请求丢弃）
- 成功：`set({ selectedDeviceState: data })` → 调用 `checkAndNotifyPowerOutage`

**`selectDevice(deviceId)`**
- `set({ selectedDeviceId: deviceId })`
- 若 deviceId 非空：`loadDeviceDetails(deviceId)` + `loadDeviceState(deviceId)`

**`removeDevice(ids: Array<string|number>)`**
- Demo 模式：本地过滤 `devices`，String 比较（防 Long 溢出）
- 真实模式：逐个 POST `/device/delete {ids: [id]}`
- 成功：若删除的是当前选中设备，清空 `selectedDeviceId/Details/State`

**`dismissAlarm(alarmId)`**
- POST `/alarm/update/isProcessed {alarmId, isProcessed: true}`
- 刷新：`loadAlarms(selectedDeviceId ?? undefined)`（注意：不用 Number()）

**`loadEnergyFlow(deviceId)`**
- `seq = ++energyFlowRequestSeq`
- GET `/deviceState/simple/energy/flow/v1?deviceId=`
- Demo 模式：`getDemoEnergyFlow(deviceId)`

**`loadHistoryData(deviceId, fromTime, toTime, keys?, count?, orderByTimeAsc?)`**
- 时间参数统一转换为 Unix ms
- 默认 keys：`['generationPower', 'outputPower', 'remainingBatteryCapacity', 'batteryTemp']`
- POST `/deviceState/attribute/keys/history`

**`loadDemoDevices()`（游客模式）**
- `set({ isDemoMode: true, devices: demoDevices, selectedDeviceId: '10001' })`
- 加载第一个设备的 demoState 和 demoEnergyFlow

**`exitDemoMode()`（退出游客模式）**
- 清空全部设备数据、告警、能量流、历史数据

---

### 5.3 powerStationStore（`src/stores/powerStationStore.ts`）

**persist key：** `'powerflow-ps-store'`（推测）
**用途：** 电源站配置、AppSettings、用户设置

```ts
interface PowerStationState {
  settings: AppSettings
  powerStation: PowerStation | null
  // ... 其他电站相关状态
}

interface AppSettings {
  notifications: boolean          // 初始值：true
  pushNotifications: boolean      // 初始值：true
  doNotDisturb: boolean           // 初始值：false
  doNotDisturbStart: string       // 初始值："22:00"
  doNotDisturbEnd: string         // 初始值："07:00"
  language: string                // 初始值："en"
  units: 'metric' | 'imperial'   // 初始值：'metric'
  cloudSync: boolean              // 初始值：true
  bluetooth: boolean              // 初始值：true
  chargeLimit: number             // 初始值：80
  ecoMode: boolean                // 初始值：false
  overTempProtection: boolean     // 初始值：true
  overDischargeProtection: boolean // 初始值：true
  founderBadge?: boolean
  founderBadgeActivatedAt?: string
  founderBadgeNumber?: number     // 0-100 唯一编号
  pushLowBattery?: boolean        // 低电量推送
  lowBatteryThreshold?: number    // 10 | 20 | 30（默认 30）
  deviceIconColor?: string
  sleepMode?: boolean
  batteryMode?: number            // 0=Normal 1=Backup 2=Eco
  pushSolarStatus?: boolean       // 光伏状态推送
}
```

---

### 5.4 notificationStore（`src/stores/notificationStore.ts`）

**用途：** 管理应用内通知列表

```ts
interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number

  addNotification(n: Omit<AppNotification, 'id' | 'timestamp'>): void
  markAsRead(id: string): void
  markAllAsRead(): void
  clearAll(): void
}

interface AppNotification {
  id: string
  type: 'alarm' | 'power_outage' | 'low_battery' | 'solar_status' | 'system'
  title: string
  body: string
  timestamp: number     // Unix ms
  read: boolean
  deviceId?: string
  deviceName?: string
}
```

---

## 6. IndexedDB 数据库

**文件：** `src/db/powerflowDB.ts`
**DB 名：** `powerflow-db`
**版本：** 3

### Object Stores

| Store | 主键 | 索引 | 最大条数 | 用途 |
|-------|------|------|----------|------|
| `power_history` | autoIncrement `id` | `timestamp` | 8640（≈24h @10s） | 功率历史 |
| `alerts` | autoIncrement `id` | `timestamp`, `resolved` | 500 | 告警日志 |
| `connection_logs` | autoIncrement `id` | `timestamp` | — | BLE/网络连接历史 |
| `commands` | autoIncrement `id` | `timestamp` | 200 | 命令审计 |
| `user_profile` | string `'profile'` | — | 1 | 用户资料缓存 |
| `smart_schedule` | string key | — | — | 峰谷/智能计划配置 |

### 类型定义（`src/types/protocol.ts`）

```ts
interface PowerHistoryRecord {
  id?: number
  timestamp: number      // Unix ms
  inputPower: number     // W
  outputPower: number    // W
  batteryLevel: number   // 0-100
  solarPower?: number    // W
  gridPower?: number     // W
  deviceId?: string
}

interface AlertRecord {
  id?: number
  timestamp: number
  type: string
  severity: 'critical' | 'major' | 'minor' | 'info'
  message: string
  resolved: number       // 0=未处理 1=已处理（IndexedDB 不支持 boolean 索引）
  deviceId?: string
}

interface CommandRecord {
  id?: number
  timestamp: number
  deviceId: string
  key: string
  value: unknown
  result: 'success' | 'failure' | 'pending'
  error?: string
}

interface UserProfile {
  userId?: number
  account?: string
  nickname?: string
  email?: string
  avatarUrl?: string
  updatedAt?: number
}
```

### DB 函数一览

```ts
// 功率历史
savePowerHistory(record: Omit<PowerHistoryRecord, 'id'>): Promise<void>
getPowerHistory(query?: { from?, to?, limit? }): Promise<PowerHistoryRecord[]>
getPowerSummary(minutesAgo?: number): Promise<{ avgInput, avgOutput, peakInput, peakOutput, totalInputWh, totalOutputWh }>

// 告警
saveAlert(alert: Omit<AlertRecord, 'id'>): Promise<void>
getAlerts(query?: AlertQuery): Promise<AlertRecord[]>
resolveAlert(id: number): Promise<void>

// 命令
saveCommand(cmd: Omit<CommandRecord, 'id'>): Promise<void>
getRecentCommands(limit?: number): Promise<CommandRecord[]>

// 用户资料
saveUserProfile(profile: UserProfile): Promise<void>
getUserProfile(): Promise<UserProfile | undefined>

// 智能计划
saveSmartSchedule(key: string, settings: PeakShavingSettings): Promise<void>
getSmartSchedule(key: string): Promise<PeakShavingSettings | undefined>

// 数据清理（按保留天数）
cleanupOldData(retentionDays?: { powerHistory?, alerts? }): Promise<void>
```

**智能计划 key 值：**
- `'peak_shaving_settings'` — 峰谷削峰设置

---

## 7. 页面详解

### 7.1 LoginPage（`src/pages/LoginPage.tsx`）

**路由：** `/login`（公开，RequireGuest 守卫：已登录则重定向 `/`）

#### useState

```ts
const [step, setStep] = useState<'entry' | 'account' | 'email'>('entry')
// 'entry' = 选择登录方式，'account' = 账号密码，'email' = 邮箱验证码
const [username, setUsername] = useState('')
const [password, setPassword] = useState('')
const [email, setEmail] = useState('')
const [otpCode, setOtpCode] = useState('')
const [captchaId, setCaptchaId] = useState<string | null>(null)
const [otpSent, setOtpSent] = useState(false)
const [countdown, setCountdown] = useState(0)
const [sending, setSending] = useState(false)
const [loading, setLoading] = useState(false)
const [error, setError] = useState('')
const [showPassword, setShowPassword] = useState(false)
```

#### useEffect

```ts
// 倒计时
useEffect(() => {
  if (countdown <= 0) return
  const t = setTimeout(() => setCountdown(c => c - 1), 1000)
  return () => clearTimeout(t)
}, [countdown])
```

#### 表单域

| 步骤 | 字段 | 类型 | 验证 | 占位符 |
|------|------|------|------|--------|
| entry | — | — | — | 显示选项按钮 |
| account | username | text | 非空 | "Username or email" |
| account | password | password | 非空 | "Password" |
| email | email | email | 正则 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | "Email address" |
| email | otpCode | text/numeric | 6位数字 | "6-digit code" |

#### 按钮与条件

| 按钮 | 步骤 | disabled 条件 | onClick |
|------|------|--------------|---------|
| Continue with Email | entry | — | `setStep('email')` |
| Log in with Username | entry | — | `setStep('account')` |
| Continue as Guest | entry | — | `setGuestMode()` → navigate('/') |
| Obtain Code | email | `countdown > 0 \|\| sending \|\| !emailValid` | `handleSendCode()` |
| Sign In (账号) | account | `!username \|\| !password \|\| loading` | `handleAccountLogin()` |
| Sign In (邮箱 OTP) | email | `!codeValid \|\| loading` | `handleEmailLogin()` |

#### 登录逻辑

**账号密码登录（`handleAccountLogin`）：**
1. `setLoading(true)`
2. `authStore.login(username, password)` → 内部 MD5 密码
3. 成功：`navigate('/')` / 失败：`setError(msg)`

**邮箱验证码（`handleSendCode`）：**
1. `setSending(true)`
2. `sendEmailCaptcha(email.trim(), '3')`（intent='3' 表示登录）
3. 成功：`setCaptchaId(result.data?.iotCaptchaId ?? result.data)` → `setCountdown(60)` → `setOtpSent(true)`

**邮箱 OTP 登录（`handleEmailLogin`）：**
1. `loginByEmail(email, captchaId, otpCode)` 
2. 成功：`navigate('/')`

---

### 7.2 RegisterPage（`src/pages/RegisterPage.tsx`）

**路由：** `/register`（公开）

#### useState

```ts
const [account, setAccount] = useState('')        // 用户名
const [email, setEmail] = useState('')            // 邮箱
const [code, setCode] = useState('')              // 验证码（6位）
const [password, setPassword] = useState('')      // 密码
const [confirm, setConfirm] = useState('')        // 确认密码
const [agreed, setAgreed] = useState(false)       // 服务协议勾选

const [captchaId, setCaptchaId] = useState<string | null>(null)
const [countdown, setCountdown] = useState(0)     // 重发倒计时（秒）
const [sending, setSending] = useState(false)     // 发送验证码中
const [loading, setLoading] = useState(false)     // 注册提交中
const [error, setError] = useState('')            // 错误信息
```

#### 验证逻辑

```ts
const ACCOUNT_RE = /^[a-zA-Z0-9_]+$/
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

const accountValid = account.trim().length > 0 && ACCOUNT_RE.test(account.trim())
const emailValid = isValidEmail(email.trim())
const passwordValid = password.length >= 6 && password.length <= 32
const confirmValid = confirm.length > 0 && confirm === password
const codeValid = code.trim().length === 6
const canSubmit = accountValid && emailValid && codeValid && passwordValid && confirmValid && agreed
```

#### 表单域

| 字段 | 类型 | 验证规则 | 占位符 | 错误提示 |
|------|------|----------|--------|---------|
| Account | text | 非空，仅字母数字下划线 | "Choose a username" | — |
| Email | email | 有效邮箱格式 | "Email address" | — |
| Verification Code | text/numeric | 6位数字 | "6-digit code" | — |
| Password | password | 6–32 字符 | "6–32 characters, case sensitive" | "Password must be 6–32 characters." |
| Confirm Password | password | 与 Password 一致 | "Re-enter your password" | "Passwords do not match." |
| Agreement checkbox | checkbox | 必须勾选 | "I have read and agree to the User Service Agreement" | — |

#### 按钮

| 按钮 | disabled 条件 | onClick |
|------|--------------|---------|
| Obtain Code | `countdown > 0 \|\| sending \|\| !emailValid` | `handleObtainCode()` |
| Register | `!canSubmit \|\| loading` | `handleRegister()` |

#### 注册逻辑

**`handleObtainCode`：**
1. `sendEmailCaptcha(email.trim(), '1')`（intent='1' 表示注册）
2. 成功：`setCaptchaId(result.data?.iotCaptchaId ?? null)` → `setCountdown(60)`

**`handleRegister`：**
1. `registerByEmail(account.trim(), password, email.trim(), code.trim(), captchaId ?? undefined)`
2. 成功（code 0）：`useAuthStore.getState().login(account, password)` → navigate('/onboarding')
3. 错误映射：
   - `/account.*exist|duplicate|illegalArgument|account.*used|username.*taken/i` → "This username is already in use. Please choose another."
   - `/email.*exist|email.*used/i` → "This email is already registered. Please sign in instead."
   - 其他：原始 message 或 "Registration failed. Please try again."

---

### 7.3 ForgotPasswordPage（`src/pages/ForgotPasswordPage.tsx`）

**路由：** `/forgot-password`（公开）

#### useState

```ts
type Step = 'request' | 'reset'
const [step, setStep] = useState<Step>('request')

// Step 1
const [email, setEmail] = useState('')
const [sending, setSending] = useState(false)
const [captchaId, setCaptchaId] = useState<string | null>(null)
const [countdown, setCountdown] = useState(0)

// Step 2
const [code, setCode] = useState('')
const [newPassword, setNewPassword] = useState('')
const [confirmPassword, setConfirmPassword] = useState('')
const [loading, setLoading] = useState(false)

// 共用
const [error, setError] = useState('')
const [success, setSuccess] = useState(false)
```

#### 验证

```ts
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emailValid = EMAIL_RE.test(email.trim())
const passwordValid = newPassword.length >= 6 && newPassword.length <= 32
const confirmValid = confirmPassword === newPassword && confirmPassword.length > 0
const codeValid = code.trim().length === 6
const canReset = codeValid && passwordValid && confirmValid
```

#### 步骤流程

**Step 1（request）：**
1. 用户输入邮箱 → 点 "Send Verification Code"
2. `sendEmailCaptcha(email.trim(), '2')`（intent='2' 表示重置密码）
3. captchaId 提取：`result.data?.iotCaptchaId ?? (typeof result.data === 'string' ? result.data : null)`
4. `setCaptchaId(cid)` → `setCountdown(60)` → `setStep('reset')`

**Step 2（reset）：**
1. 用户输入验证码 + 新密码 + 确认密码 → 点 "Reset Password"
2. `resetPassword('', newPassword, code.trim(), captchaId ?? undefined, email.trim())`（account 传空字符串）
3. 成功：`setSuccess(true)` → 2秒后 `navigate('/login', { replace: true })`
4. 错误映射：
   - `/illegalArgument|illegal.?argument/i` → "Invalid verification code or the code has expired. Please try again."
   - `/captcha|code.*invalid|verify/i` → "Verification code is incorrect. Please check and retry."
   - 其他：原始 message 或 "Reset failed. Please try again."

---

### 7.4 OverviewPage（`src/pages/OverviewPage.tsx`）

**路由：** `/`（RequireAuth）

#### useState

```ts
const [showAlarmSheet, setShowAlarmSheet] = useState(false)
const [dismissingId, setDismissingId] = useState<string | null>(null)
```

#### 来自 Store

```ts
const { devices, selectedDeviceId, selectedDeviceState, alarms, alarmLoading,
        energyFlow, energyFlowLoading, loadDeviceState, loadAlarms, loadEnergyFlow,
        selectDevice } = useDeviceStore()
const { isGuest } = useAuthStore()
const { settings } = usePowerStationStore()
```

#### useEffect（轮询）

```ts
// 首次加载
useEffect(() => {
  if (selectedDeviceId) {
    loadDeviceState(selectedDeviceId)
    loadAlarms(selectedDeviceId)
    loadEnergyFlow(selectedDeviceId)
  }
}, [selectedDeviceId])

// 30秒轮询设备状态
useEffect(() => {
  if (!selectedDeviceId) return
  const interval = setInterval(() => loadDeviceState(selectedDeviceId), 30000)
  return () => clearInterval(interval)
}, [selectedDeviceId])

// 60秒轮询告警
useEffect(() => {
  if (!selectedDeviceId) return
  const interval = setInterval(() => loadAlarms(selectedDeviceId), 60000)
  return () => clearInterval(interval)
}, [selectedDeviceId])

// 60秒轮询能量流动
useEffect(() => {
  if (!selectedDeviceId) return
  const interval = setInterval(() => loadEnergyFlow(selectedDeviceId), 60000)
  return () => clearInterval(interval)
}, [selectedDeviceId])
```

#### 主要 UI 区块

1. **设备选择器**：横向滚动列表，点击 `selectDevice(id)`
2. **电量卡片**：`selectedDeviceState.fields.remainingBatteryCapacity.value`（通过 `mapFieldsToRealtime` 映射）
3. **能量流动图**：`energyFlow`（solar/grid/battery/load 四向箭头）
4. **Energy Management**：Smart Schedule 入口（原有 Peak Shaving 已删除）
5. **告警横幅**：`alarms.filter(a => !a.isProcessed)` 数量徽章，点击展开 Sheet
6. **告警 Sheet**：列出活跃告警，每条右滑 dismiss → `dismissAlarm(alarm.alarmId)`

#### 告警 dismiss 逻辑

```ts
const handleDismiss = async (alarmId: string) => {
  setDismissingId(alarmId)
  await dismissAlarm(alarmId)
  setDismissingId(null)
}
```

---

### 7.5 DevicePage（`src/pages/DevicePage.tsx`）

**路由：** `/devices`（RequireAuth）

#### useState

```ts
const [showAddSheet, setShowAddSheet] = useState(false)
const [showQrSheet, setShowQrSheet] = useState(false)
const [qrError, setQrError] = useState<string | null>(null)
const [cameraDenied, setCameraDenied] = useState(false)
const [scannedData, setScannedData] = useState<string | null>(null)
const [sortBy, setSortBy] = useState<'name' | 'status' | 'power'>('name')
```

#### QR 扫描流程

```ts
const startQrScan = async () => {
  setQrError(null)
  setCameraDenied(false)
  try {
    // 调用 Capacitor Camera / Web getUserMedia
    const result = await scanQrCode()
    setScannedData(result)
    // 解析 QR 内容，提取 dtuDtuid 等字段
    handleQrResult(result)
  } catch (err: unknown) {
    const msg = String(err)
    if (/denied|permission|notallowed/i.test(msg)) {
      setCameraDenied(true)
      setQrError('Camera access was denied. Please enable camera permission in Settings.')
    } else {
      setQrError('QR scan failed. Please try again.')
    }
  }
}
```

**摄像头权限被拒后显示：**
- "Open Settings" 按钮 → `openAppSettings()`
  - Capacitor 原生：调用系统设置页
  - Web：`window.location.href = 'app-settings:'`

#### 实时状态更新（useEffect）

```ts
// 监听 selectedDeviceState 变化，更新设备卡片显示的电池电量
// 注意：不依赖 selectedDeviceId 作为前置条件（首次加载时可能无选中设备）
useEffect(() => {
  if (selectedDeviceState && selectedDeviceState.deviceId) {
    // 更新对应设备的 batteryLevel 显示
    const capacity = selectedDeviceState.fields.remainingBatteryCapacity?.value
    if (capacity !== undefined) {
      // 局部更新 UI，不写回 store
    }
  }
}, [selectedDeviceState])
```

---

### 7.6 SettingPage（`src/pages/SettingPage.tsx`）

**路由：** `/settings`（RequireAuth）

#### 主要设置项

| 设置项 | Store 字段 | 类型 | 说明 |
|--------|-----------|------|------|
| Notifications | `settings.notifications` | boolean | 全局通知开关 |
| Push Notifications | `settings.pushNotifications` | boolean | 推送通知 |
| Do Not Disturb | `settings.doNotDisturb` | boolean | 勿扰模式 |
| DND Start | `settings.doNotDisturbStart` | string "HH:mm" | 勿扰开始时间 |
| DND End | `settings.doNotDisturbEnd` | string "HH:mm" | 勿扰结束时间 |
| Low Battery Alert | `settings.pushLowBattery` | boolean | 低电量推送 |
| Low Battery Threshold | `settings.lowBatteryThreshold` | 10\|20\|30 | 阈值（%） |
| Solar Status | `settings.pushSolarStatus` | boolean | 光伏状态推送 |
| Language | `settings.language` | string | "en" / "zh" |
| Units | `settings.units` | 'metric'\|'imperial' | 单位制 |
| Cloud Sync | `settings.cloudSync` | boolean | 云同步 |
| Battery Mode | `settings.batteryMode` | 0\|1\|2 | 0=Normal 1=Backup 2=Eco |
| Sleep Mode | `settings.sleepMode` | boolean | 关闭屏幕 |

**已删除：** PermissionsManager 组件（权限显示区块）

---

### 7.7 SmartSchedulePage（`src/pages/SmartSchedulePage.tsx`）

**路由：** `/smart-schedule`（RequireAuth）

**功能：** 配置峰谷时段自动充放电计划

```ts
// Store 读取
const { selectedDeviceId, peakValleyConfig, peakValleyLoading,
        loadPeakValley, enablePeakValley, savePeakValleyGeneral } = useDeviceStore()

// 本地状态
const [enabled, setEnabled] = useState(peakValleyConfig?.isEnabled ?? false)
const [socLower, setSocLower] = useState(peakValleyConfig?.generalItem.chargingSocLowerLimit ?? 20)
const [socUpper, setSocUpper] = useState(peakValleyConfig?.generalItem.chargingSocUpperLimit ?? 80)
const [saving, setSaving] = useState(false)
```

---

### 7.8 NotificationsPage（`src/pages/NotificationsPage.tsx`）

**路由：** `/notifications`（RequireAuth）

```ts
const { alarms, alarmTotal, alarmLoading, loadAlarms, dismissAlarm } = useDeviceStore()
const { selectedDeviceId } = useDeviceStore()

// 分页加载
const [page, setPage] = useState(1)

const loadMore = () => {
  loadAlarms(selectedDeviceId ?? undefined, page + 1, 20, true /* append */)
  setPage(p => p + 1)
}
```

**告警 ID 处理：** 使用 String 比较（Java Long 防溢出）

---

### 7.9 InsightsPage（`src/pages/InsightsPage.tsx`）

**路由：** `/insights`（RequireAuth）

**健康度显示：** 从 `selectedDeviceState.fields.batteryCapacity` 等计算，
当前版本健康度实际来自 API，非硬编码 100%。

```ts
// 历史数据加载
useEffect(() => {
  if (!selectedDeviceId) return
  const now = Date.now()
  const from = now - 7 * 24 * 3600 * 1000  // 过去7天
  loadHistoryData(selectedDeviceId, from, now, ['generationPower', 'outputPower', 'remainingBatteryCapacity'])
}, [selectedDeviceId, selectedRange])
```

---

### 7.10 BleDebugPage（`src/pages/BleDebugPage.tsx`）

**路由：** `/ble-debug`（**RequireAuth** 守卫，生产环境隐藏入口）

**功能：** BLE 扫描、连接、Modbus 命令透传，开发者专用。

---

### 7.11 DataExportPage（`src/pages/DataExportPage.tsx`）

**路由：** `/data-export`（RequireAuth）

**功能：** 导出 IndexedDB 中的历史功率数据为 CSV。

---

## 8. 路由结构

```
HashRouter
├── /                   → OverviewPage（RequireAuth）
├── /login              → LoginPage（RequireGuest）
├── /register           → RegisterPage（公开）
├── /forgot-password    → ForgotPasswordPage（公开）
├── /onboarding         → OnboardingPage（公开）
├── /terms              → TermsPage（公开）
├── /devices            → DevicePage（RequireAuth）
├── /device/:id         → DeviceDetailPage（RequireAuth）
├── /settings           → SettingPage（RequireAuth）
├── /notifications      → NotificationsPage（RequireAuth）
├── /insights           → InsightsPage（RequireAuth）
├── /smart-schedule     → SmartSchedulePage（RequireAuth）
├── /data-export        → DataExportPage（RequireAuth）
├── /ble-debug          → BleDebugPage（RequireAuth）
└── *                   → 重定向 /
```

**导航栏（底部 Tab Bar）隐藏路由：**
`/login`, `/register`, `/forgot-password`, `/onboarding`, `/terms`, `/ble-debug`, `/data-export`

---

## 9. 权限体系

### 9.1 路由权限

```ts
// RequireAuth：未登录 → /login
// RequireGuest：已登录 → /
```

游客模式（`isGuest: true`）可访问受 RequireAuth 保护的路由，但功能受限：
- 显示 Demo 数据（`isDemoMode: true`）
- 无法控制设备
- 无法修改设置（写操作被拦截）

### 9.2 原生权限

| 权限 | 用途 | 何时请求 | 被拒后处理 |
|------|------|---------|-----------|
| Camera | QR 扫描配网 | 点击 Scan QR Code 时 | `setCameraDenied(true)` + "Open Settings" 按钮 |
| Bluetooth | BLE 配网/调试 | 进入 BLE 配网流程时 | 提示手动开启 |
| Notifications | 推送通知 | 首次进入 SettingPage 开启推送开关时 | 降级为应用内通知 |
| Location (Android) | BLE 扫描依赖 | BLE 扫描时 | 提示手动授权 |

**`openAppSettings()` 实现（`src/utils/openAppSettings.ts`）：**
- Capacitor 原生（iOS/Android）：`App.openUrl({ url: 'app-settings:' })`
- Web：`window.location.href = 'app-settings:'`

### 9.3 API 权限

| 接口类别 | 是否需要 Token | 是否需要签名 |
|---------|--------------|------------|
| 登录/注册/找回密码/发送验证码 | ❌ | ✅ |
| 所有设备/用户 API | ✅ `IOT-Token` | ✅ |

---

## 10. 本地存储汇总

### localStorage

| Key | 类型 | 用途 | 写入时机 |
|-----|------|------|---------|
| `iot_access_token` | string | API 鉴权 Token | 登录成功 |
| `iot_refresh_token` | string | Token 刷新 | 登录成功 |
| `iot_user_id` | string | 退出接口参数 | 登录成功 |
| `iot-auth` | JSON | authStore 持久化（isAuthenticated, user） | Zustand persist |
| `powerflow-device-store` | JSON | deviceStore 持久化（selectedDeviceId, devices, isDemoMode） | Zustand persist |
| `powerflow-ps-store` | JSON | powerStationStore 持久化（settings） | Zustand persist |
| `powerflow_offline_cmd_queue` | JSON | 离线命令队列（PendingCommand[]） | useOfflineSync |

### IndexedDB（`powerflow-db` v3）

详见第 6 章。最大数据量：
- `power_history`：8640 条（约 24 小时 @10s 间隔）
- `alerts`：500 条（60 天保留）
- `commands`：200 条

### 离线命令队列

```ts
interface PendingCommand {
  id: string              // UUID
  deviceId: string
  key: string             // 控制字段 key
  value: unknown
  queuedAt: number        // Unix ms
  retryCount: number      // 最大 3 次，超过后丢弃
}
```

**useOfflineSync（`src/hooks/useOfflineSync.ts`）逻辑：**
1. 监听 `window.online` 事件
2. 网络恢复时逐个重放队列中的命令（`writeDeviceConfig`）
3. 成功从队列移除，失败 `retryCount++`，达到 3 次后丢弃

---

## 附录：设计 Token

| Token | 值 | Tailwind |
|-------|----|---------|
| 主色（Primary） | `#01D6BE` | `text-primary` / `bg-primary` |
| 主色深（Dark） | `#01A18F` | `bg-primary-dark` |
| 主色浅（Light） | `#E8FBF9` | `bg-primary-light` |
| 危险（Danger） | `#FF3530` | `text-danger` |
| 成功（Success） | `#34C759` | `text-success` |
| 警告（Warning） | `#FF9500` | `text-warning` |
| 背景 | `#141414` | `bg-ink-12` |
| 卡片背景 | `#262626` | `bg-ink-10` |
| 文字主色 | `#FFFFFF` | `text-ink-1` |
| 文字次要 | `#8C8C8C` | `text-ink-7` |
| 圆角（按钮）| 8px | `rounded-m` |
| 圆角（卡片）| 12px | `rounded-l` |
| 圆角（标签）| 100px | `rounded-pill` |
