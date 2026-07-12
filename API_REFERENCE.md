# Sierro PowerFlow App — API Reference

> **Base URL**: `https://solar.siseli.com/apis`
> **Auth**: IoT-Open 签名（AppID: `rYGQpmYU5k` / AppSecret: `GhJXQYEHphHlyiqYnBGE`）
> **Content-Type**: `application/json`
> **文档来源**: http://doc.solar.siseli.com/openapi/#/
> **Swagger Spec**: http://doc.solar.siseli.com/openapi/swagger2/api-docs?group=openApis

---

## 通用响应格式

```json
{
  "code": 0,
  "message": "string",
  "localMessage": "string",
  "data": {}
}
```

`code === 0` 表示成功，其他为错误码。

---

## 请求头鉴权说明

| Header | 说明 | 示例 |
|--------|------|------|
| `Content-Type` | 固定值 | `application/json; charset=utf-8` |
| `Origin` | 固定值 | `https://solar.siseli.com` |
| `Referer` | 固定值 | `https://solar.siseli.com/` |
| `IOT-Open-AppID` | 应用ID | `rYGQpmYU5k` |
| `IOT-Open-Nonce` | 32位随机字符串 | `a1b2c3d4e5f6...` |
| `IOT-Open-Body-Hash` | Body SHA256 哈希（GET为空字符串） | `e3b0c44298fc1...` |
| `IOT-Open-Sign` | 请求签名 | `a1b2c3d4e5f6...` |
| `IOT-Token` | 登录后的 accessToken（非 Authorization Bearer） | `eyJhbGciOi...` |

### 签名算法

```
1. 计算 Body SHA256 Hash（GET 请求为空字符串）
2. 合并 URL 参数 + 公共参数（IOT-Open-AppID / IOT-Open-Nonce / IOT-Open-Body-Hash）
3. 按参数名字典序排序
4. 拼接为 key=val&key2=val2...（UTF-8 原始值，不做 URL 编码）
5. Base64(UTF-8)
6. HmacSHA256(base64String, AppSecret)
7. MD5(hmacBytes) => 最终签名
```

> ⚠️ 登录接口 `/login/account` 需签名但**不需要** IOT-Token（使用 `postSkipAuth`）
> ⚠️ 密码需 **MD5 加密后传输**（明文密码会返回 code 7）
> ⚠️ Body 使用紧凑 JSON（`separators=(",", ":")`，无多余空格）

---

## 一、用户登录服务 User Login Service

| Method | Path | Summary | Body |
|--------|------|---------|------|
| POST | `/login/account` | 账号密码登录 | `UserAccountLoginDtio` |
| POST | `/login/email` | 邮箱验证码登录 | `UserEmailLoginDtio` |
| POST | `/login/sms` | 手机短信验证码登录 | `UserSmsLoginDtio` |
| POST | `/login/inviteCode` | 邀请码登录 | `InviteCodeLoginDtio` |
| POST | `/login/logout` | 退出登录 | `LogoutDtio` |
| POST | `/login/refresh/access/token` | 刷新 Token | `RefreshTokenDtio` |
| POST | `/login/passwordless/login` | 免密登录下级用户 | `UserLoginDirectlyDtio` |

### UserAccountLoginDtio
```json
{
  "account": "string",   // *required* min:3 max:256
  "password": "string"   // *required* MD5加密后 min:6 max:32
}
```

### UserAuthTokenDtoo（登录响应 data）
```json
{
  "accessToken": "string",
  "accessTokenWillExpiredAt": "2026-05-10T00:00:00Z",
  "accessTokenWillExpiredInMillis": 0,
  "refreshToken": "string",
  "refreshTokenWillExpiredAt": "2026-05-10T00:00:00Z",
  "refreshTokenWillExpiredInMillis": 0,
  "account": "string",
  "authId": 0,
  "userId": 0,
  "userType": 0,
  "isAdmin": true,
  "isDealer": true,
  "isDeviceManufacturer": true,
  "isIntegrator": true,
  "isOfficialStaff": true,
  "isStationOwner": true,
  "ticket": "string",
  "themeColor": "string"
}
```

### RefreshTokenDtio
```json
{
  "accessToken": "string",    // *required*
  "refreshToken": "string"    // *required*
}
```

### LogoutDtio
```json
{
  "accessToken": "string",    // *required*
  "userId": 0                 // *required*
}
```

---

## 二、设备管理服务 Device Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/device/list` | 查询设备列表 | - | `DeviceListDtio` |
| GET | `/device/details` | 查看设备详情 | `deviceId*` | - |
| POST | `/device/add/single` | 添加单个设备 | - | `AddSingleMainDeviceDtio` |
| POST | `/device/add/single/addStationTogether` | 添加设备同时创建电站 | - | `AddSingleDeviceAndStationDtio` |
| POST | `/device/delete` | 删除设备 | - | `DeleteDtio` |
| POST | `/device/update` | 编辑设备信息 | - | `DeviceUpdateDtio` |
| POST | `/device/pin` | 置顶设备 | - | `GeneralIdsDtio` |
| POST | `/device/unpin` | 取消置顶设备 | - | `GeneralIdsDtio` |
| GET | `/device/dtu/info` | 获取设备采集器信息 | `dtuDtuid*` | - |
| POST | `/device/dtu/replace` | 更换设备采集器 | - | `DeviceReplaceDtuDtio` |
| POST | `/device/external/add/single` | 添加单个外挂设备 | - | `AddSingleExternalDeviceDtio` |
| POST | `/device/external/list` | 获取主设备的外挂设备列表 | - | `ExternalDeviceListDtio` |
| POST | `/device/gather/protocol/open/search` | 查询设备采集协议开放信息 | - | `GatherProtocolOpenSearchDtio` |
| GET | `/device/query/attribute/group` | 查询设备属性分组列表 | `deviceId*`, `category`, `renderIn` | - |
| GET | `/device/query/by/dtuId` | 根据dtuId查设备 | `dtuId*` | - |
| GET | `/device/query/dtuids` | 查询设备采集器列表 | `dtuids*` | - |

