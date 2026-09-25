/**
 * Device program (v4.22.0): Smart Schedule, Charging Settings, Silent Mode and the
 * (unreleased) Charge & Discharge Limits, on the mocked backend + relay.
 *
 * The relay mock validates uploads with the relay's own rules (server/deviceProgram.js)
 * and serves them back on GET /program, so a reload reads what the relay stored.
 * What the relay's tick then does with the app closed is covered in
 * server/program.test.js and server/deviceProgram.test.js.
 */
import { test, expect, type Page } from '@playwright/test'
import { E2E_TZ, mockBackend, signIn, type MockBackend, type MockDevice } from './support/mockBackend'
import { defaultProgram } from '../server/deviceProgram.js'

test.use({ timezoneId: E2E_TZ })

/** Thursday 23:30 in Los Angeles: inside a 20:00–09:00 Silent Mode window. */
const NOW = new Date('2026-09-24T23:30:00-07:00')
const PASSTHROUGH = '/remote/device/passthrough'

/** The watts of every 0x0085 write the app sent to a device. */
function chargeWrites(api: MockBackend, id: string): number[] {
  return api.callsTo(PASSTHROUGH, id)
    .map(c => [...Buffer.from(String(c.body.base64Input), 'base64')])
    .filter(b => b[1] === 0x06 && b[2] === 0x00 && b[3] === 0x85)
    .map(b => (b[4] << 8) | b[5])
}

const garage = (over: Partial<MockDevice> = {}): MockDevice[] => [{ id: '1001', name: 'Garage', model: 'Sierro 1000', ...over }]
const lastProgram = (api: MockBackend) => api.relayProgramPosts[api.relayProgramPosts.length - 1]?.program

async function pickHour(page: Page, label: string) {
  await page.getByRole('listbox', { name: 'Hour' }).getByRole('button', { name: label, exact: true }).click()
}

