/**
 * 告警文案解析
 *
 * 后端告警列表常只回 `key`/`alarmCode`（如 lineLoss、gridVoltLows、
 * cellOverVoltage…），只有少数（如市电故障）带可读 name。这里提供：
 *   1) 已知 key/code → 英文描述字典；
 *   2) 未知 key 的兜底「驼峰/下划线/中划线 → Title Case」人性化；
 * 使每条告警都能显示可读文案，而不是空白或裸代码。
 */

/** 已知告警 key/code → 英文描述 */
export const ALARM_TEXT: Record<string, string> = {
  // ── Mains / grid (市电) ──
  lineLoss: 'Mains power failure',
  mainsPowerFailures: 'Mains power failure',
  mainsFailure: 'Mains power failure',
  powerFailure: 'Mains power failure',
  gridFault: 'Grid fault',
  gridLoss: 'Grid power lost',
  lineFault: 'Grid line fault',
  utilityFail: 'Utility power failure',
  acInputFail: 'AC input failure',
  acFail: 'AC input failure',
  gridVoltLows: 'Mains undervoltage',
  gridUnderVolt: 'Grid undervoltage',
  gridOverVolt: 'Grid overvoltage',
  gridUnderFreq: 'Grid underfrequency',
  gridOverFreq: 'Grid overfrequency',
  // ── Bypass / inverter ──
  bypassUndervoltageFault: 'Bypass undervoltage',
  bypassOvervoltageFault: 'Bypass overvoltage',
  bypassOverload: 'Bypass overload',
  inverterFault: 'Inverter fault',
  inverterOverload: 'Inverter overload',
  inverterOverTemp: 'Inverter over-temperature',
  outputShortCircuit: 'Output short circuit',
  overload: 'Output overload',
  // ── Bus ──
  busOverVolt: 'DC bus overvoltage',
  busUnderVolt: 'DC bus undervoltage',
  // ── PV / solar ──
  pvOverVoltage: 'PV overvoltage',
  pvOverVolt: 'PV overvoltage',
  pvFault: 'PV input fault',
  pvOverCurrent: 'PV overcurrent',
  // ── Battery / cell ──
  cellOverVoltage: 'Cell overvoltage',
  cellUnderVoltage: 'Cell undervoltage',
  cellLowVoltage: 'Cell low voltage',
  cellHighVoltage: 'Cell high voltage',
  batteryOverVoltage: 'Battery overvoltage',
  batteryUnderVoltage: 'Battery undervoltage',
  batteryLow: 'Battery low',
  lowBattery: 'Low battery',
  batteryOverCurrent: 'Battery overcurrent',
  // ── Temperature ──
  cellHighTemp: 'Cell over-temperature',
  cellLowTemp: 'Cell under-temperature',
  overTemperature: 'Over-temperature',
  mpptOverTemp: 'MPPT over-temperature',
  dcdcOverTemp: 'DC-DC over-temperature',
  // ── Charge / system ──
  chargeFault: 'Charging fault',
  fanFault: 'Fan fault',
  commFault: 'Communication fault',
  systemFault: 'System fault',
}

/** 驼峰 / snake_case / kebab-case → "Title Case Words" */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  if (!spaced) return ''
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** 传入告警 key/code（或其原始字段），返回可读文案；找不到则人性化或回退。 */
export function describeAlarmCode(code: string | undefined | null): string {
  if (!code) return ''
  const c = String(code).trim()
  if (!c) return ''
  if (ALARM_TEXT[c]) return ALARM_TEXT[c]
  // 大小写不敏感匹配
  const lower = c.toLowerCase()
  const hit = Object.keys(ALARM_TEXT).find(k => k.toLowerCase() === lower)
  if (hit) return ALARM_TEXT[hit]
  // 兜底：把 key 人性化（纯数字代码则保留为 Alarm <code>）
  if (/^\d+$/.test(c)) return `Alarm ${c}`
  return humanizeKey(c)
}