### DeviceListDtio
```json
{
  "page": 1,                  // *required* 页码
  "count": 20,                // *required* 每页数量
  "stationId": 0,             // 电站ID（筛选）
  "name": "string",           // 设备名（模糊搜索）
  "serialNumber": "string",   // 序列号
  "deviceSortKey": "string",  // 设备种类 key
  "gatherProtocolNumber": "string",
  "dtuDtuid": "string",
  "dtuId": 0,
  "ownerUserId": 0,
  "ownerUserName": "string",
  "stationName": "string",
  "state": "string",
  "softwareVersion": "string",
  "applyModeCategory": 0,
  "orderByCreatedAtAsc": false,
  "orderByInstalledAtAsc": false,
  "orderByNameAsc": false,
  "orderByProducingPowerAsc": false,
  "orderBySerialNumberAsc": false,
  "orderByStateAsc": false
}
```

### DeviceDetailsDtoo（设备详情响应，主要字段）
```json
{
  "id": 0,
  "name": "string",
  "serialNumber": "string",
  "model": "string",
  "deviceSortKey": "string",
  "deviceSortLocaleText": "string",
  "gatherProtocolNumber": "string",
  "gatherProtocolNameDisplay": "string",
  "softwareVersion": "string",
  "stationId": 0,
  "stationName": "string",
  "dtuId": 0,
  "dtuDtuid": "string",
  "dtuName": "string",
  "isOnline": true,
  "isAlarmed": true,
  "isPined": true,
  "isPeakValleyEnabled": true,
  "isUpgrading": true,
  "isFirmwareUpgradeEnabled": true,
  "isExternalDevice": false,
  "isMainMasterDevice": true,
  "applyMode": 0,
  "state": "string",
  "stateDict": "string",
  "producingPower": 0,
  "ratedPower": 0,
  "dailyProducedQuantity": 0,
  "totalProducedQuantity": 0,
  "installedAt": "2026-05-10T00:00:00Z",
  "lastDataAt": "2026-05-10T00:00:00Z",
  "lastOnlineAt": "2026-05-10T00:00:00Z",
  "lastOfflineAt": "2026-05-10T00:00:00Z",
  "place": "string",
  "iconResid": "string",
  "ownerUserId": 0,
  "ownerUserName": "string",
  "stationTimezone": "string",
  "stationCurrencyCode": "string",
  "stationEnergyIncomePrice": 0,
  "co2EmissionReduction": 0,
  "noxEmissionReduction": 0,
  "so2EmissionReduction": 0,
  "savingStandardCarbon": 0,
  "extraProperty": {},
  "summaryProperty": {}
}
```

### AddSingleMainDeviceDtio
```json
{
  "deviceName": "string",            // *required*
  "stationId": 0,                     // *required*
  "dtuDtuid": "string",              // *required*
  "deviceSerialNumber": "string",
  "ratedPower": 0,
  "place": "string",
  "installVendor": "string",
  "installedAt": "2026-05-10T00:00:00Z",
  "isVirtualSerialNumber": false,
  "isRestartAfterAdded": false,
  "extraProperty": {}
}
```

### DeviceUpdateDtio
```json
{
  "id": 0,                // *required*
  "name": "string",       // *required*
  "place": "string",
  "installVendor": "string",
  "installedAt": "2026-05-10T00:00:00Z",
  "ratedPower": 0,
  "extraProperty": {}
}
```

---

## 三、设备状态服务 Device State Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/deviceState/attribute/record/list` | 获取设备状态明细数据 | - | `DeviceAttributeStatePageDtio` |
| POST | `/deviceState/attribute/record/list/v2` | 获取设备状态明细数据V2 | - | `DeviceAttributeStatePageDtio` |
| POST | `/deviceState/attribute/record/time/list` | 获取设备状态数据更新时间 | - | `DeviceAttributeStatePageDtio` |
| POST | `/deviceState/attribute/keys/history` | 获取设备指定属性历史数据 | - | `DeviceAttributeKeysHistoryPageDtio` |
| GET | `/deviceState/gatherAttributes` | 获取设备属性列表 | `deviceId*`, `category*`, `renderIn` | - |

### DeviceAttributeStatePageDtio
```json
{
  "deviceId": 0,          // *required*
  "fromTime": "string",   // *required* ISO 8601
  "toTime": "string",     // *required* ISO 8601
  "page": 1,              // *required*
  "count": 100            // *required*
}
```

### DeviceAttributeKeysHistoryPageDtio
```json
{
  "deviceId": 0,           // *required*
  "keys": ["soc", "acPower"],  // 属性key数组
  "fromTime": "string",    // *required* ISO 8601
  "toTime": "string",      // *required* ISO 8601
  "page": 1,               // *required*
  "count": 288,            // *required*
  "orderByTimeAsc": true
}
```

---

## 四、设备简单状态服务 Device Simple State Service

> 简化版状态接口，返回更轻量的数据结构

| Method | Path | Summary | Query Params |
|--------|------|---------|-------------|
| GET | `/deviceState/simple/state/latest/v1` | 获取设备最新状态简单数据 | `deviceId*`, `dataSource` |
| GET | `/deviceState/simple/energy/flow/v1` | 获取设备简单能量流动 | `deviceId*`, `dataSource` |
| GET | `/deviceState/simple/gatherAttributes/v1` | 获取设备属性简单列表 | `deviceId*`, `category*`, `renderIn` |
| POST | `/deviceState/simple/attribute/record/list/v1` | 获取设备状态简单数据 | Body: `DeviceAttributeStatePageDtio` |
| POST | `/deviceState/simple/attribute/keys/history/v1` | 获取设备指定属性简单历史数据 | Body: `DeviceAttributeKeysHistoryPageDtio` |

---

