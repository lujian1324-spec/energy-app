/**
 * Demo 数据 — Guest / localtest / benson 模式使用的模拟设备和状态数据
 *
 * 包含设备：
 * - SIERRO 1000 (1000Wh LiFePO4, 最大输入 400W / 最大输出 500W)
 * - SIERRO 2000 (2000Wh LiFePO4, 最大输入 1000W / 最大输出 1000W)
 */

import type {
  DeviceListItem,
  DeviceStateResponse,
  EnergyFlowData,
  EnergyFlowNode,
  HistoryDataResponse,
} from '../api/deviceApi'

// ═══════════════════════════════════════════════════════
// Demo 设备列表（符合 DeviceListItem 类型）
// ═══════════════════════════════════════════════════════

export const demoDevices: DeviceListItem[] = [
  {
    id: 10001,
    name: 'SIERRO 1000',
    serialNumber: 'SN26102503Z6104955',
    model: 'Sierro 1000',
    deviceSortKey: 'energy_storage',
    deviceSortLocaleText: 'Energy Storage System',
    gatherProtocolNumber: 'GPN-001',
    gatherProtocolNameDisplay: 'Sierro Protocol v2.1',
    softwareVersion: 'V1.0.0',
    stationId: 5001,
    stationName: 'Home Station #1',
    dtuId: 80001,
    dtuDtuid: 'SIERRO-DEMO-001',
    dtuName: 'SIERRO DTU-001',
    isOnline: true,
    isAlarmed: false,
    isPined: true,
    isPeakValleyEnabled: true,
    isUpgrading: false,
    isFirmwareUpgradeEnabled: true,
    isExternalDevice: false,
    isMainMasterDevice: true,
    applyMode: 0,
    state: 'normal',
    stateDict: 'Normal Operation',
    producingPower: 400,
    ratedPower: 500,
    dailyProducedQuantity: 4.0,
    totalProducedQuantity: 365.0,
    installedAt: '2025-10-01T08:00:00Z',
    lastDataAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    lastOnlineAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    lastOfflineAt: '',
    place: 'Garage',
    iconResid: 'icon_battery',
    ownerUserId: 9999,
    ownerUserName: 'Demo User',
    stationTimezone: 'America/New_York',
    stationCurrencyCode: 'USD',
    stationEnergyIncomePrice: 0.12,
    co2EmissionReduction: 3.2,
    noxEmissionReduction: 0.01,
    so2EmissionReduction: 0.005,
    savingStandardCarbon: 1.3,
    extraProperty: {},
    summaryProperty: {},
  },
  {
    id: 10002,
    name: 'SIERRO 2000',
    serialNumber: 'SN26102503Z6104955',
    model: 'Sierro 2000',
    deviceSortKey: 'energy_storage',
    deviceSortLocaleText: 'Energy Storage System',
    gatherProtocolNumber: 'GPN-002',
    gatherProtocolNameDisplay: 'Sierro Protocol v2.1',
    softwareVersion: 'V1.0.0',
    stationId: 5002,
    stationName: 'Home Station #2',
    dtuId: 80002,
    dtuDtuid: 'SIERRO-DEMO-002',
    dtuName: 'SIERRO DTU-002',
    isOnline: true,
    isAlarmed: false,
    isPined: true,
    isPeakValleyEnabled: true,
    isUpgrading: false,
    isFirmwareUpgradeEnabled: true,
    isExternalDevice: false,
    isMainMasterDevice: false,
    applyMode: 0,
    state: 'normal',
    stateDict: 'Charging',
    producingPower: 1000,
    ratedPower: 1000,
    dailyProducedQuantity: 5.5,
    totalProducedQuantity: 502.5,
    installedAt: '2025-10-01T10:00:00Z',
    lastDataAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    lastOnlineAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    lastOfflineAt: '',
    place: 'Basement',
    iconResid: 'icon_battery',
    ownerUserId: 9999,
    ownerUserName: 'Demo User',
    stationTimezone: 'America/New_York',
    stationCurrencyCode: 'USD',
    stationEnergyIncomePrice: 0.12,
    co2EmissionReduction: 4.8,
    noxEmissionReduction: 0.02,
    so2EmissionReduction: 0.008,
    savingStandardCarbon: 2.0,
    extraProperty: {},
    summaryProperty: {},
  },
]

