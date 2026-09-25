/**
 * Device Settings (v4.18.0):
 *  - Sleep Mode has two charge-power sliders in 50 W steps — 0–400 W on a
 *    Sierro 1000, 0–800 W on a Sierro 2000 — and a save goes to the device
 *    (0x0085 over passthrough) and to the relay (the AWS schedule server);
 *  - an offline device can still be set: the relay takes the window and writes
 *    it when the device is back (server/sleepExecutor.test.js covers that half);
 *  - Battery Priority is hidden and Device Info has no Serial Number row;
 *  - register 0x000A = 1000 W makes the device a Sierro 2000.
 */
import { test, expect, type Page } from '@playwright/test'
import { E2E_TZ, mockBackend, signIn, type MockDevice } from './support/mockBackend'

test.use({ timezoneId: E2E_TZ })

/** 23:30 in Los Angeles: inside the default 22:00–09:00 sleep window. */
const NOW = new Date('2026-09-24T23:30:00-07:00')
const PASSTHROUGH = '/remote/device/passthrough'

/** base64 of the FC06 write of `watts` to 0x0085, as the app sends it. */
function chargePowerWrite(watts: number): string {
  const bytes = [0x01, 0x06, 0x00, 0x85, (watts >> 8) & 0xff, watts & 0xff]
  let crc = 0xffff
  for (const b of bytes) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1
  }
  return Buffer.from([...bytes, crc & 0xff, crc >> 8]).toString('base64')
}

const sleepSlider = (page: Page) => page.getByRole('slider', { name: 'AC charging power during sleep' })
const wakeSlider = (page: Page) => page.getByRole('slider', { name: 'AC charging power outside sleep' })

async function openSleepMode(page: Page, id: string) {
  await page.goto(`/#/device/${id}/settings`)
  await page.getByText('Sleep Mode', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sleep Mode', exact: true })).toBeVisible()
}

test.describe('Sleep Mode', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')
  // v4.22.0: Sleep Mode is replaced by Silent Mode (device-program.e2e.spec.ts).
  // The editor stays in the code behind LEGACY_SLEEP_MODE_ENABLED; these run again if it is flipped.
  test.skip(true, 'Sleep Mode replaced by Silent Mode (LEGACY_SLEEP_MODE_ENABLED = false)')

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW })
    await signIn(page)
  })

  test('Sierro 1000: 0–400 W in 50 W steps; Save writes the device and uploads to the relay', async ({ page }) => {
    const api = await mockBackend(page, [{ id: '1001', name: 'Garage', model: 'Sierro 1000' }])
    await openSleepMode(page, '1001')
    await page.locator('button.w-12.h-7').click()

    for (const slider of [sleepSlider(page), wakeSlider(page)]) {
      await expect(slider).toHaveAttribute('min', '0')
      await expect(slider).toHaveAttribute('max', '400')
      await expect(slider).toHaveAttribute('step', '50')
    }
    await expect(sleepSlider(page)).toHaveValue('150')
    await expect(wakeSlider(page)).toHaveValue('400')

    await sleepSlider(page).fill('250')
    await wakeSlider(page).fill('350')
    await expect(page.getByText('250W', { exact: true })).toBeVisible()
    await expect(page.getByText('Low-noise charging · 250W AC charging limit')).toBeVisible()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Device Settings', exact: true })).toBeVisible()

    // Down to the device now: 23:30 is inside the window, so the sleep power.
    const writes = api.callsTo(PASSTHROUGH, '1001').filter(c => c.body.base64Input === chargePowerWrite(250))
    expect(writes.length).toBeGreaterThanOrEqual(1)
    // Up to the relay, which keeps enforcing it with the app closed.
    expect(api.relaySchedules).toHaveLength(1)
    expect(api.relaySchedules[0].deviceId).toBe('1001')
    expect(api.relaySchedules[0].schedule).toMatchObject({
      enabled: true, sleepFrom: '22:00', sleepTo: '09:00', model: 'Sierro 1000',
      sleepW: 250, wakeW: 350, mode: 'sleep', tz: E2E_TZ,
    })

    // The sliders come back where they were left — after a restart too.
    await page.reload()
    await page.getByText('Sleep Mode', { exact: true }).click()
    await expect(sleepSlider(page)).toHaveValue('250')
    await expect(wakeSlider(page)).toHaveValue('350')
  })

  test('Sierro 2000: 0–800 W', async ({ page }) => {
    await mockBackend(page, [{ id: '2002', name: 'Cabin', model: 'Sierro 2000' }])
    await openSleepMode(page, '2002')
    await page.locator('button.w-12.h-7').click()
    await expect(sleepSlider(page)).toHaveAttribute('max', '800')
    await expect(wakeSlider(page)).toHaveAttribute('max', '800')
    await expect(sleepSlider(page)).toHaveValue('300')
    await expect(wakeSlider(page)).toHaveValue('800')
    await sleepSlider(page).fill('550')
    await expect(sleepSlider(page)).toHaveValue('550')
  })

  test('an offline device can be set: the relay takes the window', async ({ page }) => {
    const api = await mockBackend(page, [{ id: '3003', name: 'Shed', model: 'Sierro 2000', isOnline: false }])
    await openSleepMode(page, '3003')
    await page.locator('button.w-12.h-7').click()
    await sleepSlider(page).fill('500')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Sleep Mode saved')).toBeVisible()
    await expect(page.getByText(/It will switch to these settings when it is back online/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Device Settings', exact: true })).toBeVisible()
    await expect(page.getByText('Could not save Sleep Mode')).toHaveCount(0)

    // Nothing was asked of the device's cloud config; the relay has the window.
    expect(api.callsTo('/remote/device/config/write')).toHaveLength(0)
    expect(api.relaySchedules).toHaveLength(1)
    expect(api.relaySchedules[0]).toMatchObject({ deviceId: '3003' })
    expect(api.relaySchedules[0].schedule).toMatchObject({ enabled: true, sleepW: 500, wakeW: 800, mode: 'sleep' })
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sierro-sleep-3003')!))
    expect(saved).toMatchObject({ enabled: true, sleepW: 500, wakeW: 800 })
  })
})

