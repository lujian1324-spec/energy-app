/**
 * Low-battery banner body copy (design p6).
 * A real duration → "{name} • Estimated remaining time: {formatted}"
 * Missing / "--" / leftover "remaining" junk → "{name} • Low battery" (never "--").
 */
export function formatLowBatteryBannerCopy(
  name: string,
  durationStr: string | null | undefined,
): string {
  const raw = (durationStr ?? '').trim()
  const formatted = raw.replace(/\s*remaining\s*$/i, '').trim()
  const looksLikeDuration = /^\d+\s*h\s*\d+\s*m$/i.test(formatted)
  if (!looksLikeDuration) {
    return `${name} • Low battery`
  }
  return `${name} • Estimated remaining time: ${formatted}`
}