## 五、远程设备控制服务 Remote Device Control Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| GET | `/remote/device/state/latest` | 获取设备最近状态数据 | `deviceId*`, `dataSource` | - |
| POST | `/remote/device/config/read` | 读取设备配置项 | `deviceId*` | `ReadRemoteDeviceConfigVijo` |
| POST | `/remote/device/config/write` | 设置设备配置项 | `deviceId*` | `WriteRemoteDeviceConfigVijo` |
| POST | `/remote/device/configs/read` | 批量读取设备配置项 | `deviceId*` | `ReadRemoteDeviceConfigsVijo` |
| GET | `/remote/device/configs/read/details` | 获取批量读取详情 | `batchReadId*` | - |
| POST | `/remote/device/configs/cache/get` | 获取设备配置项缓存 | `deviceId*` | `ReadRemoteDeviceConfigsVijo` |
| POST | `/remote/device/configs/cache/clear` | 清空设备配置项缓存 | `deviceId*` | - |
| POST | `/remote/device/config/write/records` | 查询设备配置项写记录 | - | `DeviceConfigWriteRecordSearchDtio` |
| GET | `/remote/device/energy/flow` | 获取设备能量流动 | `deviceId*`, `dataSource` | - |
| POST | `/remote/device/passthrough` | 透传数据 | `deviceId*` | `DeviceRemotePassthroughVijo` |
| POST | `/remote/device/state/report/fast/start` | 启动速报（实时数据快速上报） | `deviceId*` | `DeviceAttributeStateFastReportStartDtio` |
| POST | `/remote/device/state/report/fast/stop` | 停止速报 | `deviceId*` | `DeviceAttributeStateFastReportStopDtio` |
| GET | `/remote/device/state/report/fast/supported` | 检查是否支持速报 | `deviceId*` | - |

### GET `/remote/device/state/latest` 响应
```json
{
  "deviceId": "string",
  "dtuID": "string",
  "time": "2026-05-10T00:00:00Z",
  "stationId": "string",
  "gatherProtocolNumber": "string",
  "gatherProtocolVersionCode": "string",
  "fields": {
    "soc": {
      "key": "soc",
      "name": "Battery SOC",
      "value": 85,
      "valueDisplay": "85%",
      "unit": "%",
      "valueType": "float",
      "category": "string"
    }
  },
  "groups": [
    {
      "id": 0,
      "key": "string",
      "name": "string",
      "category": "string",
      "stateItems": []
    }
  ],
  "firingAlarms": []
}
```

### WriteRemoteDeviceConfigVijo（远程控制写入）
```json
{
  "key": "string",    // *required* 属性key，如 "acOut1Enable"
  "value": {}          // 写入值，如 true / 0 / "string"
}
```

### ReadRemoteDeviceConfigVijo（读取单个配置项）
```json
{
  "key": "string"      // *required*
}
```

### ReadRemoteDeviceConfigsVijo（批量读取配置项）
```json
{
  "keys": ["acOut1Enable", "acOut2Enable", "workMode"]   // key数组
}
```

### DeviceRemotePassthroughVijo（透传）
```json
{
  "base64Input": "string",   // *required* Base64编码的指令
  "noOutput": false          // 是否不需要返回
}
```

### DeviceAttributeStateFastReportStartDtio
```json
{
  "clientID": "string",    // *required*
  "scene": "string"        // *required*
}
```

### DeviceAttributeStateFastReportStopDtio
```json
{
  "clientID": "string"    // *required*
}
```

---

## 六、告警管理服务 Alarm Service

| Method | Path | Summary | Body |
|--------|------|---------|------|
| POST | `/alarm/getLatestAlarm` | 获取最近一条告警 | `AlarmSearchDtio` |
| POST | `/alarm/query/list` | 查询告警列表 | `AlarmSearchDtio` |
| POST | `/alarm/delete/alarm` | 删除告警 | Query: `id*` |
| POST | `/alarm/update/isProcessed` | 忽略告警 | `UpdateAlarmDtio` |

### AlarmSearchDtio
```json
{
  "page": 1,                          // *required*
  "count": 20,                         // *required*
  "deviceId": 0,                      // 设备ID
  "stationId": 0,                     // 电站ID
  "dtuId": 0,                         // 采集器ID
  "deviceSerialNumber": "string",
  "certificateDtuID": "string",
  "fromTime": "string",               // ISO 8601
  "toTime": "string",                 // ISO 8601
  "isProcessed": false,
  "level": "string",
  "orderByCreatedTimeDesc": true
}
```

### UpdateAlarmDtio
```json
{
  "iotAlarmId": 0      // *required*
}
```

---

## 七、告警报表服务 Alarm Report Service

| Method | Path | Summary | Body |
|--------|------|---------|------|
| POST | `/alarm/report/record/list` | 查询告警报表 | `AlarmReportSearchDtio` |
| GET | `/alarm/report/record/details` | 获取告警报表详情 | Query: `id*` |
| GET | `/alarm/report/alarmList/headers` | 获取告警列表报表头 | - |
| POST | `/alarm/report/alarmList/export` | 导出告警列表报表 | `ExportAlarmListReportDtio` |
| POST | `/alarm/report/record/delete/batch` | 批量删除告警报表 | - |

---

## 八、削峰填谷服务 Peak Valley Service（Smart Schedule）

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| GET | `/peakValley/device/attribute/group` | 获取设备削峰填谷采集属性分组 | `deviceId*` | - |
| GET | `/peakValley/device/general/get` | 获取设备常规削峰填谷 | `deviceId*` | - |
| POST | `/peakValley/device/general/set` | 设置设备常规削峰填谷 | - | `DeviceGeneralPeakValleyDtio` |
| GET | `/peakValley/device/get` | 获取设备削峰填谷 | `deviceId*` | - |
| POST | `/peakValley/device/customized/set` | 设置自定义削峰填谷 | - | `DeviceCustomizedPeakValleyDtio` |
| POST | `/peakValley/device/enable` | 使能设备削峰填谷 | - | `DevicePeakValleyEnableDtio` |
| GET | `/peakValley/types/device` | 获取设备支持的削峰填谷类型 | `deviceId*`, `includeDefault` | - |
| GET | `/peakValley/types/all` | 获取所有削峰填谷类型 | - | - |

### DeviceGeneralPeakValleyDtio
```json
{
  "deviceId": 0,          // *required*
  "isEnabled": true,
  "items": []             // 削峰填谷时段配置项数组
}
```

