/**
 * Demo 数据 — Guest 模式使用的模拟设备和状态数据
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
    co2EmissionReduction: 14.2,
    noxEmissionReduction: 0.05,
    so2EmissionReduction: 0.02,
    savingStandardCarbon: 5.8,
    extraProperty: {},
    summaryProperty: {},
  },
  {
    id: 10002,
    name: 'CPAP Machine',
    serialNumber: 'CP-2024-10002',
    model: 'DreamStation 2',
    deviceSortKey: 'medical_device',
    deviceSortLocaleText: 'Medical Device',
    gatherProtocolNumber: 'GPN-002',
    gatherProtocolNameDisplay: 'CPAP Protocol v1.0',
    softwareVersion: '2.3.1',
    stationId: 5002,
    stationName: 'Bedroom Station',
    dtuId: 80002,
    dtuDtuid: 'CPAP-DEMO-002',
    dtuName: 'CPAP DTU-002',
    isOnline: true,
    isAlarmed: false,
    isPined: false,
    isPeakValleyEnabled: false,
    isUpgrading: false,
    isFirmwareUpgradeEnabled: false,
    isExternalDevice: true,
    isMainMasterDevice: false,
    applyMode: 0,
    state: 'normal',
    stateDict: 'Normal Operation',
    producingPower: 80,
    ratedPower: 100,
    dailyProducedQuantity: 0,
    totalProducedQuantity: 0,
    installedAt: '2024-03-20T10:00:00Z',
    lastDataAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    lastOnlineAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    lastOfflineAt: '',
    place: 'Bedroom',
    iconResid: 'icon_medical',
    ownerUserId: 9999,
    ownerUserName: 'Demo User',
    stationTimezone: 'America/New_York',
    stationCurrencyCode: 'USD',
    stationEnergyIncomePrice: 0,
    co2EmissionReduction: 0,
    noxEmissionReduction: 0,
    so2EmissionReduction: 0,
    savingStandardCarbon: 0,
    extraProperty: {},
    summaryProperty: {},
  },
  {
    id: 10003,
    name: 'Smart Fridge',
    serialNumber: 'FR-2024-10003',
    model: 'SmartFridge Pro',
    deviceSortKey: 'appliance',
    deviceSortLocaleText: 'Home Appliance',
    gatherProtocolNumber: 'GPN-003',
    gatherProtocolNameDisplay: 'Appliance Protocol v1.5',
    softwareVersion: '1.8.0',
    stationId: 5003,
    stationName: 'Kitchen Station',
    dtuId: 80003,
    dtuDtuid: 'FRIDGE-DEMO-003',
    dtuName: 'Fridge DTU-003',
    isOnline: true,
    isAlarmed: false,
    isPined: false,
    isPeakValleyEnabled: false,
    isUpgrading: false,
    isFirmwareUpgradeEnabled: true,
    isExternalDevice: true,
    isMainMasterDevice: false,
    applyMode: 0,
    state: 'normal',
    stateDict: 'Normal Operation',
    producingPower: 150,
    ratedPower: 200,
    dailyProducedQuantity: 0,
    totalProducedQuantity: 0,
    installedAt: '2024-06-10T12:00:00Z',
    lastDataAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    lastOnlineAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    lastOfflineAt: '',
    place: 'Kitchen',
    iconResid: 'icon_fridge',
    ownerUserId: 9999,
    ownerUserName: 'Demo User',
    stationTimezone: 'America/New_York',
    stationCurrencyCode: 'USD',
    stationEnergyIncomePrice: 0,
    co2EmissionReduction: 0,
    noxEmissionReduction: 0,
    so2EmissionReduction: 0,
    savingStandardCarbon: 0,
    extraProperty: {},
    summaryProperty: {},
  },
  {
    id: 10004,
    name: 'Solar Panel System',
    serialNumber: 'SP-2024-10004',
    model: 'SolarMax 5000',
    deviceSortKey: 'solar_inverter',
    deviceSortLocaleText: 'Solar Inverter',
    gatherProtocolNumber: 'GPN-004',
    gatherProtocolNameDisplay: 'Solar Protocol v3.0',
    softwareVersion: '4.2.1',
    stationId: 5004,
    stationName: 'Roof Station',
    dtuId: 80004,
    dtuDtuid: 'SOLAR-DEMO-004',
    dtuName: 'Solar DTU-004',
    isOnline: true,
    isAlarmed: false,
    isPined: true,
    isPeakValleyEnabled: false,
    isUpgrading: false,
    isFirmwareUpgradeEnabled: true,
    isExternalDevice: false,
    isMainMasterDevice: true,
    applyMode: 0,
    state: 'normal',
    stateDict: 'Normal Operation',
    producingPower: 4200,
    ratedPower: 5000,
    dailyProducedQuantity: 28.5,
    totalProducedQuantity: 2560.8,
    installedAt: '2023-11-05T09:00:00Z',
    lastDataAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    lastOnlineAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    lastOfflineAt: '',
    place: 'Roof',
    iconResid: 'icon_solar',
    ownerUserId: 9999,
    ownerUserName: 'Demo User',
    stationTimezone: 'America/New_York',
    stationCurrencyCode: 'USD',
    stationEnergyIncomePrice: 0.15,
    co2EmissionReduction: 28.5,
    noxEmissionReduction: 0.1,
    so2EmissionReduction: 0.05,
    savingStandardCarbon: 12.3,
    extraProperty: {},
    summaryProperty: {},
  },
  {
    id: 10005,
    name: 'AC Unit',
    serialNumber: 'AC-2024-10005',
    model: 'CoolMax 12000',
    deviceSortKey: 'hvac',
    deviceSortLocaleText: 'HVAC System',
    gatherProtocolNumber: 'GPN-005',
    gatherProtocolNameDisplay: 'HVAC Protocol v2.0',
    softwareVersion: '3.0.0',
    stationId: 5005,
    stationName: 'Living Room Station',
    dtuId: 80005,
    dtuDtuid: 'AC-DEMO-005',
    dtuName: 'AC DTU-005',
    isOnline: false,
    isAlarmed: true,
    isPined: false,
    isPeakValleyEnabled: false,
    isUpgrading: false,
    isFirmwareUpgradeEnabled: false,
    isExternalDevice: true,
    isMainMasterDevice: false,
    applyMode: 0,
    state: 'offline',
    stateDict: 'Offline - Communication Lost',
    producingPower: 0,
    ratedPower: 3500,
    dailyProducedQuantity: 0,
    totalProducedQuantity: 0,
    installedAt: '2024-09-01T14:00:00Z',
    lastDataAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    lastOnlineAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    lastOfflineAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    place: 'Living Room',
    iconResid: 'icon_ac',
    ownerUserId: 9999,
    ownerUserName: 'Demo User',
    stationTimezone: 'America/New_York',
    stationCurrencyCode: 'USD',
    stationEnergyIncomePrice: 0,
    co2EmissionReduction: 0,
    noxEmissionReduction: 0,
    so2EmissionReduction: 0,
    savingStandardCarbon: 0,
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
          batteryPower: makeField('batteryPower', 'Battery Power', -600, 'W', 'battery'),
          acPower: makeField('acPower', 'AC Power', 800, 'W', 'ac'),
          solarPower: makeField('solarPower', 'Solar Power', 400, 'W', 'solar'),
          outputPower: makeField('outputPower', 'Output Power', 800, 'W', 'output'),
          batteryTemp: makeField('batteryTemp', 'Battery Temp', 28.5, '°C', 'battery'),
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

    case 10002: // CPAP Machine
      return {
        deviceId: '10002',
        dtuID: device.dtuDtuid,
        time: baseTime,
        stationId: device.stationId.toString(),
        gatherProtocolNumber: device.gatherProtocolNumber,
        gatherProtocolVersionCode: '1.0',
        fields: {
          acPower: makeField('acPower', 'AC Power', 80, 'W', 'ac'),
          batteryTemp: makeField('batteryTemp', 'Device Temp', 22.0, '°C', 'system'),
        },
        groups: [],
        firingAlarms: [],
      }

    case 10003: // Smart Fridge
      return {
        deviceId: '10003',
        dtuID: device.dtuDtuid,
        time: baseTime,
        stationId: device.stationId.toString(),
        gatherProtocolNumber: device.gatherProtocolNumber,
        gatherProtocolVersionCode: '1.5',
        fields: {
          acPower: makeField('acPower', 'AC Power', 150, 'W', 'ac'),
          batteryTemp: makeField('batteryTemp', 'Fridge Temp', 18.5, '°C', 'sensor'),
        },
        groups: [],
        firingAlarms: [],
      }

    case 10004: // Solar Panel System
      return {
        deviceId: '10004',
        dtuID: device.dtuDtuid,
        time: baseTime,
        stationId: device.stationId.toString(),
        gatherProtocolNumber: device.gatherProtocolNumber,
        gatherProtocolVersionCode: '3.0',
        fields: {
          soc: makeField('soc', 'Battery SoC', 85, '%', 'battery'),
          solarPower: makeField('solarPower', 'Solar Power', 4200, 'W', 'solar'),
          batteryTemp: makeField('batteryTemp', 'Battery Temp', 32.0, '°C', 'battery'),
        },
        groups: [],
        firingAlarms: [],
      }

    case 10005: // AC Unit (离线)
      return {
        deviceId: '10005',
        dtuID: device.dtuDtuid,
        time: Math.floor((now - 2 * 60 * 60 * 1000) / 1000).toString(),
        stationId: device.stationId.toString(),
        gatherProtocolNumber: device.gatherProtocolNumber,
        gatherProtocolVersionCode: '2.0',
        fields: {},
        groups: [],
        firingAlarms: [
          {
            alarmId: 'alarm-001',
            alarmCode: 'COMM_LOST',
            alarmMessage: 'Communication lost with device',
            severity: 'warning',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          },
        ],
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
        pvPanelFlow: makeFlowNode('pvPanel', 'Solar Panel', 'icon_solar', 400),
        batteryFlow: makeFlowNode('battery', 'Battery', 'icon_battery', -600),
        loadFlow: makeFlowNode('load', 'Load', 'icon_load', 800),
        gridFlow: makeFlowNode('grid', 'Grid', 'icon_grid', 0),
      },
    }
  }

  if (numericId === 10004) { // Solar Panel System
    return {
      code: 0,
      message: 'success',
      data: {
        ...emptyFlow,
        deviceAttributeState: {
          time: Math.floor(Date.now() / 1000).toString(),
          fields: {
            soc: makeField('soc', 'SoC', 85, '%', 'battery'),
          },
          groups: [],
        },
        pvPanelFlow: makeFlowNode('pvPanel', 'Solar Panel', 'icon_solar', 4200),
        batteryFlow: makeFlowNode('battery', 'Battery', 'icon_battery', 2800),
        loadFlow: makeFlowNode('load', 'Load', 'icon_load', 800),
        gridFlow: makeFlowNode('grid', 'Grid', 'icon_grid', -200),
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
  const points: Array<{ time: string; value: number }> = []
  const now = Date.now()
  const numericId = typeof deviceId === 'string' ? parseInt(deviceId) : deviceId

  // 生成时间序列
  for (let i = hours * 12 - 1; i >= 0; i--) { // 5分钟间隔
    const time = new Date(now - i * 5 * 60 * 1000).toISOString()

    let value = 50
    if (numericId === 10001) { // Sierro2000 - SoC
      value = 50 + Math.sin((i / (hours * 12)) * Math.PI * 2) * 30 + (Math.random() - 0.5) * 4
      value = Math.max(0, Math.min(100, value))
    } else if (numericId === 10004) { // Solar Panel - Power
      const hour = new Date(now - i * 5 * 60 * 1000).getHours()
      value = hour >= 6 && hour <= 18 ? Math.sin((hour - 6) / 12 * Math.PI) * 4200 + (Math.random() - 0.5) * 200 : 0
      value = Math.max(0, value)
    }

    points.push({ time, value })
  }

  return {
    code: 0,
    message: 'success',
    data: {
      soc: points,
    },
  }
}
