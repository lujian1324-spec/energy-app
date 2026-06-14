/**
 * Demo 数据 — Guest / localtest / benson 模式使用的模拟设备和状态数据
 *
 * 包含设备：
 * - Sierro2000 (Sierro 2000 Portable Power Station)
 * - CPAP (CPAP Machine)
 * - FRIDGE (Smart Fridge)
 * - SOLAR PANEL (Solar Panel System)
 * - AC UNIT (Air Conditioner)
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
    name: 'Sierro2000',
    serialNumber: 'SN26102503Z6104955',
    model: 'Sierro 2000',
    deviceSortKey: 'energy_storage',
    deviceSortLocaleText: 'Portable Power Station',
    gatherProtocolNumber: 'GPN-S2000',
    gatherProtocolNameDisplay: 'Sierro Protocol v2.1',
    softwareVersion: 'V1.0.0',
    stationId: 5001,
    stationName: 'Home Station #1',
    dtuId: 80001,
    dtuDtuid: 'Sierro2000-DEMO-001',
    dtuName: 'Sierro 2000 DTU',
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
    producingPower: 1000,
    ratedPower: 1000,
    dailyProducedQuantity: 15.6,
    totalProducedQuantity: 1256.3,
    installedAt: '2024-01-15T08:00:00Z',
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
    case 10001: // Sierro2000
      return {
        deviceId: '10001',
        dtuID: device.dtuDtuid,
        time: baseTime,
        stationId: device.stationId.toString(),
        gatherProtocolNumber: device.gatherProtocolNumber,
        gatherProtocolVersionCode: '2.1',
        fields: {
          soc: makeField('soc', 'State of Charge', 78, '%', 'battery'),
          batteryPower: makeField('batteryPower', 'Battery Power', -769, 'W', 'battery'),
          acPower: makeField('acPower', 'AC Power', 1000, 'W', 'ac'),
          solarPower: makeField('solarPower', 'Solar Power', 0, 'W', 'solar'),
          outputPower: makeField('outputPower', 'Output Power', 231, 'W', 'output'),
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
              { ...makeField('batteryPower', 'Power', -769, 'W', 'battery'), isHidden: false, nameDisplay: 'Battery Power' },
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

  if (numericId === 10001) { // Sierro2000
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
        batteryFlow: makeFlowNode('battery', 'Battery', 'icon_battery', -769),
        loadFlow: makeFlowNode('load', 'Load', 'icon_load', 231),
        gridFlow: makeFlowNode('grid', 'Grid', 'icon_grid', 1000),
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

export function getDemoHistoryData(deviceId: string | number, hours = 24): { code: number; message: string; data: HistoryDataResponse } {
  const socPoints: Array<{ time: string; value: number }> = []
  const solarPoints: Array<{ time: string; value: number }> = []
  const outputPoints: Array<{ time: string; value: number }> = []
  const now = Date.now()
  const numericId = typeof deviceId === 'string' ? parseInt(deviceId) : deviceId

  // ── 根据设备确定基准功率参数 ──
  let baseAC = 400, baseSolar = 0, baseOutput = 168   // 默认设备
  if (numericId === 10001) {                           // Sierro2000
    baseAC = 1000; baseSolar = 0; baseOutput = 231
  } else if (numericId === 10004) {                    // Solar Panel
    baseAC = 0; baseSolar = 4200; baseOutput = 800
  }

  // 生成时间序列（5 分钟间隔）
  for (let i = hours * 12 - 1; i >= 0; i--) {
    const ts = now - i * 5 * 60 * 1000
    const time = new Date(ts).toISOString()
    const hour = new Date(ts).getHours()
    const dayProgress = i / (hours * 12) // 0→1 从过去到现在

    // ── SoC 曲线：模拟充放电循环 ──
    let socValue = 50
    if (numericId === 10001) {
      // Sierro2000: 日间 AC 充电 (6-22h)，夜间放电
      const chargePhase = hour >= 6 && hour <= 22
      const cycleOffset = Math.sin(dayProgress * Math.PI * 2 * (hours / 24)) * 15
      socValue = chargePhase
        ? 60 + cycleOffset + (Math.random() - 0.5) * 6
        : 45 + cycleOffset + (Math.random() - 0.5) * 6
      socValue = Math.max(10, Math.min(98, socValue))
    } else if (numericId === 10004) {
      // Solar Panel: 白天太阳能充电，SoC 较高
      socValue = hour >= 6 && hour <= 18
        ? 70 + Math.sin((hour - 6) / 12 * Math.PI) * 20 + (Math.random() - 0.5) * 4
        : 50 + (Math.random() - 0.5) * 6
      socValue = Math.max(15, Math.min(98, socValue))
    } else {
      socValue = 50 + Math.sin(dayProgress * Math.PI * 2) * 30 + (Math.random() - 0.5) * 4
      socValue = Math.max(0, Math.min(100, socValue))
    }

    // ── Solar 功率曲线 ──
    let solarValue = 0
    if (baseSolar > 0) {
      solarValue = hour >= 6 && hour <= 18
        ? Math.round(baseSolar * Math.sin((hour - 6) / 12 * Math.PI) + (Math.random() - 0.5) * baseSolar * 0.08)
        : 0
      solarValue = Math.max(0, solarValue)
    }

    // ── Output 功率曲线 ──
    let outputValue = 0
    const isPeak = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 22)
    if (numericId === 10001) {
      // Sierro2000: 日间输出较低（充电中），早晚高峰略高
      outputValue = Math.round(baseOutput * (isPeak ? 1.0 : 0.6) + (Math.random() - 0.5) * baseOutput * 0.15)
    } else if (numericId === 10004) {
      outputValue = Math.round(baseOutput * (isPeak ? 1.2 : 0.4) + (Math.random() - 0.5) * baseOutput * 0.1)
    } else {
      outputValue = Math.round(baseOutput * (isPeak ? 1.1 : 0.5) + (Math.random() - 0.5) * baseOutput * 0.2)
    }
    outputValue = Math.max(0, outputValue)

    socPoints.push({ time, value: Math.round(socValue * 10) / 10 })
    solarPoints.push({ time, value: solarValue })
    outputPoints.push({ time, value: outputValue })
  }

  return {
    code: 0,
    message: 'success',
    data: {
      soc: socPoints,
      solarPower: solarPoints,
      outputPower: outputPoints,
    },
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
