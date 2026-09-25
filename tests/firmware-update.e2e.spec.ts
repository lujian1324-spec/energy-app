/**
 * Firmware Update (v4.20.0), on the mocked backend (tests/support/mockBackend.ts):
 * Settings → Firmware Update under Feedback → each device checked against the
 * firmware published for it → release notes → confirm → the update runs, and
 * while it runs the app sends nothing but firmware / session calls.
 *
 * Needs a build with VITE_ENABLE_FIRMWARE_UPDATE=true (the E2E workflow sets it);
 * consumer builds have no entry.
 */
import { test, expect, type Page } from '@playwright/test'
import { mockBackend, signIn, type MockBackend, type MockDevice } from './support/mockBackend'

const NOTES = 'New: faster AC switching.\nFixed: charging stops at 99%.'
const FIRMWARE_PATHS = /^\/(device\/(firmware|upgrade)\/|device\/details$|login\/refresh\/access\/token$|user\/select\/iotUserInfo$|gather\/protocol\/manufacturerDeviceUpgradeProtocol\/)/

function devicesFixture(): MockDevice[] {
  return [
    {
      id: '1001', name: 'Garage', softwareVersion: 'V1.0.0', upgradeOutcome: 3,
      firmware: [
        { id: 'fw-old', name: 'yfk_control_V1.0.0.hex', version: 'V1.0.0', createdAt: '2026-06-01 10:00:00' },
        { id: 'fw-new', name: 'yfk_control_V1.1.0.hex', version: 'V1.1.0', description: NOTES, createdAt: '2026-09-20 10:00:00', fileSize: 147165 },
      ],
    },
    {
      id: '2002', name: 'Cabin', softwareVersion: 'V1.1.0',
      firmware: [{ id: 'fw-new-2', name: 'yfk_control_V1.1.0.hex', version: 'V1.1.0', createdAt: '2026-09-20 10:00:00' }],
    },
  ]
}

async function openFirmwareUpdate(page: Page) {
  await page.goto('/#/setting')
  await page.getByText('Firmware Update', { exact: true }).click()
  await expect(page).toHaveURL(/#\/firmware-update/)
}

test.describe('Firmware Update', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  let api: MockBackend
  let devices: MockDevice[]
  test.beforeEach(async ({ page }) => {
    devices = devicesFixture()
    await signIn(page)
    api = await mockBackend(page, devices)
  })

  test('sits under Feedback and shows each device against its latest firmware', async ({ page }) => {
    await page.goto('/#/setting')
    const feedback = await page.getByText('Feedback', { exact: true }).boundingBox()
    const firmware = await page.getByText('Firmware Update', { exact: true }).boundingBox()
    expect(firmware!.y).toBeGreaterThan(feedback!.y)

    await page.getByText('Firmware Update', { exact: true }).click()
    await expect(page.getByTestId('fw-row-1001')).toContainText('Current: V1.0.0 · Latest: V1.1.0')
    await expect(page.getByTestId('fw-row-1001')).toContainText('Update available')
    await expect(page.getByTestId('fw-row-2002')).toContainText('Up to date')
  })

  test('shows what the update adds and fixes, then updates with everything else paused', async ({ page }) => {
    await openFirmwareUpdate(page)
    await page.getByTestId('fw-row-1001').click()
    await expect(page.getByTestId('fw-notes')).toHaveText(NOTES)
    await expect(page.getByText(/New: V1\.1\.0/)).toBeVisible()
    await page.getByRole('button', { name: 'Update Firmware' }).click()
    await expect(page.getByText(/pauses all other data/)).toBeVisible()

    const before = api.calls.length
    await page.getByRole('button', { name: 'Start Update' }).click()
    await expect(page.getByTestId('fw-run-title')).toHaveText('Updating firmware…')
    // The progress screen keeps the release notes on show.
    await expect(page.getByTestId('fw-notes')).toHaveText(NOTES)

    // Try to cause traffic while it runs: open the monitor page (state + today's
    // history reads) and flip an AC switch (a device write). None of it may go out.
    await page.goto('/#/device/2002')
    await expect(page.getByText(/Updating firmware on Garage\. Other data is paused/).last()).toBeVisible()
    await page.waitForTimeout(1500)
    await page.goto('/#/devices')
    await expect(page.getByText(/Updating firmware on Garage\. Other data is paused/).last()).toBeVisible()
    const cabinSwitch = page.locator('div').filter({ has: page.getByText('Cabin', { exact: true }) })
      .filter({ has: page.getByRole('switch', { name: 'AC Output' }) }).last().getByRole('switch', { name: 'AC Output' })
    if (await cabinSwitch.isEnabled()) await cabinSwitch.click()
    await page.waitForTimeout(1500)

    await page.getByText(/Updating firmware on Garage/).last().click()
    await expect(page.getByTestId('fw-run-title')).toHaveText('Firmware updated', { timeout: 30_000 })

    const during = api.calls.slice(before)
    const upgradeCalls = during.filter(c => c.path === '/device/upgrade/create')
    expect(upgradeCalls).toHaveLength(1)
    expect(upgradeCalls[0].body).toEqual({ deviceId: '1001', deviceFirmwareId: 'fw-new' })
    // Nothing but firmware / session traffic went out while it ran.
    // The lock ends with the last progress poll (the one that reported success).
    const lastPoll = during.map(c => c.path).lastIndexOf('/device/upgrade/details')
    expect(lastPoll).toBeGreaterThan(0)
    const whileLocked = during.slice(0, lastPoll + 1)
    expect(whileLocked.filter(c => c.path === '/device/upgrade/details').length).toBeGreaterThanOrEqual(3)
    expect(whileLocked.filter(c => !FIRMWARE_PATHS.test(c.path)).map(c => c.path)).toEqual([])
    expect(api.relaySchedules).toHaveLength(0)

    // Unlocked again, and the device now reads as up to date.
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByTestId('fw-row-1001')).toContainText('Up to date')
    await page.goto('/#/devices')
    await expect(page.getByText(/Updating firmware on/)).toHaveCount(0)
  })

  test('a failed update releases the app and says the device keeps its firmware', async ({ page }) => {
    devices[0].upgradeOutcome = 'fail'
    await openFirmwareUpdate(page)
    await page.getByTestId('fw-row-1001').click()
    await page.getByRole('button', { name: 'Update Firmware' }).click()
    await page.getByRole('button', { name: 'Start Update' }).click()
    await expect(page.getByTestId('fw-run-title')).toHaveText('Update failed', { timeout: 30_000 })
    await expect(page.getByText(/keeps its current firmware/)).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('sierro-firmware-update'))).toBeNull()
  })

  test('an offline device is not offered the update', async ({ page }) => {
    devices[0].isOnline = false
    await openFirmwareUpdate(page)
    await expect(page.getByTestId('fw-row-1001')).toContainText('Device offline')
    await expect(page.getByTestId('fw-row-1001')).toBeDisabled()
  })
})
