/**
 * The Heatmaps tab — the cohort's marks on the page, and nothing of the
 * viewer's own.
 *
 * This surface had NO coverage until now, which is why it is worth writing
 * down what the gap actually was: `noOwnWork` is passed by exactly one caller
 * (src/components/admin/HeatmapReader.tsx), no spec reached it, and so every
 * decision about what this tab hides was enforced only by reading the code.
 * Two of those decisions were made on 2026-08-22 and are asserted here.
 *
 * Runs as faculty, not admin, for the reason tests/faculty.spec.ts gives: an
 * ADMIN passes every gate, so it would prove nothing about the narrower door.
 */
import { test, expect } from "@playwright/test"

test.use({ storageState: "playwright/.auth/faculty.json" })

// Real seeded work, a 60-page scan, and pdf.js on top of it.
test.beforeEach(() => test.setTimeout(120_000))

/**
 * The cohort's heat, wherever this view draws it.
 *
 * TWO MECHANISMS, one claim. On the CANVAS — which is where this tab now opens
 * — heat is SVG rects projected from the overlay's offsets, because no page at
 * fit-all has a text layer to walk. In the paged views it is mark.js on the
 * live text layer. Both are the same runs of text; a spec that knew only one
 * of them would pass or fail on which view it happened to be in.
 */
function heatMarks(page: import("@playwright/test").Page) {
  return page.locator(".pdf-kept-heat rect, .loom-overlay-heat")
}

/** Everything the viewer's OWN work is drawn as, in either view. */
function ownMarks(page: import("@playwright/test").Page) {
  return page.locator(".loom-passage-highlight, .pdf-kept-marks rect, .pdf-railcard")
}

/**
 * Walk forward until a page carrying heat is on screen. Paged views only —
 * the canvas has every page up at once and needs no walking.
 *
 * Which page carries it depends on where the seed's passages landed, so this
 * cannot be a page number. It waits on each spread rather than turning
 * eagerly: the marks are applied from a MutationObserver a tick after the data
 * lands, so a bare count() on arrival reads zero on the very page that has
 * them.
 */
async function pageWithHeat(page: import("@playwright/test").Page) {
  for (let spread = 0; spread < 8; spread += 1) {
    const found = await page
      .locator(".loom-overlay-heat")
      .first()
      .waitFor({ state: "visible", timeout: 6_000 })
      .then(() => true, () => false)
    if (found) return true
    const next = page.getByRole("button", { name: "Next Page" })
    if (!(await next.isEnabled())) return false
    await next.click()
  }
  return false
}

test("the tab opens on the cohort, and shows no work of the viewer's own", async ({ page }) => {
  await page.goto("/admin/heatmaps")
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 30_000 })

  /**
   * OPENS ON THE COHORT, unasked (TJ, 2026-08-22: "default overlay should be
   * 'all'"). Everywhere else the overlay is off until sent for — the page is
   * the reader's own first — but a tab called Heatmaps that arrives with no
   * heat is asking for the only thing the reader came for.
   */
  await expect(page.locator(".pdf-overlay-ctl select")).toHaveValue("all", { timeout: 20_000 })
  const bar = page.locator(".pdf-overlay-bar")
  await expect(bar).toBeVisible({ timeout: 20_000 })
  // And it never flashes the failure branch on the way: overlayBusy starts
  // true alongside the band, so "could not be loaded" — which renders on
  // !overlay && !busy — has no window to appear in.
  await expect(bar).not.toContainText("could not be loaded")

  /**
   * AND ON THE CANVAS (TJ, 2026-08-22: "let the default heatmap view be
   * canvas"). The tab asks where a cohort has been across a whole reading,
   * which only the contact sheet answers in one look.
   */
  await expect(page.getByRole("button", { name: "Canvas" })).toHaveAttribute("aria-pressed", "true")
  // Heat is drawn there with no page rendered at all — the projection exists
  // precisely so fit-all is not a blank contact sheet.
  await expect(heatMarks(page).first()).toBeVisible({ timeout: 25_000 })

  /**
   * NO YELLOW (TJ, 2026-08-22: "why is there any yellow highlight? for the
   * heatmap view there should not be"). This is the assertion the whole file
   * exists for.
   *
   * WEAKER THAN IT LOOKS, and worth saying so: Test Faculty owns no passages
   * in any seeded reading, so this would also pass on a viewer who simply had
   * nothing to draw. Checked against the dev database on 2026-08-22 — of the
   * seven people with passages in the first reading, the only test account is
   * Test User A, a learner who is refused /admin. The suppression itself was
   * verified by hand on the running app as an admin who does own passages
   * there: 161 highlights and 3 margin cards before, none after, with the
   * cohort's 189 heat marks unchanged.
   */
  await expect(ownMarks(page)).toHaveCount(0)

  // Nor the surfaces that would put their work back on screen by another door.
  await expect(page.locator("#yourwork-toggle")).toHaveCount(0)
  await expect(page.locator("#captureNow")).toHaveCount(0)
})

/**
 * NO CONTROL BRINGS THE VIEWER'S OWN WORK BACK, and that is the decision
 * rather than an omission.
 *
 * There was a toggle here for about an hour on 2026-08-22 — "Passage cards"
 * first, then "My marks" once it gated the highlights with the cards. TJ
 * removed it: "'my marks' should have no meaning in the heatmaps view." The
 * tab answers where the COHORT has been, and the viewer is excluded from
 * their own overlay by construction, so their marks would be the one set on
 * screen that none of the numbers describe.
 */