// ═══════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════

/** 创建设备状态字段 */
function makeField(key: string, name: string, value: unknown, unit: string, category: string) {
  return {
    key,
    name,
    value,
    valueDisplay: `${value} ${unit}`.trim(),
    unit,
    valueType: typeof value === 'number' ? 'number' : 'string',
    category,
  }
}

/** 创建 EnergyFlowNode */
function makeFlowNode(key: string, localeTitle: string, iconResid: string, val: number): EnergyFlowNode {
  return {
    key,
    localeTitle,
    iconResid,
    value: {
      key: 'power',
      unit: 'W',
      value: val,
      valueDisplay: `${val} W`,
      isHidden: false,
      nameDisplay: localeTitle,
    },
    extraValues: [],
    isLight: val > 0 ? true : null,
    flowDirection: val > 0 ? 1 : -1,
    gatherDeviceAttributeGroupKey: key,
    isEnabled: true,
  }
}

// ═══════════════════════════════════════════════════════
// Demo 设备状态数据
// ═══════════════════════════════════════════════════════

/** 为指定设备生成模拟实时状态 */
export function getDemoDeviceState(deviceId: string | number): DeviceStateResponse | null {
  const numericId = typeof deviceId === 'string' ? parseInt(deviceId) : deviceId
  const device = demoDevices.find(d => d.id === numericId)
  if (!device) return null

  const now = Date.now()
  const baseTime = Math.floor(now / 1000).toString()

  switch (numericId) {
    case 10001: // SIERRO 1000 — AC input 400W, Solar 0W, output 168W
      return {
        deviceId: '10001',
        dtuID: device.dtuDtuid,
        time: baseTime,
        stationId: device.stationId.toString(),
        gatherProtocolNumber: device.gatherProtocolNumber,
        gatherProtocolVersionCode: '2.1',
        fields: {
          soc: makeField('soc', 'State of Charge', 78, '%', 'battery'),
          batteryPower: makeField('batteryPower', 'Battery Power', 232, 'W', 'battery'),
          batteryVoltage: makeField('batteryVoltage', 'Battery Voltage', 3.2, 'V', 'battery'),
          batteryCurrent: makeField('batteryCurrent', 'Battery Current', 72.5, 'A', 'battery'),
          batteryTemp: makeField('batteryTemp', 'Battery Temp', 28.5, '°C', 'battery'),
          batteryHealth: makeField('batteryHealth', 'Battery Health', 98, '%', 'battery'),
          batteryCycles: makeField('batteryCycles', 'Cycles', 286, '', 'battery'),
          acPower: makeField('acPower', 'AC Power', 400, 'W', 'ac'),
          solarPower: makeField('solarPower', 'Solar Power', 0, 'W', 'solar'),
          gridPower: makeField('gridPower', 'Grid Power', 0, 'W', 'grid'),
          outputPower: makeField('outputPower', 'Output Power', 168, 'W', 'output'),
          dailyCharge: makeField('dailyCharge', 'Charged Today', 2.4, 'kWh', 'energy'),
          dailyDischarge: makeField('dailyDischarge', 'Discharged Today', 1.0, 'kWh', 'energy'),
          dailyProduced: makeField('dailyProduced', 'AC Input Today', 4.0, 'kWh', 'energy'),
          workMode: makeField('workMode', 'Work Mode', 0, '', 'system'),
          // Device info fields
          hardwareVersion: makeField('hardwareVersion', 'Hardware Version', 'V1.0.0', '', 'system'),
          capacity: makeField('capacity', 'Capacity', '1000Wh', '', 'system'),
          batteryType: makeField('batteryType', 'Battery Type', 'LiFePO4', '', 'system'),
          maxInputPower: makeField('maxInputPower', 'Max Input Power', '400W', '', 'system'),
          maxOutputPower: makeField('maxOutputPower', 'Max Output Power', '500W', '', 'system'),
          voltage: makeField('voltage', 'Voltage', '3.2V', '', 'system'),
          frequency: makeField('frequency', 'Frequency', '60Hz', '', 'system'),
        },
        groups: [
          {
            id: 1,
            key: 'battery',
            name: 'Battery',
            category: 'battery',
            stateItems: [
              { ...makeField('soc', 'SoC', 78, '%', 'battery'), isHidden: false, nameDisplay: 'State of Charge' },
              { ...makeField('batteryPower', 'Power', 232, 'W', 'battery'), isHidden: false, nameDisplay: 'Battery Power' },
            ],
          },
        ],
        firingAlarms: [],
      }

    case 10002: // SIERRO 2000 — AC input 1000W, Solar 0W, output 231W
      return {
        deviceId: '10002',
        dtuID: device.dtuDtuid,
        time: baseTime,
        stationId: device.stationId.toString(),
        gatherProtocolNumber: device.gatherProtocolNumber,
        gatherProtocolVersionCode: '2.1',
        fields: {
          soc: makeField('soc', 'State of Charge', 62, '%', 'battery'),
          batteryPower: makeField('batteryPower', 'Battery Power', 769, 'W', 'battery'),
          batteryVoltage: makeField('batteryVoltage', 'Battery Voltage', 6.4, 'V', 'battery'),
          batteryCurrent: makeField('batteryCurrent', 'Battery Current', 120.2, 'A', 'battery'),
          batteryTemp: makeField('batteryTemp', 'Battery Temp', 31.2, '°C', 'battery'),
          batteryHealth: makeField('batteryHealth', 'Battery Health', 100, '%', 'battery'),
          batteryCycles: makeField('batteryCycles', 'Cycles', 48, '', 'battery'),
          acPower: makeField('acPower', 'AC Power', 1000, 'W', 'ac'),
          solarPower: makeField('solarPower', 'Solar Power', 0, 'W', 'solar'),
          gridPower: makeField('gridPower', 'Grid Power', 0, 'W', 'grid'),
          outputPower: makeField('outputPower', 'Output Power', 231, 'W', 'output'),
          dailyCharge: makeField('dailyCharge', 'Charged Today', 4.6, 'kWh', 'energy'),
          dailyDischarge: makeField('dailyDischarge', 'Discharged Today', 0.8, 'kWh', 'energy'),
          dailyProduced: makeField('dailyProduced', 'AC Input Today', 5.5, 'kWh', 'energy'),
          workMode: makeField('workMode', 'Work Mode', 1, '', 'system'),
          // Device info fields
          hardwareVersion: makeField('hardwareVersion', 'Hardware Version', 'V1.0.0', '', 'system'),
          capacity: makeField('capacity', 'Capacity', '2000Wh', '', 'system'),
          batteryType: makeField('batteryType', 'Battery Type', 'LiFePO4', '', 'system'),
          maxInputPower: makeField('maxInputPower', 'Max Input Power', '1000W', '', 'system'),
          maxOutputPower: makeField('maxOutputPower', 'Max Output Power', '1000W', '', 'system'),
          voltage: makeField('voltage', 'Voltage', '6.4V', '', 'system'),
          frequency: makeField('frequency', 'Frequency', '60Hz', '', 'system'),
        },
        groups: [
          {
            id: 1,
            key: 'battery',
            name: 'Battery',
            category: 'battery',
            stateItems: [
              { ...makeField('soc', 'SoC', 62, '%', 'battery'), isHidden: false, nameDisplay: 'State of Charge' },
              { ...makeField('batteryPower', 'Power', 769, 'W', 'battery'), isHidden: false, nameDisplay: 'Battery Power' },
            ],
          },
        ],
        firingAlarms: [],
      }

    default:
      return null
  }
}

