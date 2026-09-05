/**
 * Low-battery banner body copy (Figma p6 / Sierro_Handoff).
 * With duration → "{name} • Battery below 30%, estimated remaining time: {formatted}"
 * Missing / "--" / leftover "remaining" junk → "{name} • Battery below 30%" (never "--").
 */
export function formatLowBatteryBannerCopy(
  name: string,
  durationStr: string | null | undefined,
): string {
  const raw = (durationStr ?? '').trim()
  const formatted = raw.replace(/\s*remaining\s*$/i, '').trim()
  const looksLikeDuration = /^\d+\s*h\s*\d+\s*m$/i.test(formatted)
  if (!looksLikeDuration) {
    return `${name} • Battery below 30%`
  }
  return `${name} • Battery below 30%, estimated remaining time: ${formatted}`
}
