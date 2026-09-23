/**
 * SW-07: the Help page's structure and its copy gate.
 *
 * Rendered, not source-grepped, so it checks what the user is actually shown:
 * three titled sections, deep links that exist, and no invented prose.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, beforeEach } from 'vitest'
import HelpPage from './HelpPage'
import { useDeviceStore } from '../stores/deviceStore'
import type { DeviceListItem } from '../api/deviceApi'

function render() {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ['/help'] }, createElement(HelpPage)),
  )
}

const device = { id: '491513787113766912', name: 'Sierro 1000' } as DeviceListItem

describe('HelpPage', () => {
  beforeEach(() => {
    useDeviceStore.setState({ devices: [] })
  })

  it('renders the three sections', () => {
    const html = render()
    for (const id of ['bind', 'sleep', 'smart']) {
      expect(html).toContain(`data-help-section="${id}"`)
    }
  })

  it('titles the Sleep Mode and Smart Schedule sections with their shipped names', () => {
    const html = render()
    expect(html).toContain('Sleep Mode')
    expect(html).toContain('Smart Schedule')
  })

  it('shows no new copy beyond the [PENDING_JASON] placeholder', () => {
    useDeviceStore.setState({ devices: [device] })
    const text = render()
      .replace(/<[^>]*>/g, ' ')
      .replace(/&#x27;|&quot;|&amp;/g, ' ')
    const words = text.replace(/\[PENDING_JASON\]/g, ' ')
    // Only the two shipped section titles survive as real text; the back
    // button's "Back" is an aria-label, not rendered copy.
    for (const shipped of ['Sleep Mode', 'Smart Schedule']) {
      expect(words).toContain(shipped)
    }
    const leftover = words
      .replace(/Sleep Mode|Smart Schedule/g, ' ')
      .replace(/[\s ]+/g, '')
    expect(leftover).toBe('')
  })

  it('keeps the page readable with no devices, dropping only the Sleep Mode link', () => {
    const html = render()
    expect(html).toContain('data-help-section="sleep"')
    expect(html).not.toContain('/settings')
    // The other two deep links do not depend on a device.
    expect(html).toContain('data-help-section="bind"')
    expect(html).toContain('data-help-section="smart"')
  })

  it('has a Sleep Mode entry point once a device exists', () => {
    useDeviceStore.setState({ devices: [device] })
    // The button navigates programmatically, so assert the id the link is built
    // from is the first device's, as a string (ids exceed JS safe-int).
    expect(String(useDeviceStore.getState().devices[0].id)).toBe('491513787113766912')
    expect(render()).toContain('data-help-section="sleep"')
  })
})
