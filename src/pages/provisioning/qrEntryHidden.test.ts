/**
 * SW-10: no rendered screen may offer a QR entry point.
 *
 * The QR screens themselves are kept in the repo on purpose, so these tests
 * check what the user is shown rather than what the bundle contains.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import AddDeviceHeader from './AddDeviceHeader'
import DeviceLinkedScreen from './DeviceLinkedScreen'
import { QR_ENTRY_ENABLED } from '../../config/qrEntry'

describe('QR entry points', () => {
  it('is off in shipped builds', () => {
    expect(QR_ENTRY_ENABLED).toBe(false)
  })

  it('leaves no Scan QR action in the Add Device header, even when one is passed', () => {
    const html = renderToStaticMarkup(
      createElement(AddDeviceHeader, { onBack: () => {}, onScanQr: () => {} }),
    )
    expect(html).toContain('Add Device')
    expect(html).not.toMatch(/qr/i)
  })

  it('leaves no Scan QR action on the already-linked screen', () => {
    const html = renderToStaticMarkup(
      createElement(DeviceLinkedScreen, { onBack: () => {}, onScanQr: () => {}, onRetry: () => {} }),
    )
    expect(html).toContain('Try Again')
    expect(html).not.toMatch(/qr/i)
  })
})
