/**
 * App update (v4.23.0): the first launch of a new version drops this phone's copies
 * of server data — history, the Insights day list, live samples, the device list —
 * and keeps the session and everything the user set.
 */
import { test, expect, type Page } from '@playwright/test'
import { E2E_TZ, mockBackend, signIn } from './support/mockBackend'

test.use({ timezoneId: E2E_TZ })

/** A day key the app never writes itself (not a local midnight) and never prunes (recent). */
const SEED_DAY = Date.now() - 86_400_000 + 1234

function idb<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(fn) as Promise<T>
}

/** The seeded rows (by key, so rows the app writes meanwhile do not count) and rated params. */
const counts = (page: Page) => idb<{ history: number; days: number; rated: any }>(page, `new Promise(resolve => {
  const open = indexedDB.open('powerflow-db')
  open.onsuccess = () => {
    const db = open.result
    const tx = db.transaction(['device_history', 'history_days', 'rated_params'])
    const out = { history: -1, days: -1, rated: null }
    tx.objectStore('device_history').count(['1001', 1]).onsuccess = e => { out.history = e.target.result }
    tx.objectStore('history_days').count(['1001', ${SEED_DAY}]).onsuccess = e => { out.days = e.target.result }
    tx.objectStore('rated_params').get('1001').onsuccess = e => { out.rated = e.target.result ?? null }
    tx.oncomplete = () => { db.close(); resolve(out) }
  }
})`)

/** The first launch here counts as an update too: wait until its IndexedDB clear is done. */
async function settled(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sierro-cache-reset-pending'))).toBeNull()
}

test.describe('App update', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  test('the first launch of a new version clears cached data and keeps the user\'s', async ({ page }) => {
    await signIn(page)
    await mockBackend(page, [{ id: '1001', name: 'Garage', model: 'Sierro 1000' }])
    await page.goto('/#/devices')
    await expect(page.getByText('Garage', { exact: true }).first()).toBeVisible()
    const current = await page.evaluate(() => localStorage.getItem('sierro-app-version'))
    expect(current).toMatch(/^\d+\.\d+\.\d+\+\d+$/)
    await settled(page)

    // Leave what an older version would have: cached history, a cached day, a live
    // sample, a device list — and the user's own model pick, program and icon.
    await idb(page, `new Promise(resolve => {
      const open = indexedDB.open('powerflow-db')
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction(['device_history', 'history_days', 'rated_params'], 'readwrite')
        tx.objectStore('device_history').put({ deviceId: '1001', timestamp: 1, time: '', solar: 999, output: 999, ac: 999, soc: 1, battery: 0 })
        tx.objectStore('history_days').put({ deviceId: '1001', dayStart: ${SEED_DAY}, fetchedAt: 2, final: true })
        tx.objectStore('rated_params').put({ deviceId: '1001', acInvOutputPower: 1000, fetchedAt: Date.now(), model: 'Sierro 2000', modelSource: 'user', bleId: 'BLE-42' }, '1001')
        tx.oncomplete = () => { db.close(); resolve(null) }
      }
    })`)
    await page.evaluate(() => {
      localStorage.setItem('powerflow-live-passthrough', JSON.stringify({ state: { byDevice: { '1001': { live: { soc: 5 }, phase: 'ready', updatedAt: Date.now() } } }, version: 0 }))
      localStorage.setItem('sierro-program-1001', JSON.stringify({ keep: true }))
      localStorage.setItem('sierro-display-icon-1001', 'fridge')
      localStorage.setItem('sierro-app-version', '4.0.0+1')
    })
    expect((await counts(page)).history).toBe(1)

    await page.reload()
    await expect(page.getByText('Garage', { exact: true }).first()).toBeVisible()
    const after = await counts(page)
    expect(after.history).toBe(0)
    expect(after.days).toBe(0)
    // The user's model pick and the Bluetooth ID survive; only the cache age is reset.
    expect(after.rated).toMatchObject({ model: 'Sierro 2000', modelSource: 'user', bleId: 'BLE-42' })
    const kept = await page.evaluate(() => ({
      version: localStorage.getItem('sierro-app-version'),
      token: localStorage.getItem('iot_access_token'),
      program: localStorage.getItem('sierro-program-1001'),
      icon: localStorage.getItem('sierro-display-icon-1001'),
      live: JSON.parse(localStorage.getItem('powerflow-live-passthrough') ?? '{}')?.state?.byDevice?.['1001']?.live?.soc ?? null,
      pending: localStorage.getItem('sierro-cache-reset-pending'),
    }))
    expect(kept).toMatchObject({ version: current, token: 'E2E-ACCESS', program: '{"keep":true}', icon: 'fridge', pending: null })
    // The stale 5 % sample is gone (a fresh read may have replaced it).
    expect(kept.live).not.toBe(5)
    // Still signed in: the device list shows, not the sign-in screen.
    await expect(page).toHaveURL(/#\/devices/)
  })

  test('a relaunch of the same version clears nothing', async ({ page }) => {
    await signIn(page)
    await mockBackend(page, [{ id: '1001', name: 'Garage', model: 'Sierro 1000' }])
    await page.goto('/#/devices')
    await expect(page.getByText('Garage', { exact: true }).first()).toBeVisible()
    await settled(page)
    await idb(page, `new Promise(resolve => {
      const open = indexedDB.open('powerflow-db')
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction(['history_days'], 'readwrite')
        tx.objectStore('history_days').put({ deviceId: '1001', dayStart: ${SEED_DAY}, fetchedAt: 2, final: true })
        tx.oncomplete = () => { db.close(); resolve(null) }
      }
    })`)
    await page.reload()
    await expect(page.getByText('Garage', { exact: true }).first()).toBeVisible()
    expect((await counts(page)).days).toBe(1)
  })
})
