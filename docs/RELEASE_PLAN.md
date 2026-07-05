# Sierro Energy App — 发布审查与开发规划

> 目标：将 App 发布到 **Apple App Store** 与 **Google Play**。
> 本文档由**七维度审查**（商店合规 / 架构 / 安全 / 原生就绪 / 测试与发布工程 / 产品 UX / 正确性 bug）汇总，
> 高严重度结论经读码核实。已修复项标注 **✅DONE(版本号)**，待办标注 P 级别。
> 使用方式：按 P0 → P3 / M1 → M6 推进；每项含"问题 / 影响 / 建议 / 工作量"。

## 进度快照（截至 v3.31.x）

| 已完成 ✅ | 版本 |
|---|---|
| P0-1 删除公开泄露的 api-test.html / test_api.py | v3.30.1 |
| P0-2 删除账号真正调用 API | v3.31.0 |
| P0-5 iOS 相册用途声明 | v3.31.0 |
| P1-5 发布版隐藏 Modbus/Debug/BLE 调试页与入口 | v3.31.0 |
| P1-6 ITSAppUsesNonExemptEncryption + PrivacyInfo.xcprivacy | v3.31.0 / v3.31.x |
| P1-1 移除虚假分析声明与空开关（隐私一致） | v3.31.x |
| P1-4 Android versionName 由 version.json 注入、versionCode 由 CI 传入 | v3.31.x |
| 安全：allowBackup=false + data_extraction_rules（token 不可 adb 导出） | v3.31.x |
| BUG R1 回归：速报模式离线设备显示 Connected+冻结读数 → 修正在线判定 | v3.31.x |
| BUG R1 回归：速报会话可能被遗留高频上报 → 修正 ref 时序 | v3.31.x |
| 质量：CI e2e 改测 PR 自身构建（不再测线上）；真实账号凭据移入 env | v3.31.x |

| 仍待办（需产品决策/外部依赖） | 级别 |
|---|---|
| P0-3 品牌图标/启动图（需设计出图） | 阻断 |
| P0-4 推送首发实现 or 裁剪（需后端 + APNs/FCM 账号） | 阻断 |
| M4 Android release 签名 + AAB / iOS TestFlight（需证书/keystore） | 阻断 |
| P2 双 store 退役、API 归一化、实时链路收口 | 债 |
| P3 单元测试(Vitest)、崩溃监控(Sentry)、代码分割 | 护栏 |

---

## 0. 第一性原理：这个 App 要成立，必须回答三个问题

1. **数据可信** —— 展示的电量/功率/状态是真实、新鲜的（已在 v3.27.6/v3.29.0 大幅加固：CRC 校验、失效回退、速报优先）。
2. **命令可达** —— 开关/充电功率/配网真的送达设备，失败有反馈（透传控制链路已建立）。
3. **可上架且可信任** —— 满足两大商店的合规红线，不泄露密钥，不误导用户。**当前差距集中在第 3 点。**

前两点工程上已相当扎实；本规划的重心是**第 3 点(上架合规 + 安全)**,以及支撑长期迭代的**技术债清偿**。

> **CI 状态说明**：Web 部署(GitHub Pages)、Android APK、E2E 均绿。唯一红叉是 `Build iOS App`
> 编译烟雾测试(已标记 `continue-on-error`,非阻断)。根因:`@capacitor/status-bar@8.0.2` 的
> `StatusBar.swift` 通过 `bridge.webView` / `bridge.viewController` 访问 bridge,与 CI 上 SPM 解析的
> `capacitor-swift-pm` 的 `CAPBridgeProtocol` 不兼容(`has no member 'webView'`)。属 M4 iOS 工作,
> 需在 macOS + Xcode 上对齐 Capacitor 版本组合(或 patch/替换 status-bar 的状态栏方案)后验证。

---

## P0 — 上架阻断项（不修则被拒 / 安全事故，必须最先做）

