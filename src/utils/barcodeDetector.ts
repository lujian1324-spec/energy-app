/**
 * The platform's 1D/2D code reader, where the engine ships one.
 *
 * jsQR covers QR everywhere, including iOS WKWebView, which has no
 * BarcodeDetector at all. What it cannot read is a 1D barcode — and units
 * labelled with a barcode and no QR left owners with nothing to scan. This is
 * the reader for those, used in addition to jsQR rather than instead of it.
 */

export interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}

/**
 * The codes a Sierro label can carry. QR stays in the list so an engine with a
 * detector can read it there too; jsQR handles it either way.
 */
export const SCANNABLE_FORMATS = [
  'qr_code',
  'code_128', 'code_39', 'code_93', 'codabar', 'itf',
  'ean_13', 'ean_8', 'upc_a', 'upc_e',
]

/** How often to run a detect() pass, ms — it is far heavier than a jsQR pass. */
export const DETECT_INTERVAL_MS = 250

type BarcodeDetectorCtor = (new (opts?: { formats?: string[] }) => BarcodeDetectorLike) & {
  getSupportedFormats?: () => Promise<string[]>
}

function ctor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null
  const c = (window as typeof window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return typeof c === 'function' ? c : null
}

/**
 * A detector for every format this engine reports it can read, or null where
 * the API is absent. Asking for a format the engine does not implement throws
 * in some of them, so the list is narrowed to what it reports before the
 * detector is built, and a rejected list falls back to QR alone rather than
 * leaving the screen with no reader.
 */
export async function createBarcodeDetector(): Promise<BarcodeDetectorLike | null> {
  const BD = ctor()
  if (!BD) return null

  let formats = SCANNABLE_FORMATS
  try {
    const supported = await BD.getSupportedFormats?.()
    if (Array.isArray(supported) && supported.length > 0) {
      const usable = SCANNABLE_FORMATS.filter(f => supported.includes(f))
      if (usable.length === 0) return null
      formats = usable
    }
  } catch {/* fall through and let the constructor decide */}

  try {
    return new BD({ formats })
  } catch {/* narrow to the one format every implementation has */}
  try {
    return new BD({ formats: ['qr_code'] })
  } catch {
    return null
  }
}
