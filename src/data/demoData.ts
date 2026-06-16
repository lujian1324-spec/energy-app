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
    name: 'NAS',
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
    name: 'Fridge',
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
  {
    id: 10003,
    name: 'WiFi Router',
    serialNumber: 'SN26102503Z6104956',
    model: 'Sierro 1000',
    deviceSortKey: 'energy_storage',
    deviceSortLocaleText: 'Energy Storage System',
    gatherProtocolNumber: 'GPN-003',
    gatherProtocolNameDisplay: 'Sierro Protocol v2.1',
    softwareVersion: 'V1.0.0',
    stationId: 5003,
    stationName: 'Home Station #3',
    dtuId: 80003,
    dtuDtuid: 'SIERRO-DEMO-003',
    dtuName: 'SIERRO DTU-003',
    isOnline: false,
    isAlarmed: false,
    isPined: false,
    isPeakValleyEnabled: true,
    isUpgrading: false,
    isFirmwareUpgradeEnabled: true,
    isExternalDevice: false,
    isMainMasterDevice: false,
    applyMode: 0,
    state: 'normal',
    stateDict: 'Offline',
    producingPower: 0,
    ratedPower: 500,
    dailyProducedQuantity: 0,
    totalProducedQuantity: 120.0,
    installedAt: '2025-10-01T08:00:00Z',
    lastDataAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    lastOnlineAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    lastOfflineAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    place: 'Living Room',
    iconResid: 'icon_battery',
    ownerUserId: 9999,
    ownerUserName: 'Demo User',
    stationTimezone: 'America/New_York',
    stationCurrencyCode: 'USD',
    stationEnergyIncomePrice: 0.12,
    co2EmissionReduction: 0.8,
    noxEmissionReduction: 0.005,
    so2EmissionReduction: 0.002,
    savingStandardCarbon: 0.4,
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
          soc: makeField('soc', 'State of Charge', 95, '%', 'battery'),
          batteryPower: makeField('batteryPower', 'Battery Power', 0, 'W', 'battery'),
          batteryVoltage: makeField('batteryVoltage', 'Battery Voltage', 3.2, 'V', 'battery'),
          batteryCurrent: makeField('batteryCurrent', 'Battery Current', 72.5, 'A', 'battery'),
          batteryTemp: makeField('batteryTemp', 'Battery Temp', 28.5, '°C', 'battery'),
          batteryHealth: makeField('batteryHealth', 'Battery Health', 98, '%', 'battery'),
          batteryCycles: makeField('batteryCycles', 'Cycles', 286, '', 'battery'),
          acPower: makeField('acPower', 'AC Power', 45, 'W', 'ac'),
          solarPower: makeField('solarPower', 'Solar Power', 0, 'W', 'solar'),
          gridPower: makeField('gridPower', 'Grid Power', 0, 'W', 'grid'),
          outputPower: makeField('outputPower', 'Output Power', 45, 'W', 'output'),
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
              { ...makeField('soc', 'SoC', 95, '%', 'battery'), isHidden: false, nameDisplay: 'State of Charge' },
              { ...makeField('batteryPower', 'Power', 0, 'W', 'battery'), isHidden: false, nameDisplay: 'Battery Power' },
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
          soc: makeField('soc', 'State of Charge', 100, '%', 'battery'),
          batteryPower: makeField('batteryPower', 'Battery Power', 920, 'W', 'battery'),
          batteryVoltage: makeField('batteryVoltage', 'Battery Voltage', 6.4, 'V', 'battery'),
          batteryCurrent: makeField('batteryCurrent', 'Battery Current', 120.2, 'A', 'battery'),
          batteryTemp: makeField('batteryTemp', 'Battery Temp', 31.2, '°C', 'battery'),
          batteryHealth: makeField('batteryHealth', 'Battery Health', 100, '%', 'battery'),
          batteryCycles: makeField('batteryCycles', 'Cycles', 48, '', 'battery'),
          acPower: makeField('acPower', 'AC Power', 1000, 'W', 'ac'),
          solarPower: makeField('solarPower', 'Solar Power', 0, 'W', 'solar'),
          gridPower: makeField('gridPower', 'Grid Power', 0, 'W', 'grid'),
          outputPower: makeField('outputPower', 'Output Power', 80, 'W', 'output'),
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
              { ...makeField('soc', 'SoC', 100, '%', 'battery'), isHidden: false, nameDisplay: 'State of Charge' },
              { ...makeField('batteryPower', 'Power', 920, 'W', 'battery'), isHidden: false, nameDisplay: 'Battery Power' },
            ],
          },
        ],
        firingAlarms: [],
      }

    case 10003: // WiFi Router — offline, last known state
      return {
        deviceId: '10003',
        dtuID: device.dtuDtuid,
        time: baseTime,
        stationId: device.stationId.toString(),
        gatherProtocolNumber: device.gatherProtocolNumber,
        gatherProtocolVersionCode: '2.1',
        fields: {
          soc: makeField('soc', 'State of Charge', 14, '%', 'battery'),
          batteryPower: makeField('batteryPower', 'Battery Power', 0, 'W', 'battery'),
          batteryVoltage: makeField('batteryVoltage', 'Battery Voltage', 3.0, 'V', 'battery'),
          batteryCurrent: makeField('batteryCurrent', 'Battery Current', 0, 'A', 'battery'),
          batteryTemp: makeField('batteryTemp', 'Battery Temp', 24.0, '°C', 'battery'),
          batteryHealth: makeField('batteryHealth', 'Battery Health', 95, '%', 'battery'),
          batteryCycles: makeField('batteryCycles', 'Cycles', 142, '', 'battery'),
          acPower: makeField('acPower', 'AC Power', 0, 'W', 'ac'),
          solarPower: makeField('solarPower', 'Solar Power', 0, 'W', 'solar'),
          gridPower: makeField('gridPower', 'Grid Power', 0, 'W', 'grid'),
          outputPower: makeField('outputPower', 'Output Power', 0, 'W', 'output'),
          dailyCharge: makeField('dailyCharge', 'Charged Today', 0, 'kWh', 'energy'),
          dailyDischarge: makeField('dailyDischarge', 'Discharged Today', 0, 'kWh', 'energy'),
          dailyProduced: makeField('dailyProduced', 'AC Input Today', 0, 'kWh', 'energy'),
          workMode: makeField('workMode', 'Work Mode', 0, '', 'system'),
          hardwareVersion: makeField('hardwareVersion', 'Hardware Version', 'V1.0.0', '', 'system'),
          capacity: makeField('capacity', 'Capacity', '1000Wh', '', 'system'),
          batteryType: makeField('batteryType', 'Battery Type', 'LiFePO4', '', 'system'),
          maxInputPower: makeField('maxInputPower', 'Max Input Power', '400W', '', 'system'),
          maxOutputPower: makeField('maxOutputPower', 'Max Output Power', '500W', '', 'system'),
          voltage: makeField('voltage', 'Voltage', '3.0V', '', 'system'),
          frequency: makeField('frequency', 'Frequency', '60Hz', '', 'system'),
        },
        groups: [
          {
            id: 1,
            key: 'battery',
            name: 'Battery',
            category: 'battery',
            stateItems: [
              { ...makeField('soc', 'SoC', 14, '%', 'battery'), isHidden: false, nameDisplay: 'State of Charge' },
              { ...makeField('batteryPower', 'Power', 0, 'W', 'battery'), isHidden: false, nameDisplay: 'Battery Power' },
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

  if (numericId === 10001) { // SIERRO 1000 — AC 45W in, 0W solar, 45W out, 0W battery, SoC 95%
    return {
      code: 0,
      message: 'success',
      data: {
        ...emptyFlow,
        deviceAttributeState: {
          time: Math.floor(Date.now() / 1000).toString(),
          fields: {
            soc: makeField('soc', 'SoC', 95, '%', 'battery'),
          },
          groups: [],
        },
        pvPanelFlow: makeFlowNode('pvPanel', 'Solar Panel', 'icon_solar', 0),
        batteryFlow: makeFlowNode('battery', 'Battery', 'icon_battery', 0),
        loadFlow: makeFlowNode('load', 'Load', 'icon_load', 45),
        gridFlow: makeFlowNode('grid', 'Grid', 'icon_grid', 45),
      },
    }
  }

  if (numericId === 10002) { // SIERRO 2000 — AC 1000W in, 0W solar, 80W out, 920W charging battery, SoC 100%
    return {
      code: 0,
      message: 'success',
      data: {
        ...emptyFlow,
        deviceAttributeState: {
          time: Math.floor(Date.now() / 1000).toString(),
          fields: {
            soc: makeField('soc', 'SoC', 100, '%', 'battery'),
          },
          groups: [],
        },
        pvPanelFlow: makeFlowNode('pvPanel', 'Solar Panel', 'icon_solar', 0),
        batteryFlow: makeFlowNode('battery', 'Battery', 'icon_battery', 920),
        loadFlow: makeFlowNode('load', 'Load', 'icon_load', 80),
        gridFlow: makeFlowNode('grid', 'Grid', 'icon_grid', 1000),
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

// ── Real hourly simulation logs (latest day) — sierro1000_4days_simulation_3.csv / sierro2000_4days.csv ──
// Grid_Input_W / Grid_W  → AC input
// PV_Input_W   / PV_W    → Solar input
// Fridge_Load_W / Load_W → Output
// Battery_SOC_Pct/SOC_Pct → Battery capacity (%)
const REAL_HOURLY: Record<number, { grid: number[]; pv: number[]; load: number[]; soc: number[] }> = {
  10001: { // SIERRO 1000 — Jun 4, 2026
    grid: [84,51,41,84,52,54,70,25,14,40,0,0,0,0,0,16,4,32,81,47,52,86,43,45],
    pv:   [0,0,0,0,0,0,0,18,29,46,65,82,87,76,76,59,43,13,3,0,0,0,0,0],
    load: [84,51,41,84,52,54,70,43,43,86,52,44,73,43,42,75,47,45,84,47,52,86,43,45],
    // 90% → 100% (charging) → 95% (discharging) repeating every 12h
    soc:  [90,92,94,96,98,100,99,98,97,96,95.5,95, 90,92,94,96,98,100,99,98,97,96,95.5,95],
  },
  10002: { // SIERRO 2000 — Jul 4, 2026
    grid: [0,0,1000,0,0,1000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1000,0,0,1000],
    pv:   [0,0,0,0,0,0,0,1164,1584,1568,1548,1566,1578,1582,1574,1562,1579,1164,0,0,0,0,0,0],
    load: [77,48,64,47,70,50,82,59,84,68,48,66,78,82,74,62,79,58,67,66,80,64,53,80],
    soc:  [96.2,93.8,100.0,97.6,94.2,100.0,95.9,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,100.0,96.7,93.4,100.0,96.8,94.1,100.0],
  },
}

/**
 * Fixed 0am→24pm day curve (not anchored to "now") for the Real-Time Power
 * chart, whose x-axis ticks are fixed at 0/4/8/12/16/20/24.
 * Uses cosine (ease) interpolation between hourly readings plus a light
 * moving-average smoothing pass so hour-to-hour jumps don't render as
 * sharp cliffs once the curve is sampled at high resolution.
 */
export function getDemoDayCurve(
  deviceId: string | number,
  key: 'acPower' | 'solarPower' | 'outputPower' | 'soc',
  points = 480
): number[] {
  const numericId = typeof deviceId === 'string' ? parseInt(deviceId) : deviceId
  const real = REAL_HOURLY[numericId]
  if (!real) return Array(points).fill(0)

  const arr = key === 'acPower' ? real.grid : key === 'solarPower' ? real.pv : key === 'outputPower' ? real.load : real.soc

  const raw: number[] = []
  for (let i = 0; i < points; i++) {
    const hourFloat = (i / (points - 1)) * 24
    const h0 = Math.floor(hourFloat) % 24
    const h1 = (h0 + 1) % 24
    const frac = hourFloat - Math.floor(hourFloat)
    // Cosine easing instead of linear — softens the transition around each hourly reading.
    const eased = (1 - Math.cos(frac * Math.PI)) / 2
    const v = arr[h0] * (1 - eased) + arr[h1] * eased
    raw.push(v)
  }

  // Light moving-average smoothing (circular, since the curve wraps 12am→12am) to
  // further reduce any remaining sharp dips/jumps between consecutive hours.
  // SoC moves slowly relative to power, so it gets a wider smoothing window.
  const windowRadius = Math.max(1, Math.round(points / 96)) * (key === 'soc' ? 2 : 1)
  const smoothed = raw.map((_, i) => {
    let sum = 0
    let count = 0
    for (let o = -windowRadius; o <= windowRadius; o++) {
      const idx = (i + o + raw.length) % raw.length
      sum += raw[idx]
      count++
    }
    return sum / count
  })

  return smoothed.map(v => key === 'soc' ? Math.round(Math.max(0, Math.min(100, v))) : Math.round(Math.max(0, v)))
}

export function getDemoHistoryData(
  deviceId: string | number,
  hours = 24
): { code: number; message: string; data: HistoryDataResponse } {
  const now = Date.now()
  const numericId = typeof deviceId === 'string' ? parseInt(deviceId) : deviceId

  const soc: Array<{ time: string; value: number }> = []
  const solarPower: Array<{ time: string; value: number }> = []
  const outputPower: Array<{ time: string; value: number }> = []
  const batteryPower: Array<{ time: string; value: number }> = []
  const gridPower: Array<{ time: string; value: number }> = []
  const acPower: Array<{ time: string; value: number }> = []

  // 根据时间范围选择采样间隔：避免数据点过多
  // Day(24h)→5min(288pts), Week(168h)→30min(336pts), Month+(720h+)→2h(360pts)
  const intervalMins = hours <= 24 ? 5 : hours <= 200 ? 30 : 120
  const totalPoints = Math.round((hours * 60) / intervalMins)

  const real = REAL_HOURLY[numericId]

  if (real) {
    // Interpolate the real hourly log across the requested points, anchored to actual hour-of-day
    const interp = (arr: number[], hour: number, minute: number) => {
      const h0 = Math.floor(hour) % 24
      const h1 = (h0 + 1) % 24
      const frac = minute / 60
      return arr[h0] * (1 - frac) + arr[h1] * frac
    }

    for (let i = totalPoints - 1; i >= 0; i--) {
      const ts = new Date(now - i * intervalMins * 60 * 1000)
      const time = ts.toISOString()
      const hour = ts.getHours()
      const minute = ts.getMinutes()

      const gridVal = Math.round(interp(real.grid, hour, minute))
      const pvVal = Math.round(interp(real.pv, hour, minute))
      const loadVal = Math.round(interp(real.load, hour, minute))
      const socVal = Math.round(interp(real.soc, hour, minute))

      soc.push({ time, value: Math.max(0, Math.min(100, socVal)) })
      acPower.push({ time, value: Math.max(0, gridVal) })
      solarPower.push({ time, value: Math.max(0, pvVal) })
      outputPower.push({ time, value: Math.max(0, loadVal) })
      batteryPower.push({ time, value: gridVal + pvVal - loadVal })
      gridPower.push({ time, value: Math.max(0, gridVal) })
    }

    return {
      code: 0,
      message: 'success',
      data: { soc, solarPower, outputPower, batteryPower, gridPower, acPower },
    }
  }

  // ── Fallback procedural data for devices without a real log (e.g. offline WiFi Router) ──
  const acInput = 0
  const outputBase = 0

  for (let i = totalPoints - 1; i >= 0; i--) {
    const ts = new Date(now - i * intervalMins * 60 * 1000)
    const time = ts.toISOString()
    soc.push({ time, value: 14 })
    acPower.push({ time, value: acInput })
    solarPower.push({ time, value: 0 })
    outputPower.push({ time, value: outputBase })
    batteryPower.push({ time, value: 0 })
    gridPower.push({ time, value: 0 })
  }

  return {
    code: 0,
    message: 'success',
    data: { soc, solarPower, outputPower, batteryPower, gridPower, acPower },
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
