# Handoff: Solar of Things (solar.siseli.com) — device firmware / upgrade API

Context: captured from the Solar of Things web console on 2026-09-25 ("Device Firmware List"
page and the related upgrade pages), read-only — no Download / Disable / Delete / upgrade action
was triggered. The app does **not** call any of these yet; this file is the reference for adding
firmware upgrades. Compare `API_REFERENCE.md` §14–15 and §35.

> `docs/API_INTERFACES.txt` / `docs/API_STATUS_REPORT.txt` list `/firmware/latest`,
> `/firmware/upgrade` and `/firmware/upgrade/progress`. Those were placeholders written before
> this capture — **they do not exist** on the platform.

Base: `https://solar.siseli.com/apis` · session header `IOT-Token` (the app's usual signed
request, `src/utils/apiClient.ts`) · ids are snowflake Longs (e.g. `511784252588920832`) — send
and keep them as **strings**, like every other id in this app.

## 1. Firmware (what is published)

| Method | Path | Seen on | Notes |
|---|---|---|---|
| POST | `/device/firmware/list` | Device Firmware List table | Body carries the filters (Name, upgrade protocol) + `page`/`count`. |
| GET | `/device/firmware/details?id=<firmwareId>` | "View" drawer | Name, File Size, File MD5, Creation Time, Creating People, Device Firmware Upgrade Protocol (e.g. `FFB · yfk_control_V1.0.1`), Status, Check Password, Description. |
| GET | `/device/upgrade/protocol/names` | "Applicable To The Upgrade Protocol" dropdown | Upgrade protocol options. |
| GET | `/device/upgrade/firmware/names` | firmware name suggestions | |
| GET | `/device/upgrade/permission/get` | "Device Firmware Upgrade Permission" button | Whether this account may upgrade — check before offering anything. |
| POST | `/device/firmware/list/fromManufacturer?deviceId=&certificateDtuID=` | (API_REFERENCE §14, not on this page) | Firmware the manufacturer published **for one device** — the call a per-device "Check for update" needs. |

Row actions **Download / Disable / Delete** have their own endpoints, not captured (Disable and
Delete change or remove data). Download is read-only and can be captured next.

## 2. Upgrade tasks (running an upgrade)

| Method | Path | Notes |
|---|---|---|
| POST | `/device/upgrade/create` | **Starts an upgrade** (API_REFERENCE §15, `DeviceUpgradeCreateDtio`). Body not captured yet. |
| POST | `/device/upgrade/list` | Upgrade tasks (`DeviceUpgradeSearchDtio`). |
| GET | `/device/upgrade/details?id=<deviceUpgradeId>` | One task. |
| GET | `/device/upgrade/logs?deviceUpgradeId=<id>` | Progress / log lines of one task. |
| GET | `/device/upgrade/script/file/info?protocolId=&deviceId=&certificateDtuID=` | Upgrade script file for a protocol + device (API_REFERENCE §15). |
| POST | `/device/batch/upgrade/list` | Batch upgrades (fleet). |
| GET | `/device/batch/upgrade/details?id=<batchId>` | One batch. |
| GET | `/device/batch/upgrade/subDeviceupgrade?batchId=<batchId>` | Per-device state inside a batch. |
| GET | `/dictionary/data/deviceBatchUpgrade` | Dictionary (status / type labels) for batch upgrades. |
| POST | `/device/manufacturer/upgrade/protocol/query/bound/list` | Upgrade protocols the manufacturer has bound. |

The `…/list` methods were not recorded in the capture; POST is assumed from the console's
pattern (lists are POST, details and dictionaries GET) and must be confirmed.

## 2b. The console's per-device upgrade wizard (captured 2026-09-25)

Page `#/operator/stationDevice/deviceList/upgrade?id=<deviceId>` (a Sierro unit on gather protocol
`MS2113672 深圳壹飞克协议_希亚罗`). Captured up to step 3; **"Upgrade Now" was not pressed.**

