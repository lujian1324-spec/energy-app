import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Only our pure-logic unit tests. Playwright's tests/e2e.spec.ts is NOT run here.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
