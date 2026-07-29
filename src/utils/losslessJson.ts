/**
 * Lossless JSON parsing for the IoT backend.
 *
 * The backend uses Java `Long` ids (station id, device id, dtu id, user id …).
 * Many are returned as JSON strings ("Long as string"), but some endpoints —
 * notably `/station/list` — return the id as a bare JSON NUMBER. Those ids can
 * exceed JavaScript's safe-integer range (Number.MAX_SAFE_INTEGER =
 * 9007199254740991), so a plain `JSON.parse` / `resp.json()` silently ROUNDS
 * them at parse time. Sending such a corrupted id back (e.g. as the stationId
 * when adding a device) makes the backend reject it with "illegal argument".
 *
 * `parseLossless` walks the raw text and wraps any integer literal that would
 * be unsafe as an integer in quotes BEFORE parsing, so it arrives as an exact
 * decimal string instead of a lossy Number. Floats, safe integers, strings,
 * and everything else are left untouched. It is a superset of JSON.parse for
 * valid JSON.
 */

/** True when a run of decimal digits denotes an integer beyond MAX_SAFE_INTEGER. */
function isUnsafeIntegerDigits(digits: string): boolean {
  const d = digits.replace(/^0+/, '') || '0'
  if (d.length > 16) return true
  if (d.length < 16) return false
  return d > '9007199254740991' // equal length → lexicographic compare is correct
}

/**
 * Return `text` with every unsafe integer literal quoted. String contents are
 * scanned but never modified (a "-" or digit inside a string is left alone).
 * Assumes `text` is valid JSON — in valid JSON a bare `-`/digit outside a
 * string can only begin a number token (keys are always quoted).
 */
export function quoteUnsafeIntegers(text: string): string {
  let out = ''
  let inStr = false
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]

    if (inStr) {
      out += ch
      if (ch === '\\') { out += text[i + 1] ?? ''; i += 2; continue }
      if (ch === '"') inStr = false
      i++
      continue
    }

    if (ch === '"') { inStr = true; out += ch; i++; continue }

    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      // Read the whole numeric token starting at i.
      let j = i
      if (text[j] === '-') j++
      const intStart = j
      while (j < n && text[j] >= '0' && text[j] <= '9') j++
      const intDigits = text.slice(intStart, j)

      let isFloat = false
      let k = j
      if (text[k] === '.') { isFloat = true; k++; while (k < n && text[k] >= '0' && text[k] <= '9') k++ }
      if (text[k] === 'e' || text[k] === 'E') {
        isFloat = true
        k++
        if (text[k] === '+' || text[k] === '-') k++
        while (k < n && text[k] >= '0' && text[k] <= '9') k++
      }

      const token = text.slice(i, k)
      if (!isFloat && isUnsafeIntegerDigits(intDigits)) {
        out += `"${token}"`
      } else {
        out += token
      }
      i = k
      continue
    }

    out += ch
    i++
  }

  return out
}

/** JSON.parse that preserves Long ids beyond MAX_SAFE_INTEGER as strings. */
export function parseLossless(text: string): unknown {
  return JSON.parse(quoteUnsafeIntegers(text))
}