### P0-1 🔴 公开发布的调试控制台泄露 AppSecret ✅
- **问题**：`public/api-test.html` 被 git 跟踪 → 打进 `dist` → 随 GitHub Pages 公开发布。文件内含硬编码 AppSecret（5 处密钥/密码字样）。`test_api.py`（本地未跟踪）也含真实账号密码。
- **影响**：任何人可访问该页面拿到签名密钥，伪造平台 Open API 请求。安全事故级。
- **建议**：① 立即从仓库删除 `public/api-test.html`、`test_api.py`；② 向平台方申请**轮换 AppSecret**（视为已泄露）；③ 长期把签名迁到后端代理（见 P2-4）。
- **工作量**：删除 10 分钟；密钥轮换依赖平台方。

### P0-2 🔴 "删除账号"是假的 ✅
- **问题**：用户可达的删除入口在 `ProfileEditPage`（`SettingPage.tsx:554` 打开）。其确认处理 `handleConfirm`（`ProfileEditPage.tsx:228-234`）**只调用 `logout()`，从不调用 `deleteAccount()`**。真正调 `deleteAccount()` 的 modal 在 `SettingPage.tsx:475`,但 `setShowDeleteConfirm(true)` 只存在于 `DeviceDetailPage`（那是删设备)——SettingPage 的账号删除弹窗是死代码。
- **影响**：违反 **Apple 5.1.1(v)** 与 **Google Play 账号删除政策**;且弹窗文案称"永久删除账号和所有数据"却只登出,构成误导(Apple 2.3.1)。**两家商店都会拒。**
- **建议**：把 `ProfileEditPage` 的删除确认接到 `deleteAccount()`（含失败处理 + 成功后清理本地数据/登出）；Play 另需提供**网页版删除入口 URL**。
- **工作量**：0.5 天。

### P0-3 🔴 App 图标与启动图是 Capacitor 默认占位图 ✅
- **问题**：iOS `AppIcon-512@2x.png`、Android 各密度 `ic_launcher_foreground.png`、双端 splash 均为 Capacitor 默认蓝色 "X" logo + 白色启动图。白色 splash 还与深色 App(`#141414`)冲突造成启动闪白。
- **影响**：**Apple 2.3.8 / 2.1** 直接拒;Play 要求正式品牌图标。
- **建议**：用 Sierro 品牌图制作 1024×1024 主图,经 `@capacitor/assets` 生成全套(含 Android 自适应图标前景/背景、深色 splash);另需商店素材:1024 商店图标、Play 特色图、双端截图。
- **工作量**：设计出图后 0.5 天集成;设计另计。

### P0-4 🔴 推送在两端都无法工作 ✅
- **问题**：App 启动即申请推送权限并注册(`nativePush.ts:20-72`),Settings 页主打"停电/低电量/太阳能"推送开关,但:① iOS 无任何 `.entitlements`、无 `aps-environment`(Push 能力未开);② Android 缺 `android/app/google-services.json`(FCM 不可用,`build.gradle` 已注明"Push 不工作");③ 后端 token 注册端点在 `webPush.ts` 标注"待后端实现",VAPID 公钥为空。
- **影响**：**停电告警这个核心安全卖点完全不可用**,却向用户申请权限——Apple 2.1 完成度拒审风险 + Play 权限滥用信号。
- **建议**：先决定推送是否作为**首发功能**。
  - 若首发:开 Apple Push 能力 + 上传 APNs Key + 加 entitlements;建 Firebase 项目 + `google-services.json`;后端实现 token 注册与推送下发。
  - 若延后:**移除/隐藏推送开关和启动时的权限申请**,避免"申请了却不能用"被拒。
- **工作量**：完整实现 3-5 天(依赖后端);首发裁剪 0.5 天。

### P0-5 🟠 iOS 缺相机相册用途声明(链接了 @capacitor/camera)✅
- **问题**：`Package.swift` 链接了 `CapacitorCamera`,但 `Info.plist` 只有蓝牙/相机/本地网络用途,缺 `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription`。而实际拍照走 `getUserMedia`、头像走 `<input type=file>`,插件仅用于权限检查。
- **影响**：App Store 上传静态检查 **ITMS-90683** 拒绝。
- **建议**：二选一——补两条相册用途字符串;**或**直接从 `package.json`/`Package.swift` 移除未真正使用的 `@capacitor/camera`(更干净)。
- **工作量**：0.5 小时。

