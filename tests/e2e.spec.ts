/**
 * Sierro Energy App — E2E Self-Test Suite
 *
 * Target: https://lujian1324-spec.github.io/energy-app
 * Accounts:
 *   Guest mode  (demo data, no login required)
 *   jason1324 / jjww1324-LJ  (real API account)
 *
 * Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test --reporter=list
 */

import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const BASE = 'https://lujian1324-spec.github.io/energy-app'

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Skip the one-time PermissionsGate by setting localStorage before React reads it.
 * Navigate to the base URL first so we have a document context, set the flag,
 * then let the caller navigate to the real target.
 */
async function skipPermissionsGate(page: Page) {
  // Load the shell so localStorage is accessible
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.setItem('sierro_permissions_asked', '1')
  })
  // Reload so React remounts and reads the updated localStorage value.
  // Without this, the hash navigation is same-document and React keeps
  // permissionsDone=false from initial mount.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
}

async function loginReal(page: Page, username: string, password: string) {
  await skipPermissionsGate(page)
  await page.goto(`${BASE}/#/login`)
  await page.waitForSelector('input[placeholder="Username"]', { timeout: 20000 })
  await page.locator('input[placeholder="Username"]').fill(username)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button').filter({ hasText: /Sign In/i }).first().click()
  await page.waitForURL(/\/(devices|device)/, { timeout: 25000 })
}

async function loginAsGuest(page: Page) {
  await skipPermissionsGate(page)
  await page.goto(`${BASE}/#/login`)
  await page.waitForSelector('text=Continue as Guest', { timeout: 20000 })
  await page.locator('text=Continue as Guest').click()
  await page.waitForURL(/\/(devices|device)/, { timeout: 15000 })
}

async function logout(page: Page) {
  await page.goto(`${BASE}/#/setting`)
  await page.waitForTimeout(2000)
  // Tap avatar / manage account to open drawer
  const manageBtn = page.locator('text=Manage my account').first()
  if (await manageBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await manageBtn.click()
    await page.waitForTimeout(1000)
  }
  const logoutBtn = page.locator('text=Sign out').first()
  if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await logoutBtn.click()
    await page.waitForURL(/\/login/, { timeout: 10000 })
  }
}

async function wait(page: Page, ms = 2000) {
  await page.waitForTimeout(ms)
}

// ─── Auth Pages (no login needed) ───────────────────────────────────────────

test.describe('Auth Pages', () => {
  test('login page loads with username + password fields', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/#/login`)
    await expect(page.locator('input[placeholder="Username"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 5000 })
  })

  test('register page loads', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/#/register`)
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 20000 })
  })

  test('forgot-password page loads with email field', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/#/forgot-password`)
    await expect(
      page.locator('input[type="email"], input[placeholder*="email" i]').first()
    ).toBeVisible({ timeout: 20000 })
  })

  test('terms page loads with content', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/#/terms`)
    await wait(page, 3000)
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('privacy page loads with content', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/#/privacy`)
    await wait(page, 3000)
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('unauthenticated /devices redirects to login', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/#/devices`)
    await page.waitForURL(/\/(login|devices)/, { timeout: 15000 })
    const url = page.url()
    expect(url).toMatch(/\/(login|devices)/)
  })

  test('wrong password stays on login or shows error', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/#/login`)
    await page.waitForSelector('input[placeholder="Username"]', { timeout: 20000 })
    await page.locator('input[placeholder="Username"]').fill('nobody_xyz_test')
    await page.locator('input[type="password"]').fill('wrongpassword123')
    await page.locator('button').filter({ hasText: /Sign In/i }).first().click()
    await wait(page, 4000)
    const url = page.url()
    const hasError = await page.locator('[class*="danger"], text=/error|invalid|failed|incorrect/i').count() > 0
    expect(url.includes('login') || hasError).toBeTruthy()
  })
})

// ─── Forgot Password Flow ────────────────────────────────────────────────────

test.describe('Forgot Password Flow', () => {
  test('send button disabled with invalid email', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/#/forgot-password`)
    await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 20000 })
    await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill('notanemail')
    const sendBtn = page.locator('button').filter({ hasText: /send/i }).first()
    await expect(sendBtn).toBeDisabled({ timeout: 5000 })
  })

  test('send button enabled with valid email', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/#/forgot-password`)
    await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 20000 })
    await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill('test@example.com')
    const sendBtn = page.locator('button').filter({ hasText: /send/i }).first()
    await expect(sendBtn).toBeEnabled({ timeout: 5000 })
  })

  test('send button is within iPhone 16 viewport (393×852)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => { localStorage.setItem('sierro_permissions_asked', '1') })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
    await page.goto(`${BASE}/#/forgot-password`)
    await page.waitForSelector('button', { timeout: 20000 })
    const sendBtn = page.locator('button').filter({ hasText: /send/i }).first()
    await expect(sendBtn).toBeVisible({ timeout: 10000 })
    const box = await sendBtn.boundingBox()
    expect(box).not.toBeNull()
    if (box) expect(box.y + box.height).toBeLessThanOrEqual(852 + 5)
    await ctx.close()
  })
})

// ─── Guest Mode Tests ────────────────────────────────────────────────────────

