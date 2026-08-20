import { defineConfig, devices } from '@playwright/test';

/**
 * Scratch config for THIS machine: port 3000 sits inside a Windows excluded
 * port range (see NEXT_SESSION.md "Local environment notes"), so the suite
 * runs against a dev server on 3100. Identical to playwright.config.ts apart
 * from the port — keep globalSetup + storageState or the authenticated specs
 * run signed-out and fail for the wrong reason.
 *
 *   npx playwright test --config=playwright.3100.config.ts
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One worker everywhere: every spec signs in as the same Test User A, and
  // the capture specs now delete their own data — parallel workers race each
  // other's rows (a deleted concept vanishes under another spec's assertion).
  workers: 1,
  reporter: [['list']],
  globalSetup: require.resolve('./playwright/global-setup'),
  // Runs whatever happened — the failing run is the one that skipped its own
  // cleanup, so this is the only place the sweep can be reliable.
  globalTeardown: require.resolve('./playwright/global-teardown'),
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    storageState: 'playwright/.auth/user.json',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
