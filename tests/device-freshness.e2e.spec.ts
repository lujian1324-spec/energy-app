/**
 * Device monitor, "Connected" but nothing moving (v4.21.1).
 *
 * The passthrough read sat on top of every newer cloud sample for up to 15
 * minutes after the reads stopped coming back, so the screen froze while the
 * header kept saying "Connected". The newest sample wins now, and once the
 * newest reading is over ten minutes old the header says when it was taken.
 */
import { test, expect } from '@playwright/test'
import { E2E_TZ, mockBackend, signIn, type MockDevice } from './support/mockBackend'

test.use({ timezoneId: E2E_TZ })

const NOW = new Date('2026-09-24T15:00:00-07:00')
const ring = (page: import('@playwright/test').Page, pct: number) =>
  page.getByRole('img', { name: new RegExp(`\\b${pct} percent`) })

test.describe('Device data freshness', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW })
    await signIn(page)
  })

  test('when live reads stop, the newer cloud readings show instead of a frozen one', async ({ page }) => {
    const devices: MockDevice[] = [{ id: '1001', name: 'Garage', soc: 80, cloudSoc: 80, stateAt: NOW.getTime() }]
    await mockBackend(page, devices)
    await page.goto('/#/device/1001')
    await expect(ring(page, 80)).toBeVisible()
    await expect(page.getByText('Connected', { exact: true })).toBeVisible()

    // The device stops answering live reads; the cloud keeps reporting, now 55 %.
    devices[0].failLiveReads = true
    devices[0].cloudSoc = 55
    devices[0].stateAt = NOW.getTime() + 2.5 * 60_000
    // Past the 2-minute freshness and a 30 s cloud poll later, the cloud figure is shown.
    await page.clock.fastForward('02:40')
    await expect(ring(page, 55)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  })

  test('the header says when the last reading was taken once they stop arriving', async ({ page }) => {
    const devices: MockDevice[] = [{ id: '1001', name: 'Garage', failLiveReads: true, stateAt: NOW.getTime() - 45 * 60_000 }]
    await mockBackend(page, devices)
    await page.goto('/#/device/1001')
    // 15:00 − 45 min = 2:15pm.
    await expect(page.getByText('Last update 2:15pm', { exact: true })).toBeVisible()
    await expect(page.getByText('Connected', { exact: true })).toHaveCount(0)
  })

  test('a fresh live reading is not replaced by an older cloud sample', async ({ page }) => {
    const devices: MockDevice[] = [{ id: '1001', name: 'Garage', soc: 80, cloudSoc: 55, stateAt: NOW.getTime() - 60_000 }]
    await mockBackend(page, devices)
    await page.goto('/#/device/1001')
    await expect(ring(page, 80)).toBeVisible()
    await page.clock.fastForward('01:00')
    await expect(ring(page, 80)).toBeVisible()
  })
})
