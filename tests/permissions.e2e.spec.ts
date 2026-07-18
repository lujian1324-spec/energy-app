/**
 * PG cases as Playwright E2E — the PWA-observable parts of TEST_PLAN.md §3b.
 *
 * These assert behaviour that only exists in the LOCAL build (the deployed
 * GitHub Pages site may still be an older version), so the whole suite is gated
 * on E2E_LOCAL=1, which also makes playwright.config.ts start a `vite preview`
 * server. Run:
 *
 *   npm run build
 *   E2E_LOCAL=1 npx playwright test tests/permissions.e2e.spec.ts --project="Mobile Chrome (iPhone 16)"
 *
 * PG-06 (Open Settings shows a toast, never opens the app-settings: scheme) is
 * not reproduced here because reaching the BLE permission-denied UI needs a real
 * device; it stays covered by the unit test openAppSettings.test.ts.
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

// Local-build only — skip entirely on the live-site CI run.
test.describe('权限按需化 (PG-01)', () => {
  test.skip(!process.env.E2E_LOCAL, 'PG e2e runs against a local build (set E2E_LOCAL=1)')

  const GATE_HEADING = 'App Permissions'
  const GATE_BUTTON = 'Allow All'

  async function assertNoGateThenLogin(page: Page) {
    // The removed PermissionsGate rendered full-screen before routing. It must
    // never appear; the app should fall straight through to the login page.
    await expect(page.getByText(GATE_HEADING, { exact: false })).toHaveCount(0)
    await expect(page.getByRole('button', { name: GATE_BUTTON })).toHaveCount(0)
    await expect(page.locator('input[placeholder="Username"]')).toBeVisible({ timeout: 20000 })
  }

  test('PG-01 全新首启不显示 App Permissions 页，直接进登录', async ({ page }) => {
    // Fresh context → empty localStorage → simulates a first install.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await assertNoGateThenLogin(page)
  })

  test('PG-01b 旧的 sierro_permissions_asked 标记已失效，仍无权限页', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    // Preset the now-defunct flag; it must have no effect either way.
    await page.evaluate(() => localStorage.setItem('sierro_permissions_asked', '1'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await assertNoGateThenLogin(page)
  })
})