### DeviceCustomizedPeakValleyDtio
```json
{
  "deviceId": 0,                          // *required*
  "isEnabled": true,
  "defaultItem": {},                      // *required* 默认配置项
  "items": []                             // 自定义时段配置项数组
}
```

### DevicePeakValleyEnableDtio
```json
{
  "deviceId": 0,          // *required*
  "isEnabled": true,      // *required*
  "category": "string"
}
```

---

## 九、电站管理服务 Station Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/station/list` | 搜索电站列表 | - | `StationListDtio` |
| GET | `/station/details` | 查询电站详情 | `stationId*` | - |
| POST | `/station/add` | 创建电站 | - | `StationAddDtio` |
| POST | `/station/update` | 编辑电站 | - | `StationUpdateDtio` |
| POST | `/station/delete` | 删除电站 | `stationId*` | - |
| POST | `/station/pin` | 置顶电站 | - | `GeneralIdsDtio` |
| POST | `/station/unpin` | 取消置顶电站 | - | `GeneralIdsDtio` |
| GET | `/station/energy/flow` | 获取电站简单能量流动 | `stationId*`, `isManualRefresh` | - |

### StationListDtio
```json
{
  "page": 1,                          // *required*
  "count": 20,                         // *required*
  "name": "string",
  "stationType": 0,
  "connectedGridType": 0,
  "state": "string",
  "ownerUserName": "string",
  "groupId": 0,
  "ids": [],
  "orderByCreatedAtAsc": false,
  "orderByInstalledAtAsc": false,
  "orderByInstalledCapacityAsc": false,
  "orderByNameAsc": false,
  "orderByStateAsc": false,
  "orderByStationTypeAsc": false,
  "orderByConnectedGridTypeAsc": false,
  "userMeta": {}
}
```

### StationAddDtio
```json
{
  "name": "string",                   // *required* max:40
  "country": "string",                // *required*
  "province": "string",
  "city": "string",
  "area": "string",
  "address": "string",                // max:400
  "latitude": 0,                       // *required* -90~90
  "longitude": 0,                     // *required* -180~180
  "stationType": 0,                    // *required*
  "connectedGridType": 0,             // *required*
  "installedCapacity": 0,              // *required* ≥0.001
  "installedAt": "2026-05-10T00:00:00Z", // *required*
  "timezone": "string",               // *required*
  "currencyCode": "string",           // *required*
  "energyIncomePrice": 0,
  "totalCost": 0,
  "imageResid": "string"
}
```

---

## 十、电站总览服务 Station OverView Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/stationOverView/generationPower/daily` | 获取电站日发电量 | `stationId*` | `DailyDtio` |
| POST | `/stationOverView/generatedEnergy/monthly` | 获取电站月发电量 | `stationId*` | `MonthlyDtio` |
| POST | `/stationOverView/generatedEnergy/yearly` | 获取电站年发电量 | `stationId*` | `YearlyDtio` |
| POST | `/stationOverView/generatedEnergy/total` | 获取电站总发电量 | `stationId*` | - |
| POST | `/stationOverView/stateAttributeSummary/daily` | 获取设备状态属性电站日度汇总 | `stationId*`, `summaryPropertyKey*` | `DailyDtio` |
| POST | `/stationOverView/stateAttributeSummary/monthly` | 获取设备状态属性电站月度汇总 | `stationId*`, `summaryPropertyKey*` | `MonthlyDtio` |
| POST | `/stationOverView/stateAttributeSummary/yearly` | 获取设备状态属性电站年度汇总 | `stationId*`, `summaryPropertyKey*` | `YearlyDtio` |
| POST | `/stationOverView/stateAttributeSummary/total` | 获取设备状态属性电站年总计 | `stationId*`, `summaryPropertyKey*` | - |
| POST | `/stationOverView/stateAttributeSummary/category/daily` | 获取状态属性统计类目电站日汇总 | `stationId*`, `summaryCategoryKey*` | `DailyDtio` |
| POST | `/stationOverView/stateAttributeSummary/category/monthly` | 获取状态属性统计类目电站月度汇总 | `stationId*`, `summaryCategoryKey*` | `MonthlyDtio` |
| POST | `/stationOverView/stateAttributeSummary/category/yearly` | 获取状态属性统计类目电站年度汇总 | `stationId*`, `summaryCategoryKey*` | `YearlyDtio` |
| POST | `/stationOverView/stateAttributeSummary/category/total` | 获取状态属性统计类目电站年总计 | `stationId*`, `summaryCategoryKey*` | - |

---

## 十一、站点业主总览服务 Station Owner OverView Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/ownerOverView/select/ownerStatistics` | 获取站点业主资源详情 | - | - |
| POST | `/ownerOverView/station/generationPower/daily` | 获取电站日发电量 | - | `DailyDtio` |
| POST | `/ownerOverView/station/generatedEnergy/monthly` | 获取电站月发电量 | - | `MonthlyDtio` |
| POST | `/ownerOverView/station/generatedEnergy/yearly` | 获取电站年发电量 | - | `YearlyDtio` |
| POST | `/ownerOverView/station/generatedEnergy/total` | 获取电站总发电量 | - | - |
| POST | `/ownerOverView/station/stateAttributeSummary/daily` | 获取设备状态属性业主日度汇总 | `summaryPropertyKey*` | `DailyDtio` |
| POST | `/ownerOverView/station/stateAttributeSummary/monthly` | 获取设备状态属性业主月度汇总 | `summaryPropertyKey*` | `MonthlyDtio` |
| POST | `/ownerOverView/station/stateAttributeSummary/yearly` | 获取设备状态属性业主年度汇总 | `summaryPropertyKey*` | `YearlyDtio` |
| POST | `/ownerOverView/station/stateAttributeSummary/total` | 获取设备状态属性业主年总计 | `summaryPropertyKey*` | - |
| POST | `/ownerOverView/station/stateAttributeSummary/category/daily` | 获取状态属性统计类目业主日汇总 | `summaryCategoryKey*` | `DailyDtio` |
| POST | `/ownerOverView/station/stateAttributeSummary/category/monthly` | 获取状态属性统计类目业主月度汇总 | `summaryCategoryKey*` | `MonthlyDtio` |
| POST | `/ownerOverView/station/stateAttributeSummary/category/yearly` | 获取状态属性统计类目业主年度汇总 | `summaryCategoryKey*` | `YearlyDtio` |
| POST | `/ownerOverView/station/stateAttributeSummary/category/total` | 获取状态属性统计类目业主年总计 | `summaryCategoryKey*` | - |

