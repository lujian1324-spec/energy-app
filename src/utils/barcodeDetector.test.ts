import { describe, it, expect, afterEach, vi } from 'vitest'
import { createBarcodeDetector, SCANNABLE_FORMATS } from './barcodeDetector'

type Ctor = ((opts?: { formats?: string[] }) => void) & { getSupportedFormats?: () => Promise<string[]> }

// The node environment has no window; these run against a minimal stub, the
// same way openAppSettings.test.ts does.
function install(impl: Ctor | undefined) {
  // @ts-expect-error minimal window stub
  globalThis.window = impl === undefined ? {} : { BarcodeDetector: impl }
}

afterEach(() => {
  // @ts-expect-error clean up the window stub
  delete globalThis.window
  vi.restoreAllMocks()
})

describe('createBarcodeDetector', () => {
  it('is null where the engine has no BarcodeDetector (iOS WKWebView)', async () => {
    install(undefined)
    expect(await createBarcodeDetector()).toBeNull()
  })

  it('asks for the 1D formats, not QR alone — the point of the reader', async () => {
    let asked: string[] | undefined
    const BD = function (this: unknown, opts?: { formats?: string[] }) { asked = opts?.formats } as unknown as Ctor
    install(BD)
    expect(await createBarcodeDetector()).not.toBeNull()
    expect(asked).toContain('code_128')
    expect(asked).toContain('qr_code')
  })

  it('narrows to what the engine reports it supports', async () => {
    let asked: string[] | undefined
    const BD = function (this: unknown, opts?: { formats?: string[] }) { asked = opts?.formats } as unknown as Ctor
    BD.getSupportedFormats = async () => ['qr_code', 'code_128', 'aztec']
    install(BD)
    await createBarcodeDetector()
    expect(asked).toEqual(['qr_code', 'code_128'])
  })

  it('falls back to QR alone when the engine rejects the format list', async () => {
    let asked: string[] | undefined
    let calls = 0
    const BD = function (this: unknown, opts?: { formats?: string[] }) {
      calls++
      if (calls === 1) throw new TypeError('unsupported format')
      asked = opts?.formats
    } as unknown as Ctor
    install(BD)
    expect(await createBarcodeDetector()).not.toBeNull()
    expect(asked).toEqual(['qr_code'])
  })

  it('is null when the engine supports none of the formats we scan', async () => {
    const BD = function () {} as unknown as Ctor
    BD.getSupportedFormats = async () => ['aztec', 'pdf417']
    install(BD)
    expect(await createBarcodeDetector()).toBeNull()
  })

  it('lists QR first so a label carrying both reads as the richer code', () => {
    expect(SCANNABLE_FORMATS[0]).toBe('qr_code')
  })
})