test.describe('Device program', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW })
    await signIn(page)
  })

  test('Device Settings: Smart Schedule and Charging Settings replace Sleep Mode', async ({ page }) => {
    await mockBackend(page, garage())
    await page.goto('/#/device/1001/settings')
    await expect(page.getByText('Smart Schedule', { exact: true })).toBeVisible()
    await expect(page.getByText('Charging Settings', { exact: true })).toBeVisible()
    await expect(page.getByText('Sleep Mode', { exact: true })).toHaveCount(0)
    await page.getByText('Charging Settings', { exact: true }).click()
    await expect(page).toHaveURL(/#\/device\/1001\/charging$/)
  })

  test('Smart Schedule: add, edit and switch off tasks; Save sends them to the relay in this zone', async ({ page }) => {
    const api = await mockBackend(page, garage())
    await page.goto('/#/device/1001/schedule')
    const save = page.getByRole('button', { name: 'Save', exact: true })
    await expect(save).toBeDisabled()

    // Charging: Stop Charging at 7:00 AM on weekdays.
    await page.getByRole('button', { name: 'Add Schedule' }).click()
    await page.getByRole('radio', { name: 'Stop Charging' }).click()
    await page.getByRole('button', { name: 'Time' }).click()
    await pickHour(page, '7 AM')
    await page.getByRole('button', { name: 'Done' }).first().click()
    await page.getByRole('button', { name: 'Weekdays' }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('Stop Charging', { exact: true })).toBeVisible()
    await expect(page.getByText('7:00 AM', { exact: true })).toBeVisible()

    // AC Output: Turn Off at 10:00 PM every day.
    await page.getByRole('tab', { name: 'AC Output' }).click()
    await page.getByRole('button', { name: 'Add Schedule' }).click()
    await page.getByRole('radio', { name: 'Turn Off' }).click()
    await page.getByRole('button', { name: 'Time' }).click()
    await pickHour(page, '10 PM')
    await page.getByRole('button', { name: 'Done' }).first().click()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('Turn Off AC Output', { exact: true })).toBeVisible()

    await save.click()
    await expect(page.getByText('Smart Schedule saved')).toBeVisible()
    const p = lastProgram(api)
    expect(p.tz).toBe(E2E_TZ)
    expect(p.tasks).toEqual([
      expect.objectContaining({ kind: 'charge', action: 'stop', time: '07:00', days: [1, 2, 3, 4, 5], enabled: true }),
      expect.objectContaining({ kind: 'ac', action: 'off', time: '22:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true }),
    ])
    expect(api.relayProgramPosts[0].userId).toBeTruthy()
    expect(api.relayProgramPosts[0].deviceId).toBe('1001')

    // Read back from the relay after a restart; switch one off and save again.
    await page.reload()
    await expect(page.getByText('Stop Charging', { exact: true })).toBeVisible()
    await page.getByRole('switch', { name: 'Stop Charging at 7:00 AM' }).click()
    await save.click()
    await expect.poll(() => lastProgram(api).tasks[0].enabled).toBe(false)

    // Delete it from the sheet.
    await page.getByRole('button', { name: 'Edit Stop Charging' }).click()
    await page.getByRole('button', { name: 'Delete Schedule' }).click()
    await save.click()
    await expect.poll(() => lastProgram(api).tasks.map((t: { kind: string }) => t.kind)).toEqual(['ac'])
  })

  test('two Charging schedules at the same time on the same day are refused before anything is sent', async ({ page }) => {
    const api = await mockBackend(page, garage())
    await page.goto('/#/device/1001/schedule')
    for (const action of ['Start Charging', 'Stop Charging']) {
      await page.getByRole('button', { name: 'Add Schedule' }).click()
      await page.getByRole('radio', { name: action }).click()
      await page.getByRole('button', { name: 'Done' }).click()
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(/Two Charging schedules run at 23:00/)).toBeVisible()
    expect(api.relayProgramPosts).toHaveLength(0)
  })

  test('Charging Settings: Sierro 1000 choices, Save stores the power and sends it to the device', async ({ page }) => {
    const api = await mockBackend(page, garage())
    await page.goto('/#/device/1001/charging')
    const options = page.getByRole('radio')
    await expect(options).toHaveText(['50 W', '100 W', '150 W', '200 W', '300 W', '400 W'])
    await page.getByRole('radio', { name: '200 W' }).click()
    await expect(page.getByTestId('ac-power-value')).toHaveText('200 W')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Charging Settings saved')).toBeVisible()
    expect(lastProgram(api).chargePowerW).toBe(200)
    expect(chargeWrites(api, '1001')).toEqual([200])
  })

  test('Sierro 2000 doubles the choices and the Silent Mode limit', async ({ page }) => {
    // 0x000A = 1000 W is what makes the app treat a unit as a Sierro 2000 (v4.18.0).
    await mockBackend(page, [{ id: '2002', name: 'Cabin', model: 'Sierro 2000', acInvOutputW: 1000 }])
    // The device list is where the model is read from the device (v4.18.0).
    await page.goto('/#/devices')
    await expect(page.getByText('Cabin', { exact: true }).first()).toBeVisible()
    await expect.poll(() => page.evaluate(() => new Promise<string | null>(resolve => {
      const open = indexedDB.open('powerflow-db')
      open.onsuccess = () => {
        try {
          const req = open.result.transaction('rated_params').objectStore('rated_params').get('2002')
          req.onsuccess = () => { resolve(req.result?.model ?? null); open.result.close() }
          req.onerror = () => { resolve(null); open.result.close() }
        } catch { resolve(null); open.result.close() }
      }
      open.onerror = () => resolve(null)
    }))).toBe('Sierro 2000')
    await page.goto('/#/device/2002/charging')
    await expect(page.getByRole('radio')).toHaveText(['100 W', '200 W', '300 W', '400 W', '600 W', '800 W'])
    await page.getByText('Silent Mode', { exact: true }).click()
    await expect(page.getByTestId('silent-sub')).toHaveText('Turn on to limit AC charging power to 300 W or less.')
  })

  test('Silent Mode: switched on with a 8 PM–9 AM schedule, the device is limited at once inside the window', async ({ page }) => {
    const api = await mockBackend(page, garage())
    await page.goto('/#/device/1001/charging/silent')
    await expect(page.getByTestId('silent-sub')).toHaveText('Turn on to limit AC charging power to 150 W or less.')
    await expect(page.getByText('Scheduled Silent Mode')).toHaveCount(0)
    await page.getByRole('switch', { name: 'Silent Mode', exact: true }).click()
    await expect(page.getByTestId('silent-sub')).toHaveText('AC charging limit: 150 W')
    await page.getByRole('switch', { name: 'Scheduled Silent Mode' }).click()
    await expect(page.getByRole('button', { name: 'From 8:00 PM' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'To 9:00 AM next day' })).toBeVisible()
    await expect(page.getByText('Every day', { exact: true })).toBeVisible()
    await expect(page.getByTestId('silent-status')).toContainText('Limiting now · ends tomorrow 9:00 AM')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Silent Mode saved')).toBeVisible()
    expect(lastProgram(api).silent).toMatchObject({ enabled: true, scheduled: true, from: '20:00', to: '09:00', days: [0, 1, 2, 3, 4, 5, 6] })
    expect(chargeWrites(api, '1001')).toEqual([150])

    // Charging Settings shows the limit and keeps choices above it out of reach.
    await page.goto('/#/device/1001/charging')
    await expect(page.getByTestId('ac-power-value')).toHaveText('150 W')
    await expect(page.getByRole('radio', { name: '200 W' })).toBeDisabled()
    await expect(page.getByText('Silent Mode is limiting AC charging to 150 W.')).toBeVisible()
    await expect(page.getByText('Silent Mode', { exact: true }).locator('..')).toContainText('On')
  })

  test('changing the power while a Stop Charging schedule is in effect never starts a charge', async ({ page }) => {
    const api = await mockBackend(page, garage())
    const stop = { id: 'stop', kind: 'charge', action: 'stop', time: '18:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true, updatedAt: 1 }
    api.relayPrograms['1001'] = { ...defaultProgram('Sierro 1000', E2E_TZ), tasks: [stop], savedAt: 1 }
    await page.goto('/#/device/1001/charging')
    await expect(page.getByTestId('charging-paused-note')).toContainText('Charging is paused by Smart Schedule')
    await page.getByRole('radio', { name: '300 W' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Charging Settings saved')).toBeVisible()
    expect(lastProgram(api).chargePowerW).toBe(300)
    expect(chargeWrites(api, '1001')).toEqual([0])
  })

  test('Device Settings rows read the relay\'s program on a phone that has no copy of it (v4.23.1)', async ({ page }) => {
    const api = await mockBackend(page, garage())
    const acOff = { id: 'acoff', kind: 'ac', action: 'off', time: '22:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true, updatedAt: 1 }
    api.relayPrograms['1001'] = { ...defaultProgram('Sierro 1000', E2E_TZ), chargePowerW: 200, tasks: [acOff], savedAt: 1 }
    await page.goto('/#/device/1001/settings')
    await expect(page.getByText('Smart Schedule', { exact: true }).locator('..')).toContainText('On')
    await expect(page.getByText('Charging Settings', { exact: true }).locator('..')).toContainText('200 W')
  })

  test('another phone saved meanwhile: this phone\'s change is added to it, not over it (v4.23.1)', async ({ page }) => {
    const api = await mockBackend(page, garage())
    const loaded = page.waitForResponse(r => new URL(r.url()).pathname === '/program' && r.request().method() === 'GET')
    await page.goto('/#/device/1001/charging/silent')
    await loaded
    await expect(page.getByTestId('silent-sub')).toHaveText('Turn on to limit AC charging power to 150 W or less.')
    // While this screen is open, another phone saves an AC Output schedule and 300 W.
    const acOff = { id: 'acoff', kind: 'ac', action: 'off', time: '22:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true, updatedAt: 1 }
    api.relayPrograms['1001'] = { ...defaultProgram('Sierro 1000', E2E_TZ), chargePowerW: 300, tasks: [acOff], savedAt: 5 }
    await page.getByRole('switch', { name: 'Silent Mode', exact: true }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved together with changes made on another phone.')).toBeVisible()
    expect(api.relayProgramPosts.map(p => p.baseSavedAt)).toEqual([0, 5])
    const saved = lastProgram(api)
    expect(saved.silent).toMatchObject({ enabled: true, scheduled: false })
    expect(saved.tasks.map((t: { id: string }) => t.id)).toEqual(['acoff'])
    expect(saved.chargePowerW).toBe(300)
    // Silent Mode always on: 300 W is capped at 150 W.
    expect(chargeWrites(api, '1001')).toEqual([150])
  })

  test('a refused save says so, sends nothing to the device and stays unsaved', async ({ page }) => {
    const api = await mockBackend(page, garage())
    api.relayProgramRefusal.status = 409
    await page.goto('/#/device/1001/charging')
    await page.getByRole('radio', { name: '100 W' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText("Couldn't save Charging Settings")).toBeVisible()
    await expect(page.getByText(/Background session is missing/)).toBeVisible()
    expect(chargeWrites(api, '1001')).toEqual([])
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  })

  test('an offline device is saved for the relay and not written now', async ({ page }) => {
    const api = await mockBackend(page, garage({ isOnline: false }))
    await page.goto('/#/device/1001/charging')
    await page.getByRole('radio', { name: '300 W' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(/The device is offline; it will switch when it is back online/)).toBeVisible()
    expect(lastProgram(api).chargePowerW).toBe(300)
    expect(chargeWrites(api, '1001')).toEqual([])
  })

  test('a saved Sleep Mode window becomes the Silent Mode schedule', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('sierro-sleep-1001', JSON.stringify({ enabled: true, sleepFrom: '22:00', sleepTo: '06:30' }))
    })
    await mockBackend(page, garage())
    await page.goto('/#/device/1001/charging/silent')
    await expect(page.getByRole('switch', { name: 'Silent Mode', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('button', { name: 'From 10:00 PM' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'To 6:30 AM next day' })).toBeVisible()
  })

  test('Charge & Discharge Limits (unreleased) save with the program', async ({ page }) => {
    const api = await mockBackend(page, garage())
    await page.goto('/#/device/1001/limits')
    await page.getByRole('radio', { name: '80%' }).click()
    await page.getByRole('radio', { name: '10%' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Limits saved')).toBeVisible()
    expect(lastProgram(api).limits).toEqual({ chargeMax: 80, dischargeMin: 10 })
  })
})