// ═══════════════════════════════════════════════════════
// Demo 能量流动数据
// ═══════════════════════════════════════════════════════

export function getDemoEnergyFlow(deviceId: string | number): { code: number; message: string; data: EnergyFlowData } {
  const numericId = typeof deviceId === 'string' ? parseInt(deviceId) : deviceId

  const emptyFlow: EnergyFlowData = {
    deviceAttributeState: {
      time: Math.floor(Date.now() / 1000).toString(),
      fields: {},
      groups: [],
    },
    pvPanelFlow: null,
    gridFlow: null,
    batteryFlow: null,
    loadFlow: null,
    generatorFlow: null,
    upsFlow: null,
    ctFlow: null,
  }

  if (numericId === 10001) { // SIERRO 1000 — AC 400W in, 168W out, 232W charging battery
    return {
      code: 0,
      message: 'success',
      data: {
        ...emptyFlow,
        deviceAttributeState: {
          time: Math.floor(Date.now() / 1000).toString(),
          fields: {
            soc: makeField('soc', 'SoC', 78, '%', 'battery'),
          },
          groups: [],
        },
        pvPanelFlow: makeFlowNode('pvPanel', 'Solar Panel', 'icon_solar', 0),
        batteryFlow: makeFlowNode('battery', 'Battery', 'icon_battery', 232),
        loadFlow: makeFlowNode('load', 'Load', 'icon_load', 168),
        gridFlow: makeFlowNode('grid', 'Grid', 'icon_grid', 0),
      },
    }
  }

  if (numericId === 10002) { // SIERRO 2000 — AC 1000W in, 231W out, 769W charging battery
    return {
      code: 0,
      message: 'success',
      data: {
        ...emptyFlow,
        deviceAttributeState: {
          time: Math.floor(Date.now() / 1000).toString(),
          fields: {
            soc: makeField('soc', 'SoC', 62, '%', 'battery'),
          },
          groups: [],
        },
        pvPanelFlow: makeFlowNode('pvPanel', 'Solar Panel', 'icon_solar', 0),
        batteryFlow: makeFlowNode('battery', 'Battery', 'icon_battery', 769),
        loadFlow: makeFlowNode('load', 'Load', 'icon_load', 231),
        gridFlow: makeFlowNode('grid', 'Grid', 'icon_grid', 0),
      },
    }
  }

  return {
    code: 0,
    message: 'success',
    data: emptyFlow,
  }
}

