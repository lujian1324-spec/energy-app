/**
 * Device list — the AC Output switch (v4.15.1), the phone going offline
 * (APP-20260923-002) and the bell dot agreeing with Notifications
 * (APP-20260923-004). Two online devices and one offline, all mocked.
 */
import { test, expect, type Page } from '@playwright/test'
import { mockBackend, signIn, type MockDevice } from './support/mockBackend'

const OFFLINE_COPY = 'No internet connection. Check your network and try again.'
const PASSTHROUGH = '/remote/device/passthrough'

/** The AC Output switch on one device's card. */
function acSwitch(page: Page, name: string) {
  return page.locator('div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('switch', { name: 'AC Output' }) })
    .last()
    .getByRole('switch', { name: 'AC Output' })
}

/** base64 of the FC06 write to 0x0080 the app sends for on / off. */
function acWrite(on: boolean): string {
  const bytes = [0x01, 0x06, 0x00, 0x80, ...(on ? [0x01, 0xaa] : [0xaa, 0x01])]
  let crc = 0xffff
  for (const b of bytes) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1
  }
  return Buffer.from([...bytes, crc & 0xff, crc >> 8]).toString('base64')
}

test.describe('Device list', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  let devices: MockDevice[]
  test.beforeEach(async ({ page }) => {
    devices = [
      { id: '1001', name: 'Garage', acOn: true, alarms: ['inverterOverload'] },
      { id: '2002', name: 'Cabin', acOn: false, alarms: ['inverterOverTemp'] },
      { id: '3003', name: 'Shed', acOn: true, isOnline: false },
    ]
    await signIn(page)
  })

  test('the AC switch shows what each device reports; an offline device shows off', async ({ page }) => {
    await mockBackend(page, devices)
    await page.goto('/#/devices')
    await expect(acSwitch(page, 'Garage')).toHaveAttribute('aria-checked', 'true')
    await expect(acSwitch(page, 'Cabin')).toHaveAttribute('aria-checked', 'false')
    // Shed's last report says on, but it is offline: off, and not switchable.
    await expect(acSwitch(page, 'Shed')).toHaveAttribute('aria-checked', 'false')
    await expect(acSwitch(page, 'Shed')).toBeDisabled()
  })

  test('flipping the switch writes 0x0080 and stays once the device confirms', async ({ page }) => {
    const api = await mockBackend(page, devices)
    await page.goto('/#/devices')
    const cabin = acSwitch(page, 'Cabin')
    await expect(cabin).toHaveAttribute('aria-checked', 'false')
    await cabin.click()
    await expect(cabin).toHaveAttribute('aria-checked', 'true')
    const writes = api.callsTo(PASSTHROUGH, '2002').filter(c => c.body.base64Input === acWrite(true))
    expect(writes).toHaveLength(1)
    // Waited for the device's reply rather than fire-and-forget.
    expect(writes[0].body.noOutput).toBe(false)
    expect(devices[1].acOn).toBe(true)
  })

  test('a device that does not switch is reported, and the switch shows its real state', async ({ page }) => {
    devices[1].acObeys = false
    await mockBackend(page, devices)
    await page.goto('/#/devices')
    const cabin = acSwitch(page, 'Cabin')
    await cabin.click()
    await expect(page.getByText("The device didn't switch its AC output. Try again.")).toBeVisible({ timeout: 15_000 })
    await expect(cabin).toHaveAttribute('aria-checked', 'false')
  })

  test('with the phone offline the list says so and locks the switches', async ({ page, context }) => {
    await mockBackend(page, devices)
    await page.goto('/#/devices')
    await expect(acSwitch(page, 'Garage')).toBeEnabled()

    await context.setOffline(true)
    await expect(page.getByText(OFFLINE_COPY)).toBeVisible()
    await expect(acSwitch(page, 'Garage')).toBeDisabled()
    await expect(acSwitch(page, 'Cabin')).toBeDisabled()
    // The phone's network says nothing about the device: its state stays.
    await expect(acSwitch(page, 'Garage')).toHaveAttribute('aria-checked', 'true')

    await context.setOffline(false)
    await expect(page.getByText(OFFLINE_COPY)).toHaveCount(0)
    await expect(acSwitch(page, 'Garage')).toBeEnabled()
  })

  test('the bell dot lights for every device\'s alarms and clears once the list is opened', async ({ page }) => {
    await mockBackend(page, devices)
    await page.goto('/#/devices')
    const bell = page.getByRole('button', { name: 'Notifications' })
    const dot = bell.locator('span.bg-danger-dot')
    await expect(dot).toBeVisible()

    await bell.click()
    await expect(page).toHaveURL(/#\/notifications/)
    // One row per device, each naming its device — not only the selected one.
    await expect(page.getByText('Inverter overload')).toBeVisible()
    await expect(page.getByText('Garage • Warning')).toBeVisible()
    await expect(page.getByText('Inverter over-temperature')).toBeVisible()
    await expect(page.getByText('Cabin • Warning')).toBeVisible()
    await expect(page.getByText('You’re all caught up')).toHaveCount(0)

    await page.goto('/#/devices')
    await expect(bell).toBeVisible()
    await expect(dot).toHaveCount(0)
  })
})

test.describe('Device list banners', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  test('"Failed to switch power" sits 16px below the header and 16px above the cards, not on the header', async ({ page }) => {
    await signIn(page)
    await mockBackend(page, [
      { id: '1001', name: 'Garage', acOn: false, refuseRegisterWrites: true },
      { id: '2002', name: 'Cabin', acOn: true },
    ])
    await page.goto('/#/devices')
    await acSwitch(page, 'Garage').click()
    await expect(page.getByRole('alert')).toContainText('Failed to switch power')
    await page.waitForTimeout(500) // the height animation settles
    const header = await page.locator('.safe-area-top-header').first().boundingBox()
    const banner = await page.getByRole('alert').boundingBox()
    const card = await page.locator('div.rounded-l').filter({ has: page.getByText('Garage', { exact: true }) }).last().boundingBox()
    expect(Math.round(banner!.y - (header!.y + header!.height))).toBe(16)
    expect(Math.round(card!.y - (banner!.y + banner!.height))).toBe(16)
  })
})
