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
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  globalSetup: require.resolve('./playwright/global-setup'),
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
