/**
 * Low-battery banner body copy (handoff `A_1.1.1_Homepage -v 有 alert`).
 * Design string: "Fish Tank • Battery below 30%, estimated remaining time: 1h 24m"
 * A real duration → "{name} • Battery below {threshold}%, estimated remaining time: {formatted}"
 * Missing / "--" / leftover "remaining" junk → "{name} • Battery below {threshold}%" (never "--").
 *
 * The threshold is a parameter, not a literal 30, because DevicePage reads it from
 * `settings.lowBatteryThreshold` (the Low Battery notification screen lets it be edited).
 */
export function formatLowBatteryBannerCopy(
  name: string,
  durationStr: string | null | undefined,
  threshold = 30,
): string {
  const raw = (durationStr ?? '').trim()
  const formatted = raw.replace(/\s*remaining\s*$/i, '').trim()
  const looksLikeDuration = /^\d+\s*h\s*\d+\s*m$/i.test(formatted)
  const head = `${name} • Battery below ${threshold}%`
  if (!looksLikeDuration) {
    return head
  }
  return `${head}, estimated remaining time: ${formatted}`
}