### P0-6 🟠 Apple 审核需要可用 Demo 账号 + 硬件流程说明 ✅
- **问题**：App 登录依赖 `solar.siseli.com`;核心流程(配网、控制)依赖真实设备。Apple 审核需在备注里给全功能 Demo 登录。已有游客模式但不足以展示设备控制。
- **建议**：准备专用审核账号;在 App Review 备注中说明 BLE 配网/控制需实体设备,并附演示视频。
- **工作量**：0.5 天(账号 + 备注 + 录屏)。

---

## P1 — 上架前应修（合规瑕疵 + 数据正确性风险）

### P1-1 🟠 隐私声明与实际数据实践不符
- **问题**：隐私政策/隐私 UI 提到分析、崩溃上报、社交登录等**并不存在**的功能;`DataExportPage` 的"Anonymous Analytics"开关**不控制任何东西**;反馈表单经 EmailJS 把用户邮箱发给第三方(`SettingPage.tsx:109 from_email`)。
- **影响**：若照抄隐私政策填 Play Data safety / Apple 隐私标签,申报会与事实不符——合规风险。
- **建议**：让隐私政策与真实数据流一致(采集:邮箱、推送 token、反馈内容经 EmailJS);移除或真正实现分析开关;把 EmailJS 第三方共享写入隐私标签。
- **工作量**：1 天(文案 + 移除空开关)。

### P1-2 🟠 登录后仍可能被喂 Demo 假数据
- **问题**：`isDemoMode` 被持久化,真实登录后若未正确清除,认证用户可能看到 demo 假设备。
- **影响**：数据可信性红线;用户可能对着假数据做操作。
- **建议**：登录成功强制 `isDemoMode=false` 并清 demo 持久化;给 store 加 persist 版本迁移。
- **工作量**：0.5 天。

### P1-3 🟠 历史数据缓存会污染自身(IndexedDB)
- **问题**：历史管线 cache-first 无 TTL、旧读路径无 deviceId 过滤、通配 deviceId 匹配、重复写入。
- **影响**：Insights 图表可能显示过期或跨设备串味数据。
- **建议**：缓存加 TTL + 严格按 deviceId 过滤;写入去重。
- **工作量**：1 天。

### P1-4 🟠 iOS/Android 版本号停在 1.0
- **问题**：`android/app/build.gradle` versionCode 1 / versionName "1.0";iOS `MARKETING_VERSION 1.0` / `CURRENT_PROJECT_VERSION 1`。与 `package.json` 3.30.0 脱节。
- **影响**：商店版本管理混乱;versionCode 不递增无法上传新构建。
- **建议**：构建时由 `version.json` 注入 versionName,versionCode 用 CI 构建号自增(见 P3-1)。
- **工作量**：0.5 天。

### P1-5 🟡 面向消费者的调试页应隐藏
- **问题**：`/ble-debug`、`/device/:id/debug-params`(`DeviceDetailPage:582` 有入口)、`/device/:id/passthrough` 在生产可达。含原始寄存器、Modbus 透传控制台。
- **影响**：普通用户误入可能误操作设备;观感不专业。
- **建议**：用构建期开关(`import.meta.env.DEV` 或隐藏手势)门控这些路由与入口,发布版不暴露。
- **工作量**：0.5 天。

### P1-6 🟡 ITSAppUsesNonExemptEncryption 未设 + 缺隐私清单
- **问题**：`Info.plist` 未设 `ITSAppUsesNonExemptEncryption`;iOS 无 `PrivacyInfo.xcprivacy`。
- **影响**：每次上传都被追问出口合规;2024 起 Apple 要求隐私清单声明 API 使用原因(UserDefaults 等)。
- **建议**：App 仅用标准 HTTPS/MD5 → `ITSAppUsesNonExemptEncryption=false`;添加 `PrivacyInfo.xcprivacy` 声明 UserDefaults/文件时间戳等 required-reason API。
- **工作量**：0.5 天。 **✅DONE v3.31.x**(iOS 已加 `PrivacyInfo.xcprivacy`,但需在 Xcode 里把该文件加入 App target 的 Copy Bundle Resources——pbxproj 手改易错,留待 Xcode 打开时确认)。

---

## P1.5 — 七维度审查补充发现（UX / 原生,发布前应处理）

