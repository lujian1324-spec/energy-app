# Sierro Energy App — QA 测试报告

> 测试方式：**代码级静态验证**（逐个对照 QA Checklist v1.1 审查实现，未在真机/浏览器交互运行）
> 测试日期：2026-06-25 ｜ 分支：`main` ｜ 范围：14 个模块
> 图例：✅ 通过 ｜ ❌ 失败 ｜ ⚠️ 部分/有缺陷 ｜ 🔬 需真机手测

---

## 总览

| 模块 | 通过 | 失败/缺陷 | 需手测 |
|------|------|-----------|--------|
| 1. 权限页 | 7 | 0 | 0 |
| 2. 登录/注册/找回 | 18 | 1 (2.1.8) | 0 |
| 3. 设备列表 | 14 | 1 (3.4 弱) | 0 |
| 4. 设备详情/监控/设置 | 9 | 0 | 0 |
| 5. Insights/Stats/Overview | 9 | 1 (5.4) | 0 |
| 6. 智能调度 | 3 | 1 (6.4) | 0 |
| 7. BLE 配网 | 7 | 0 | 部分🔬 |
| 8. 通知 | 5 | 0 | 1 (8.4) |
| 9. 设置/账户 | 8 | 1 (9.8) | 0 |
| 10. 路由守卫 | 5 | 0(1 注) | 0 |
| 11. UI 设计系统 | 7 | 0(2 注) | 0 |
| 13. 接口签名 | 5 | 0 | 0 |

**关键缺陷 7 项**（详见末尾），其中 **3 项合规级**。

---

## 1. 首次启动权限页 (PermissionsGate) — 全部 ✅

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 1.1 | 四项权限说明 | ✅ | permissions.ts:253-289；PermissionsGate.tsx:107-117 |
| 1.2 | Allow All 顺序授权→All Set | ✅ | PermissionsGate.tsx:53-65, 137-171 |
| 1.3 | 不卡死（超时兜底） | ✅ | withTimeout：通知 8s/相机 10s/蓝牙 30s/存储 5s（permissions.ts:39-44）注：蓝牙单步 30s 略超 28s |
| 1.4 | Asking 中 Continue 逃生 | ✅ | PermissionsGate.tsx:194-201 |
| 1.5 | Skip for now | ✅ | PermissionsGate.tsx:67-70 |
| 1.6 | 只问一次 | ✅ | localStorage flag，App.tsx:76,89-91 |
| 1.7 | 拒绝显示 Denied(橙) | ✅ | PermissionsGate.tsx:74-75 `#FF9500` |

## 2. 登录 / 注册 / 找回密码

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 2.1.1-2.1.7 | 用户名/邮箱/验证码登录、错误处理、游客、条款 | ✅ | LoginPage.tsx:17,119-141,166-321 |
| **2.1.8** | **无硬编码测试账号（合规）** | **❌** | authStore.ts:51 内置后门 `benson/benson1324`；public/api-test.html:71,75 预填；login-debug-latest.json、e2e、docs 含真实账号 `jason1324/jjww1324-LJ` |
| 2.2.1-2.2.4 | 注册表单校验/倒计时/密码规则/成功跳转 | ✅ | RegisterPage.tsx:34-39,50,73-79,179-197 |
| 2.3.1-2.3.7 | 找回密码布局/校验/视口/重置/无 account error/重发 | ✅ | ForgotPasswordPage.tsx:88-209；authApi.ts:381-387（account 为空时正确省略）|

## 3. 设备列表 (DevicePage)

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 3.1 | 真实设备加载 | ✅ | DevicePage.tsx:163-175；deviceStore.ts:184-207 |
| 3.2 | 空状态 | ✅ | DevicePage.tsx:572-593 |
| 3.3 | 加载骨架 | ✅ | DevicePage.tsx:489-494 |
| **3.4** | **错误重试** | **⚠️** | loadDevices 吞掉异常（deviceStore.ts:204-206），有缓存设备时错误/Retry 几乎不出现 |
| 3.5 | 下拉刷新 | ✅ | DevicePage.tsx:458 |
| 3.6 | 进详情 | ✅ | DevicePage.tsx:287-290,513 |
| 3.7 | 铃铛+红点 | ✅ | DevicePage.tsx:425-434 |
| 3.8 | 游客 Demo | ✅ | deviceStore.ts:584-605 |
| 3.9.1-3.9.7 | 扫码/手动/校验/建站/选站/成功/失败 | ✅ | ManualAddDeviceModal.tsx:36-88；DevicePage.tsx:796,949-957 |
| 附 | Battery/Sun 图标已导入（修复确认） | ✅ | DevicePage.tsx:23-24 |

