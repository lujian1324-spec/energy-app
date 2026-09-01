/**
 * Scan-time display names for Found Devices / bind flow.
 * Product wants "Sierro · last4" (no model "1000"). Display only —
 * BLE advertised names and bind payload identifiers stay unchanged.
 */

const MODEL_RE = /\bSierro\s*(?:1000|2000)?\b/gi

function last4Token(value?: string | null): string | null {
  if (!value) return null
  const cleaned = value.replace(MODEL_RE, '').replace(/[^0-9A-Za-z]/g, '')
  if (cleaned.length < 4) return null
  return cleaned.slice(-4)
}

export function formatScanDisplayName(opts: {
  serial?: string | null
  name?: string | null
  deviceId?: string | null
}): string {
  const last4 =
    last4Token(opts.serial) ||
    last4Token(opts.deviceId) ||
    last4Token(opts.name)
  return last4 ? `Sierro · ${last4}` : 'Sierro'
}