---

## 十二、设备应用模式服务 Device Apply Mode Service

| Method | Path | Summary | Query Params |
|--------|------|---------|-------------|
| GET | `/deviceApplyMode/modes/main` | 获取设备主应用模式列表 | - |
| GET | `/deviceApplyMode/modes/external` | 获取设备外挂应用模式列表 | - |

---

## 十三、设备偏移量服务 Device PowerGen Offset Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| GET | `/deviceOffset/details` | 查看设备偏移量详情 | `deviceId*` | - |
| POST | `/deviceOffset/list` | 查询设备偏移量列表 | - | `DeviceOffsetSearchDtio` |
| POST | `/deviceOffset/set` | 设置设备偏移量 | - | `DeviceOffsetSetDtio` |
| GET | `/deviceOffset/totally` | 获取总偏移量 | `deviceId*` | - |

---

## 十四、设备固件服务 Device Firmware Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/device/firmware/list` | 查询设备固件列表 | - | `DeviceFirmwareSearchDtio` |
| POST | `/device/firmware/list/fromManufacturer` | 根据设备id查询厂家固件列表 | `deviceId`, `certificateDtuID` | `DeviceFirmwareSearchDtio` |

---

## 十五、设备升级服务 Device Upgrade Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/device/upgrade/create` | 创建设备升级 | - | `DeviceUpgradeCreateDtio` |
| POST | `/device/upgrade/list` | 查询设备升级列表 | - | `DeviceUpgradeSearchDtio` |
| GET | `/device/upgrade/logs` | 获取设备升级日志 | `deviceUpgradeId*` | - |
| GET | `/device/upgrade/script/file/info` | 获取设备升级脚本文件信息 | `protocolId*`, `deviceId`, `certificateDtuID` | - |

---

## 十六、采集器管理服务 DTU Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| GET | `/dtu/count/general` | 采集器常规统计 | - | - |
| POST | `/dtu/query/list` | 查询采集器列表 | - | `DtuSearchDtio` |
| POST | `/dtu/select/dtu/withDtuID` | 根据DtuID查看采集器详情 | `DtuID*` | - |

---

## 十七、远程采集器控制服务 Remote Dtu Control Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/remote/dtu/restart` | 重启采集器 | `dtuId`, `certificateDtuID` | - |
| POST | `/remote/dtu/passthrough/salve/single` | 透传数据至下位机 | `dtuId`, `certificateDtuID` | `DtuRemotePassthroughVijo` |
| POST | `/remote/dtu/hfmi/language` | 设置智慧屏设备hfmi文件语言 | - | `DtuHfmiLanguageSetDtio` |

---

## 十八、采集器近端数采服务 Dtu Near Service

