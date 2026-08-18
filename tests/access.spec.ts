import { test, expect } from "@playwright/test"

// A student must not reach /access: it cites the file and line that enforces
// each row, which is maintainer's material, not a reader's.
test.use({ storageState: "playwright/.auth/testa.json" })

test("a student who types /access is returned to the shelf", async ({ page }) => {
  const response = await page.goto("/access")
  expect(response?.status(), "/access should not error").toBeLessThan(400)
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
})

test("a student sees no Access tab, and no Workflows link either", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator(".shelfcard").first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('nav[aria-label="The journey"] .staffgroup')).toHaveCount(0)
  // Students stopped being offered Workflows on 2026-08-17 (TJ: "students do
  // not get workflow for the moment… it needs more development anyway"). The
  // PAGE still reads for them — see workflows.spec, which navigates there
  // directly — so this is the link going, not a gate arriving.
  await expect(page.locator('header a[href="/workflows"]')).toHaveCount(0)
})
