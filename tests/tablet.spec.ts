import { test, expect, type Locator, type Page } from "@playwright/test"
import { deleteConceptInVocabulary, deletePassageInPassagesView } from "./helpers"

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

/** Press a control through Playwright's touchscreen rather than its mouse. */
async function touch(page: Page, target: Locator) {
  await expect(target).toBeVisible({ timeout: 20_000 })
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  expect(box, "touch target has no rendered box").not.toBeNull()
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2)
}

/** Turn to a page that actually carries text, and say so if none does. */
async function pageWithText(page: Page) {
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
    await touch(page, next.first())
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

  const afterCancel = await page.evaluate(() => {
    const target = [...document.querySelectorAll(".react-pdf__Page__textContent span")].find((el) => {
      const box = el.getBoundingClientRect()
      return (el.textContent ?? "").trim().length > 10 && box.width > 40 && box.height > 2
    })
    if (!target) return "no target"
    const box = target.getBoundingClientRect()
    const y = box.y + box.height / 2
    const fire = (type: string, x: number, buttons: number) =>
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 42,
        pointerType: "pen",
        isPrimary: true,
        button: 0,
        buttons,
        clientX: x,
        clientY: y,
      }))

    // A tap must clear the earlier passage rather than re-arm it.
    fire("pointerdown", box.x + 2, 1)
    fire("pointerup", box.x + 2, 0)
    if (window.getSelection()?.toString()) return "tap retained selection"

    // An interrupted drag is not a completed selection.
    fire("pointerdown", box.x + 2, 1)
    fire("pointermove", box.x + box.width - 2, 1)
    fire("pointercancel", box.x + box.width - 2, 0)
    return window.getSelection()?.toString() ?? ""
  })
  expect(afterCancel).toBe("")
  await expect(page.locator("#captureNow")).toHaveCount(0)
})

test("a browser selection can be saved through touch controls and survives reload", async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto("/", { waitUntil: "domcontentloaded" })
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(card, "seed missing — run `npm run seed:demo` first").toBeVisible({ timeout: 20_000 })
  await touch(page, card.locator("a.shelfmain"))
  await expect(page).toHaveURL(/\/reading\//, { timeout: 20_000 })
  await expect(page.locator(".react-pdf__Page").first()).toBeAttached({ timeout: 60_000 })
  expect(await pageWithText(page), "no page of this reading drew selectable text").toBe(true)

  /**
   * Playwright cannot perform iPadOS's native long-press selection. Build the
   * Selection Safari would report, then use touchscreen input for every control
   * in the capture path. The pen-typed gesture itself is covered above.
   */
  const selected = await page.evaluate(() => {
    const layer = [...document.querySelectorAll(".react-pdf__Page__textContent")].find(
      (candidate) => candidate.querySelectorAll("span").length > 5
    )
    const spans = layer
      ? [...layer.querySelectorAll("span")].filter((span) => (span.textContent ?? "").trim().length > 0)
      : []
    const start = spans.findIndex((span) => (span.textContent ?? "").trim().length >= 20)
    if (start < 0) return ""
    let end = start
    let length = (spans[start].textContent ?? "").length
    while (end + 1 < spans.length && length < 100) {
      end += 1
      length += (spans[end].textContent ?? "").length
    }
    const range = document.createRange()
    range.setStartBefore(spans[start].firstChild ?? spans[start])
    range.setEndAfter(spans[end].firstChild ?? spans[end])
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event("selectionchange"))
    return (selection?.toString() ?? "").trim()
  })
  expect(selected.length).toBeGreaterThanOrEqual(20)
  const selectedExcerpt = selected.split(/\s+/).slice(0, 8).join(" ")

  const capture = page.locator("#captureNow")
  await expect(capture).toBeVisible({ timeout: 15_000 })
  await touch(page, capture)
  await expect(page.locator("#capturePassageSave")).toBeVisible({ timeout: 10_000 })

  // This prefix is recognised by scripts/clean-fixtures.ts, so a failed run
  // cannot strand the passage even if it never reaches the cleanup below.
  const conceptName = `Test Concept for Tablet Touch ${Date.now().toString(36)}`
  await touch(page, page.locator("#captureConceptToggle"))
  await page.locator("#captureConcept").fill(conceptName)
  await touch(page, page.locator("#capturePassageSave"))
  await expect(page.locator("#capturePassageSave")).toHaveCount(0, { timeout: 30_000 })

  await touch(page, page.getByRole("button", { name: "In your work ›" }))
  const savedRow = page.locator("#yourwork .ywpassage", { hasText: conceptName })
  await expect(savedRow).toBeVisible({ timeout: 15_000 })
  await expect(savedRow.locator(".passage")).toContainText(selectedExcerpt)
  const passageId = await savedRow.getAttribute("data-passage-id")
  expect(passageId).toMatch(/^[0-9a-f-]{36}$/)

  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.locator(".pdf-shell")).toBeVisible({ timeout: 30_000 })
  await touch(page, page.locator("#yourwork-toggle"))
  const reloadedRow = page.locator(`#yourwork [data-passage-id="${passageId}"]`)
  await expect(reloadedRow).toContainText(conceptName, {
    timeout: 20_000,
  })
  await expect(reloadedRow.locator(".passage")).toContainText(selectedExcerpt)

  await deletePassageInPassagesView(page, passageId!)
  // Confirm the server-side delete before removing the test concept that makes
  // this passage recognisable to the failed-run fixture sweep.
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.locator(".pdf-shell")).toBeVisible({ timeout: 30_000 })
  await touch(page, page.locator("#yourwork-toggle"))
  await expect(page.locator(`#yourwork [data-passage-id="${passageId}"]`)).toHaveCount(0)
  await deleteConceptInVocabulary(page, conceptName)
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
  await touch(page, notice.getByRole("button", { name: /dismiss/i }))
  await expect(notice).toHaveCount(0)
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.locator(".shelfcard").first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator(".narrownotice")).toHaveCount(0)
})
