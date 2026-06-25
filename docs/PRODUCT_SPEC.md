# Sierro Energy App — 完整产品说明文档

> 版本日期：2026-06-25
> 适用代码库：`lujian1324-spec/energy-app`（分支 `main`）
> 本文档系统性列出 App 的每一个页面、每一个参数，以及前端、后端、数据库、接口、权限、存储六大维度。

---

## 目录

1. [产品概述](#1-产品概述)
2. [技术架构](#2-技术架构前端)
3. [页面清单与详解](#3-页面清单与详解)
4. [接口层（后端 API）](#4-接口层后端-api)
5. [状态管理（Zustand Stores）](#5-状态管理zustand-stores)
6. [数据库与存储](#6-数据库与存储)
7. [权限体系](#7-权限体系)
8. [数据模型（Types）](#8-数据模型types)

---

## 1. 产品概述

Sierro Energy App 是一款用于管理 Sierro 储能设备（便携式 / 家用电源站）的 PWA 应用。核心功能：

- **设备管理**：添加 / 删除 / 重命名设备，BLE & Wi-Fi 配网，二维码扫描
- **实时监控**：电量、功率流（光伏 / 市电 / 电池 / 负载）、温度、告警
- **历史与洞察**：日 / 周 / 月 / 区间能量统计，CO₂ 减排，分享
- **智能调度**：峰谷电价（TOU）充放电计划
- **睡眠模式**：定时开关机
- **告警中心**：实时 + 历史告警
- **账户体系**：邮箱 / 用户名 / 短信登录，注册，找回密码，资料编辑
- **调试工具**：BLE 调试、Modbus 透传、参数表（开发者）

**设计基调**：深色主题（dark-first）、iOS 原生质感、圆角卡片、teal（#01D6BE）品牌色。

---

## 2. 技术架构（前端）

| 维度 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 |
| 样式 | Tailwind CSS 3（设计 token 锁定于 `tailwind.config.js`） |
| 路由 | React Router 6（**HashRouter**） |
| 状态 | Zustand 4（含 persist 中间件） |
| 动画 | Framer Motion 11 |
| 本地数据库 | IndexedDB（`idb` 库封装） |
| 加密 | crypto-js（HMAC-SHA256 / MD5 / SHA256） |
| 原生封装 | Capacitor 8（iOS / Android） |
| 二维码 | jsQR |
| 截图分享 | html2canvas |
| PWA | vite-plugin-pwa（Workbox） |
| 蓝牙 | Web Bluetooth API（`@types/web-bluetooth`） |
| 部署 | push `main` → GitHub Actions → GitHub Pages (`gh-pages`)，base path `/sierroApp/` |

**入口链路**：`src/main.tsx` → `src/App.tsx`（路由 + 会话恢复 + 权限门）→ `src/pages/*`

---

## 3. 页面清单与详解

### 路由总表

| 页面 | 路由 | 鉴权 | 底部导航 | 用途 |
|------|------|------|----------|------|
| LoginPage | `/login` | 否 | 无 | 邮箱/用户名 + 密码/验证码登录 |
| RegisterPage | `/register` | 否 | 无 | 邮箱验证码注册 |
| ForgotPasswordPage | `/forgot-password` | 否 | 无 | 邮箱验证码找回密码 |
| TermsPage | `/terms` | 否 | 无 | 使用条款（15 节） |
| PrivacyPage | `/privacy` | 否 | 无 | 隐私政策（11 节） |
| DevicePage | `/devices` | 是 | **有** | 设备列表 |
| StatsPage | `/insights` | 是 | **有** | 能量统计与洞察 |
| SettingPage | `/setting` | 是 | **有** | 应用设置 |
| OverviewPage | `/device/:id/dashboard` | 是 | 无 | 设备仪表盘 |
| DeviceMonitorPage | `/device/:id` | 是 | 无 | 实时功率图表 |
| DeviceDetailPage | `/device/:id/settings` | 是 | 无 | 设备设置 |
| SmartSchedulePage | `/smart-schedule` | 是 | 无 | 峰谷调度 |
| NotificationsPage | `/notifications` | 是 | 无 | 告警中心 |
| OnboardingPage | `/onboarding` | 是 | 无 | 新用户引导 |
| DataExportPage | `/data-export` | 是 | 无 | 数据导出 |
| BleDebugPage | `/ble-debug` | 是 | 无 | BLE 调试（开发者） |
| PassthroughPage | `/device/:id/passthrough` | 是 | 无 | Modbus 透传（开发者） |
| DebugParamsPage | `/device/:id/debug-params` | 是 | 无 | 参数表（开发者） |
| ProvisioningPage | 模态覆盖 | 是 | 无 | BLE 配网向导 |
| ProfileEditPage | SettingPage 内模态 | 是 | 无 | 资料编辑 |

> 注：`PeakShavingPage.tsx` 仍存于代码库但**已废弃、未挂路由**（被 SmartSchedulePage 取代，且 Overview 入口已移除）。

---

### 3.1 LoginPage `/login`

**用途**：双模式登录 —— 标签切换「用户名 / 邮箱」，并可切换「密码 / 验证码」。

**布局**：品牌 Logo → 标签栏（Username | Email）→ 条件输入框 → "With Verification Code" 开关（仅邮箱）→ Sign In 按钮 → 底部链接（忘记密码 / 注册 / 游客 / 条款隐私）。

**参数 / 字段**：
- 邮箱或用户名输入
- 密码 或 验证码（6 位数字）
- "Obtain Code" 按钮（60s 冷却）
- "With Verification Code" 开关（邮箱标签）
- Sign In（缺字段时禁用）

**本地状态**：`tab('email'|'username')`、`email`、`username`、`password`、`otpCode`、`otpMode`、`otpSent`、`captchaId`、`cooldown`、`error`、`busy`

**Store**：读 `useAuthStore`（loading / isAuthenticated / login()）；写认证状态

**接口**：`sendEmailCaptcha(email,'3')`、`loginByEmail(email,captchaId,otpCode)`、`login(account,password)`

**导航**：成功 → `/`；→ `/register`、`/forgot-password`、`/terms`、`/privacy`；游客模式 `setGuestMode()`

---

### 3.2 RegisterPage `/register`

**用途**：邮箱验证码注册，注册成功后自动登录并进入引导。

**字段**：Account（字母数字下划线）、Email、验证码（6 位 + Obtain 按钮 60s 冷却）、密码（6–32 位）、确认密码、用户协议勾选

**本地状态**：`account`、`email`、`code`、`password`、`confirm`、`agreed`、`captchaId`、`countdown`、`sending`、`loading`、`error`

**接口**：`sendEmailCaptcha(email,'1')`、`registerByEmail(account,password,email,code,captchaId)`、`login()`（自动登录）

**导航**：成功 → `/onboarding`；→ `/login`

---

### 3.3 ForgotPasswordPage `/forgot-password`

**用途**：邮箱 OTP 两步找回密码。

**字段**：Step1 — 邮箱 + 发送验证码；Step2 — 验证码（6 位）+ 新密码（6–32 位）+ 确认密码 + Resend

**本地状态**：`step('request'|'reset')`、`email`、`code`、`newPassword`、`confirmPassword`、`captchaId`、`countdown`、`sending`、`error`、`success`、`loading`

**接口**：`sendEmailCaptcha(email,'2')`、`resetPassword(...)`

---

### 3.4 TermsPage `/terms` · 3.5 PrivacyPage `/privacy`

**用途**：静态法律文本。Terms 15 节、Privacy 11 节，均含目录锚点跳转与版权页脚。无输入字段，无本地状态。

---

### 3.6 DevicePage `/devices`

**用途**：设备列表主页 —— 实时电量、电源开关、添加 / 管理。

**布局**：标题 + 添加按钮 + 通知按钮（未读角标）→ 错误横幅 → 低电量横幅（可关）→ 设备卡片列表 → 空状态。多个模态：添加设备选项（BLE / Wi-Fi / 手动 / 扫码）、二维码扫描、BLE 扫描、手动添加表单、设备参数详情、配网覆盖层。

**参数 / 字段**：电量标签（%、充电指示、连接状态）、电源开关（断连禁用）、设备卡（图标 / 名称 / 型号 / 电量）；详情表（序列号 / 电站 / 固件 / 协议 / 状态 / 位置 / 最后数据；SOC / 电池 / AC / 光伏 / 输出功率 / 温度；端口控制）

**本地状态**：`showAddModal`、`showManualAdd`、`showQrScan`、`showBleScan`、`showProvisioning`、`error`、`bannerDismissed`、`powerStates`、`realtimeCache`、`refreshingId`、`showDeviceParams`、QR/BLE 扫描态

**Store**：读 `useDeviceStore`（devices / deviceLoading / selectedDeviceState）、`useAuthStore`、`usePowerStationStore`（settings.lowBatteryThreshold）、`useNotificationStore`（unreadCount）；写 selectDevice / loadDevices / loadDeviceState / loadStations

**接口**：`fetchDeviceList`、`fetchStationList`、`fetchDeviceState`、`mapFieldsToRealtime`

**导航**：点卡片 → `/device/:id`；通知 → `/notifications`

---

### 3.7 OverviewPage `/device/:id/dashboard`

**用途**：设备综合仪表盘 —— 实时功率流、电量环、快捷控制、告警、通知。

**布局**：头部（设备名 / 设置 / 通知 / 告警）→ 电量环（圆形 SOC）→ 功率流图（光伏 / 市电 / 充放电 / 输出）→ 快捷控制（睡眠 / 工作模式）→ 告警区 → 能量流分解 → 设备状态。

**参数 / 字段**：SOC %、AC/Solar/Output/Battery 功率（W）、电池温度、充满 / 剩余时间、工作模式（Backup / Saving）、睡眠开关、端口状态、实时告警列表

**本地状态**：`showNotifications`、`showDisplaySettings`、`showLockScreenAlert`、`showAlerts`、`alertList`、`pushPermission`、`showDeviceDropdown`、`dismissingAlarmId`、`powerDataSource`、`controlLoading`、`displayConfig`、`collapsedGroups`、`localSleepMode`、`activeMode`、`dataSource`

**Store**：读 `useDeviceStore`（selectedDeviceState / devices / selectedDeviceDetails / alarms / energyFlow）、`usePowerStationStore`（settings）；写 controlDevice / dismissAlarm / loadAlarms / loadEnergyFlow

**接口与轮询**：`loadDeviceState`（30s）、`loadAlarms`（60s）、`loadEnergyFlow`（60s）、`controlDevice`、`dismissAlarm`、停电 / 低电量通知

**导航**：设置 → `/device/:id/settings`；返回 → 设备列表

---

### 3.8 DeviceMonitorPage `/device/:id`

**用途**：实时功率监控，可交互区域图（24h / 选定区间）。

**参数 / 字段**：指标标签（电量 % / AC / 光伏 / 输出 W）；区域图（Y 轴随指标变化，电量 0–100%、其余 0–1000W；X 轴时间标签；渐变填充；悬停提示）

**本地状态**：`activeTab('battery'|'ac'|'solar'|'output')`、`showDeviceDropdown`、`sampleTick`

**Store**：读 `useDeviceStore`（devices / selectedDeviceState / historyData / isDemoMode）；写 selectDevice / loadDeviceState / loadHistoryData

**接口**：`loadDeviceState`（30s）、`loadHistoryData`

**localStorage**：`sierro-rtpower-{deviceId}-{YYYY-MM-DD}`（日缓存）、`sierro-rtsamples-{deviceId}-{YYYY-MM-DD}`（实时样本，≤600 点）

---

### 3.9 DeviceDetailPage `/device/:id/settings`

**用途**：设备设置 —— 重命名、图标、信息、睡眠计划、工作模式、删除。多子屏：main / editName / displayIcon / deviceInfo / sleepMode。

**参数 / 字段**：
- 设备名输入
- 显示图标选择器（8 个 Lucide 图标 + 设备照片）
- 睡眠模式：开关、From（HH:MM）、To（HH:MM）、下次事件、上次发送时间
- 工作模式：Backup（100% 预留）/ Savings（60% 预留）
- 设备信息（只读）：序列号 / 电站 / 固件 / 协议 / 状态 / 位置 / 最后数据
- 删除设备（含确认模态）

**本地状态**：`screen`、`editName`、`editTargetId`、`showDeviceDropdown`、`sleepMode`、`sleepFrom`、`sleepTo`、`workModeDraft`、`workMode`、`selectedIcon`、`pendingIcon`、`showDeleteConfirm`、`deleting`、`deleteError`

**Store**：读 `useDeviceStore`、`usePowerStationStore`；写 renameDeviceLocal / updateDeviceInfo / removeDevice / updateDeviceNameById

**接口**：`updateDevice`、`deleteDevice`、睡眠计划持久化（useSleepModeScheduler hook）

**localStorage**：`sierro-display-icon-{deviceId}`、`sierro-sleep-{deviceId}`、`sierro-sleep-phase-{deviceId}`

---

### 3.10 SettingPage `/setting`

**用途**：应用级设置。

**参数 / 字段**：用户头像（点击编辑资料）、用户名、推送开关 ×3（停电 / 低电量 / 光伏）、低电量阈值滑块（10/20/30%）、反馈按钮、数据导出、条款 / 隐私、创始会员徽章兑换、App 版本、管理账户 / 退出登录

**本地状态**：`showSupport`、`showDeleteConfirm`、`showManageAccount`、`showFounderModal`、`showResetConfirm`、`support*`、`founder*`、`showProfileEdit`、`userProfile`、`pushOutage`、`pushLowBattery`、`pushSolarStatus`、`lowBatteryThreshold`

**Store**：读 `usePowerStationStore`（settings / powerStation / activateFounderBadge / updateSettings）、`useAuthStore`（user / logout / isGuest）；写 updateSettings

**接口 / DB**：`getUserProfile`（IndexedDB）、`deleteAccount`、`mailto:` 反馈

> 注：原"权限管理"区块已按需求移除。

---

### 3.11 StatsPage `/insights`

**用途**：能量统计 —— 日 / 周 / 月 / 区间，光伏 / 输出能量图，CO₂ 减排，洞察。

**参数 / 字段**：周期选择（Day/Week/Month/Range）、日历选择器（含区间起止）、月份网格选择器、组合输入 / 输出柱状图 + SOC 折线叠加 + 悬停提示、统计卡（CO₂ kg / 总输入 kWh / 总输出 kWh / 洞察文案）、分享按钮（html2canvas）

> **注**：电池健康（Battery Health）当前硬编码为 100%。

**本地状态**：`period`、`selectedDate`、`rangeStart`、`rangeEnd`、`rangePickStep`、`viewDate`

**Store**：读 `useDeviceStore`（selectedDeviceState / historyData / isDemoMode）；写 loadHistoryData

**接口**：`loadHistoryData(id, from, to, ['generationPower','outputPower','remainingBatteryCapacity'], limit)`、`aggregateHistory`

---

### 3.12 SmartSchedulePage `/smart-schedule`

**用途**：峰谷电价（TOU）充放电计划，含时钟环可视化、节省计算、设备同步。

**参数 / 字段**：启用开关、峰 / 谷电价（$/kWh，可编辑）、24h 时钟环（计划段彩弧）、计划卡（名称 / 类型 Charge·Discharge·Grid·Battery / 起止时间整点 / 启用开关 / 编辑删除）、节省显示（日 / 月 / 年 $）、冲突检测、Save to Device

**本地状态**：`showAddModal`、`editingSchedule`、`editForm`、`editConflict`、`deleteConfirm`、`showPartPeak`、`newSchedule`、`conflictResult`

**Store**：读 `usePowerStationStore`（peakShavingSettings / peakShavingStatus）、`useDeviceStore`（selectedDeviceId / peakValleyConfig / peakValleyLoading）；写 add/update/deletePeakShavingSchedule / togglePeakShaving / enablePeakValley / savePeakValleyGeneral

**接口**：`fetchPeakValleyConfig`、`setPeakValleyEnabled`、`setPeakValleyGeneral`、`mapBundleToSettings`、`mapSettingsToGeneralConfig`

---

### 3.13 NotificationsPage `/notifications`

**用途**：实时 + 历史告警，支持忽略 / 处理。

**参数 / 字段**：头部计数（当前 / 未处理 / 历史）；实时告警区（红色 ACTIVE，含严重度图标 / 标题 / 等级 / 时间，无忽略按钮）；历史告警区（已处理绿色勾、未处理含忽略按钮，按日期倒序）；空状态；加载更多

**本地状态**：`dismissingIds`（Set）

**Store**：读 `useDeviceStore`（selectedDeviceId / selectedDeviceState / alarms / alarmTotal / alarmLoading）；写 loadAlarms / dismissAlarm / loadDeviceState

**接口**：`fetchAlarms`（分页）、`ignoreAlarm`

---

### 3.14 OnboardingPage `/onboarding`

**用途**：注册后引导 —— 设昵称 + 添加首个设备。

**字段**：Step1 昵称输入 + Continue；Step2 Connect Device + Skip for now

**本地状态**：`step('name'|'device')`、`name`、`saving`、`showProvisioning`

**DB**：`saveUserProfile` / `getUserProfile`（IndexedDB）

**导航**：Skip / 完成 → `/devices`

---

### 3.15 ProvisioningPage（模态覆盖）

**用途**：BLE 配网向导 —— scan → 命名 → 图标 → 配网。

**字段**：BLE 设备列表（RSSI）、USB 串口、二维码扫描、设备名、图标选择、Wi-Fi SSID 下拉、Wi-Fi 密码（可见切换）、BLE key、进度条、日志

**本地状态**：`uiScreen`、`deviceNameInput`、`nameError`、`bleKeyInput`、`showPassword`、`selectedIcon`、`foundDevices`、`bleStatus`

**Store**：`useProvisionStore`、`useConnectionStore`、`useDeviceStore`

**协议**：`getProvisionManager()`（connect / scan / verify / config / restart）

---

### 3.16 DataExportPage `/data-export`

**用途**：数据主权 —— 导出 JSON/CSV、隐私确认、回收站说明。

**字段**：Export JSON（完整快照）、Export CSV（仅时间序列）、隐私确认勾选、回收站信息（30 天恢复）、隐私链接

**本地状态**：`exportLoading('json'|'csv'|null)`、`privacyAck`

**Store**：读 `usePowerStationStore` / `useAuthStore` / `useDeviceStore`；写 updateSettings（保存隐私确认）

**实现**：纯客户端 blob 下载

---

### 3.17 BleDebugPage `/ble-debug`（开发者）

**用途**：BLE 配网技术调试。

**字段**：BLE 连接、设备信息（名称 / DTUID / AES Key / 状态）、Wi-Fi 配置（SSID / 密码 / BLE key）、充电功率（AC / PV / 合并三寄存器）、命令按钮（GET_VER / GET_SCAN / SET_CONFIG / GET_WIFI_ST / CONFIRM_KEY / RESTART）、日志查看（复制 / 导出 .txt）

**本地状态**：`logs`、`connected`、`busy`、`deviceName`、`dtuid`、`aesKey`、`bleStatus`、`version`、`apList`、`ssid`、`wifiPwd`、`bleKey`

**协议**：`getProvisionManager()`、`computeAesKey()`、`parseBleName()`

---

### 3.18 PassthroughPage `/device/:id/passthrough`（开发者）

**用途**：Modbus 协议透传 —— 发送原始 hex 帧，自动解析响应。

**字段**：预设帧（读数据 7 / 控制 4 / 配置 4）、充电功率（3 寄存器 + 快捷 100/200/300/500/1000W）、自定义 hex 输入 + 发送、日志（TX/RX + 解析摘要 + 错误）

**本地状态**：`logs`、`loading`、`customFrameHex`

**接口 / 协议**：`passthroughDevice(deviceId, hexFrame)`、`parseReadResponse`、`parseRunState`、`parseWarnCode1`、`buildWriteSingleFrame`

---

### 3.19 DebugParamsPage `/device/:id/debug-params`（开发者）

**用途**：展示 UI 使用的全部实时参数（映射值 + 原始字段）。

**字段分组**：电量 / 容量、功率、电压 / 频率、温度、能量统计、开关状态、模式 / 版本、派生参数（输入功率 / 净充电功率 / 是否充电 / 电池容量 / 剩余 Wh / 充满 / 剩余时间）

**Store**：读 `useDeviceStore`（devices / selectedDeviceState）

**接口**：`mapFieldsToRealtime`（无实时轮询，读缓存）

---

### 3.20 ProfileEditPage（SettingPage 内模态）

**用途**：编辑用户资料 —— 昵称、邮箱、密码、头像、徽章兑换。子屏：main / editName / editEmail / editPassword。

**字段**：头像上传、昵称、邮箱（OTP 验证）、密码修改（旧 / 新 / 确认 + 可见切换）、徽章码、退出 / 删除账户

**本地状态**：`profile`、`userId`、`isLoading`、`editingField`、`tempValue`、`isSaving`、`fieldError`、邮箱 OTP 流、密码字段、`showMenu`、`confirmAction`、`showRedeem`、`founderCode`、`founderError`

**接口**：`getUserProfile`、`fetchUserInfo`、`updateUserInfo`、`sendEmailCaptcha(email,'4')`、`updateUserEmail`、`updatePassword`、`saveUserProfile`

---

## 4. 接口层（后端 API）

### 4.1 基础配置

| 项 | 值 |
|----|----|
| Base URL | `https://solar.siseli.com/apis` |
| WebSocket | `wss://solar.siseli.com/openapis/ws` |
| Content-Type | `application/json;charset=UTF-8`（紧凑无空格） |
| 鉴权头 | `IOT-Token`（自定义，非 Bearer） |
| 超时 | 10000ms |
| 重试 | 仅网络错误，最多 2 次，指数退避 600ms×2^n |

**Token 存储**（localStorage）：`iot_access_token`、`iot_refresh_token`、`iot_user_id`

**HTTP 客户端方法**（`src/utils/apiClient.ts`）：`api.get`、`api.post`、`api.postSkipAuth`（登录类）、`api.postNoSign`

### 4.2 请求签名机制（`src/utils/iotSign.ts`）

**凭据**：AppID `rYGQpmYU5k`、AppSecret `GhJXQYEHphHlyiqYnBGE`（可被 localStorage `OPEN_APP_ID`/`OPEN_APP_SECRET` 覆盖）

**算法**（v2024090201）：
1. Body Hash = `SHA256(body)`（GET 为空串）
2. 合并 URL 参数 + 公共参数（`IOT-Open-AppID` / `IOT-Open-Nonce` / `IOT-Open-Body-Hash`）
3. 按 key 字典序排序
4. 拼接 `k=v&k2=v2`（UTF-8 原值，不 URL 编码）
5. Base64
6. `HmacSHA256(base64, AppSecret)`
7. `MD5(hmac)` → 最终签名

**注入头**：`IOT-Open-AppID`、`IOT-Open-Nonce`（32 hex）、`IOT-Open-Body-Hash`、`IOT-Open-Sign`

**密码处理**：所有密码先 `MD5(明文)` 再传输（HTTPS 之上）。

### 4.3 响应与错误码

```ts
interface ApiResponse<T> { code: number|string; message?; msg?; localMessage?; data?: T }
```
- 成功：`0` / `'0'` / `200` / `'200'` / `'success'`
- 鉴权过期：`401` / `1001` / `1002` → 自动调 refresh 重试，失败则派发 `auth:expired` 事件 → 清会话跳登录

### 4.4 完整接口表

**Auth（`src/api/authApi.ts`）**

| 功能 | 方法 | 端点 | Token | 签名 |
|------|------|------|:----:|:----:|
| 账号登录 | POST | `/login/account` | ✗ | ✓ |
| 邮箱登录 | POST | `/login/email` | ✗ | ✓ |
| 短信登录 | POST | `/login/sms` | ✗ | ✓ |
| 邮箱注册 | POST | `/user/register/email` | ✗ | ✓ |
| 手机注册 | POST | `/user/register/cellphone` | ✗ | ✓ |
| 检查账号 | GET | `/user/account/check` | ✓ | ✓ |
| 检查邮箱 | GET | `/user/email/check` | ✓ | ✓ |
| 发送邮箱验证码 | POST | `/user/send/email/captcha` | ✗ | ✓ |
| 发送短信验证码 | POST | `/user/send/sms/captcha` | ✗ | ✓ |
| 刷新 Token | POST | `/login/refresh/access/token` | ✗ | ✓ |
| 登出 | POST | `/login/logout` | ✓ | ✓ |
| 获取用户信息 | POST | `/user/select/iotUserInfo` | ✓ | ✓ |
| 更新用户信息 | POST | `/user/update/iotUserInfo` | ✓ | ✓ |
| 更新邮箱 | POST | `/user/update/iotUserEmail` | ✓ | ✓ |
| 更新手机 | POST | `/user/update/iotUserCellphone` | ✓ | ✓ |
| 修改密码 | POST | `/user/update/authPassword` | ✓ | ✓ |
| 重置密码 | POST | `/user/reset/password` | ✗ | ✓ |
| 注销账户 | POST | `/user/logout/account` | ✓ | ✓ |

> 验证码 intent：`1`=注册、`2`=重置密码、`3`=登录、`4`=改邮箱。字段名为 `address`。

**Device（`src/api/deviceApi.ts`）**

| 功能 | 方法 | 端点 |
|------|------|------|
| 设备列表 | POST | `/device/list` |
| 设备详情 | GET | `/device/details` |
| 添加设备 | POST | `/device/add/single` |
| 添加设备+电站 | POST | `/device/add/single/addStationTogether` |
| 删除设备 | POST | `/device/delete`（body `{id}` 单个） |
| 更新设备 | POST | `/device/update` |
| 置顶 / 取消置顶 | POST | `/device/pin` · `/device/unpin` |
| 设备状态计数 | GET | `/device/state/count`（10告警/20在线/30离线/40故障） |
| DTU 信息 | GET | `/device/dtu/info` |
| 属性分组 | GET | `/device/query/attribute/group` |

**实时状态 / 控制**

| 功能 | 方法 | 端点 |
|------|------|------|
| 最新状态 | GET | `/remote/device/state/latest` |
| 能量流 | GET | `/remote/device/energy/flow` |
| 简版状态 | GET | `/deviceState/simple/state/latest/v1` |
| 简版能量流 | GET | `/deviceState/simple/energy/flow/v1` |
| 写配置 | POST | `/remote/device/config/write`（toggleAcOut1/2, toggleUsbOut1, toggleSleepMode, setWorkMode, setChargeLimit） |
| 读配置 / 批量 / 缓存 | POST | `/remote/device/config/read` · `/configs/read` · `/configs/cache/get` |
| 透传 | POST | `/remote/device/passthrough`（hex→base64） |
| 快速上报 开/关/支持 | POST/GET | `/remote/device/state/report/fast/start` · `/stop` · `/supported` |
| 历史数据 | POST | `/deviceState/attribute/keys/history`（**毫秒时间戳**） |

**Alarm**

| 功能 | 方法 | 端点 |
|------|------|------|
| 告警列表 | POST | `/alarm/query/list` |
| 最新告警 | POST | `/alarm/getLatestAlarm` |
| 标记已处理 | POST | `/alarm/update/isProcessed` |
| 删除告警 | POST | `/alarm/delete/alarm` |

**Peak Shaving / 调度**

| 功能 | 方法 | 端点 |
|------|------|------|
| 属性分组 | GET | `/peakValley/device/attribute/group` |
| 通用配置 读/写 | GET/POST | `/peakValley/device/general/get` · `/general/set` |
| 完整配置 | GET | `/peakValley/device/get` |
| 自定义配置 | POST | `/peakValley/device/customized/set` |
| 启用/禁用 | POST | `/peakValley/device/enable` |
| 类型 设备/全部 | GET | `/peakValley/types/device` · `/types/all` |

**Apply Modes**：`/deviceApplyMode/modes/main`、`/modes/external`（GET）

**Station**

| 功能 | 方法 | 端点 |
|------|------|------|
| 电站列表 | POST | `/station/list` |
| 电站详情 | GET | `/station/details` |
| 添加 / 更新 / 删除 | POST | `/station/add` · `/station/update` · `/station/delete` |
| 能量流 | GET | `/station/energy/flow` |

> 除登录 / 注册 / 验证码 / 刷新 / 重置密码（无 Token）外，**所有端点均需 IOT-Token + 签名**。

---

## 5. 状态管理（Zustand Stores）

| Store | 文件 | persist key | 持久化字段 |
|-------|------|-------------|-----------|
| authStore | `src/stores/authStore.ts` | `iot-auth` | isAuthenticated, user |
| deviceStore | `src/stores/deviceStore.ts` | `powerflow-device-store` | selectedDeviceId, devices, deviceTotal, isDemoMode |
| notificationStore | `src/stores/notificationStore.ts` | `sierro-notifications` | deletedIds, lastReadAt |
| powerStationStore | `src/stores/powerStationStore.ts` | `powerflow-storage` | settings, selectedDeviceId, devices, peakShavingSettings |
| connectionStore | `src/stores/connectionStore.ts` | 无 | 运行时 |
| provisionStore | `src/stores/provisionStore.ts` | 无 | 运行时 |

### 5.1 authStore
**State**：isAuthenticated, isGuest, user, loading, error, sessionReady
**Actions**：login(username,password)、logout()、clearError()、restoreSession()、setGuestMode()
**会话恢复**：启动 → 查 token → verifySession() → 失败则 refreshAccessToken() → 再失败清会话。监听 `auth:expired` 事件。

### 5.2 deviceStore
**State**：isDemoMode、设备列表（devices/deviceTotal/devicePage/deviceLoading）、选中设备（selectedDeviceId/Details/State/stateLoading）、电站（stations/stationTotal）、告警（alarms/alarmTotal/alarmLoading）、能量流（energyFlow/loading/error）、峰谷（peakValleyConfig/loading/saving/error）、历史（historyData/loading/error）
**Actions**（节选）：loadDevices、loadDeviceDetails、loadDeviceState、selectDevice、addNewDevice、addNewDeviceWithStation、removeDevice、updateDeviceInfo、togglePin、controlDevice、start/stopRealtimeReport、loadAlarms、dismissAlarm、loadStations、createStation、loadPeakValley、enablePeakValley、savePeakValleyGeneral、loadEnergyFlow、loadHistoryData、renameDeviceLocal、loadDemoDevices、exitDemoMode
**竞态保护**：stateRequestSeq / alarmRequestSeq / energyFlowRequestSeq 序号计数防陈旧响应覆盖

### 5.3 powerStationStore
**State**：powerStation、devices、settings(AppSettings)、selectedDeviceId、peakShavingSettings、peakShavingStatus
**Actions**（节选）：setMode、togglePort、updateBatteryLevel、updatePowerData、toggleDevice(s)、deleteDevices、updateSettings、setChargeLimit、updateDeviceName(ById)、updateDeviceSpecs、updateDeviceRealtime、峰谷计划增删改、togglePeakShaving、lookupTOURate(zipCode)、activateFounderBadge、resetAll

### 5.4 notificationStore
**State**：deletedIds、lastReadAt；方法 items(deviceSerial?)、unreadCount(deviceSerial?)
**Actions**：markAllRead、deleteNotification(id)、clearAll（当前源自 demoData）

### 5.5 connectionStore（运行时）
bleConnection、serialConnection、activeDataSource('simulator'|'bluetooth'|'serial')、bleSupported、serialSupported、unreadAlertCount

### 5.6 provisionStore（运行时）
配网向导：step、deviceName、dtuid、版本、apList、selectedSsid、wifiPassword、configResult、wifiStatus、needBleKey、bleKeyVerified、isOperating、logs

---

## 6. 数据库与存储

### 6.1 IndexedDB（`src/db/powerflowDB.ts`）

**库名**：`powerflow-db` · **版本**：3

| ObjectStore | 主键 | 索引 | 内容 | 上限 / 保留 |
|-------------|------|------|------|-----------|
| `power_history` | 自增 id | timestamp | 功率历史 | 8640 条 / 30 天 |
| `alerts` | 自增 id | timestamp, resolved | 告警日志 | 500 条 / 60 天 |
| `connection_logs` | 自增 id | timestamp | 连接历史 | — |
| `commands` | 自增 id | timestamp | 命令审计 | 200 条 |
| `user_profile` | `'profile'` | — | 用户资料 | — |
| `smart_schedule` | `'peak_shaving_settings'` | — | 调度设置 | — |

**关键函数**：savePowerHistory、getPowerHistory、getPowerSummary、addAlert、getAlerts、resolveAlert、getUnresolvedAlertCount、importAlertsFromAPI、getAlertsByDevice、logConnection、logCommand、clearOldPowerHistory（30天）、clearOldAlerts（60天）、clearAllHistory、getDBStats、save/get/clearUserProfile、save/load/clearScheduleSettings

### 6.2 localStorage 键总表

| 键 | 位置 | 内容 |
|----|------|------|
| `iot_access_token` | apiClient | 访问令牌 |
| `iot_refresh_token` | apiClient | 刷新令牌 |
| `iot_user_id` | authStore | 用户 ID（登出用） |
| `iot-auth` | authStore persist | isAuthenticated, user |
| `powerflow-device-store` | deviceStore persist | selectedDeviceId, devices, deviceTotal, isDemoMode |
| `sierro-notifications` | notificationStore persist | deletedIds, lastReadAt |
| `powerflow-storage` | powerStationStore persist | settings, selectedDeviceId, devices, peakShavingSettings |
| `sierro_permissions_asked` | PermissionsGate | "1"=已询问首次权限 |
| `sierro-sleep-{deviceId}` | useSleepModeScheduler | 睡眠计划（enabled/from/to） |
| `sierro-sleep-phase-{deviceId}` | useSleepModeScheduler | 上次相位 sleep/wake |
| `sierro-display-icon-{deviceId}` | DeviceDetailPage/DevicePage | 设备显示图标 |
| `sierro-rtpower-{deviceId}-{date}` | DeviceMonitorPage | 日实时功率缓存 |
| `sierro-rtsamples-{deviceId}-{date}` | DeviceMonitorPage | 实时样本（≤600） |
| `powerflow_offline_cmd_queue` | useOfflineSync | 离线命令队列 |
| `OPEN_APP_ID` / `OPEN_APP_SECRET` | iotSign | 凭据覆盖（开发用） |

### 6.3 离线同步队列（`src/hooks/useOfflineSync.ts`）

```ts
interface PendingCommand { id; deviceId; key; value; queuedAt; retryCount }
```
在线即时发送；离线入队 localStorage；网络恢复按序重放（最多 3 次重试），并 `fetchRecentHistory` 补全历史。

---

## 7. 权限体系

### 7.1 路由鉴权（`src/App.tsx`）

`RequireAuth`：`!isAuthenticated && !isGuest` → 重定向 `/login`。
- **公开**：`/login`、`/register`、`/forgot-password`、`/terms`、`/privacy`
- **受保护**：其余全部（含 `/ble-debug`、`/data-export`、`/device/*` 调试页 —— 均已加守卫）

### 7.2 游客模式
`setGuestMode()` 后仅加载 `src/data/demoData.ts` 演示数据；`isDemoMode` 在所有 deviceStore 方法入口处拦截，**不发任何真实 API 请求**；不持久化（刷新即退出）。

### 7.3 浏览器权限（`src/utils/permissions.ts` + `PermissionsGate.tsx`）

| 权限 | API | 用途 | 超时 |
|------|-----|------|------|
| 通知 | `Notification.requestPermission()` | 停电 / 告警推送 | 8s |
| 摄像头 | `getUserMedia({video})` | 扫码 / 头像 | 10s |
| 蓝牙 | `navigator.bluetooth` | 配网 / 配对 | 30s |
| 网络 | `navigator.onLine` + connection | 可达性 | — |
| 存储 | `localStorage` + `storage.persist()` | 持久化配额 | 5s |

首次启动经 `PermissionsGate` 依序请求（不重叠），置 `sierro_permissions_asked=1` 后不再弹。
（注：原 SettingPage 内的 `PermissionsManager` 重测区块已按需求移除；`PermissionsManager.tsx` 组件文件仍保留。）

---

## 8. 数据模型（Types）

### 8.1 实时字段 `DeviceRealtimeFields`（`src/types/index.ts`）
电量（remainingBatteryCapacity / batteryCapacity / batteryCurrent / numberOfBatteryUsageCycles）、功率（acPower=exchangeChargingPower / solarPower=generationPower / outputPower / batteryPower）、电压频率（acInput/Output Voltage/Frequency / solarInputVoltage）、温度（batteryTemp=cellTemperature1 / cell2/3 / mppt / dcdc）、能量统计（pvGeneratedEnergyOfDay / totalPVGeneratedEnergy / accumulatedCharging/DischargeTime）、开关状态（acOut1/2Enable / usbOut1Enable / photovoltaicCharging / mainsCharging / bypassStatus / noLoadShutdown / sleepMode）、模式（workMode 0正常/1备份/2节能）、版本（hardware/software/inverter）

### 8.2 设备 `Device`
本地（id / name / type / status / batteryLevel / isOn / power）+ 云端元数据（deviceId / serialNumber / model / firmwareVersion / stationId / isOnline / isAlarmed / isPinned / lastOnlineAt）+ 实时字段子集

### 8.3 设置 `AppSettings`
notifications、pushNotifications、doNotDisturb(+start/end)、language、units、cloudSync、bluetooth、chargeLimit、ecoMode、overTempProtection、overDischargeProtection、founderBadge(+activatedAt/number)、pushLowBattery、lowBatteryThreshold、deviceIconColor、sleepMode、batteryMode、pushSolarStatus

### 8.4 峰谷 `PeakShavingSettings` / `PeakShavingSchedule` / `TOURateInfo` / `PeakShavingStatus`
计划（id/name/startTime/endTime/type/enabled）、设置（enabled/schedules/peak·offPeak·partPeak Price/maxCharge·DischargePower/min·maxBatteryLevel/zipCode/touRateInfo/chargingEfficiency/depthOfDischarge/executionRate）、状态（isActive/currentMode/estimatedSavings/today·monthlySavings）

---

*文档结束。如需更深入的单页面字段级表格或单接口的完整请求/响应 TS 类型，可在此基础上展开。*