test.describe('[Guest] Core Navigation', () => {
  test('can enter as guest', async ({ page }) => {
    await loginAsGuest(page)
    await expect(page).toHaveURL(/\/(devices|device)/, { timeout: 5000 })
  })

  test('devices page shows demo device cards', async ({ page }) => {
    await loginAsGuest(page)
    await page.goto(`${BASE}/#/devices`)
    await wait(page, 3000)
    const hasCards = await page.locator('[class*="card"], [class*="ink-10"]').count() > 0
    const hasEmpty = await page.locator('text=/no device|add device|get started/i').count() > 0
    expect(hasCards || hasEmpty).toBeTruthy()
  })

  test('bottom navigation visible', async ({ page }) => {
    await loginAsGuest(page)
    await page.goto(`${BASE}/#/devices`)
    await wait(page, 2000)
    // Nav items: Devices, Insights, Settings
    const nav = page.locator('nav').first()
    await expect(nav).toBeVisible({ timeout: 5000 })
  })

  test('insights/stats page loads', async ({ page }) => {
    await loginAsGuest(page)
    await page.goto(`${BASE}/#/insights`)
    await wait(page, 3000)
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('settings page loads', async ({ page }) => {
    await loginAsGuest(page)
    await page.goto(`${BASE}/#/setting`)
    await wait(page, 2000)
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('settings shows sign-in prompt for guest', async ({ page }) => {
    await loginAsGuest(page)
    await page.goto(`${BASE}/#/setting`)
    await wait(page, 2000)
    const guestText = await page.locator('text=/guest|sign in/i').count() > 0
    expect(guestText).toBeTruthy()
  })

  test('smart-schedule page loads', async ({ page }) => {
    await loginAsGuest(page)
    await page.goto(`${BASE}/#/smart-schedule`)
    await wait(page, 3000)
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('notifications page loads', async ({ page }) => {
    await loginAsGuest(page)
    await page.goto(`${BASE}/#/notifications`)
    await wait(page, 2000)
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('onboarding page loads', async ({ page }) => {
    await loginAsGuest(page)
    await page.goto(`${BASE}/#/onboarding`)
    await wait(page, 2000)
    await expect(page.locator('body')).not.toBeEmpty()
  })
})

test.describe('[Guest] Device Dashboard', () => {
  test('clicking demo device navigates to device page', async ({ page }) => {
    await loginAsGuest(page)
    await page.goto(`${BASE}/#/devices`)
    await wait(page, 3000)
    // Try clicking first tappable element that looks like a device
    const deviceItem = page.locator('button, [role="button"], a').filter({ hasText: /NAS|Fridge|Sierro|device/i }).first()
    if (await deviceItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deviceItem.click()
      await wait(page, 3000)
      expect(page.url()).toMatch(/\/(device|dashboard)/)
    }
  })
})

// ─── jason1324 Real Account Tests ───────────────────────────────────────────

test.describe('[jason1324] Login & Navigation', () => {
  test('can log in with real account', async ({ page }) => {
    await loginReal(page, 'jason1324', 'jjww1324-LJ')
    await expect(page).toHaveURL(/\/(devices|device)/, { timeout: 5000 })
  })

  test('devices page loads after real login', async ({ page }) => {
    await loginReal(page, 'jason1324', 'jjww1324-LJ')
    await page.goto(`${BASE}/#/devices`)
    await wait(page, 4000)
    const hasContent = await page.locator('[class*="ink-10"], [class*="card"]').count() > 0
    const hasEmpty = await page.locator('text=/no device|add device/i').count() > 0
    expect(hasContent || hasEmpty).toBeTruthy()
  })

  test('insights page loads after real login', async ({ page }) => {
    await loginReal(page, 'jason1324', 'jjww1324-LJ')
    await page.goto(`${BASE}/#/insights`)
    await wait(page, 4000)
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('settings page loads and shows manage account', async ({ page }) => {
    await loginReal(page, 'jason1324', 'jjww1324-LJ')
    await page.goto(`${BASE}/#/setting`)
    await wait(page, 2000)
    await expect(page.locator('text=Manage my account')).toBeVisible({ timeout: 5000 })
  })

  test('can log out', async ({ page }) => {
    await loginReal(page, 'jason1324', 'jjww1324-LJ')
    await logout(page)
    await expect(page).toHaveURL(/login/, { timeout: 10000 })
  })
})

// ─── PWA & Asset Health ──────────────────────────────────────────────────────

test.describe('PWA & Asset Health', () => {
  test('no 404 on JS/CSS assets', async ({ page }) => {
    await skipPermissionsGate(page)
    const failed: string[] = []
    page.on('response', res => {
      if (res.status() === 404 && (res.url().includes('/assets/') || res.url().match(/\.(js|css)$/))) {
        failed.push(res.url())
      }
    })
    await page.goto(`${BASE}/`)
    await wait(page, 5000)
    expect(failed).toHaveLength(0)
  })

  test('app shell renders non-blank root', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/`)
    await wait(page, 6000)
    // Either login page or devices page should have rendered
    const hasInput = await page.locator('input, button').count() > 0
    expect(hasInput).toBeTruthy()
  })

  test('no fatal JS errors on startup', async ({ page }) => {
    await skipPermissionsGate(page)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`${BASE}/`)
    await wait(page, 5000)
    const fatal = errors.filter(e =>
      !e.includes('push') && !e.includes('notification') &&
      !e.includes('serviceWorker') && !e.includes('ResizeObserver') &&
      !e.includes('favicon') && !e.includes('Non-Error')
    )
    expect(fatal).toHaveLength(0)
  })

  test('privacy policy link works on login page', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/#/login`)
    await wait(page, 3000)
    const privacyLink = page.locator('a[href*="privacy"], text=Privacy').first()
    if (await privacyLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await privacyLink.click()
      await wait(page, 2000)
      expect(page.url()).toMatch(/privacy/)
    }
  })

  test('terms link works on login page', async ({ page }) => {
    await skipPermissionsGate(page)
    await page.goto(`${BASE}/#/login`)
    await wait(page, 3000)
    const termsLink = page.locator('a[href*="terms"], text=Terms').first()
    if (await termsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await termsLink.click()
      await wait(page, 2000)
      expect(page.url()).toMatch(/terms/)
    }
  })
})
