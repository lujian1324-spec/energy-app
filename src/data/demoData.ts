/**
 * Demo 数据 — Guest 模式使用的模拟设备和状态数据
 *
 * 包含设备：
 * - SIERRO 1000 (Sierro Energy Storage, 5 kWh)
 * - SIERRO 2000 (Sierro Energy Storage, 10 kWh)
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
    serialNumber: 'SR-2024-10001',
    model: 'SIERRO-1000',
    deviceSortKey: 'energy_storage',
    deviceSortLocaleText: 'Energy Storage System',
    gatherProtocolNumber: 'GPN-001',
    gatherProtocolNameDisplay: 'Sierro Protocol v2.1',
    softwareVersion: '3.11.0',
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
    producingPower: 3600,
    ratedPower: 5000,
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
    co2EmissionReduction: 14.2,
    noxEmissionReduction: 0.05,
    so2EmissionReduction: 0.02,
    savingStandardCarbon: 5.8,
    extraProperty: {},
    summaryProperty: {},
  },
  {
    id: 10002,
    name: 'SIERRO 2000',
    serialNumber: 'SR-2024-10002',
    model: 'SIERRO-2000',
    deviceSortKey: 'energy_storage',
    deviceSortLocaleText: 'Energy Storage System',
    gatherProtocolNumber: 'GPN-002',
    gatherProtocolNameDisplay: 'Sierro Protocol v2.1',
    softwareVersion: '3.11.0',
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
    producingPower: 1800,
    ratedPower: 10000,
    dailyProducedQuantity: 22.4,
    totalProducedQuantity: 843.7,
    installedAt: '2024-06-01T10:00:00Z',
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
    co2EmissionReduction: 9.6,
    noxEmissionReduction: 0.03,
    so2EmissionReduction: 0.01,
    savingStandardCarbon: 3.9,
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
    case 10001: // SIERRO 1000
      return {
        deviceId: '10001',
        dtuID: device.dtuDtuid,
        time: baseTime,
        stationId: device.stationId.toString(),
        gatherProtocolNumber: device.gatherProtocolNumber,
        gatherProtocolVersionCode: '2.1',
        fields: {
          soc: makeField('soc', 'State of Charge', 78, '%', 'battery'),
          batteryPower: makeField('batteryPower', 'Battery Power', -1200, 'W', 'battery'),
          batteryVoltage: makeField('batteryVoltage', 'Battery Voltage', 51.2, 'V', 'battery'),
          batteryCurrent: makeField('batteryCurrent', 'Battery Current', -23.4, 'A', 'battery'),
          batteryTemp: makeField('batteryTemp', 'Battery Temp', 28.5, '°C', 'battery'),
          batteryHealth: makeField('batteryHealth', 'Battery Health', 98, '%', 'battery'),
          batteryCycles: makeField('batteryCycles', 'Cycles', 286, '', 'battery'),
          acPower: makeField('acPower', 'AC Power', 2400, 'W', 'ac'),
          solarPower: makeField('solarPower', 'Solar Power', 3200, 'W', 'solar'),
          gridPower: makeField('gridPower', 'Grid Power', 0, 'W', 'grid'),
          outputPower: makeField('outputPower', 'Output Power', 3600, 'W', 'output'),
          dailyCharge: makeField('dailyCharge', 'Charged Today', 9.8, 'kWh', 'energy'),
          dailyDischarge: makeField('dailyDischarge', 'Discharged Today', 6.2, 'kWh', 'energy'),
          dailyProduced: makeField('dailyProduced', 'Solar Today', 15.6, 'kWh', 'energy'),
          workMode: makeField('workMode', 'Work Mode', 0, '', 'system'),
        },
        groups: [
          {
            id: 1,
            key: 'battery',
            name: 'Battery',
            category: 'battery',
            stateItems: [
              { ...makeField('soc', 'SoC', 78, '%', 'battery'), isHidden: false, nameDisplay: 'State of Charge' },
              { ...makeField('batteryPower', 'Power', -1200, 'W', 'battery'), isHidden: false, nameDisplay: 'Battery Power' },
            ],
          },
        ],
        firingAlarms: [],
      }

    case 10002: // SIERRO 2000
      return {
        deviceId: '10002',
        dtuID: device.dtuDtuid,
        time: baseTime,
        stationId: device.stationId.toString(),
        gatherProtocolNumber: device.gatherProtocolNumber,
        gatherProtocolVersionCode: '2.1',
        fields: {
          soc: makeField('soc', 'State of Charge', 45, '%', 'battery'),
          batteryPower: makeField('batteryPower', 'Battery Power', 1800, 'W', 'battery'),
          batteryVoltage: makeField('batteryVoltage', 'Battery Voltage', 102.4, 'V', 'battery'),
          batteryCurrent: makeField('batteryCurrent', 'Battery Current', 17.6, 'A', 'battery'),
          batteryTemp: makeField('batteryTemp', 'Battery Temp', 31.2, '°C', 'battery'),
          batteryHealth: makeField('batteryHealth', 'Battery Health', 100, '%', 'battery'),
          batteryCycles: makeField('batteryCycles', 'Cycles', 48, '', 'battery'),
          acPower: makeField('acPower', 'AC Power', 2200, 'W', 'ac'),
          solarPower: makeField('solarPower', 'Solar Power', 4800, 'W', 'solar'),
          gridPower: makeField('gridPower', 'Grid Power', -800, 'W', 'grid'),
          outputPower: makeField('outputPower', 'Output Power', 2200, 'W', 'output'),
          dailyCharge: makeField('dailyCharge', 'Charged Today', 14.2, 'kWh', 'energy'),
          dailyDischarge: makeField('dailyDischarge', 'Discharged Today', 3.1, 'kWh', 'energy'),
          dailyProduced: makeField('dailyProduced', 'Solar Today', 22.4, 'kWh', 'energy'),
          workMode: makeField('workMode', 'Work Mode', 1, '', 'system'),
        },
        groups: [
          {
            id: 1,
            key: 'battery',
            name: 'Battery',
            category: 'battery',
            stateItems: [
              { ...makeField('soc', 'SoC', 45, '%', 'battery'), isHidden: false, nameDisplay: 'State of Charge' },
              { ...makeField('batteryPower', 'Power', 1800, 'W', 'battery'), isHidden: false, nameDisplay: 'Battery Power' },
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

  if (numericId === 10001) { // SIERRO 1000
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
        pvPanelFlow: makeFlowNode('pvPanel', 'Solar Panel', 'icon_solar', 3200),
        batteryFlow: makeFlowNode('battery', 'Battery', 'icon_battery', -1200),
        loadFlow: makeFlowNode('load', 'Load', 'icon_load', 3600),
        gridFlow: makeFlowNode('grid', 'Grid', 'icon_grid', 0),
      },
    }
  }

  if (numericId === 10002) { // SIERRO 2000 — charging from solar + exporting to grid
    return {
      code: 0,
      message: 'success',
      data: {
        ...emptyFlow,
        deviceAttributeState: {
          time: Math.floor(Date.now() / 1000).toString(),
          fields: {
            soc: makeField('soc', 'SoC', 45, '%', 'battery'),
          },
          groups: [],
        },
        pvPanelFlow: makeFlowNode('pvPanel', 'Solar Panel', 'icon_solar', 4800),
        batteryFlow: makeFlowNode('battery', 'Battery', 'icon_battery', 1800),
        loadFlow: makeFlowNode('load', 'Load', 'icon_load', 2200),
        gridFlow: makeFlowNode('grid', 'Grid', 'icon_grid', -800),
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
// Demo 历史数据
// ═══════════════════════════════════════════════════════

export function getDemoHistoryData(deviceId: string | number, hours = 24): { code: number; message: string; data: HistoryDataResponse } {
  const now = Date.now()
  const numericId = typeof deviceId === 'string' ? parseInt(deviceId) : deviceId

  const soc: Array<{ time: string; value: number }> = []
  const solarPower: Array<{ time: string; value: number }> = []
  const outputPower: Array<{ time: string; value: number }> = []
  const batteryPower: Array<{ time: string; value: number }> = []
  const gridPower: Array<{ time: string; value: number }> = []

  // 设备额定功率（用于缩放曲线）
  const solarPeak = numericId === 10002 ? 5000 : 3600
  const loadPeak = numericId === 10002 ? 2200 : 2400

  // 生成 5 分钟间隔的时间序列
  for (let i = hours * 12 - 1; i >= 0; i--) {
    const ts = new Date(now - i * 5 * 60 * 1000)
    const time = ts.toISOString()
    const hour = ts.getHours() + ts.getMinutes() / 60
    const jitter = (amp: number) => (Math.random() - 0.5) * amp

    // 太阳能：日出到日落的钟形曲线（6:00–18:00）
    const solar = hour >= 6 && hour <= 18
      ? Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI) * solarPeak + jitter(180))
      : 0

    // 负载：早晚双峰（早 7-9 点、晚 18-22 点更高）
    const morningPeak = Math.exp(-Math.pow(hour - 8, 2) / 4)
    const eveningPeak = Math.exp(-Math.pow(hour - 20, 2) / 6)
    const base = 350
    const output = Math.max(120, base + (morningPeak + eveningPeak) * loadPeak + jitter(120))

    // 电池：白天光伏富余时充电（负值=充电），夜晚放电（正值）
    const battery = solar - output
    // 电网：补足缺口（正值=从电网取电）
    const grid = Math.max(0, output - solar - Math.max(0, -battery))

    // SoC：白天充电上升、夜晚放电下降，限制在 20–100%
    const socVal = 60 + Math.sin(((hour - 9) / 24) * Math.PI * 2) * 35 + jitter(3)

    soc.push({ time, value: Math.max(20, Math.min(100, Math.round(socVal))) })
    solarPower.push({ time, value: Math.round(solar) })
    outputPower.push({ time, value: Math.round(output) })
    batteryPower.push({ time, value: Math.round(battery) })
    gridPower.push({ time, value: Math.round(grid) })
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
  { id: 1, type: 'low_battery', deviceName: 'SIERRO 1000', description: 'Reserve threshold reached (20%). Charging from solar now.', time: '5 mins ago', date: 'Today' },
  { id: 2, type: 'power_outage', deviceName: 'SIERRO 2000', description: 'Grid outage detected. Switched to battery backup automatically.', time: '3:42 PM', date: 'Today' },
  { id: 3, type: 'low_battery', deviceName: 'SIERRO 1000', description: 'Battery at 22% — peak-shaving paused until charged.', time: '1:10 PM', date: 'Today' },
  { id: 4, type: 'power_outage', deviceName: 'SIERRO 2000', description: 'Grid restored after 18-minute outage. Resuming normal operation.', time: '11:24 AM', date: 'Yesterday' },
  { id: 5, type: 'low_battery', deviceName: 'SIERRO 1000', description: 'Battery fully charged — exporting surplus to grid.', time: 'Apr 28', date: 'April' },
  { id: 6, type: 'power_outage', deviceName: 'SIERRO 2000', description: 'Backup power engaged for 42 minutes during outage.', time: 'Apr 15', date: 'April' },
  { id: 7, type: 'low_battery', deviceName: 'SIERRO 1000', description: 'Overnight discharge completed. Solar recharge begins at sunrise.', time: 'Mar 23', date: 'March' },
]

// ═══════════════════════════════════════════════════════
// Demo 用户资料（Profile / Setting 模块）
// ═══════════════════════════════════════════════════════

export const demoUserProfile = {
  name: 'Demo User',
  email: 'demo@sierro.energy',
  avatar: null as string | null,
  memberSince: '2024-01-15T08:00:00Z',
  founderBadge: true,
  founderNumber: 42,
}

// ═══════════════════════════════════════════════════════
// Demo 削峰填谷配置（Peak Shaving 模块）
// ═══════════════════════════════════════════════════════

export const demoPeakValleyConfig = {
  enabled: true,
  // 分时电价（美元/kWh）
  peakPrice: 0.42,
  offPeakPrice: 0.12,
  // 时段（分钟，自午夜起算）
  peakStart: 16 * 60,   // 16:00
  peakEnd: 21 * 60,     // 21:00
  offPeakStart: 0,      // 00:00
  offPeakEnd: 6 * 60,   // 06:00
  reserveSoc: 20,       // 保留电量 %
  estimatedMonthlySaving: 48.6, // USD
}
