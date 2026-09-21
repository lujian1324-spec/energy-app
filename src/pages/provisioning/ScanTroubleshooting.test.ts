import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import ScanTroubleshooting from './ScanTroubleshooting'

describe('scan troubleshooting', () => {
  it('appears on the second failure with every recovery step and QR action', () => {
    for (const failures of [0, 1]) {
      expect(renderToStaticMarkup(createElement(ScanTroubleshooting, { failures, onScanQr: () => {} }))).toBe('')
    }
    for (const failures of [2, 3]) {
      const html = renderToStaticMarkup(createElement(ScanTroubleshooting, { failures, onScanQr: () => {} }))
      for (const text of ['Power on', 'pairing mode', 'Bluetooth', 'Location', 'Move your phone closer', 'Scan QR Code']) {
        expect(html).toContain(text)
      }
      expect(html).toContain('<button')
    }
  })
})