> 用于蓝牙/本地连接场景下的近端数据采集与指令生成

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/near/dtu/checkin` | 签到 | - | - |
| POST | `/near/dtu/detectGatherProtocol` | 侦测采集协议 | - | `NearDetectGatherProtocolVijo` |
| GET | `/near/dtu/gatherProtocol` | 获取采集协议 | `protocolNo*`, `verCode*` | - |
| GET | `/near/dtu/device/attribute/groups` | 获取采集属性分组列表 | `protocolNo*`, `verCode*`, `category` | - |
| POST | `/near/dtu/gen/device/config/read` | 生成读取设备配置项指令 | `protocolNo*`, `verCode*` | `ReadRemoteDeviceConfigVijo` |
| POST | `/near/dtu/gen/device/config/write` | 生成设置设备配置项指令 | `protocolNo*`, `verCode*` | `NearWriteDeviceConfigVijo` |
| POST | `/near/dtu/gen/device/config/pre/write` | 生成预设置设备配置项指令 | `protocolNo*`, `verCode*` | `WriteRemoteDeviceConfigVijo` |
| POST | `/near/dtu/gen/device/configs/read` | 生成批量读取设备配置项指令 | `protocolNo*`, `verCode*` | `ReadRemoteDeviceConfigsVijo` |
| POST | `/near/dtu/parse/device/state` | 解析设备状态数据 | `protocolNo*`, `verCode*` | `NearParseDeviceStateVijo` |
| POST | `/near/dtu/parse/device/event` | 解析设备事件数据 | `protocolNo*`, `verCode*` | `NearParseDeviceStateVijo` |
| POST | `/near/dtu/parse/device/energy/flow` | 解析设备能量流动数据 | `protocolNo*`, `verCode*` | `NearParseDeviceStateVijo` |
| POST | `/near/dtu/parse/device/config/read` | 解析设备配置项读取响应 | `protocolNo*`, `verCode*` | `NearParseDeviceConfigVijo` |
| POST | `/near/dtu/parse/device/config/write` | 解析设备配置项设置响应 | `protocolNo*`, `verCode*` | `NearParseDeviceConfigWriteVijo` |
| POST | `/near/dtu/parse/device/configs/read` | 解析设备配置项批量读取响应 | `protocolNo*`, `verCode*` | `NearParseDeviceConfigsVijo` |
| GET | `/near/dtu/hisScript` | 获取dtu的His脚本 | - | - |
| GET | `/near/dtu/hfmi/overviews` | 获取智慧屏hfmi文件概览列表 | - | - |
| GET | `/near/dtu/hfmi/detail` | 获取智慧屏hfmi文件详情 | `langCode*`, `projID*`, `projVerCode*` | - |

---

## 十九、设备种类服务 Device Sort Service

| Method | Path | Summary | Query Params |
|--------|------|---------|-------------|
| GET | `/deviceSort/sorts/all` | 获取所有设备种类 | - |
| GET | `/deviceSort/sorts/details` | 查看设备种类详情 | `id*` |

---

## 二十、App扫码服务 App Scan Code Service

| Method | Path | Summary | Body |
|--------|------|---------|------|
| POST | `/app/scan/qrcode/login` | 二维码登录确认 | `QRCodeLoginDtio` |

### QRCodeLoginDtio
```json
{
  "ticket": "string"    // *required*
}
```

---

## 二十一、APP版本服务 APP Version Service

| Method | Path | Summary | Query Params |
|--------|------|---------|-------------|
| GET | `/app/version/check` | 根据appId检查App版本（已废弃） | `appId*`, `versionCode*` |
| GET | `/app/version/check/v2` | 根据包名检查APP版本 | `packageName*`, `platform*`, `versionCode*` |

---

## 二十二、验证码服务 Captcha Service

| Method | Path | Summary | Body |
|--------|------|---------|------|
| POST | `/graphic/validation/code/generate` | 生成滑块拼图验证码 | Query: `intent*` |
| POST | `/graphic/validation/code/verify` | 校验滑块拼图验证码 | `VerifyGraphicVerificationCodeDtio` |

---

## 二十三、用户账户管理 User Account Management

| Method | Path | Summary | Body |
|--------|------|---------|------|
| GET | `/user/account/check` | 校验账户是否存在 | Query: `account*` |
| GET | `/user/email/check` | 校验邮箱是否存在 | Query: `email*` |
| POST | `/user/register/cellphone` | 手机注册账户 | `UserRegisterDtio` |
| POST | `/user/register/email` | 邮箱注册账户 | `UserRegisterDtio` |
| POST | `/user/reset/password` | 找回密码 | `UserRetrievePasswordDtio` |
| POST | `/user/select/iotUserInfo` | 查看个人用户信息 | - |
| POST | `/user/update/iotUserInfo` | 更新个人用户信息 | `UserUpdateInfoDtio` |
| POST | `/user/update/authPassword` | 更新密码 | `UserUpdatePasswordDtio` |
| POST | `/user/update/iotUserCellphone` | 修改手机号 | `UpdateTelephoneDtio` |
| POST | `/user/update/iotUserEmail` | 更新用户邮箱 | `UserUpdateByEmailDtio` |
| POST | `/user/update/cellphoneVerify` | 更新用户手机验证 | `UpdateTelephoneVerifyDtio` |
| POST | `/user/send/sms/captcha` | 发送短信验证码 | `SendCaptchaDtio` |
| POST | `/user/send/email/captcha` | 发送邮箱验证码 | `SendCaptchaDtio` |
| GET | `/user/app/applyMode/` | 获取APP应用模式 | - |
| POST | `/user/app/applyMode/update` | 更新APP应用模式 | `AppApplyModeDtio` |
| POST | `/user/logout/account` | 注销账户 | - |
| POST | `/user/verify/account` | 验证账户名 | `VerifyAccountDtio` |

### AppApplyModeDtio
```json
{
  "appApplyMode": "string"    // *required*
}
```

---

## 二十四、用户服务 User Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/user/subordinate/list` | 查询下级用户列表 | - | `UserListDtio` |
| POST | `/user/create/account` | 创建下级用户账号 | - | `CreateUserDtio` |
| GET | `/user/type` | 查询下级用户类型 | - | - |
| GET | `/user/bindableSuperior` | 查询可绑定的上级用户 | `uid*` | - |
| GET | `/user/owner` | 查询可绑定的站点业主用户 | `account`, `cellphone`, `countryTelephoneCode`, `email`, `uid` | - |
| POST | `/user/search/stationUser` | 根据账号搜索电站用户 | - | `UniqueUserDtio` |
| GET | `/user/group/list` | 查询用户分组列表 | `account`, `count*`, `groupName`, `page*` | - |
| POST | `/user/group/add/user` | 添加分组用户 | - | `UserGroupAddUserDtio` |
| GET | `/user/group/user/list` | 分组查询用户列表 | `account`, `count*`, `page*`, `userGroupId*` | - |

---

## 二十五、用户分组管理 User Group Management

| Method | Path | Summary | Body |
|--------|------|---------|------|
| POST | `/userGroup/insert/userGroup` | 添加用户分组 | `InsertUserGroupDtio` |
| POST | `/userGroup/query/list` | 用户分组列表 | `UserGroupDtio` |

---

## 二十六、数据字典服务 Data Dictionary Service

| Method | Path | Summary |
|--------|------|---------|
| GET | `/dictionary/data/alarm` | 获取告警数据字典 |
| GET | `/dictionary/data/device` | 获取设备数据字典 |
| GET | `/dictionary/data/station` | 获取站点数据字典 |
| GET | `/dictionary/data/simcard` | 获取SIM卡数据字典 |
| GET | `/dictionary/data/report` | 获取报表数据字典 |
| GET | `/dictionary/data/sensitive/country` | 获取敏感国家数据字典 |
| GET | `/dictionary/data/hjsa/version` | 获取HJSA脚本数据字典 |

---

## 二十七、全球行政区域服务 Admin Region Service

| Method | Path | Summary | Body |
|--------|------|---------|------|
| POST | `/admin/region/coding/reverse` | 将gis点反转为管理区域 | `GisPointDtio` |
| POST | `/admin/region/coding/reverse/ip` | 将IP地址反转为管理区域 | Query: `ip*` |
| POST | `/admin/region/coding/reverse/myip` | 将我的IP地址反转为管理区域 | - |

---

## 二十八、IP地址转换地理位置服务

| Method | Path | Summary | Query Params |
|--------|------|---------|-------------|
| GET | `/geo/location/ip/lookup/lite` | 根据IP查询地理位置-精简版 | `ip*` |
| GET | `/geo/location/ip/lookup/myip/lite` | 根据当前IP查询地理位置-精简版 | - |

---

## 二十九、数据大屏服务 Dashboard Service

