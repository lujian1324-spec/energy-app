/**
 * Real-Time Power (DeviceMonitorPage) — today's history, v4.17.0.
 *
 * The browser runs in Los Angeles, west of UTC, where the old request lost the
 * minus sign of its offset and the backend answered 20101 with an empty chart.
 * Two devices report different values so a chart showing the other device's,
 * or a cached, curve is caught by its height alone.
 */
import { test, expect, type Page } from '@playwright/test'
import { E2E_TZ, localHM, mockBackend, signIn, type MockBackend, type MockDevice } from './support/mockBackend'

test.use({ timezoneId: E2E_TZ })

/** 2026-09-24 15:00 in Los Angeles. */
const NOW = new Date('2026-09-24T15:00:00-07:00')
/** The console's call the chart makes (siseli-history-api-handoff). */
const KEYS_V1 = '/deviceState/simple/attribute/keys/history/v1'
/** The Siseli app's call it falls back to (count 80); Insights reads it too, with 300. */
const RECORD_LIST = '/deviceState/attribute/record/list'
const chartCalls = (api: MockBackend, id: string) => api.callsTo(KEYS_V1, id)
const fallbackCalls = (api: MockBackend, id: string) => api.callsTo(RECORD_LIST, id).filter(c => c.body.count === 80)

// Garage: Battery 60 %, AC 100 W, Solar 50 W, Output 120 W, silent 02:00–05:00.
// Cabin: Battery 30 %, no AC reading at all, Solar 200 W, Output 400 W.
const garageFields = { remainingBatteryCapacity: 60, exchangeChargingPower: 100, generationPower: 50, outputPower: 120 }
const cabinFields = { remainingBatteryCapacity: 30, generationPower: 200, outputPower: 400 }
const beforeCutoff = (cutoff: () => number, fields: Record<string, number>, skip?: [number, number]) =>
  (t: number) => {
    if (t >= cutoff()) return null
    const { h, m } = localHM(t)
    if (skip && h >= skip[0] && h < skip[1]) return null
    return m % 5 === 0 ? fields : null
  }

/*
 * Chart geometry: the plot is a 300×70 viewBox with zero at y=60 and full
 * scale at y=5. Battery is 0–100 %, power tabs 0–1000 W on a Sierro 2000:
 *   60 % → 27.0   30 % → 43.5   100 W → 54.5   400 W → 38.0
 */
async function readChart(page: Page) {
  const card = page.locator('div')
    .filter({ has: page.getByText('Real-Time Power', { exact: true }) })
    .filter({ has: page.locator('svg[viewBox="0 0 300 70"]') })
    .last()
  const lines = await card.locator('svg[viewBox="0 0 300 70"] polyline').evaluateAll(els =>
    els.map(el => (el.getAttribute('points') ?? '').trim().split(/\s+/).map(p => Number(p.split(',')[1]))))
  return {
    segments: lines.length,
    points: lines.reduce((n, l) => n + l.length, 0),
    heights: [...new Set(lines.flat().map(y => y.toFixed(1)))],
    emptyNote: await card.getByText('No readings recorded yet today').count() > 0,
    failedNote: await card.getByText("Couldn't load today's history").count() > 0,
  }
}

async function openTab(page: Page, name: 'Battery' | 'AC' | 'Solar' | 'Output') {
  await page.getByRole('button', { name, exact: true }).click()
}

async function idbCounts(page: Page) {
  return page.evaluate(() => new Promise<{ legacy: number; byDevice: Record<string, number> }>((resolve) => {
    const open = indexedDB.open('powerflow-db')
    open.onsuccess = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('device_history')) { db.close(); resolve({ legacy: -1, byDevice: {} }); return }
      const tx = db.transaction(['power_history', 'device_history'])
      const out = { legacy: 0, byDevice: {} as Record<string, number> }
      tx.objectStore('power_history').count().onsuccess = e => { out.legacy = (e.target as IDBRequest<number>).result }
      const rows = tx.objectStore('device_history').getAll()
      rows.onsuccess = () => { for (const r of rows.result) out.byDevice[r.deviceId] = (out.byDevice[r.deviceId] ?? 0) + 1 }
      tx.oncomplete = () => { db.close(); resolve(out) }
    }
  }))
}

