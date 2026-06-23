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