| Method | Path | Summary |
|--------|------|---------|
| POST | `/dashboard/summary/station/generatedEnergy/monthly` | 汇总当月每天的发电量 |
| POST | `/dashboard/summary/station/generatedEnergy/yearly` | 汇总当年每月的发电量 |
| POST | `/dashboard/summary/station/generatedEnergy/total` | 汇总每年的发电量 |

---

## 三十、系统货币服务 System Currency Service

| Method | Path | Summary |
|--------|------|---------|
| GET | `/currency/list` | 货币列表 |

---

## 三十一、电话区号服务 Telephone Area Code Service

| Method | Path | Summary |
|--------|------|---------|
| GET | `/telephone/area/code/all/country/code/values` | 获取所有国家电话区号码值 |

---

## 三十二、统一资源管理 Uniform Resource Management

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/resource/upload/icon` | 上传公共资源图片 | `category`, `deleteResid`, `downloadName`, `isInternal` | - |
| POST | `/resource/upload/media` | 上传公共资源媒体 | `category`, `deleteResid`, `downloadName`, `isInternal` | - |

---

## 三十三、SIM卡报表服务 SIM Card Report Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/sim/card/report/list` | 查询SIM卡报表 | - | `SimCardReportSearchDtio` |
| GET | `/sim/card/report/details` | 获取SIM卡报表详情 | `id*` | - |
| GET | `/sim/card/report/headers` | 获取SIM卡列表报表头 | - | - |
| POST | `/sim/card/report/export` | 导出SIM卡列表报表 | - | `ExportSimCardListExcelDtio` |
| POST | `/sim/card/report/delete/batch` | 批量删除SIM卡报表 | - | - |

---

## 三十四、敏感国家服务 Sensitive Country Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| GET | `/sensitive/country/details` | 查询敏感国家详情 | `id*` | - |
| POST | `/sensitive/country/reverse/gis` | 逆解析gis点为敏感国家 | - | `GisPointDtio` |

---

## 三十五、采集协议管理 Gather Protocol Management

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| GET | `/gather/protocol/manufacturerDeviceUpgradeProtocol/overviews` | 获取厂家设备固件升级协议概述列表 | `gatherProtocolId*` | - |
| POST | `/gather/protocol/manufacturerDeviceUpgradeProtocol/bind` | 绑定厂家设备固件升级协议 | - | `GatherProtocolManufacturerUpgradeProtocolBindDtio` |

---

## 三十六、设备厂家管理 Device Manufacturer Management

| Method | Path | Summary | Body |
|--------|------|---------|------|
| POST | `/deviceManufacturer/add` | 创建厂家 | `DeviceManufacturerAddDtio` |

---

## 三十七、厂家总览服务 Device Manufacturer Overview Service

| Method | Path | Summary |
|--------|------|---------|
| POST | `/factoryOverView/select/alertsHistorical` | 厂家设备告警排行 |
| POST | `/factoryOverView/select/deviceDistributionRanking` | 厂家设备分布排名 |
| POST | `/factoryOverView/select/deviceOnlineRate` | 厂家设备在线率 |
| POST | `/factoryOverView/select/manufacturerStatistics` | 厂家统计信息 |

---

## 三十八、集成商总览服务 Integrators OverView Service

| Method | Path | Summary | Query Params |
|--------|------|---------|-------------|
| POST | `/integratorsOverView/select/integratorsStatistics` | 获取集成商资源详情 | - |
| POST | `/integratorsOverView/select/powerStationRanking` | 获取电站满发时间排名 | `asc` |

---

## 三十九、设备总览服务 Device OverView Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| POST | `/deviceOverView/generationPower/daily` | 获取设备当日发电功率明细 | `deviceId*` | `{time: "yyyy-mm-dd"}` |
| POST | `/deviceOverView/generatedEnergy/monthly` | 获取设备当月每天发电量 | `deviceId*` | `{time: "yyyy-mm"}` |
| POST | `/deviceOverView/generatedEnergy/yearly` | 获取设备当年每月发电量 | `deviceId*` | `{time: "yyyy"}` |
| POST | `/deviceOverView/generatedEnergy/total` | 获取设备历年发电量 | `deviceId*` | - |
| POST | `/deviceOverView/stateAttributeSummary/category/daily` | 获取状态属性统计类目设备日汇总 | `deviceId*`, `summaryCategoryKey*` | `DailyDtio` |
| POST | `/deviceOverView/stateAttributeSummary/category/monthly` | 获取状态属性统计类目设备月度汇总 | `deviceId*`, `summaryCategoryKey*` | `MonthlyDtio` |
| POST | `/deviceOverView/stateAttributeSummary/category/yearly` | 获取状态属性统计类目设备年度汇总 | `deviceId*`, `summaryCategoryKey*` | `YearlyDtio` |
| POST | `/deviceOverView/stateAttributeSummary/category/total` | 获取状态属性统计类目设备年总计 | `deviceId*`, `summaryCategoryKey*` | - |
| POST | `/deviceOverView/stateAttributeSummary/daily` | 获取设备状态属性日度汇总 | `deviceId*`, `summaryPropertyKey*` | `DailyDtio` |
| POST | `/deviceOverView/stateAttributeSummary/monthly` | 获取设备状态属性月度汇总 | `deviceId*`, `summaryPropertyKey*` | `MonthlyDtio` |
| POST | `/deviceOverView/stateAttributeSummary/yearly` | 获取设备状态属性年度汇总 | `deviceId*`, `summaryPropertyKey*` | `YearlyDtio` |
| POST | `/deviceOverView/stateAttributeSummary/total` | 获取设备状态属性年总计 | `deviceId*`, `summaryPropertyKey*` | - |

> **实测验证（2026-07-12）**：`generationPower/daily`/`generatedEnergy/monthly` 用普通消费者账号
> （非安装商/厂商角色）的 `IOT-Token` 即可直接调通，无需特殊权限。响应逐条带 `isRealValue` 布尔
> 字段，标识该数据点是设备真实上报还是后端补的占位值——`/deviceState/attribute/keys/history`
> （Sierro Insights 页当前用的接口）没有这个能力。Sierro 尚未接入这组接口，评估细节见
> `RELEASE_PLAN.md` P4 与桌面留存的 `Sierro_App_vs_sise_wifi_config_对比文档.md` 第 11.3 节。

