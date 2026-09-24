# Handoff: Solar of Things (solar.siseli.com) — attribute history API

Context: reverse-engineered from the "Device details → Data Analysis" tab on 2026-09-25 (captured live request/response in the browser; verified one data point against the chart tooltip). Use this to integrate device history data into the Energy App.

## Endpoint

```
POST https://solar.siseli.com/apis/deviceState/simple/attribute/keys/history/v1
```

Front-end source (umi.6d0aa871.js, UmiJS + umi-request):

```js
request(`${b}/deviceState/simple/attribute/keys/history/v1`,
        { method: "POST", headers: { "IOT-Token": getToken() }, body: t })
```

### Headers

| Header | Value |
|---|---|
| `IOT-Token` | 32-char session token (from login; copy from any `/apis/` request in DevTools) |
| `IOT-Time-Zone` | `Asia/Taipei` |
| `Accept-Language` | `en-US` |
| `Content-Type` | `application/json` (with charset) |
| `Accept` | `application/json` |

### Request body

```json
{
  "deviceId": "524496472032645121",
  "keys": ["remainingBatteryCapacity", "batteryCurrent"],
  "fromTime": "2026-09-24T00:00:00+08:00",
  "toTime":   "2026-09-24T23:59:59+08:00",
  "page": 1,
  "count": 1500,
  "orderByTimeAsc": true
}
```

- `keys`: multiple keys supported in one call.
- UI date picker → full local day with explicit offset.
- `count` = page size, `page` = page number (1-based).

## Response (columnar, NOT [time, value] pairs)

```json
{
  "code": 0,
  "message": "Success",
  "localMessage": "Success",
  "data": {
    "page": 1,
    "count": 47,
    "total": 1,
    "payload": {
      "timeSeries": ["2026-09-24T08:07:54.860Z", "2026-09-24T08:09:07.502Z", "..."],
      "fields": {
        "remainingBatteryCapacity": [null, 93.8, 93.6, 93.5, "..."],
        "batteryCurrent":           [null, -4.1, -5.1, -5.5, "..."]
      },
      "formatters": {},
      "fieldInfo": null
    }
  }
}
```

- `timeSeries`: shared UTC ISO timestamps (ms precision) = the device's report frames.
- `fields.<key>[i]` aligns with `timeSeries[i]`; `null` = key absent in that frame.
- The time axis is independent of which keys are requested (same 47 frames for `l1AcInputVoltage` and battery keys).
- `data.count` = points in this page. `data.total` = 1 here — assumed to be total pages (unverified). Paginate with `page` on dense days.
- Verified: `timeSeries[23]` = `2026-09-24T10:04:07.440Z` (18:04:07 Taipei), `remainingBatteryCapacity[23]` = 89.8 — matches the chart tooltip.

Front-end rendering (inferred, not confirmed in code): ECharts, time-type x-axis, `tooltip.trigger: 'axis'`. Hovering does not hit the backend; it reads already-loaded points.

## Attribute key catalog

```
GET /apis/deviceState/simple/gatherAttributes/v1?deviceId=<id>&category=1&renderIn=2
→ { code, message, localMessage, data: [{ key, valueType, name, unit }, ...] }   // 37 entries for this device
```

Examples:

| key | name | unit |
|---|---|---|
| `remainingBatteryCapacity` | Remaining Battery Capacity | % |
| `batteryCapacity` | Battery capacity | Ah |
| `batteryCurrent` | Battery Current | A |
| `battery_cell_voltage_1` … `_16` | Battery Cell Voltage #n | V |
| `l1AcInputVoltage` | AC Input Voltage | V |
| `pvGeneratedEnergyOfDay` | Daily Power Gen. | kWh |
| `totalPVGeneratedEnergy` | Total PV Generated Energy | kWh |

## Other endpoints seen on the same page

- `GET  /apis/deviceState/simple/energy/flow/v1?deviceId=<id>&dataSource=1`
- `POST /apis/deviceOverView/pvInverterPowerClass/daily/detail?deviceId=<id>` (Data Chart tab)
- `POST /apis/deviceOverView/generatedEnergy/daily?deviceId=<id>`
- `POST /apis/deviceOverView/stateAttributeSummary/category/total?deviceId=<id>&summaryCategoryKey=<k>`

## Data observation (device Sierro-2715, 2026-09-24)

- 47 report frames from 16:07 to 23:44 Taipei; SOC non-null only for indexes 1–30.
- Last SOC 84.2% at 18:40:08 Taipei; frames continue to 23:44 with SOC = null. Possible BMS/battery-channel dropout — worth checking.
- Discharge current ≈ -4 to -5.5 A early in the window.

## Reproduce

```bash
curl -X POST 'https://solar.siseli.com/apis/deviceState/simple/attribute/keys/history/v1' \
  -H 'IOT-Token: <token>' -H 'IOT-Time-Zone: Asia/Taipei' \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"524496472032645121","keys":["remainingBatteryCapacity","batteryCurrent"],"fromTime":"2026-09-24T00:00:00+08:00","toTime":"2026-09-24T23:59:59+08:00","page":1,"count":1500,"orderByTimeAsc":true}'
```

## Integration notes

- Token lifetime unknown; login flow not captured. Plan for token refresh / re-login.
- Zip `timeSeries` + `fields` into rows client-side; drop rows where all requested keys are null.
- Check platform ToS before automated polling.
