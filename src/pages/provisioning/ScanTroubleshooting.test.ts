import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import ScanTroubleshooting from './ScanTroubleshooting'

describe('scan troubleshooting', () => {
  it('appears on the second failure with every recovery step', () => {
    for (const failures of [0, 1]) {
      expect(renderToStaticMarkup(createElement(ScanTroubleshooting, { failures, onScanQr: () => {} }))).toBe('')
    }
    for (const failures of [2, 3]) {
      const html = renderToStaticMarkup(createElement(ScanTroubleshooting, { failures, onScanQr: () => {} }))
      for (const text of ['Power on', 'Bluetooth', 'Location', 'Move your phone closer']) {
        expect(html).toContain(text)
      }
    }
  })

  // SW-10: the QR step and its button are hidden, and nothing takes their place —
  // the last thing the panel tells the user to do is search again.
  it('offers no QR step, no QR button and no action in their place', () => {
    const html = renderToStaticMarkup(createElement(ScanTroubleshooting, { failures: 3, onScanQr: () => {} }))
    expect(html).not.toMatch(/qr/i)
    // After-sales R08: no step names a pairing mode the app never explains.
    expect(html).not.toMatch(/pairing/i)
    expect(html).not.toContain('<button')
  })
})