---

## 四十、自动化指令服务 Auto Instruction Service

| Method | Path | Summary | Query Params | Body |
|--------|------|---------|-------------|------|
| GET | `/instruction` | 获取自动化指令详情 | `id*` | - |
| GET | `/instruction/list` | 分页查询自动化指令 | `deviceId*`, `pageNo`, `pageSize` | - |
| POST | `/instruction/add` | 添加自动化指令 | - | `InstructionVijo` |
| POST | `/instruction/update` | 更新自动化指令 | - | `InstructionVijo` |
| POST | `/instruction/updateStatus` | 更新自动化指令状态 | `id*`, `status*` | - |
| POST | `/instruction/delete` | 删除自动化指令 | `id*` | - |
| POST | `/instruction/historyList` | 分页查询指令执行历史 | - | `AutoInstructionLogDtio` |
| GET | `/instruction/historyListOfinstruction` | 分页查询指令执行历史（按指令ID） | `instructionId*`, `pageNo`, `pageSize` | - |

---

## 四十一、电站能量流动 StationEnergyFlowDtoo

```json
{
  "time": 0,
  "isSupportFlow": true,
  "batteryFlow": {
    "enabled": true,
    "isLight": true,
    "key": "string",
    "localeTitle": "string",
    "iconResid": "string",
    "flowDirection": 0,
    "flowRule": "string",
    "lightRule": "string",
    "value": {
      "key": "string",
      "name": "string",
      "value": {},
      "valueDisplay": "string",
      "unit": "string"
    },
    "extraValues": []
  },
  "gridFlow": {},
  "pvPanelFlow": {},
  "loadFlow": {},
  "ctFlow": {},
  "generatorFlow": {},
  "upsFlow": {}
}
```

---

## 常用属性 Key 参考

> 以下 key 用于 `/remote/device/state/latest` 的 `fields` 和 `/remote/device/config/write` 的 `key`

| 属性 Key | 说明 | 单位 |
|---------|------|------|
| `soc` | 电池电量 | % |
| `batteryPower` | 电池功率 | W |
| `batteryVoltage` | 电池电压 | V |
| `batteryTemp` | 电池温度 | °C |
| `acPower` | AC 输出功率 | W |
| `acVoltage` | AC 电压 | V |
| `solarPower` | 光伏输入功率 | W |
| `solarVoltage` | 光伏电压 | V |
| `outputPower` | 总输出功率 | W |
| `acOut1Enable` | AC Out 1 开关 | boolean |
| `acOut2Enable` | AC Out 2 开关 | boolean |
| `usbOut1Enable` | USB Out 1 开关 | boolean |
| `sleepMode` | 睡眠模式 | boolean |
| `workMode` | 工作模式（0=正常/1=备份/2=节能） | integer |
| `chargeLimit` | 充电上限 | % |
| `dischargeLimit` | 放电下限 | % |

> **注意**：实际 key 名称需以真实设备采集协议为准，通过 `/deviceState/gatherAttributes?deviceId=xxx` 获取完整列表。

---

## 旧路径 → 新路径对照表

> 从 Swagger 规范提取的实际路径与旧文档中的路径差异对照

| 旧路径 | 新路径 | 说明 |
|--------|--------|------|
| `/alarm/latest` | `/alarm/getLatestAlarm` | 路径变更 |
| `/alarm/search` | `/alarm/query/list` | 路径变更 |
| `/alarm/delete` | `/alarm/delete/alarm` | 路径变更 |
| `/alarm/ignore` | `/alarm/update/isProcessed` | 路径变更 + Body 变更 |
| `/device/state/page` | `/deviceState/attribute/record/list` | 路径重构 |
| `/device/state/page/v2` | `/deviceState/attribute/record/list/v2` | 路径重构 |
| `/device/state/page/v3` | `/deviceState/attribute/record/time/list` | 路径重构 |
| `/device/attribute/history` | `/deviceState/attribute/keys/history` | 路径重构 |
| `/device/attributes` | `/deviceState/gatherAttributes` | 路径重构 |
| `/peak/valley/device/attribute/group` | `/peakValley/device/attribute/group` | 驼峰化 |
| `/peak/valley/general` (GET) | `/peakValley/device/general/get` (GET) | 驼峰化+拆分 |
| `/peak/valley/general` (POST) | `/peakValley/device/general/set` (POST) | 驼峰化+拆分 |
| `/peak/valley/bundle` | `/peakValley/device/get` | 驼峰化 |
| `/peak/valley/enable` | `/peakValley/device/enable` | 驼峰化 |
| `/peak/valley/customized` | `/peakValley/device/customized/set` | 驼峰化 |
| `/peak/valley/types` | `/peakValley/types/device` | 驼峰化 |
| `/peak/valley/types/all` | `/peakValley/types/all` | 驼峰化 |
| `/scan/qrcode/login` | `/app/scan/qrcode/login` | 增加模块前缀 |

---

## 分页请求通用参数

所有分页查询接口（`*ListDtio` / `*SearchDtio`）均使用以下通用分页字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | integer | ✅ | 页码（从1开始） |
| `count` | integer | ✅ | 每页数量（1~2000） |

分页响应通用格式（`RspPageHeader«T»`）：

```json
{
  "total": 100,
  "page": 1,
  "count": 20,
  "list": []
}
```

---

## 通用时间参数

| DTO | 字段 | 说明 |
|-----|------|------|
| `DailyDtio` | `time` | 日期字符串，如 `"2026-05-12"` |
| `MonthlyDtio` | `time` | 月份字符串，如 `"2026-05"` |
| `YearlyDtio` | `time` | 年份字符串，如 `"2026"` |

---

> 📊 **共计 41 个服务分组，227 个接口端点**
> 最后更新: 2026-07-12（新增 §39 的 4 个 `generationPower`/`generatedEnergy` 端点，实测校验过）