test.describe('Device Settings rows', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  test('Battery Priority is hidden and Device Info has no Serial Number', async ({ page }) => {
    await signIn(page)
    await mockBackend(page, [{ id: '1001', name: 'Garage', dtuDtuid: '43767893781169874514', serialNumber: 'SN26312510CN003146260849' }])
    await page.goto('/#/device/1001/settings')
    // v4.22.0: Charging Settings (with Silent Mode) replaces the Sleep Mode row.
    await expect(page.getByText('Charging Settings', { exact: true })).toBeVisible()
    await expect(page.getByText('Sleep Mode', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Battery Priority')).toHaveCount(0)
    await page.getByText('Device Info', { exact: true }).click()
    await expect(page.getByText('Bluetooth ID', { exact: true })).toBeVisible()
    await expect(page.getByText('43767893781169874514')).toBeVisible()
    await expect(page.getByText('Serial Number')).toHaveCount(0)
    await expect(page.getByText('SN26312510CN003146260849')).toHaveCount(0)
  })

  for (const [watts, model] of [[1000, 'Sierro 2000'], [500, 'Sierro 1000']] as const) {
    test(`0x000A = ${watts} W reads as the ${model}`, async ({ page }) => {
      await signIn(page)
      const devices: MockDevice[] = [{ id: '1001', name: 'Garage', model: watts === 1000 ? 'Sierro 1000' : 'Sierro 2000', acInvOutputW: watts }]
      const api = await mockBackend(page, devices)
      await page.goto('/#/devices')
      await expect(page.getByText('Garage', { exact: true }).first()).toBeVisible()
      // The register is read over passthrough: 0x0000 × 0x12 covers 0x000A.
      await expect.poll(() => api.callsTo(PASSTHROUGH, '1001')
        .filter(c => Buffer.from(c.body.base64Input, 'base64').toString('hex') === '010300000012c5c7').length).toBeGreaterThan(0)
      await expect.poll(() => page.evaluate(() => new Promise<string | null>(resolve => {
        const open = indexedDB.open('powerflow-db')
        open.onsuccess = () => {
          const req = open.result.transaction('rated_params').objectStore('rated_params').get('1001')
          req.onsuccess = () => { resolve(req.result?.model ?? null); open.result.close() }
        }
      }))).toBe(model)

      // The model's AC charging power choices (v4.22.0 Charging Settings).
      await page.goto('/#/device/1001/charging')
      await expect(page.getByRole('radio').last()).toHaveText(model === 'Sierro 2000' ? '800 W' : '400 W')
    })
  }

  test('Device Info reads Rated Capacity / Output Power / Voltage from the model, not 0x000A (v4.19.0)', async ({ page }) => {
    await signIn(page)
    // A Sierro 1000 whose 0x000A reads 300 W: 300 × 2 used to show 0.6 kWh.
    await mockBackend(page, [
      { id: '1001', name: 'Garage', model: 'Sierro 1000', acInvOutputW: 300, soc: 80 },
      { id: '2002', name: 'Cabin', model: 'Sierro 1000', acInvOutputW: 1000 },
    ])
    await page.goto('/#/devices')
    await expect(page.getByText('Garage', { exact: true }).first()).toBeVisible()
    const savedModel = (id: string) => page.evaluate((deviceId) => new Promise<string | null>(resolve => {
      const open = indexedDB.open('powerflow-db')
      open.onsuccess = () => {
        const req = open.result.transaction('rated_params').objectStore('rated_params').get(deviceId)
        req.onsuccess = () => { resolve(req.result?.model ?? null); open.result.close() }
      }
    }), id)
    await expect.poll(() => savedModel('1001')).toBe('Sierro 1000')
    await expect.poll(() => savedModel('2002')).toBe('Sierro 2000')

    const rowOf = (label: string) => page.locator('div').filter({ has: page.getByText(label, { exact: true }) }).last()
    await page.goto('/#/device/1001/settings')
    await page.getByText('Device Info', { exact: true }).click()
    await expect(rowOf('Rated Capacity')).toContainText('1 kWh')
    await expect(rowOf('Rated Output Power')).toContainText('500W')
    await expect(rowOf('Rated Voltage')).toContainText('120V')
    await expect(page.getByText('0.6 kWh')).toHaveCount(0)
    for (const old of ['Capacity', 'Output Power', 'Voltage']) await expect(page.getByText(old, { exact: true })).toHaveCount(0)

    await page.goto('/#/device/2002/settings')
    await page.getByText('Device Info', { exact: true }).click()
    await expect(rowOf('Rated Capacity')).toContainText('2 kWh')

    // The runtime estimate uses the same 1 kWh: 80 % SOC, +30 W net → 200 Wh / 30 W = 6h40m
    // (with 0.6 kWh it read 4h0m).
    await page.goto('/#/device/1001')
    await expect(page.getByText('6h40m to full')).toBeVisible()
  })
})

