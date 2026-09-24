import { test, expect } from '@playwright/test'

test.describe('schedule save acknowledgement', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses an isolated local build and mocked device/relay APIs')

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('iot-auth', JSON.stringify({ state: { isGuest: true }, version: 0 }))
      localStorage.setItem('iot_user_id', 'isolated-e2e-account')
      localStorage.setItem('powerflow-device-store', JSON.stringify({ state: { isDemoMode: false, devices: [], selectedDeviceId: 'e2e-device' }, version: 0 }))
      localStorage.setItem('powerflow-storage', JSON.stringify({ state: { peakShavingSettings: { enabled: true, schedules: [] } }, version: 0 }))
      localStorage.setItem('sierro-sleep-e2e-device', JSON.stringify({ enabled: true, sleepFrom: '22:00', sleepTo: '09:00' }))
      localStorage.setItem('sierro-active-schedule-e2e-device', 'sleep')
    })
    // No test request can reach a customer account, device, or production relay.
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api/')) return route.continue()
      return route.fulfill({ json: { code: 0, data: { fields: { sleepMode: { value: true } } } } })
    })
  })

  // SW-14: Smart Schedule row is hidden while SMART_SCHEDULE_PAUSED; Sleep Save path is the real intent.
  test('hides Smart Schedule row, retains failed Sleep draft and retries Save', async ({ page }) => {
    let uploads = 0
    await page.route('**/schedule', route => {
      uploads++
      return route.fulfill(uploads === 1
        ? { status: 409, json: { code: 1, reason: 'POLLER_SESSION_REQUIRED' } }
        : { json: { code: 0 } })
    })
    await page.goto('/#/device/e2e-device/settings')
    await expect(page.getByText('Smart Schedule', { exact: true })).toHaveCount(0)
    await page.getByText('Sleep Mode', { exact: true }).click()
    // The only unnamed button with a rounded toggle track on this screen.
    await page.locator('button.w-12.h-7').click()
    const save = page.getByRole('button', { name: 'Save', exact: true })
    await save.click()
    await expect(page.getByText('Background schedule may still run', { exact: true })).toBeVisible()
    await expect(page.getByText(/Background session is missing/)).toBeVisible()
    await expect(save).toBeEnabled()
    await expect(page.getByRole('heading', { name: 'Sleep Mode', exact: true })).toBeVisible()
    await save.click()
    await expect(page.getByRole('heading', { name: 'Device Settings', exact: true })).toBeVisible()
    expect(uploads).toBe(2)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sierro-sleep-e2e-device')!))
    expect(saved.enabled).toBe(false)
  })

  test('saves Sleep settings without the background-save toast when enabling', async ({ page }) => {
    const uploads: boolean[] = []
    await page.route('**/schedule', route => {
      const enabled = route.request().postDataJSON().schedule.enabled
      uploads.push(enabled)
      return route.fulfill(enabled
        ? { status: 409, json: { code: 1, reason: 'POLLER_SESSION_REQUIRED' } }
        : { json: { code: 0 } })
    })
    await page.goto('/#/device/e2e-device/settings')
    for (const enabled of [false, true]) {
      await page.getByText('Sleep Mode', { exact: true }).click()
      await page.locator('button.w-12.h-7').click()
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Device Settings', exact: true })).toBeVisible()
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sierro-sleep-e2e-device')!))
      expect(saved.enabled).toBe(enabled)
    }
    expect(uploads).toEqual([false, true])
    await expect(page.getByText('Saved on the device, not in the background', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Background schedule may still run', { exact: true })).toHaveCount(0)
  })
})