### U-1 🟠 Insights 在历史接口出错时，向真实用户静默展示伪造的 Demo 能源/CO₂ 数据
- **问题**：`StatsPage.tsx:481` `useDemo = !!historyError && !historyLoading`,出错即回退 `getDemoChartFrame`。真实登录用户历史 API 失败时,页面渲染合成功率曲线,CO₂ 卡片基于伪造数据算环保收益,**无"模拟数据"横幅、无错误+重试**。
- **影响**：错误被伪装成看似真实的数字——数据可信红线;缺 error+retry 状态。
- **建议**：真实用户(`!isDemoMode`)出错时显示 error + retry,不回退 demo 数据;demo 数据仅游客模式用。
- **工作量**：0.5 天。

### U-2 🟡 `text-ink-7`(#595959)正文对比度不达 WCAG AA
- **问题**：#595959 在 ink-12 背景约 2.6:1、卡片 ink-10 约 2.2:1,低于 AA 4.5:1(正文)/3:1(大字)。用于 Notifications/SmartSchedule/Login/Stats/Terms 的真实内容文本。
- **影响**：可访问性;部分地区商店/企业采购有硬性要求。
- **建议**：正文文本从 `ink-7` 提到 `ink-6`(#8C8C8C,约 3.5:1)或更亮;`ink-7` 仅用于超大字或装饰。
- **工作量**：0.5-1 天(逐页核对)。

### U-3 🟡 DataExport 回收站是硬编码的空壳
- **问题**：Recycle Bin 为非功能占位 UI。
- **建议**：实现 30 天软删除回收站,或在发布版隐藏该区块。
- **工作量**：实现 1-2 天 / 隐藏 0.5 小时。

### N-1 🟡 targetSdk 36 强制 edge-to-edge 与 `setOverlaysWebView({overlay:false})` 冲突
- **问题**：Android 15+(SDK 35+)强制全面屏沉浸,`overlay:false` 与 App 自有 safe-area 处理可能叠加出错(状态栏区域重复留白或被内容顶穿)。
- **建议**：真机(Android 15)验证状态栏/导航栏留白;必要时改用 edge-to-edge + WebView 内 safe-area padding 统一方案。
- **工作量**：0.5-1 天。

---

## P2 — 架构与安全技术债（发布后持续,但越早越省）

### P2-1 双 Store 退役
- **问题**：mock `powerStationStore` 仍活在 **11 个文件**,还持有真实用户 `settings`,并持久化第二份 `devices/selectedDeviceId`。
- **建议**：`deviceStore` 作为唯一设备事实源;`settings` 迁到独立 `settingsStore` 或并入 deviceStore;删除 mock。e2e 护航,分 2-3 次小步迁移。
- **工作量**：2-3 天。

### P2-2 API 层归一化
- **问题**：`ApiResponse<unknown>` 出现 52 次,手写 `code===0` 检查残留 36 处;`authStore.isSuccess` 还接受 `200/'success'`,与平台标准 `0/'0'` 不一致。
- **建议**：集中 typed mapper + 统一 `isApiSuccess`;与后端确认 success 语义。
- **工作量**：1-2 天。

### P2-3 实时链路收口
- **问题**：`useLiveDeviceStatus` 只用在 Overview;`DeviceMonitorPage` 自带非可见性门控的 30s 轮询 + 第三套 localStorage 图表管线。
- **建议**：DeviceMonitor 也接 `useLiveDeviceStatus`;统一图表数据源。
- **工作量**：1 天。

### P2-4 密钥与令牌
- **问题**：AppSecret 仍作为前端 bundle 兜底(可还原);token 存 localStorage(WebView XSS 可读);参考推送后端 `INTERNAL_KEY` 未设时 `/notify` 无鉴权 + CORS 全开;BLE 配网 AES 密钥 = `MD5(DTUID+"SEC_")` 且 IV=密钥(弱、可公开推导,保护 Wi-Fi 凭据)。
- **建议**：签名迁后端代理;原生用 Capacitor Secure Storage 存 token;推送后端强制鉴权 + 收紧 CORS;BLE 弱加密向平台方反馈(需固件配合)。
- **工作量**：签名迁移 2-3 天;其余各 0.5 天。

### P2-5 巨型文件拆分
- **问题**：13 个文件 >600 行;OverviewPage/DevicePage/deviceApi/ProvisioningPage/StatsPage 混合取数、缓存、图表、弹窗。
- **建议**：抽 hooks(取数/轮询/图表)与子组件;优先 OverviewPage、DevicePage。
- **工作量**：分页面各 0.5-1 天。

### P2-6 清理残留死代码
- **问题**：模拟器时代残留 `usePowerHistorySampler`、`smart_schedule` IDB helpers、未用 `clearAllHistory`;authStore↔deviceStore 循环 import(靠 `noUnusedLocals=false` 才编译)。
- **建议**：删除死代码;打破循环依赖。
- **工作量**：0.5 天。

---

## P3 — 测试与发布工程（护栏,支撑长期迭代）

### P3-1 版本 + 发布自动化
- 由 `version.json` 注入 Android versionName / iOS MARKETING_VERSION;versionCode/build 用 CI run number 自增。
- Android CI 目前只出 debug APK → 增加 **release AAB**(签名 keystore 走 CI secret);iOS CI 目前只出无签名模拟器包 → 接 **TestFlight**(fastlane 或 Xcode Cloud,需证书)。
- **工作量**：1-2 天(不含证书申请)。

### P3-2 单元测试(当前为 0)
- 最高价值纯函数目标:`modbusProtocol`(CRC/decodeLiveStatus/REG_DESC 枚举)、`batteryTime`、`alarmText`、`iotSign`、`apiClient` 重试。
- 用 **Vitest**(与 Vite 5 天然契合)。协议层已用合成帧手工验证过,固化为回归测试半天即可起步。
- **工作量**：起步 0.5 天,持续补充。

### P3-3 e2e 扩展
- 现有 30 个用例覆盖导航/认证/PWA 健康,**未覆盖**:设备控制(开关/充电功率)、配网流程、Smart Schedule、通知。真实账号用例依赖硬编码凭据(应改为 CI secret)。
- 补关键交互流的 mock-backend e2e。
- **工作量**：1-2 天。

### P3-4 崩溃/错误监控
- 原生构建无崩溃上报。接 **Sentry**(支持 Capacitor)或 Crashlytics,发布后才有生产可观测性。
- **工作量**：0.5 天。

### P3-5 包体与加载
- dist 预缓存 ~1.26MB。按路由 `React.lazy` 拆分(尤其重页 Overview/Stats/Provisioning),缩短首屏。
- **工作量**：1 天。

---

## 已做得好的地方（保持）

- 数据可信链路:CRC 校验、livePt 失效回退、速报优先 + 透传回退、轮询可见性门控(v3.27.6–v3.29.0)。
- 设计系统 LOCKED 令牌一致性、字体平滑、tabular-nums、text-wrap、按压反馈。
- 双端适配基础:tap-highlight、状态栏、Android 返回键接管、键盘、触觉反馈(v3.30.0)。
- 合规基础:Terms/Privacy 页面存在且被 Settings/DataExport/Register 链接;BLE 权限用 `neverForLocation` 建模正确;targetSdk 36 满足 Play;Apple 4.2 最小功能风险低(有真实原生能力)。
- typecheck 进 CI、构建门禁、协议层合成帧验证。

---

## 建议执行顺序（面向"可提交商店的构建"）

| 里程碑 | 内容 | 依赖 |
|---|---|---|
| **M1 安全止血(本周)** | P0-1 删泄露文件 + 轮换密钥 | 平台方轮换 AppSecret |
| **M2 合规红线** | P0-2 删账号、P0-3 图标/splash、P0-5 相册声明、P0-6 Demo 账号、P1-1 隐私一致、P1-5 隐藏调试页、P1-6 加密声明 | 品牌设计出图 |
| **M3 推送决策** | P0-4:首发实现 或 裁剪隐藏 | 后端 + Firebase/APNs |
| **M4 构建管线** | P1-4 版本同步、P3-1 release AAB + TestFlight | 签名证书/keystore |
| **M5 提交送审** | 商店素材、审核备注、内测(Play internal / TestFlight) | 前述完成 |
| **M6 发布后迭代** | P2 架构债 + P3 测试/监控 | — |

> M1–M2 是硬门槛,M3 需产品决策,M4 需证书。M2 里除图标外全部可在代码侧完成。
