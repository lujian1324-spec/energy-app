# 测试报告 — 权限按需化 + 蓝牙权限/扫描修复

- **日期**:2026-07-18
- **范围**:v4.4.3(Android/iOS/PWA 蓝牙权限与扫描修复)、v4.4.4(移除首启 App Permissions 页,权限改为纯按需)及其配套单元测试
- **分支**:`feat/on-demand-permissions-v4.4.4`
- **执行环境**:Node v24 / Vitest 4.1.10(node env)/ TypeScript 5.x —— 全部在 CLI 可复现
- **性质**:本报告为**某一时点快照**;长期活文档见 `docs/TEST_PLAN.md`(尤其第 3b、10、11 节)

> 说明:自动化只能在无头环境验证"我方逻辑/接线";真正的"操作系统权限弹窗行为"必须在**真机 APK/IPA**
> 上人工确认(见文末手动清单)。二者互补,缺一不可。

---

## 1. 结论摘要

| 检查项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | ✅ 0 错误 |
| 单元测试 | `npx vitest run` | ✅ **125 / 125 通过**(14 个测试文件) |
| 生产构建 | `npm run build` | ✅ 成功(仅既有 chunk>500KB 提示,与本次无关) |

本轮新增 **49** 项测试(76 → 125),全部通过。为纯测试新增,不改变出货 bundle,**未 bump 版本**(遵循 CLAUDE.md)。

---

## 2. 自动化测试明细(逐文件)

### 2.1 权限层(v4.4.2~v4.4.4,共 57 项)

| 文件 | 项数 | 覆盖 |
|---|---|---|
| `src/utils/permissions.web.test.ts` | 28 | PWA/web 分支:`withTimeout`;通知/相机/蓝牙/Wi-Fi/存储的 `check()`+`request()`(stub 浏览器全局) |
| `src/utils/permissions.native.test.ts` | 14 | Capacitor mock 原生分支:`initialize()` 为 BLE 权限入口且至多一次、Android 无线电关→`requestEnable()`、iOS 不调用、`initialize()` 拒绝→denied、相机/通知映射 + `NATIVE_PUSH_READY` 门控 `register()` |
| `src/protocols/bleProvision.native.test.ts` | 4 | `scanDevices()`:无 OS 名称过滤、客户端只转发 Sierro 结果、Android 定位关抛 location 错、定位查询异常仍扫描、iOS 跳过定位检查 |
| `src/utils/permissions.test.ts` | 4 | `classifyBleError()` 三类归类(permission / bluetooth_off / generic) |
| `src/protocols/bleProvision.test.ts` | 3 | `isSierroScanResult()`(SSL_ 名 或 FEE7 服务) |
| `src/utils/openAppSettings.test.ts` | 1 | web 返回 false 且从不 `window.open('app-settings:')` |
| `src/utils/openAppSettings.native.test.ts` | 3 | 原生深链 Android ApplicationDetails / iOS App、插件失败→false |

### 2.2 既有核心(未改动,回归通过,共 68 项)
Modbus CRC/解码/0x0133 枚举、电池时间、`isApiSuccess`、速报探测、BLE 直连解码/控制
(`bleDirect.test.ts`)、全 API 接口契约(`api-contract.test.ts` 38 项)、getPowers、parseSupported、apiClient。

---

## 3. 关键行为的用例→结果映射

### 3.1 v4.4.4 权限按需化
| 用例 | 验证方式 | 结果 |
|---|---|---|
| 首启不再渲染 App Permissions 页 | `PermissionsGate.tsx` 已删除、`App.tsx` 无引用;tsc + 构建通过 | ✅ 结构验证通过(真机确认见 PG-01) |
| 相机仅在扫码时申请 | web `getUserMedia` + native `Camera.requestPermissions` 映射 | ✅ |
| 蓝牙仅在扫描/连接时申请 | `initialize()` 为权限入口,只调用一次 | ✅ |
| 推送仅在开关开启时申请 | native 通知映射 + `register()` 门控 | ✅ |
| 头像沿用系统选择器(免权限) | 现状保留(无 OS 权限调用) | ✅ 无回归 |

### 3.2 v4.4.3 蓝牙扫描/权限修复
| 用例 | 验证方式 | 结果 |
|---|---|---|
| Android 不再"一直搜索"空列表 | `scanDevices` 无 OS 名称过滤 + 客户端 `isSierroScanResult` 过滤 | ✅ 转发 [a,c] 丢弃无关/无 deviceId |
| SSL_ 名 或 FEE7 服务均可识别 | `isSierroScanResult` 用例(大小写、只有服务 UUID 等) | ✅ |
| Android 定位关闭明确报错 | `isLocationEnabled()=false` → 抛 `/location/i` 且不扫描 | ✅ |
| 定位查询异常不阻断扫描 | `isLocationEnabled` reject → 仍照常扫描 | ✅ |
| iOS 不检查定位 | platform=ios → 不调用 `isLocationEnabled` | ✅ |
| Android 蓝牙关→requestEnable | 无线电关 → `requestEnable()` → 开 → granted | ✅ |
| iOS 不调用 requestEnable | platform=ios + 无线电关 → 不调用、denied | ✅ |
| 权限拒绝正确归类 | `classifyBleError` permission/bluetooth_off/generic | ✅ |
| PWA Open Settings 不跳坏网址 | web 返回 false,断言从不 `window.open('app-settings:')` | ✅ |
| 原生 Open Settings 深链 | Android ApplicationDetails / iOS App,失败回 false | ✅ |

---

## 4. 未自动化 —— 必须真机人工验证(待办)

以下为"系统实际弹窗/交互行为",无头环境无法替代(详见 `TEST_PLAN.md` 第 3b 节 PG-01~PG-10):

- [ ] **PG-01** 全新安装首开无 App Permissions 页,直接进登录/设备页,启动不弹权限
- [ ] **PG-02/PG-03** 首次扫描才弹蓝牙权限;附近 Sierro 设备(含/不含 SSL_ 名)实时进列表
- [ ] **PG-04/PG-05** 定位关闭 / 蓝牙关闭时出现对应引导
- [ ] **PG-06** PWA 权限被拒点 Open Settings 只显示 toast、不开坏标签页
- [ ] **PG-07** 首次扫码才弹相机权限
- [ ] **PG-08** Settings 首次开推送开关才弹通知权限,且不崩溃
- [ ] **PG-09** 换头像直接开系统相簿选择器,无多余权限弹窗

平台矩阵:Android 原生 APK、iOS(需 Mac/TestFlight)、Web PWA(部署站点)。

---

## 5. 风险 / 备注

- **客户端扫描过滤假设**:识别条件为"SSL_ 名 **或** 广播 FEE7 服务",依据 `connect()` 既有回退推导。
  若某真机两者都不广播,需退到"列出全部设备手动选";留待真机 PG-03 确认后再定。
- 单元测试的原生分支基于 mock,验证的是**我方接线正确**,不能替代真机权限弹窗与真实设备通信。
- 本次为纯测试/文档变更,不改出货 bundle,故未 bump 版本。

---

## 6. 复现命令
```
npx tsc --noEmit        # 类型检查
npx vitest run          # 单元 + 接口契约(125 项,秒级)
npm run build           # 生产构建
```
