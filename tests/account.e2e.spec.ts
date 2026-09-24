/**
 * Sign-in and per-account state (v4.17.1):
 *  - the verification-code caret sits in the cell the next digit goes into;
 *  - settings follow the account: B signing in after A sees none of A's
 *    Founding Member tag, push toggles or threshold, and A gets them back;
 *  - Device Info's Serial Number is the Bluetooth ID the device was added with.
 *
 * Everything runs on the mocked backend; no code is ever e-mailed. The member
 * address is the team account the roster script lists in plain text (#666).
 */
import { test, expect, type Page } from '@playwright/test'
import { mockBackend, signIn, type MockDevice } from './support/mockBackend'

const MEMBER = 'jason@sierro.us'   // roster #666 (scripts/build_founding_roster.py EXTRA)
const OTHER = 'someone@example.com'
const ACCOUNTS = { [MEMBER]: '491513787113766001', [OTHER]: '491513787113766002' }

async function openCodeStep(page: Page, email: string) {
  await page.goto('/#/login')
  await page.getByRole('button', { name: 'Continue with Email' }).click()
  await page.locator('input[type="email"]').fill(email)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByLabel('Verification code')).toBeVisible()
}

async function signInWithEmail(page: Page, email: string) {
  await openCodeStep(page, email)
  await page.getByLabel('Verification code').click()
  await page.keyboard.type('123456')
  await expect(page).toHaveURL(/#\/(devices)?$/)
}

async function signOut(page: Page) {
  await page.goto('/#/setting')
  await page.getByText('Manage my account').click()
  await page.locator('button:has(img[src$="icon_more-hor.svg"])').click()
  await page.getByText('Sign out', { exact: true }).click()
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click()
  await expect(page).toHaveURL(/#\/login/)
}

/** The value printed beside "Alert Threshold". */
const thresholdValue = (page: Page) =>
  page.getByText('Alert Threshold', { exact: true }).locator('xpath=following-sibling::span[1]')

/** Which of the six cells holds the drawn caret (-1: none). */
const caretCell = (page: Page) => page.evaluate(() => {
  const caret = document.querySelector('.animate-caret-blink')
  if (!caret) return -1
  const cell = caret.parentElement!
  return [...cell.parentElement!.children].indexOf(cell)
})

test.describe('Sign-in and per-account state', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  test('the code caret moves to the cell the next digit goes into', async ({ page }) => {
    await mockBackend(page, [], ACCOUNTS)
    await openCodeStep(page, OTHER)
    const input = page.getByLabel('Verification code')
    await input.click()
    await expect.poll(() => caretCell(page)).toBe(0)
    for (const [i, d] of [...'1234'].entries()) {
      await page.keyboard.type(d)
      await expect.poll(() => caretCell(page)).toBe(i + 1)
    }
    await page.keyboard.press('Backspace')
    await expect.poll(() => caretCell(page)).toBe(3)
    // A tap on an earlier cell still types at the end, where the caret is drawn.
    await input.click({ position: { x: 5, y: 20 } })
    await page.keyboard.type('9')
    await expect(input).toHaveValue('1239')
    await expect.poll(() => caretCell(page)).toBe(4)
    // The field's own caret can never paint: the input itself is invisible.
    expect(await input.evaluate(el => getComputedStyle(el).opacity)).toBe('0')
  })

  test('settings follow the account, and the Founding Member tag follows the roster', async ({ page }) => {
    await mockBackend(page, [], ACCOUNTS)
    const outage = page.getByRole('switch', { name: 'Power outage alerts' })
    const lowBattery = page.getByRole('switch', { name: 'Low battery alerts' })

    // A — a founding member — signs in and sets their alerts up.
    await signInWithEmail(page, MEMBER)
    await page.goto('/#/setting')
    await expect(page.getByText('Founding Member #666')).toBeVisible()
    await outage.click()
    await lowBattery.click()
    await page.locator('input[type="range"]').fill('10')
    await expect(outage).toHaveAttribute('aria-checked', 'true')
    await expect(thresholdValue(page)).toHaveText('10%')

    // B signs in on the same phone: nothing of A's.
    await signOut(page)
    await signInWithEmail(page, OTHER)
    await page.goto('/#/setting')
    await expect(page.getByRole('switch', { name: 'Power outage alerts' })).toHaveAttribute('aria-checked', 'false')
    await expect(lowBattery).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByText('Alert Threshold')).toHaveCount(0)
    await expect(page.getByText(/Founding Member #/)).toHaveCount(0)

    // A comes back and finds their own settings.
    await signOut(page)
    await signInWithEmail(page, MEMBER)
    await page.goto('/#/setting')
    await expect(page.getByText('Founding Member #666')).toBeVisible()
    await expect(outage).toHaveAttribute('aria-checked', 'true')
    await expect(lowBattery).toHaveAttribute('aria-checked', 'true')
    await expect(thresholdValue(page)).toHaveText('10%')
  })

  test('Device Info: Serial Number is the device\'s own serial, the Bluetooth ID is its own row (R15)', async ({ page }) => {
    const devices: MockDevice[] = [
      { id: '1001', name: 'Garage', dtuDtuid: '43767893781169874514', serialNumber: 'SN26312510CN003146260849', isVirtualSerialNumber: false },
      { id: '2002', name: 'Cabin', dtuDtuid: '00112233445566778899', serialNumber: 'SR1000-778899', isVirtualSerialNumber: true },
    ]
    await signIn(page)
    await mockBackend(page, devices)
    const rowOf = (label: string) => page.locator('div').filter({ has: page.getByText(label, { exact: true }) }).last()

    await page.goto('/#/device/1001/settings')
    await page.getByText('Device Info', { exact: true }).click()
    await expect(rowOf('Serial Number')).toContainText('SN26312510CN003146260849')
    await expect(rowOf('Bluetooth ID')).toContainText('43767893781169874514')
    await expect(rowOf('Serial Number')).not.toContainText('43767893781169874514')

    // A serial the app generated at bind time is never shown as the unit's.
    await page.goto('/#/device/2002/settings')
    await page.getByText('Device Info', { exact: true }).click()
    await expect(rowOf('Serial Number')).toContainText('--')
    await expect(rowOf('Serial Number')).not.toContainText('SR1000-778899')
    await expect(rowOf('Bluetooth ID')).toContainText('00112233445566778899')
    await expect(page.getByText('SNXXXX')).toHaveCount(0)
  })
})
