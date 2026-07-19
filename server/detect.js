// Server-side alarm detection for the poller.
// Ported from the client so the closed-app path matches the in-app one:
//   - outage      ← src/utils/powerOutageNotification.ts (POWER_OUTAGE_KEYS / detectOutageFromFields)
//   - low battery ← src/hooks/useLowBatteryMonitor.ts   (remainingBatteryCapacity < threshold)
//   - solar       ← generationPower crossing 0 (edge)
// Keep these constants in sync with the client sources above.

// Alarm keys (field: key) that indicate AC/grid power loss or mains undervoltage.
// EXACT matching only — never substring — so a normal field is not mistaken for an outage.
export const POWER_OUTAGE_KEYS = new Set([
  'lineLoss', 'mainsPowerFailures', 'gridVoltLows', 'bypassUndervoltageFault',
  'gridFault', 'acInputFail', 'acFail', 'mainsFailure', 'gridLoss', 'utilityFail',
  'powerFailure', 'lineFault',
])

/** A device-state field is "on" when truthy across the API's encodings. */
export function isFieldOn(value) {
  return value === 1 || value === '1' || value === true || value === 'true'
}

/** Read fields[key].value, tolerating both nested {value} and bare shapes. */
export function fieldVal(fields, key) {
  const f = fields?.[key]
  if (f == null) return undefined
  return (typeof f === 'object' && 'value' in f) ? f.value : f
}

/** Grid/mains power-loss or undervoltage from the raw fields map. Exact key match. */
export function detectOutage(fields) {
  if (!fields) return { outage: false }
  for (const key of POWER_OUTAGE_KEYS) {
    const f = fields[key]
    if (f && isFieldOn(typeof f === 'object' && 'value' in f ? f.value : f)) return { outage: true, reason: key }
  }
  return { outage: false }
}

/** Low battery when SOC (remainingBatteryCapacity) is a positive number below threshold. */
export function detectLowBattery(fields, threshold = 30) {
  const soc = Number(fieldVal(fields, 'remainingBatteryCapacity'))
  if (!Number.isFinite(soc) || soc <= 0) return { low: false }
  return { low: soc < threshold, soc }
}

/** Solar edge: generationPower crossing 0. Returns 'started' | 'stopped' | null. */
export function detectSolar(prevGenW, fields) {
  const gen = Number(fieldVal(fields, 'generationPower'))
  if (!Number.isFinite(gen)) return { event: null, genW: prevGenW }
  const prev = Number.isFinite(prevGenW) ? prevGenW : 0
  let event = null
  if (prev <= 0 && gen > 0) event = 'started'
  else if (prev > 0 && gen <= 0) event = 'stopped'
  return { event, genW: gen }
}
