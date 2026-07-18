import { defineConfig, devices } from '@playwright/test'

// E2E_LOCAL=1 runs the local-build specs (e.g. permissions.e2e.spec.ts) against a
// `vite preview` server instead of the deployed site — needed for changes not yet
// on GitHub Pages (like the removed PermissionsGate). CI's live-site run is untouched.
const LOCAL = !!process.env.E2E_LOCAL
// Bind/hit IPv4 explicitly: vite preview otherwise listens on IPv6 [::1] only, and a
// browser resolving localhost/127.0.0.1 to IPv4 gets ERR_CONNECTION_REFUSED.
const LOCAL_URL = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  ...(LOCAL
    ? {
        webServer: {
          command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
          url: LOCAL_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
      }
    : {}),

  use: {
    baseURL: process.env.E2E_BASE_URL ?? (LOCAL ? LOCAL_URL : 'https://lujian1324-spec.github.io/energy-app'),
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro default
    locale: 'en-US',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'Mobile Chrome (iPhone 16)',
      use: {
        browserName: 'chromium',
        // executablePath only needed in restricted sandbox environments
        // (must live under launchOptions — top-level executablePath is ignored).
        // For LOCAL runs also bypass the system proxy so the browser can reach the
        // localhost preview server (some sandboxes proxy even localhost → refused).
        launchOptions: {
          ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
            : {}),
          ...(LOCAL ? { args: ['--no-proxy-server'] } : {}),
        },
        viewport: { width: 393, height: 852 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