test("no control offers the viewer their own work back", async ({ page }) => {
  await page.goto("/admin/heatmaps")
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 30_000 })
  // The cohort's heat is there…
  await expect(heatMarks(page).first()).toBeVisible({ timeout: 25_000 })
  // …and nothing on the toolbar turns the viewer's own marks on.
  await expect(page.getByRole("button", { name: /my marks|passage cards/i })).toHaveCount(0)
  await expect(ownMarks(page)).toHaveCount(0)

  // Nor in the paged view, where own marks are painted by a different
  // mechanism (mark.js on the live text layer) and could have survived a fix
  // that only reached the canvas.
  await page.getByRole("button", { name: "1 page", exact: true }).click()
  expect(await pageWithHeat(page), "no page of this reading shows the cohort's marks").toBe(true)
  await expect(ownMarks(page)).toHaveCount(0)
})

test("choosing a student does not resize the scope strip", async ({ page }) => {
  await page.goto("/admin/heatmaps")
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 30_000 })

  const strip = page.locator("nav").nth(1)
  const before = await strip.boundingBox()
  expect(before).not.toBeNull()

  const picker = page.getByLabel("Select active student")
  const names = await picker.locator("option").evaluateAll((opts) =>
    (opts as HTMLOptionElement[]).map((o) => o.value).filter(Boolean)
  )
  expect(names.length, "the seed must place at least one student in this course").toBeGreaterThan(0)
  await picker.selectOption(names[0])
  await expect(page).toHaveURL(/student=/, { timeout: 15_000 })

  /**
   * THE STRIP IS THE SAME HEIGHT. The emphasis toggle used to appear here the
   * moment a name was chosen, and a `btn mini` is taller than a `tinput
   * inline`, so the row grew and pushed the whole reading surface down (TJ,
   * 2026-08-22: "the 'course' toolbar changes size when i select a student,
   * why?"). It is gone from this tab — src/app/admin/heatmaps/page.tsx never
   * reads ?graph, so it redrew nothing here — and the strip carries a floor
   * equal to its tallest state so nothing else can do the same again.
   */
  const after = await strip.boundingBox()
  expect(after).not.toBeNull()
  expect(Math.round(after!.height)).toBe(Math.round(before!.height))
  await expect(strip.locator(".navseg")).toHaveCount(0)
})

/**
 * SWITCHING READINGS MUST NOT ASK FOR PAGES THE NEW ONE HAS NOT GOT.
 *
 * `url`/`sourceId` change together and immediately; the new page count only
 * arrives when pdf.js has finished loading. While those disagreed, the canvas
 * held the OLD count against the NEW image base. Measured before the fix,
 * going from a 60-page reading to a 9-page one: 51 requests for pages 10-60 of
 * the 9-page document, every one a 404 — and the page-image route reads a 404
 * as "not rendered yet" and queues a whole-document render behind it, so one
 * switch also queued 51 redundant generation jobs for a reading that was
 * already complete.
 *
 * This asserts the network, not the pixels, because that is where the damage
 * was: the canvas looked almost right the whole time.
 */
test("switching to a shorter reading asks only for pages it has", async ({ page }) => {
  const missing: string[] = []
  page.on("response", (response) => {
    const url = response.url()
    if (/\/api\/readings\/[^/]+\/pages\/\d+/.test(url) && response.status() === 404) {
      missing.push(url.replace(/^.*\/api\/readings\//, ""))
    }
  })

  await page.goto("/admin/heatmaps")
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 30_000 })
  await expect(heatMarks(page).first()).toBeVisible({ timeout: 25_000 })

  // Object Worlds is 9 pages; the reading this tab opens on is 60. The seed
  // puts both in this course, which is what makes the mismatch reachable.
  const reading = page.getByLabel("Select active reading")
  const short = await reading.locator("option").evaluateAll((opts) => {
    const found = (opts as HTMLOptionElement[]).find((o) => /object worlds/i.test(o.textContent ?? ""))
    return found ? found.value : null
  })
  expect(short, "the seed must offer Object Worlds in this course").not.toBeNull()

  await reading.selectOption(short!)
  await expect(page).toHaveURL(new RegExp(`source=${short}`), { timeout: 15_000 })
  await page.waitForTimeout(6_000)

  expect(missing, `asked for pages the reading does not have: ${missing.join(", ")}`).toEqual([])
})

test("the legend floats over the page instead of adding a row above it", async ({ page }) => {
  await page.goto("/admin/heatmaps")
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 30_000 })

  const bar = page.locator(".pdf-overlay-bar")
  await expect(bar).toBeVisible({ timeout: 20_000 })

  /**
   * IT TAKES NO HEIGHT FROM THE PAGES. It used to sit in flow between the
   * toolbar and the stage, so turning the overlay on shortened the stage and
   * the canvas re-laid out under the reader (TJ, 2026-08-22: "the current
   * additive hearder is causing a resize of the canvas/page").
   */
  await expect(bar).toHaveClass(/floating/)
  const box = await bar.boundingBox()
  const stage = await page.locator(".pdf-stage").boundingBox()
  expect(box).not.toBeNull()
  expect(stage).not.toBeNull()

  // Anchored to the TOP of the pages (TJ, same day), and BELOW the toolbar —
  // which is the reason the top offset is measured rather than a constant.
  expect(box!.y).toBeGreaterThanOrEqual(stage!.y)
  expect(box!.y - stage!.y).toBeLessThan(40)

  // Narrow enough to sit over a margin rather than across the text.
  expect(box!.width).toBeLessThanOrEqual(260)
})
