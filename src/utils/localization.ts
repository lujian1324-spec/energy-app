// PRD v1.1 §10.5: 北美本地化 (P0)
// °F 默认 | 12h AM/PM | USD ($)

/** 摄氏度 → 华氏度 */
export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32
}

/** 华氏度 → 摄氏度 */
export function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9
}

/** 格式化温度（默认 °F） */
export function formatTemp(celsius: number, unit: 'C' | 'F' = 'F'): string {
  if (unit === 'F') {
    return `${Math.round(celsiusToFahrenheit(celsius))}°F`
  }
  return `${Math.round(celsius)}°C`
}

/** 格式化时间为 12h AM/PM（默认）或 24h */
export function formatTime12h(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date
  let h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m} ${ampm}`
}

export function formatTime24h(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/** 24h 数组 → 12h 显示 */
export function formatHourLabel(hour24: number, format: '12h' | '24h' = '12h'): string {
  if (format === '24h') return `${hour24.toString().padStart(2, '0')}:00`
  if (hour24 === 0) return '12 AM'
  if (hour24 === 12) return '12 PM'
  if (hour24 < 12) return `${hour24} AM`
  return `${hour24 - 12} PM`
}

/** 格式化货币 (默认 USD $) */
export function formatCurrency(amount: number, currency: 'USD' | 'CNY' = 'USD'): string {
  const symbol = currency === 'USD' ? '$' : '¥'
  return `${symbol}${amount.toFixed(2)}`
}

/** 格式化功率 (W) */
export function formatPower(watts: number): string {
  if (Math.abs(watts) >= 1000) {
    return `${(watts / 1000).toFixed(2)} kW`
  }
  return `${Math.round(watts)} W`
}

/** 格式化能量 (kWh) */
export function formatEnergy(kwh: number): string {
  return `${kwh.toFixed(2)} kWh`
}

/** 格式化时长 (秒 → "Xh Ym") */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** 估算剩余放电时间 (remainingBatteryCapacity%, currentLoadW, capacityWh) */
export function estimateTimeRemaining(
  remainingBatteryCapacity: number,
  loadWatts: number,
  capacityWh: number
): number {
  if (loadWatts <= 0) return 0
  const remainingWh = (remainingBatteryCapacity / 100) * capacityWh
  return (remainingWh / loadWatts) * 3600
}

/** 估算充满时间 (remainingBatteryCapacity%, chargeRateW, capacityWh) */
export function estimateTimeToFull(
  remainingBatteryCapacity: number,
  chargeWatts: number,
  capacityWh: number
): number {
  if (chargeWatts <= 0) return 0
  const remainingWh = ((100 - remainingBatteryCapacity) / 100) * capacityWh
  return (remainingWh / chargeWatts) * 3600
}

// ─── Energy Flow register labels (English canon) ───
// The /deviceState/simple/energy/flow/v1 API returns group/field names and some
// enum value text pre-localized to Chinese by the backend. This app is English-only
// (see CLAUDE.md label canon), so map the known keys/values here instead of
// rendering the backend's raw text — mirrors DebugParamsPage's approach but keyed
// off this endpoint's own field keys.

const ENERGY_FLOW_GROUP_LABELS: Record<string, string> = {
  grid_status: 'Grid Status',
  pv_panel_status: 'PV Panel Status',
  battery_status: 'Battery Status',
  load_status: 'Load Status',
}

/** group.key → English title; unmapped "virtual_more_group_*" keys become "More" */
export function translateEnergyFlowGroupLabel(key: string, fallback: string): string {
  if (ENERGY_FLOW_GROUP_LABELS[key]) return ENERGY_FLOW_GROUP_LABELS[key]
  if (key.startsWith('virtual_more_group')) return 'More'
  return fallback
}

const ENERGY_FLOW_FIELD_LABELS: Record<string, string> = {
  l1AcInputVoltage: 'AC Input Voltage',
  acInputFrequency: 'AC Input Frequency',
  acOutputVoltage: 'AC Output Voltage',
  acOutputFrequency: 'AC Output Frequency',
  outputPower: 'AC Output Power',
  exchangeChargingPower: 'AC Charge Power',
  mainsCharging: 'AC Charging',
  acOutputs: 'AC Output',
  solarInputVoltage: 'PV Input Voltage',
  generationPower: 'PV Charge Power',
  pvGeneratedEnergyOfDay: "Today's PV Generation",
  totalPVGeneratedEnergy: 'Total PV Generation',
  photovoltaicCharging: 'PV Charging',
  cellElectrolyticCapacitorVoltage: 'Cell Capacitor Voltage',
  batteryCapacity: 'Battery Capacity',
  remainingBatteryCapacity: 'Battery Remaining',
  numberOfBatteryUsageCycles: 'Battery Cycle Count',
  batteryCurrent: 'Battery Current',
  cellTemperature1: 'Cell 1 Temperature',
  cellTemperature2: 'Cell 2 Temperature',
  cellTemperature3: 'Cell 3 Temperature',
  numberOfBatteries: 'Number of Cells',
  inversionState: 'Inverter Output',
  noLoadShutdown: 'No-Load Shutdown',
  mpptTemperature: 'MPPT Temperature',
  dcdcTemperature: 'DCDC Temperature',
  bypassStatus: 'Bypass Status',
  numberOfBatteryTemperatureSensors: 'Battery Temp Sensors',
  accumulatedChargingTime: 'Total Charge Time',
  accumulatedDischargeTime: 'Total Discharge Time',
  hardwareVersion: 'Hardware Version',
  softwareVersionNumber: 'Main SW Version',
  inverterSoftwareVersionNumber: 'Inverter SW Version',
}

/** item.key → English label; "battery_cell_voltage_NN" is generated (Cell N Voltage) */
export function translateEnergyFlowFieldLabel(key: string, fallback: string): string {
  const cellMatch = /^battery_cell_voltage_0*(\d+)$/.exec(key)
  if (cellMatch) return `Cell ${cellMatch[1]} Voltage`
  return ENERGY_FLOW_FIELD_LABELS[key] ?? fallback
}

// Fields whose backend valueDisplay is a Chinese enum phrase rather than a plain
// number — derive an English on/off phrase from the raw "0"/"1" value instead.
const ENERGY_FLOW_BOOL_LABELS: Record<string, [on: string, off: string]> = {
  mainsCharging: ['AC Charging', 'Not AC Charging'],
  acOutputs: ['On', 'Off'],
  photovoltaicCharging: ['PV Charging', 'Not PV Charging'],
  inversionState: ['Active', 'Idle'],
  noLoadShutdown: ['Active', 'Idle'],
  bypassStatus: ['Active', 'Inactive'],
}

/** item.value + item.key → English value text; numeric fields pass fallbackDisplay through untouched */
export function translateEnergyFlowFieldValue(
  key: string,
  value: unknown,
  fallbackDisplay: string
): string {
  const pair = ENERGY_FLOW_BOOL_LABELS[key]
  if (!pair) return fallbackDisplay
  const isOn = value === '1' || value === 1 || value === true
  return pair[isOn ? 0 : 1]
}

const ENERGY_FLOW_UNIT_LABELS: Record<string, string> = {
  分钟: 'min',
}

/** Translate the handful of non-Latin unit strings the backend sends (e.g. 分钟 → min) */
export function translateEnergyFlowUnit(unit: string): string {
  return ENERGY_FLOW_UNIT_LABELS[unit] ?? unit
}