## 4. 设备详情 / 监控 / 设置 — 全部 ✅

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 4.1 | 实时数据 | ✅ | DeviceMonitorPage.tsx:268-298,451-492 |
| 4.2 | 重命名持久化（string id，无溢出） | ✅ | DeviceDetailPage.tsx:182；deviceStore.ts:330 |
| 4.3 | 乐观更新+回滚 | ✅ | DeviceDetailPage.tsx:174-196 |
| 4.4 | Save loading | ✅ | DeviceDetailPage.tsx:180,314 |
| 4.5 | 删除单 id（string） | ✅ | DeviceDetailPage.tsx:222-227；deviceStore.ts:307 |
| 4.6 | 删除失败处理 | ✅ | DeviceDetailPage.tsx:228-237 |
| 4.7 | 监控曲线 | ✅ | DeviceMonitorPage.tsx:244-350 |
| 4.8 | 设备信息 | ✅ | DeviceInfoPage.tsx:57-59（注：型号/健康度硬编码）|
| 4.9 | 游客本地操作 | ✅ | deviceStore.ts:294-329 |

## 5. Insights / Stats / Overview

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 5.1 | Insights 渲染 | ✅ | StatsPage.tsx:836-954 |
| 5.2 | 周期切换 | ✅ | StatsPage.tsx:544-571,737-745 |
| 5.3 | Overview 汇总 | ✅ | OverviewPage.tsx:195-217,552-583 |
| **5.4** | **数据导出** | **❌** | DataExportPage 逻辑完整但**未注册任何路由**，应用内不可达 |
| 5.5 | 空数据占位 | ✅ | StatsPage.tsx:433-444,702-717 |
| 附(a-e) | deviceId string/String()比较/settings/电池时间/ms 时间戳 | ✅ | 全部修复确认（StatsPage.tsx:482-485,623,629；OverviewPage.tsx:82；deviceStore.ts:535-557）|

## 6. 智能调度 (SmartSchedule)

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 6.1 | 加载 | ✅ | SmartSchedulePage.tsx:84 |
| 6.2 | 创建/编辑/保存 | ✅ | SmartSchedulePage.tsx:144-222 |
| 6.3 | Toggle 微交互 | ⚠️ | 用滑块平移而非 scale 0.95→1（SmartSchedulePage.tsx:336-345）|
| **6.4** | **无独立 Peak Shaving 入口（合规）** | **❌** | OverviewPage.tsx:803 仍有 Peak Shaving 入口且 `/peak-shaving` 路由不存在→静默跳 /devices |
| 附 | string deviceId（无 Number()） | ✅ | SmartSchedulePage.tsx:113,139,147,155 |

## 7. BLE 配网 (ProvisioningPage) — 全部 ✅（真机行为需手测🔬）

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 7.1 | 蓝牙扫描 | ✅ | ProvisioningPage.tsx:217-242,546-571 |
| 7.2 | 无权限页 | ✅ | ProvisioningPage.tsx:201-213,410-442 |
| 7.3 | Open Settings（原生+web兜底） | ✅ | openAppSettings.ts:13-35 |
| 7.4-7.6 | WiFi 配网/成功绑定/失败重试 | ✅ | ProvisioningPage.tsx:294-344,980-996 |
| 7.7 | QR 扫码 jsQR | ✅ | ProvisioningPage.tsx:13,88 |

## 8. 通知 (NotificationsPage)

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 8.1 | 倒序 | ✅ | deviceStore.ts:384 |
| 8.2 | 已读清红点 | ✅ | OverviewPage.tsx:291,520 |
| 8.3 | 空状态 | ✅ | NotificationsPage.tsx:225-237 |
| 8.4 | 告警跳转设备 | ⚠️🔬 | 设备已按 selectedDeviceId 过滤，但告警行不可点击深链跳转 |
| 附 | string deviceId/双区布局/去重 | ✅ | NotificationsPage.tsx:153,165-172,240-264 |