// ═══════════════════════════════════════════════════════
// Demo 历史数据（支持 Day / Week / Month 3个月范围）
// ═══════════════════════════════════════════════════════

export function getDemoHistoryData(
  deviceId: string | number,
  hours = 24
): { code: number; message: string; data: HistoryDataResponse } {
  const now = Date.now()
  const numericId = typeof deviceId === 'string' ? parseInt(deviceId) : deviceId

  // AC 功率（作为输入功率存入 solarPower 字段供图表展示）
  const acInput = numericId === 10002 ? 1000 : 400
  const outputBase = numericId === 10002 ? 231 : 168

  const soc: Array<{ time: string; value: number }> = []
  const solarPower: Array<{ time: string; value: number }> = []
  const outputPower: Array<{ time: string; value: number }> = []
  const batteryPower: Array<{ time: string; value: number }> = []
  const gridPower: Array<{ time: string; value: number }> = []

  // 根据时间范围选择采样间隔：避免数据点过多
  // Day(24h)→5min(288pts), Week(168h)→30min(336pts), Month+(720h+)→2h(360pts)
  const intervalMins = hours <= 24 ? 5 : hours <= 200 ? 30 : 120
  const totalPoints = Math.round((hours * 60) / intervalMins)

  // 固定随机种子：用设备 id + 点索引保证同设备每次生成相同曲线
  const pseudoRand = (i: number, amp: number) => {
    const x = Math.sin(i * 127.1 + numericId * 0.01) * 43758.5453
    return (x - Math.floor(x) - 0.5) * amp
  }

  // 初始 SoC：SIERRO 1000 从 40% 开始，SIERRO 2000 从 30% 开始
  // 每个 interval 净充电 = acInput - outputBase（单位 W），换算成 kWh
  const capacityKwh = numericId === 10002 ? 2.0 : 1.0
  const intervalH = intervalMins / 60
  const netChargePerInterval = ((acInput - outputBase) * intervalH) / 1000 // kWh
  const socChangePerInterval = (netChargePerInterval / capacityKwh) * 100  // %

  let currentSoc = numericId === 10002 ? 30 : 40

  for (let i = totalPoints - 1; i >= 0; i--) {
    const ts = new Date(now - i * intervalMins * 60 * 1000)
    const time = ts.toISOString()
    const jitter = (amp: number) => pseudoRand(i, amp)

    // SoC: 随时间线性增长（充电状态），加小幅抖动，夹在 5~100%
    currentSoc = Math.max(5, Math.min(100, currentSoc + socChangePerInterval + jitter(0.5)))

    // 功率加轻微抖动模拟真实波动（±5%）
    const inputVal = Math.round(Math.max(0, acInput + jitter(acInput * 0.05)))
    const outputVal = Math.round(Math.max(0, outputBase + jitter(outputBase * 0.05)))

    soc.push({ time, value: Math.round(currentSoc) })
    solarPower.push({ time, value: inputVal })  // AC power stored as solarPower for chart input series
    outputPower.push({ time, value: outputVal })
    batteryPower.push({ time, value: Math.round(inputVal - outputVal) })
    gridPower.push({ time, value: 0 })
  }

  return {
    code: 0,
    message: 'success',
    data: { soc, solarPower, outputPower, batteryPower, gridPower },
  }
}