test.describe('Real-Time Power history', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  let cutoff = NOW.getTime()
  let devices: MockDevice[]

  test.beforeEach(async ({ page }) => {
    cutoff = NOW.getTime()
    devices = [
      { id: '1001', name: 'Garage', createdAt: '2026-01-01T00:00:00Z', history: beforeCutoff(() => cutoff, garageFields, [2, 5]) },
      { id: '2002', name: 'Cabin', createdAt: '2026-02-01T00:00:00Z', history: beforeCutoff(() => cutoff, cabinFields) },
    ]
    await page.clock.install({ time: NOW })
    await signIn(page)
  })

  test('asks for today\'s four keys the way the Solar of Things console does', async ({ page }) => {
    const api = await mockBackend(page, devices)
    await page.goto('/#/device/1001')
    await expect.poll(async () => (await readChart(page)).segments).toBeGreaterThan(0)

    const calls = chartCalls(api, '1001')
    expect(calls[0].body).toEqual({
      deviceId: '1001',
      keys: ['remainingBatteryCapacity', 'exchangeChargingPower', 'generationPower', 'outputPower'],
      fromTime: '2026-09-24T00:00:00-07:00',
      toTime: '2026-09-24T23:59:59-07:00',
      page: 1,
      count: 1500,
      orderByTimeAsc: true,
    })
    expect(calls[0].headers['iot-time-zone']).toBe(E2E_TZ)
    // 00:00–02:00 and 05:00–15:00 every 5 min = 144 frames: one page.
    expect(calls.map(c => c.body.page)).toEqual([1])
    expect(fallbackCalls(api, '1001')).toHaveLength(0)
    expect((await readChart(page)).failedNote).toBe(false)
  })

  test('falls back to record/list where the platform refuses the console\'s call', async ({ page }) => {
    devices[0].refuseKeysV1 = true
    const api = await mockBackend(page, devices)
    await page.goto('/#/device/1001')
    await expect.poll(async () => (await readChart(page)).heights).toEqual(['27.0'])
    expect((await readChart(page)).segments).toBe(2)
    // 144 samples through record/list: two pages of 80.
    expect(fallbackCalls(api, '1001').map(c => c.body.page)).toEqual([1, 2])
  })

  test('each device draws only its own readings, with gaps where nothing was reported', async ({ page }) => {
    await mockBackend(page, devices)
    await page.goto('/#/device/1001')
    await expect.poll(async () => (await readChart(page)).heights).toEqual(['27.0'])
    // The three silent hours break the line instead of bridging it.
    expect((await readChart(page)).segments).toBe(2)
    await openTab(page, 'AC')
    await expect.poll(async () => (await readChart(page)).heights).toEqual(['54.5'])

    // Switch device from the header dropdown.
    await page.getByRole('button', { name: /Garage/ }).first().click()
    await page.getByRole('button', { name: /Cabin/ }).first().click()
    await expect(page).toHaveURL(/#\/device\/2002/)

    await openTab(page, 'Battery')
    await expect.poll(async () => (await readChart(page)).heights).toEqual(['43.5'])
    // Cabin never reports AC: an empty tab, not a line along 0 W.
    await openTab(page, 'AC')
    await expect.poll(async () => (await readChart(page)).emptyNote).toBe(true)
    expect((await readChart(page)).segments).toBe(0)
    await openTab(page, 'Output')
    await expect.poll(async () => (await readChart(page)).heights).toEqual(['38.0'])
  })

  test('the cache is per device and never stands in for the server', async ({ page }) => {
    // An install from before v4.17: guest-simulator rows with no deviceId.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('legacy-seeded')) return
      sessionStorage.setItem('legacy-seeded', '1')
      const open = indexedDB.open('powerflow-db', 4)
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore('power_history', { keyPath: 'id', autoIncrement: true })
        store.createIndex('timestamp', 'timestamp')
        for (let i = 0; i < 50; i++) {
          store.add({ timestamp: Date.now() - i * 60_000, batteryLevel: 99, inputPower: 480, outputPower: 300, temperature: 25, mode: 'normal' })
        }
      }
      open.onsuccess = () => open.result.close()
    })
    const api = await mockBackend(page, devices)
    await page.goto('/#/device/1001')
    await expect.poll(async () => (await readChart(page)).heights).toEqual(['27.0'])
    await expect.poll(() => idbCounts(page)).toEqual({ legacy: 0, byDevice: { '1001': 144 } })

    // The server's day changes; the next visit must show it, not the cache.
    devices[0].history = beforeCutoff(() => cutoff, { ...garageFields, remainingBatteryCapacity: 90 }, [2, 5])
    await page.goto('/#/devices')
    // Wait out the monitor's exit transition, then open the device from its card.
    await expect(page.getByText('Real-Time Power', { exact: true })).toHaveCount(0)
    await page.getByText('Garage', { exact: true }).click()
    await expect(page).toHaveURL(/#\/device\/1001/)
    await expect.poll(async () => (await readChart(page)).heights).toEqual(['10.5'])
    expect(chartCalls(api, '1001').filter(c => c.body.page === 1 && c.body.fromTime.endsWith('T00:00:00-07:00')).length).toBe(2)
  })

  test('the curve keeps growing while the screen is open', async ({ page }) => {
    const api = await mockBackend(page, devices)
    await page.goto('/#/device/1001')
    await expect.poll(async () => (await readChart(page)).points).toBeGreaterThan(0)
    const before = (await readChart(page)).points
    const fullReads = chartCalls(api, '1001').length

    // A new sample lands at 15:00; a minute later the tail is re-read.
    cutoff = NOW.getTime() + 60_000
    await page.clock.fastForward('01:05')
    await expect.poll(async () => (await readChart(page)).points).toBe(before + 1)
    const tail = chartCalls(api, '1001').slice(fullReads)
    expect(tail.length).toBeGreaterThan(0)
    // Only the recent end, not the whole day again.
    expect(tail[0].body.fromTime).toBe('2026-09-24T14:45:00-07:00')
  })

  test('rolls over to the new day at midnight', async ({ page }) => {
    await page.clock.setSystemTime(new Date('2026-09-24T23:59:30-07:00'))
    const api = await mockBackend(page, devices)
    cutoff = Date.parse('2026-09-26T00:00:00-07:00')
    await page.goto('/#/device/1001')
    await expect.poll(() => chartCalls(api, '1001').length).toBeGreaterThan(0)
    await page.clock.fastForward('02:00')
    await expect.poll(() => chartCalls(api, '1001').some(c => c.body.fromTime === '2026-09-25T00:00:00-07:00')).toBe(true)
  })

  test('signing out clears every device\'s cached history', async ({ page }) => {
    await mockBackend(page, devices)
    await page.goto('/#/device/1001')
    await expect.poll(async () => (await idbCounts(page)).byDevice['1001'] ?? 0).toBeGreaterThan(0)
    await page.goto('/#/device/2002')
    await expect.poll(async () => (await idbCounts(page)).byDevice['2002'] ?? 0).toBeGreaterThan(0)

    await page.goto('/#/setting')
    await page.getByText('Manage my account').click()
    await page.locator('button:has(img[src$="icon_more-hor.svg"])').click()
    await page.getByText('Sign out', { exact: true }).click()
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click()
    await expect(page).toHaveURL(/#\/login/)
    await expect.poll(() => idbCounts(page)).toEqual({ legacy: 0, byDevice: {} })
  })
})