| Step | Method | Path | Params | Purpose |
|---|---|---|---|---|
| load | GET | `/device/details` | `deviceId` | SN, model, firmware version, gather protocol, DTU |
| ① upgrade protocol | GET | `/gather/protocol/manufacturerDeviceUpgradeProtocol/overviews` | `gatherProtocolId` (the device's gather protocol) | Upgrade protocols bound to that gather protocol, e.g. `AKDB \| yfk_Inversion_V1.0.1` |
| ② firmware | POST | `/device/firmware/list` | body, presumably filtered by the chosen upgrade protocol (body not captured) | Firmware files for that protocol |
| ③ confirm | — | not captured (`/device/upgrade/…`, most likely `create`) | — | The write that starts the upgrade; afterwards track with `upgrade/details` and `upgrade/logs` |

What this tells us:
- A Sierro unit exposes **more than one upgrade protocol**: `yfk_control_V1.0.1` (seen on the
  firmware list — main control) and `yfk_Inversion_V1.0.1` (the wizard — inverter). Each has its
  own firmware files (`.hex`, e.g. `EOD-580HV01_LV_CN501_1102_CL260725.hex`, ~144 KB).
- **Firmware is matched by upgrade protocol, not by model.** In the capture the wizard
  pre-selected `EOD-580HV01_LV_CN11_1150_CL260706.hex` for a device whose model and firmware
  fields were empty, so the console gave no way to check the file fits the unit. The app must
  never let a user pick firmware: it may only offer a file that a curated mapping
  (model + board → upgrade protocol → firmware) says is right for that device.
- Download (row action on the firmware list) is a JS-issued request that saves the `.hex`; its
  URL is still to be recorded.

## 3. What the app already has

- Device record fields (`DeviceListItem`, `src/api/deviceApi.ts`): `softwareVersion`,
  `isUpgrading`, `isFirmwareUpgradeEnabled` (details only), `deviceUpgradeId`. Typed, **unused**.
- Device registers: 0x0200 hardware version, 0x0204 main-control SW version, 0x0208 inverter SW
  version (`REG_VERSION`, `FRAMES.READ_MCU_VERSION`); **0x0133 = 11 "Online Upgrade"** (system
  state machine). Telemetry `softwareVersionNumber` / `inverterSoftwareVersionNumber`.
- None of it is shown to users today (Device Info has no version row), and nothing stops the app
  writing to a device that is upgrading.

## 4. Still needed before an in-app upgrade

1. **Step ③ ("Upgrade Now") request + response** — DevTools → Network on a unit you intend to
   upgrade anyway, with firmware confirmed for its board; plus `…/details` and `…/logs` while it
   runs. Also the request bodies of steps ② and the list calls (the capture tool saw URLs only).
2. **Which firmware a Sierro unit takes** — main control, inverter or the Wi-Fi module (DTU), and
   how firmware maps to model (Sierro 1000 / 2000).
3. **`certificateDtuID`** — confirm it is the device's `dtuDtuid`.
4. **Permission** — `permission/get` and `isFirmwareUpgradeEnabled` for an **end-user** account
   (not the manufacturer console account). If users cannot upgrade, the app can only show the
   version and upgrade state, and upgrades stay a manufacturer/after-sales action.
5. **Download** endpoint (read-only), for completeness.

## 5. Planned app behaviour (once §4 is answered)

- Device Info: firmware version row (`softwareVersion`, else 0x0204/0x0208).
- "Check for update": `permission/get` → `firmware/list/fromManufacturer` for the device;
  offer an update only when a newer firmware for its protocol exists and the device is online.
- Upgrade: `upgrade/create` → poll `upgrade/details` / `logs` (and `isUpgrading`, 0x0133) with a
  progress screen; the user is told not to unplug or power off.
- **While upgrading, no writes**: AC switch, Sleep Mode / Smart Schedule power writes, the
  client scheduler and the relay tick all hold off while `isUpgrading` is true or 0x0133 = 11.
