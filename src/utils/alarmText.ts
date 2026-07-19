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

/** 仅查字典（大小写不敏感）：命中返回策展好的英文描述，未命中返回 ''。 */
export function knownAlarmText(code: string | undefined | null): string {
  if (!code) return ''
  const c = String(code).trim()
  if (!c) return ''
  if (ALARM_TEXT[c]) return ALARM_TEXT[c]
  const lower = c.toLowerCase()
  const hit = Object.keys(ALARM_TEXT).find(k => k.toLowerCase() === lower)
  return hit ? ALARM_TEXT[hit] : ''
}

/** 传入告警 key/code（或其原始字段），返回可读文案；找不到则人性化或回退。 */
export function describeAlarmCode(code: string | undefined | null): string {
  const known = knownAlarmText(code)
  if (known) return known
  const c = String(code ?? '').trim()
  if (!c) return ''
  // 兜底：把 key 人性化（纯数字代码则保留为 Alarm <code>）
  if (/^\d+$/.test(c)) return `Alarm ${c}`
  return humanizeKey(c)
}

/**
 * 单一入口：把一条 firing alarm 解析成最可读的描述文案。真实后端每条告警用
 * `key`(代码)/`name`(显示名)，旧字段 `alarmCode`/`alarmMessage` 常为空。优先级：
 *   1) 已知代码 → 策展英文（保持「字典优先、避免直出后端中文」）；
 *   2) 后端 name；3) 后端 alarmMessage；4) 未知代码人性化；5) 兜底 Alarm{id}/Device Alarm。
 * NotificationsPage 显示与 deviceAlarmNotification 推播共用，保证文案一致。
 */
export interface ResolvableAlarm {
  key?: string
  alarmCode?: string
  name?: string
  alarmMessage?: string
  alarmId?: string
}

export function resolveAlarmText(alarm: ResolvableAlarm): string {
  const code = alarm.key ?? alarm.alarmCode ?? ''
  const known = knownAlarmText(code)
  if (known) return known
  const name = alarm.name?.trim()
  if (name) return name
  const message = alarm.alarmMessage?.trim()
  if (message) return message
  const humanized = describeAlarmCode(code)
  if (humanized) return humanized
  return alarm.alarmId ? `Alarm ${alarm.alarmId}` : 'Device Alarm'
}

// ── Alarm-center display rules (dedupe + correlated-symptom suppression) ──
/** Resolved display text of the mains-outage root cause. */
const MAINS_POWER_FAILURE = 'Mains power failure'
/**
 * Symptoms a grid outage always trips alongside the root cause — Mains undervoltage
 * (gridVoltLows) and Bypass undervoltage (bypassUndervoltageFault). Hidden ONLY when
 * a Mains power failure is also firing; on their own they still surface as genuine
 * independent faults. Matched on the resolved display text (curated in ALARM_TEXT).
 */
const MAINS_FAILURE_SYMPTOMS = new Set(['Mains undervoltage', 'Bypass undervoltage'])

/**
 * Prepare firing alarms for the alarm center: resolve each to its display title,
 * drop exact duplicates (same title — collapses e.g. lineLoss + mainsFailure that
 * both read "Mains power failure"), and, when a Mains power failure is present, hide
 * its correlated undervoltage symptoms. Preserves order; each kept alarm is annotated
 * with the resolved `title` so callers don't re-resolve.
 */
export function dedupeAndFilterAlarms<T extends ResolvableAlarm>(alarms: T[]): Array<T & { title: string }> {
  const withTitle = alarms.map(a => ({ ...a, title: resolveAlarmText(a) }))
  const hasMainsFailure = withTitle.some(a => a.title === MAINS_POWER_FAILURE)
  const seen = new Set<string>()
  const out: Array<T & { title: string }> = []
  for (const a of withTitle) {
    if (hasMainsFailure && MAINS_FAILURE_SYMPTOMS.has(a.title)) continue
    if (seen.has(a.title)) continue
    seen.add(a.title)
    out.push(a)
  }
  return out
}
