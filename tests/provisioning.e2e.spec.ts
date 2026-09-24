/**
 * Add Device → the Bluetooth search screen (v4.14.1 SW-10, v4.16.2 APP-002).
 *
 * The browser plays an Android phone: `CapacitorCustomPlatform` makes the app
 * take its native path, and the Bluetooth plugin's web layer runs on a stubbed
 * `navigator.bluetooth` that counts scans and advertises two Sierro devices.
 * A resume from the App plugin is a `visibilitychange`, which is also what a
 * system dialog closing looks like to the app (isActive:true with no stop).
 */
import { test, expect, type Page } from '@playwright/test'
import { mockBackend, signIn, type MockDevice } from './support/mockBackend'

const SEARCHING = 'Searching for nearby devices...'
const NO_DEVICES = 'No Devices Found'

/** "SSL_" + Wi-Fi status + base64 of the 10-byte DTU id, as the device advertises. */
function bleName(dtuHex: string): string {
  return `SSL_0${Buffer.from(dtuHex, 'hex').toString('base64')}`
}
const ADVERTS = [
  { id: 'ble-a', name: bleName('00112233445566778899') },
  { id: 'ble-b', name: bleName('99887766554433221100') },
]

async function stubAndroidBluetooth(page: Page) {
  await page.addInitScript((adverts) => {
    const w = window as any
    w.CapacitorCustomPlatform = { name: 'android', plugins: {} }
    w.__scans = 0
    w.__failNextScan = false
    // Every headline the search screen shows, in order, from the first frame.
    w.__headlines = [] as string[]
    new MutationObserver(() => {
      // The search screen is a full-screen overlay; other tabs stay mounted underneath.
      const h = document.querySelector('.fixed.inset-0.z-50 h2')?.textContent ?? ''
      if (h && w.__headlines[w.__headlines.length - 1] !== h) w.__headlines.push(h)
    }).observe(document, { subtree: true, childList: true, characterData: true })

    const events = new EventTarget()
    const bluetooth = {
      getAvailability: async () => true,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      requestDevice: async () => { throw new Error('not used') },
      requestLEScan: async () => {
        w.__scans++
        if (w.__failNextScan) { w.__failNextScan = false; throw new Error('Scan failed on purpose') }
        const scan = { active: true, stop() { scan.active = false } }
        setTimeout(() => {
          for (const a of adverts) {
            if (!scan.active) return
            const ev = new Event('advertisementreceived') as any
            ev.device = { id: a.id, name: a.name }
            ev.rssi = -50
            ev.manufacturerData = new Map()
            ev.serviceData = new Map()
            ev.uuids = []
            events.dispatchEvent(ev)
          }
        }, 300)
        return scan
      },
    }
    Object.defineProperty(navigator, 'bluetooth', { value: bluetooth, configurable: true })
  }, ADVERTS)
}

const scans = (page: Page) => page.evaluate(() => (window as any).__scans as number)
const headlines = (page: Page) => page.evaluate(() => (window as any).__headlines as string[])

/** Fire the App plugin's appStateChange the way Android would. */
async function appState(page: Page, active: boolean) {
  await page.evaluate((isActive) => {
    Object.defineProperty(document, 'hidden', { value: !isActive, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }, active)
}

test.describe('Add Device search', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  const devices: MockDevice[] = [{ id: '1001', name: 'Garage' }]
  test.beforeEach(async ({ page }) => {
    await stubAndroidBluetooth(page)
    await signIn(page)
    await mockBackend(page, devices)
    await page.goto('/#/devices')
    await expect(page.getByText('Garage', { exact: true })).toBeVisible()
  })

  test('opens straight on the search and lists the devices it hears, with no QR entry', async ({ page }) => {
    await page.evaluate(() => { (window as any).__headlines = [] })
    await page.getByRole('button', { name: 'Add device' }).click()
    await expect(page.getByText('Found Devices (2)')).toBeVisible()
    expect((await headlines(page))[0]).toBe(SEARCHING)
    expect(await headlines(page)).not.toContain(NO_DEVICES)
    // SW-10: QR provisioning is hidden everywhere on this screen.
    await expect(page.getByText(/Scan QR/i)).toHaveCount(0)
    expect(await scans(page)).toBe(1)
  })

  test('a failed search does not paint over the next visit', async ({ page }) => {
    await page.evaluate(() => { (window as any).__failNextScan = true })
    await page.getByRole('button', { name: 'Add device' }).click()
    await expect(page.getByRole('heading', { name: NO_DEVICES })).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: NO_DEVICES })).toHaveCount(0)

    await page.evaluate(() => { (window as any).__headlines = [] })
    await page.getByRole('button', { name: 'Add device' }).click()
    await expect(page.getByText('Found Devices (2)')).toBeVisible()
    // Reopened after Back, it starts on the search, never on the last failure.
    // (Back clears the flow itself; the per-visit reset in ProvisioningPage
    // covers leaving without Back, which this spec cannot reach.)
    expect((await headlines(page))[0]).toBe(SEARCHING)
    expect(await headlines(page)).not.toContain(NO_DEVICES)
  })

  test('a system prompt closing does not restart the search or empty the list', async ({ page }) => {
    await page.getByRole('button', { name: 'Add device' }).click()
    await expect(page.getByText('Found Devices (2)')).toBeVisible()
    expect(await scans(page)).toBe(1)

    // A dialog closing: resume with no stop before it — twice.
    await appState(page, true)
    await appState(page, true)
    await page.waitForTimeout(1000)
    expect(await scans(page)).toBe(1)
    await expect(page.getByText('Found Devices (2)')).toBeVisible()

    // Back from the background while the search is still running: keep it.
    await appState(page, false)
    await appState(page, true)
    await page.waitForTimeout(1000)
    expect(await scans(page)).toBe(1)
    await expect(page.getByText('Found Devices (2)')).toBeVisible()
    await expect(page.getByRole('heading', { name: SEARCHING })).toBeVisible()
  })
})