## 9. 设置 / 账户 (SettingPage)

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 9.1-9.7 | 设置页/游客/管理账户/编辑资料/反馈/删除账户/退出 | ✅ | SettingPage.tsx:79,110-549；authApi.ts:391-393 |
| **9.8** | **无隐藏调试入口（合规）** | **⚠️❌** | 版本为纯文本✅，但 `/ble-debug` 路由**未加 RequireAuth**，可凭 URL 直达（App.tsx:144）|
| 9.9 | 版本号 | ✅ | v3.13.0（version.json:2）|

## 10. 路由与守卫 — 全部 ✅

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 10.1 | 未登录守卫 | ✅ | App.tsx:31-38,170 |
| 10.2 | 已登录回跳 | ✅ | App.tsx:106-108 |
| 10.3 | HashRouter | ✅ | main.tsx |
| 10.4 | 404 兜底 | ✅(注) | App.tsx:182-185（静默重定向，无专门 404 页）|
| 10.5 | 静态页 | ✅ | TermsPage/PrivacyPage |
| 附 | navigate 目标核对 | ⚠️ | `/peak-shaving` 无对应路由（见缺陷）|

## 11. UI / 设计系统 — 全部 ✅（2 处一致性注记）

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 11.1-11.3 | 深色/主色/字体 | ✅ | tailwind.config.js:18-21,45,100-108 |
| 11.4 | 触控≥48dp | ✅(注) | 主 CTA≥48px；个别图标按钮 40px |
| 11.5 | 焦点环 | ✅ | 主色 focus 样式 |
| 11.6 | 安全区 | ✅ | index.css:91-96 |
| 11.7 | 圆角 token | ✅(注) | token 正确，部分仍用 legacy rounded-xl |

## 13. 接口与签名 — 全部 ✅

| # | 用例 | 结果 | 证据 |
|---|------|------|------|
| 13.1 | HMAC 签名 | ✅ | iotSign.ts:80-117；apiClient.ts:144-166 |
| 13.2 | Token 刷新重试 | ✅ | apiClient.ts:50-92,224-232 |
| 13.3 | 会话恢复 | ✅ | authStore.ts:138-167 |
| 13.4 | 错误码 message | ✅ | LoginPage.tsx:108,127 |
| 13.5 | 超时处理 | ✅ | apiClient.ts:131,174,197（10s）|

---

## 🐞 关键缺陷清单（按优先级）

### 合规级（App Store / 安全）
1. **后门测试账号** — `authStore.ts:51` 内置 `benson/benson1324` 绕过真实 API，随包发布。**违反 2.1.8。**
2. **真实凭据入库** — `login-debug-latest.json:12-13`、`tests/e2e.spec.ts:267`、`docs/TEST_CHECKLIST.md:5` 含可用账号 `jason1324/jjww1324-LJ`；`public/api-test.html:71,75` 预填凭据且对外可访问。
3. **未守卫调试页** — `/ble-debug`（App.tsx:144）无 RequireAuth，任何人可凭 URL 直达。**违反 9.8。**

### 功能级
4. **`/peak-shaving` 路由缺失** — OverviewPage.tsx:803,807 导航到未声明路由，静默跳转 /devices；同时违反"已移除 Peak Shaving"合规要求（6.4）。version.json 变更日志却宣称已上线。
5. **DataExportPage 不可达** — 实现完整但无任何路由引用（5.4 失败）。
6. **设备列表错误重试形同虚设** — loadDevices 吞异常（deviceStore.ts:204-206），有缓存时 Retry 不出现（3.4）。
7. **遗漏的 Long 溢出** — `deviceStore.ts:409`（dismissAlarm 内 `loadAlarms(Number(...))`）与 `useOfflineSync.ts:179` 仍用 `Number(deviceId)`，重新引入溢出风险。

### 次要
- DeviceInfoPage 型号硬编码 `Sierro 1000`、健康度硬编码 100%（DeviceInfoPage.tsx:56,72）
- StatsPage 电池健康硬编码 100（StatsPage.tsx:618）
- 设备参数弹窗为死代码（无 setShowDeviceParams 调用）
- 通知行无深链跳转（8.4）
- 部分按钮 40px <48dp、个别 legacy 圆角