// ═══════════════════════════════════════════════════════
// Demo 通知数据（Notifications 模块）
// ═══════════════════════════════════════════════════════

export interface DemoNotification {
  id: number
  type: 'low_battery' | 'power_outage'
  deviceName: string
  description: string
  time: string
  date: string
}

export const demoNotifications: DemoNotification[] = [
  { id: 1, type: 'low_battery', deviceName: 'SIERRO 1000', description: 'Reserve threshold reached (20%). Charging from AC now.', time: '5 mins ago', date: 'Today' },
  { id: 2, type: 'power_outage', deviceName: 'SIERRO 2000', description: 'Grid outage detected. Switched to battery backup automatically.', time: '3:42 PM', date: 'Today' },
  { id: 3, type: 'low_battery', deviceName: 'SIERRO 1000', description: 'Battery at 22% — peak-shaving paused until charged.', time: '1:10 PM', date: 'Today' },
  { id: 4, type: 'power_outage', deviceName: 'SIERRO 2000', description: 'Grid restored after 18-minute outage. Resuming normal operation.', time: '11:24 AM', date: 'Yesterday' },
  { id: 5, type: 'low_battery', deviceName: 'SIERRO 1000', description: 'Battery fully charged — ready for backup.', time: 'Apr 28', date: 'April' },
  { id: 6, type: 'power_outage', deviceName: 'SIERRO 2000', description: 'Backup power engaged for 42 minutes during outage.', time: 'Apr 15', date: 'April' },
  { id: 7, type: 'low_battery', deviceName: 'SIERRO 1000', description: 'Overnight discharge completed. AC recharge begins at 6 AM.', time: 'Mar 23', date: 'March' },
]

// ═══════════════════════════════════════════════════════
// Demo 用户资料（Profile / Setting 模块）
// ═══════════════════════════════════════════════════════

export const demoUserProfile = {
  name: 'Demo User',
  email: 'demo@sierro.energy',
  avatar: null as string | null,
  memberSince: '2025-10-01T08:00:00Z',
  founderBadge: true,
  founderNumber: 42,
}

// ═══════════════════════════════════════════════════════
// Demo 削峰填谷配置（Peak Shaving 模块）
// ═══════════════════════════════════════════════════════

export const demoPeakValleyConfig = {
  enabled: true,
  peakPrice: 0.42,
  offPeakPrice: 0.12,
  peakStart: 16 * 60,
  peakEnd: 21 * 60,
  offPeakStart: 0,
  offPeakEnd: 6 * 60,
  reserveSoc: 20,
  estimatedMonthlySaving: 48.6,
}
