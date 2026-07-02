import { chromium, type Page } from "playwright"
import { mkdir } from "fs/promises"
import path from "path"

async function mockAuth(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          name: "Test Admin",
          email: "tjm@tjmcleish.com",
          id: "test-admin-id",
          role: "ADMIN",
        },
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      }),
    })
  })

  await page.addInitScript(() => {
    localStorage.setItem("loom_has_seen_walkthrough", "true")
  })
}

async function capture(viewport: { width: number; height: number }, name: string) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()

  await mockAuth(page)
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1200)

  const outDir = path.join(process.cwd(), "test-results", "ui-audit")
  await mkdir(outDir, { recursive: true })

  await page.screenshot({
    path: path.join(outDir, `${name}-open.png`),
    fullPage: true,
  })

  const library = page.getByRole("button", { name: /Library/i })
  if (await library.isVisible()) {
    await library.click()
    await page.waitForTimeout(1200)
    await page.screenshot({
      path: path.join(outDir, `${name}-library.png`),
      fullPage: true,
    })
  }

  const readInLoom = page.locator('button:has-text("Read in Loom")').first()
  if (await readInLoom.isVisible()) {
    await readInLoom.click()
    await page.waitForTimeout(1800)
    await page.screenshot({
      path: path.join(outDir, `${name}-pdf.png`),
      fullPage: true,
    })
  }

  await browser.close()
}

async function main() {
  await capture({ width: 1440, height: 900 }, "desktop")
  await capture({ width: 390, height: 844 }, "mobile")
  console.log("ui-audit screenshots saved to test-results/ui-audit")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
