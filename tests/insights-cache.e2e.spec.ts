/**
 * Insights history cache (v4.21.0): every app open caches the last month of the
 * Insights device in the background — one day per request, in idle time — and
 * Insights then paints from the phone, re-reading only today.
 */
import { test, expect, type Page } from '@playwright/test'
import { E2E_TZ, mockBackend, reportsBetween, signIn, type MockBackend, type MockDevice } from './support/mockBackend'

test.use({ timezoneId: E2E_TZ })

const NOW = new Date('2026-09-24T15:00:00-07:00')
const HISTORY = '/deviceState/simple/attribute/keys/history/v1'
const DAYS_CACHED = 31 // 2026-08-25 … 2026-09-24

function fleet(): MockDevice[] {
  return [
    // The oldest device is the one Insights shows.
    { id: '1001', name: 'Garage', createdAt: '2026-01-01T00:00:00Z',
      history: reportsBetween(8, 12, { generationPower: 100, exchangeChargingPower: 50, outputPower: 120 }) },
    { id: '2002', name: 'Cabin', createdAt: '2026-02-01T00:00:00Z',
      history: reportsBetween(0, 24, { generationPower: 999, outputPower: 999 }) },
  ]
}

const historyDays = (api: MockBackend, deviceId = '1001') =>
  [...new Set(api.callsTo(HISTORY, deviceId).map(c => String(c.body.fromTime).slice(0, 10)))]

/** Long tasks (main thread busy ≥ 50 ms) from now on. */
async function watchLongTasks(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[] }
    w.__long = []
    new PerformanceObserver(list => { for (const e of list.getEntries()) w.__long.push(e.duration) })
      .observe({ type: 'longtask', buffered: false })
  })
}

test.describe('Insights history cache', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW })
    await signIn(page)
  })

  test('opening the app caches the last month in the background, a day per request', async ({ page }) => {
    const api = await mockBackend(page, fleet())
    await page.goto('/#/devices')
    await expect(page.getByText('Garage', { exact: true }).first()).toBeVisible()
    await watchLongTasks(page)

    // Mid-run the app answers taps as usual: switch tabs while days are still coming in.
    await expect.poll(() => historyDays(api).length, { timeout: 20_000 }).toBeGreaterThan(3)
    expect(historyDays(api).length).toBeLessThan(DAYS_CACHED)
    await page.getByRole('link', { name: 'Insights' }).click()
    await expect(page.getByText('Input vs. Output')).toBeVisible({ timeout: 5000 })
    await page.getByRole('link', { name: 'Devices' }).click()
    await expect(page.getByText('Garage', { exact: true }).first()).toBeVisible({ timeout: 5000 })

    await expect.poll(() => historyDays(api).length, { timeout: 45_000 }).toBe(DAYS_CACHED)
    const calls = api.callsTo(HISTORY, '1001')
    // Newest day first, each request exactly one local day, the Insights device only.
    expect(calls[0].body.fromTime).toBe('2026-09-24T00:00:00-07:00')
    expect(historyDays(api)).toContain('2026-08-25')
    expect(calls.every(c => String(c.body.toTime).endsWith('T23:59:59-07:00'))).toBe(true)
    expect(historyDays(api, '2002')).toEqual([])

    // The main thread was never blocked for long while it ran.
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long)
    console.log(`long tasks during the run: ${long.length}, longest ${Math.round(Math.max(0, ...long))} ms`)
    expect(Math.max(0, ...long)).toBeLessThan(250)
  })

  test('Insights paints a cached month from the phone and re-reads only today', async ({ page }) => {
    const api = await mockBackend(page, fleet())
    await page.goto('/#/devices')
    await expect.poll(() => historyDays(api).length, { timeout: 45_000 }).toBe(DAYS_CACHED)

    const before = api.callsTo(HISTORY).length
    await page.goto('/#/insights')
    await page.getByRole('button', { name: 'Month' }).click()
    await expect(page.getByText('September 2026')).toBeVisible()
    // No skeleton wait: the month's totals are on screen from the cache.
    await expect(page.getByText('No power history for this period yet.')).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Input and output energy' })).toBeVisible()
    await page.waitForTimeout(1500)
    const after = api.callsTo(HISTORY).slice(before).map(c => String(c.body.fromTime).slice(0, 10))
    expect([...new Set(after)]).toEqual(['2026-09-24'])
  })

  test('the next app open reads only what is not final yet', async ({ page }) => {
    const api = await mockBackend(page, fleet())
    await page.goto('/#/devices')
    await expect.poll(() => historyDays(api).length, { timeout: 45_000 }).toBe(DAYS_CACHED)

    // Reopened a few minutes later.
    const before = api.callsTo(HISTORY).length
    await page.clock.setSystemTime(new Date(NOW.getTime() + 5 * 60_000))
    await page.reload()
    await expect(page.getByText('Garage', { exact: true }).first()).toBeVisible()
    await expect.poll(() => api.callsTo(HISTORY).length - before, { timeout: 20_000 }).toBeGreaterThan(0)
    await page.waitForTimeout(3000)
    const again = api.callsTo(HISTORY).slice(before).map(c => String(c.body.fromTime).slice(0, 10))
    // Only today: every earlier day was read after it had settled.
    expect([...new Set(again)]).toEqual(['2026-09-24'])
  })

  test('a day the Real-Time Power chart just read is not read again', async ({ page }) => {
    const api = await mockBackend(page, fleet())
    await page.goto('/#/device/1001')
    await expect.poll(() => api.callsTo(HISTORY, '1001').length).toBeGreaterThan(0)
    await expect.poll(() => historyDays(api).length, { timeout: 45_000 }).toBe(DAYS_CACHED)
    const today = api.callsTo(HISTORY, '1001').filter(c => String(c.body.fromTime).startsWith('2026-09-24T00:00:00'))
    expect(today.filter(c => c.body.page === 1)).toHaveLength(1)
  })
})
