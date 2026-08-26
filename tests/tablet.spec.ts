import { test, expect } from "@playwright/test"

test.use({ storageState: "playwright/.auth/testa.json" })
test.beforeEach(() => test.setTimeout(150_000))

/**
 * SAFARI, AT AN IPAD.
 *
 * This file exists because a reader asked whether Loom works on a tablet —
 * they could not select words with an Apple Pencil — and the suite could not
 * answer: every project ran Desktop Chrome, and WebKit was not installed. It
 * runs under the `tablet` project (playwright.config.ts), which is WebKit at
 * `devices['iPad Pro 11']` — 834 x 1194, touch, portrait.
 *
 * WHAT IT SETTLES: Safari's engine renders the app, a reading draws a real
 * text layer at that size, and Loom turns pen-typed pointer input over those
 * words into the live selection that arms a capture.
 *
 * WHAT IT CANNOT: whether a real Apple Pencil reaches that handler before
 * iPadOS claims the gesture. Playwright has no Pencil input; the PointerEvents
 * below are synthetic and test Loom's path, never the operating system's
 * arbitration. That last fact still needs a real device.
 *
 * A CORRECTION THIS FILE OWES ITS OWN EXISTENCE TO. The first pass at this
 * concluded "Loom renders no selectable text below 900px" — measured, and
 * wrong. It only ever looked at page ONE of the reading, which is a scanned
 * cover carrying no text at all; below 900 the viewer shows one page rather
 * than a spread (PdfViewer.tsx:838, deliberately), so page one was all there
 * was to see. Page two has 69 spans and selects fine. Hence `readingPage`
 * below: nothing here may assert about text on a page that has none.
 */

/** Turn to a page that actually carries text, and say so if none does. */
async function pageWithText(page: import("@playwright/test").Page) {
  const spans = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".react-pdf__Page__textContent")].reduce(
        (n, layer) => n + layer.querySelectorAll("span").length,
        0
      )
    )
  for (let turn = 0; turn < 4; turn += 1) {
    if ((await spans()) > 5) return true
    const next = page.getByRole("button", { name: "Next Page" })
    if (!(await next.count()) || !(await next.first().isEnabled())) return false
    await next.first().click()
    await page.waitForTimeout(6_000)
  }
  return (await spans()) > 5
}

test("pen-typed pointer input selects reading text and arms capture", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(card, "seed missing — run `npm run seed:demo` first").toBeVisible({ timeout: 20_000 })
  await card.locator("a.shelfmain").click()
  await expect(page).toHaveURL(/\/reading\//, { timeout: 20_000 })

  // The engine renders it at all — the first thing worth knowing, since this
  // is the only project in the suite that is not Chromium.
  await expect(page.locator(".pdf-shell")).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(".react-pdf__Page").first()).toBeAttached({ timeout: 60_000 })

  expect(
    await pageWithText(page),
    "no page of this reading drew a text layer on WebKit at an iPad"
  ).toBe(true)

  const selected = await page.evaluate(() => {
    const layer = [...document.querySelectorAll(".react-pdf__Page__textContent")].find(
      (l) => l.querySelectorAll("span").length > 5
    )
    if (!layer) return ""
    const target = [...layer.querySelectorAll("span")].find((el) => {
      const box = el.getBoundingClientRect()
      return (el.textContent ?? "").trim().length > 10 && box.width > 40 && box.height > 2
    })
    if (!target) return ""
    const box = target.getBoundingClientRect()

    const y = box.y + box.height / 2
    const fire = (type: string, x: number, buttons: number) =>
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 41,
        pointerType: "pen",
        isPrimary: true,
        button: 0,
        buttons,
        clientX: x,
        clientY: y,
      }))
    fire("pointerdown", box.x + 2, 1)
    fire("pointermove", box.x + box.width - 2, 1)
    fire("pointerup", box.x + box.width - 2, 0)
    return (window.getSelection()?.toString() ?? "").trim()
  })
  expect(selected.length, `pen path selected "${selected}"`).toBeGreaterThan(5)

  // …and the selection arms the capture, which is the act the whole station is
  // for. Selectable text nobody can keep would be a hollow pass.
  await expect(page.locator("#captureNow")).toBeVisible({ timeout: 15_000 })
})

test("the narrow layout says what Loom is built for, without getting in the way", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await expect(page.locator(".shelfcard").first()).toBeVisible({ timeout: 20_000 })

  /**
   * Below 900px Loom is out of its stated range (AGENTS.md: a desktop tool,
   * floor 1280), so it says so once rather than pretending otherwise — and
   * says it in a line, not a wall: reading here is meant to work.
   */
  const notice = page.locator(".narrownotice")
  await expect(notice).toBeVisible({ timeout: 15_000 })
  await expect(notice).toContainText(/wider screen/i)

  // It can be put away, and it stays away — a standing banner on every visit
  // would be the getting-in-the-way this is meant to avoid.
  await notice.getByRole("button", { name: /dismiss/i }).click()
  await expect(notice).toHaveCount(0)
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.locator(".shelfcard").first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator(".narrownotice")).toHaveCount(0)
})
