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

/**
 * THE TAB, ON A READING THE SEED ACTUALLY GAVE THE COHORT MARKS.
 *
 * Heatmaps opens on the first reading in syllabus order, and on a fresh seed
 * that reading has nobody's marks on it — CI said so in as many words:
 * "Nobody in the cohort has marked this reading yet." Every test here that
 * waits on heat was written against the dev database, which carries months of
 * real work, and every one of them failed the first time the suite ran on a
 * seeded one.
 *
 * So the reading is CHOSEN, not inherited. "Object Worlds" is the reading
 * `npm run seed:demo` gives Test Users A, C and D overlapping captures in —
 * the same reading tests/overlay.spec.ts names for the same reason — and the
 * failure message says so, because a spec that dies with "element not found"
 * teaches nothing about a missing seed.
 */
const SEEDED_WITH_MARKS = "Object Worlds"

async function openHeatmaps(page: import("@playwright/test").Page, reading?: string) {
  await page.goto("/admin/heatmaps")
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 30_000 })
  if (!reading) return
  const picker = page.getByLabel("Select active reading")
  const value = await picker.locator("option").evaluateAll(
    (opts, title) => (opts as HTMLOptionElement[]).find((o) => (o.textContent ?? "").includes(title))?.value ?? null,
    reading
  )
  expect(value, `seed missing "${reading}" — run \`npm run seed:demo\` first`).not.toBeNull()
  await picker.selectOption(value!)
  await expect(page).toHaveURL(new RegExp(`source=${value}`), { timeout: 15_000 })
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 30_000 })
}

/** The cohort's marks, with the seed named if they are not there. */
async function expectHeat(page: import("@playwright/test").Page) {
  await expect(
    heatMarks(page).first(),
    `no cohort marks on "${SEEDED_WITH_MARKS}" — run \`npm run seed:demo\`, which seeds the overlapping captures this asserts on`
  ).toBeVisible({ timeout: 25_000 })
}

test("the tab opens on the cohort, and shows no work of the viewer's own", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)

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
  await expectHeat(page)

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
  await openHeatmaps(page, SEEDED_WITH_MARKS)
  // The cohort's heat is there…
  await expectHeat(page)
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
  await openHeatmaps(page)

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

  // Starts where the tab opens — a LONGER reading — because the whole point is
  // switching to a shorter one while the old page count is still in hand. It
  // needs no heat: what it watches is the network, not the wash.
  await openHeatmaps(page)

  // Object Worlds is 9 pages; the reading this tab opens on has more. The seed
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

/**
 * ONE MECHANISM PER VIEW. Heat has two ways of being drawn — mark.js on a live
 * text layer, and the projection the canvas needs because at fit-all there is
 * no text layer to walk — and on the canvas both fired the moment a page grew
 * big enough to be promoted. The same runs painted twice from two different
 * boxes (a text-layer span is the line's full height, a projected rect is the
 * font's), which is what "a border, a line at the top of the rect, and then a
 * fill… they dont seem to align" was (TJ, 2026-08-22).
 */
test("heat is drawn once per page, by the view that owns it", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)

  const projected = page.locator(".pdf-kept-heat rect")
  const live = page.locator(".loom-overlay-heat")

  // The canvas draws its own and lets mark.js draw none…
  await expect(projected.first()).toBeVisible({ timeout: 25_000 })
  await expect(live).toHaveCount(0)

  // …at every zoom, including one deep enough to promote pages to real text
  // layers, which is where the double-paint used to start.
  for (let step = 0; step < 5; step += 1) {
    await page.getByRole("button", { name: "Zoom in" }).click()
    await page.waitForTimeout(700)
  }
  await page.waitForTimeout(4_000)
  await expect(live).toHaveCount(0)
  await expect(projected.first()).toBeVisible()

  // The paged view is the other way round: mark.js paints, nothing is
  // projected over it.
  await page.getByRole("button", { name: "1 page", exact: true }).click()
  expect(await pageWithHeat(page), "no page of this reading shows the cohort's marks").toBe(true)
  await expect(projected).toHaveCount(0)
})

test("the legend floats over the page instead of adding a row above it", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)

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

  /**
   * THE SWATCHES SHOW WHAT THE PAGE SHOWS. The canvas draws heat as fill
   * alone; the paged views keep the 2px overline mark.js gives it. A legend
   * that disagrees with the marks it floats over is worse than no legend, so
   * it follows the view (TJ, 2026-08-22: "the legend needs reworking to
   * match").
   */
  const edges = () =>
    page.locator(".pdf-overlay-scale i").evaluateAll((els) =>
      (els as HTMLElement[]).map((el) => getComputedStyle(el).boxShadow === "none")
    )
  // The bar appears while the comparison is still being read, carrying only
  // "reading the cohort…" — the scale arrives with the counts.
  await expect(page.locator(".pdf-overlay-scale i").first()).toBeAttached({ timeout: 25_000 })
  const onCanvas = await edges()
  expect(onCanvas.length, "the scale draws a swatch per step the reading can reach").toBeGreaterThan(0)
  expect(onCanvas.every(Boolean), "canvas swatches are flat, like the rects").toBe(true)

  await page.getByRole("button", { name: "1 page", exact: true }).click()
  await page.waitForTimeout(2_000)
  const onPage = await edges()
  expect(onPage.some(Boolean), "paged swatches keep the overline, like the marks").toBe(false)
})

/**
 * THE DARKEST STEP IS REACHED IN EVERY READING, because the scale is fully
 * relative: the densest run in a reading paints the top, whatever number that
 * run happens to be (TJ, 2026-08-22, of two readings side by side: "the
 * darkest color in each is different, correct? why?").
 *
 * It replaced a hybrid — the step WAS the count below six people, a ramp above
 * five — under which a reading where two people converged could never reach
 * its own top step while one where three did could. Both readings in this
 * course sit in exactly that range, which is why this is worth asserting on
 * both rather than on whichever one the tab happens to open.
 */
test("every reading that carries marks reaches its own darkest step", async ({ page }) => {
  await openHeatmaps(page)

  /**
   * ONLY THE READINGS THAT HAVE MARKS, and that is the whole subtlety.
   *
   * The claim is that a reading's own densest run paints the top step,
   * whatever number that run holds — so it is testable on any reading that has
   * heat, and meaningless on one that has none. The first version took the
   * first two readings in the picker and demanded step 5 of both; on a fresh
   * seed the second has nobody's marks, so it failed on a reading the claim
   * was never about.
   */
  const reading = page.getByLabel("Select active reading")
  const all = await reading.locator("option").evaluateAll((opts) =>
    (opts as HTMLOptionElement[]).map((o) => ({ value: o.value, label: o.textContent ?? "" })).filter((o) => o.value)
  )
  expect(all.length, "the course must offer at least one reading").toBeGreaterThan(0)

  /**
   * THE SEEDED READING GOES FIRST, and that is not a convenience.
   *
   * The picker lists readings in syllabus order, and on a fresh seed the only
   * one carrying cohort marks sits well down that list — CI walked the first
   * four, found none, and failed with this test's own "no reading has cohort
   * marks" message. Walking every reading instead would be honest and slow:
   * each one loads a PDF. So the walk starts where the marks are and takes a
   * couple of neighbours after it.
   */
  const seeded = all.filter((o) => o.label.includes(SEEDED_WITH_MARKS))
  const others = all.filter((o) => !o.label.includes(SEEDED_WITH_MARKS)).slice(0, 2)
  const options = [...seeded, ...others].map((o) => o.value)

  const tops: { top: number; swatches: number }[] = []
  for (const value of options) {
    await reading.selectOption(value)
    await expect(page).toHaveURL(new RegExp(`source=${value}`), { timeout: 15_000 })
    await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 30_000 })
    // A reading nobody marked draws nothing, and says so in the bar. Give it
    // the same window the marked ones get before concluding it is empty.
    const drew = await page
      .locator(".pdf-kept-heat rect")
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true, () => false)
    if (!drew) continue
    const top = await page.locator(".pdf-kept-heat rect").evaluateAll((els) =>
      Math.max(...(els as SVGElement[]).map((el) => Number(el.getAttribute("data-heat")) || 0))
    )
    const swatches = await page.locator(".pdf-overlay-scale i").count()
    tops.push({ top, swatches })

    /**
     * TWO SHAPES, AND THE SECOND IS NOT A FAILURE OF THE FIRST.
     *
     * Where anyone agreed with anyone, the ramp is in play: five swatches, and
     * the densest run paints the top step. Where NOBODY did — every run one
     * person, so there is no range to grade — the scale is one swatch and
     * everything paints the faintest step, deliberately: painting a whole
     * reading at the top would say they converged everywhere when the opposite
     * happened.
     *
     * Asserting only the first shape is what failed here: a reading with marks
     * but no agreement is legal, and this demanded step 5 of it.
     */
    if (swatches === 1) expect(top, "no agreement: one swatch, faintest step").toBe(1)
    else {
      expect(swatches, "a graded scale draws the whole ramp").toBe(5)
      expect(top, "the densest run paints the top step").toBe(5)
    }
  }

  expect(
    tops.length,
    "no reading in this course has cohort marks — run `npm run seed:demo`, which seeds the overlapping captures this asserts on"
  ).toBeGreaterThan(0)
  // At least one reading must actually exercise the ramp, or this has only
  // proved the degenerate case.
  expect(
    tops.some((t) => t.swatches === 5),
    `no reading showed a graded scale — tops were ${tops.map((t) => `${t.top}/${t.swatches}`).join(", ")}`
  ).toBe(true)
})

/**
 * THE PICKER, AND WHAT IT TURNS OFF.
 *
 * These two claims used to live in tests/overlay.spec.ts, driven from the
 * reading toolbar. The control moved here on 2026-08-23 (TJ: "the overlay view
 * should only be available in the heatmap, not in reading") and the assertions
 * moved with it rather than being dropped — turning a comparison OFF is the
 * half most likely to rot, because nothing on screen complains when a wash
 * outlives the band that fetched it.
 */
test("the overlay can be turned off, and never names anybody", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)
  await expectHeat(page)

  /**
   * The comparison is never a door into anybody: the marks are hidden from a
   * screen reader and carry no name, because the counts are the report and
   * they live in the bar.
   *
   * ASSERTED ON BOTH MECHANISMS, at the level each one actually carries it.
   * The canvas hides the whole projected LAYER, since a rect is not a node a
   * reader would land on; mark.js hides each mark, because those are real
   * elements in the text layer. A single assertion against "the first heat
   * mark" checked the wrong node in one of the two views — which is how this
   * first failed.
   */
  await expect(page.locator(".pdf-kept-heat")).toHaveAttribute("aria-hidden", "true")
  await expect(page.locator(".pdf-overlay-bar")).not.toContainText("Test User")

  await page.getByRole("button", { name: "1 page", exact: true }).click()
  expect(await pageWithHeat(page), "no page of this reading shows the cohort's marks").toBe(true)
  await expect(page.locator(".loom-overlay-heat").first()).toHaveAttribute("aria-hidden", "true")

  // Off takes the wash away and leaves the reading as it was.
  await page.getByLabel("Which section to compare").selectOption("off")
  await expect(page.locator(".pdf-overlay-bar")).toHaveCount(0, { timeout: 15_000 })
  await expect(heatMarks(page)).toHaveCount(0, { timeout: 20_000 })
  await expect(page.locator("#cardTable, .pdf-shell").first()).toBeVisible()
})

/**
 * ONE STUDENT'S CARDS, on request (TJ, 2026-08-23: "heatmaps should have a
 * show cards/hide cards toggle for the heatmap view", then "make it available
 * only when 1 student is selected").
 *
 * Both halves of that instruction are load-bearing and neither is obvious from
 * the markup, so both are asserted here. The availability rule is not a
 * courtesy: this tab is built for ~60 looms on a reading, where the whole
 * cohort's cards would be a wall of several hundred in a margin meant for a
 * few dozen. The server enforces it by sending no passages at all unless one
 * student is chosen — which is why the control's absence, not merely its
 * disabled state, is what gets checked.
 */
/**
 * NAMED, NOT THE FIRST IN THE LIST. The control only exists where the chosen
 * student has passages in the open reading, and the picker holds the whole
 * course — faculty, the two-course fixture and several people who have never
 * touched this reading. Taking option[1] chose one of those and the spec
 * failed on an empty roster rather than on the rule it is about.
 *
 * Test User A for the same reason SEEDED_WITH_MARKS names this reading: the
 * seed gives A captures here, and overlay.spec.ts already leans on it.
 */
async function chooseAStudent(page: import("@playwright/test").Page, name = "Test User A") {
  const picker = page.getByLabel("Select active student")
  const id = await picker.locator("option").evaluateAll(
    (opts, who) => (opts as HTMLOptionElement[]).find((o) => (o.textContent ?? "").trim() === who)?.value ?? null,
    name
  )
  expect(id, `seed missing "${name}" — run \`npm run seed:demo\``).not.toBeNull()
  await picker.selectOption(id!)
  await expect(page).toHaveURL(/student=/, { timeout: 15_000 })
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 30_000 })
}

const cardsToggle = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /^(show|hide) cards$/i })

test("the cards toggle exists only once a single student is chosen", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)

  // All students: no control, because there is nothing it could honestly show.
  await expect(cardsToggle(page)).toHaveCount(0)

  await chooseAStudent(page)
  await expect(cardsToggle(page)).toHaveCount(1)

  /**
   * And it opens CLOSED. The tab's question is where the cohort has been; a
   * margin already full of cards answers a different one before being asked.
   * This is also what keeps the two tests above true — they assert no cards
   * are on screen, and they would go on passing for the wrong reason if the
   * default here ever flipped.
   */
  await expect(cardsToggle(page)).toHaveText(/show cards/i)
  await expect(page.locator(".pdf-railcard")).toHaveCount(0)
})

test("the cards it shows are the student's, and nothing on them writes", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)
  await chooseAStudent(page)

  await cardsToggle(page).click()
  await expect(page.locator(".pdf-railcard").first()).toBeVisible({ timeout: 25_000 })
  await expect(cardsToggle(page)).toHaveText(/hide cards/i)

  /**
   * NOT ONE WRITE AFFORDANCE. These cards are another person's work shown to
   * staff, and every handler that would change them is withheld at the call
   * site rather than hidden with CSS — the rail draws an affordance only where
   * its handler exists (ConceptRail), so an absent button is the gate itself.
   *
   * `readOnly` could not be the gate: that flag is Open Loom's, and it is
   * false for a faculty member reading their own Heatmaps tab
   * (src/app/layout.tsx passes `readOnly={!!viewing}`). A spec that assumed
   * otherwise would pass while the affordances were live.
   */
  const rails = page.locator(".pdf-railcard")
  await expect(rails.locator("[data-cardmenu]")).toHaveCount(0)
  await expect(rails.locator("textarea, [contenteditable='true']")).toHaveCount(0)
  await expect(rails.getByRole("button", { name: "+", exact: true })).toHaveCount(0)

  // And it puts them away again.
  await cardsToggle(page).click()
  await expect(page.locator(".pdf-railcard")).toHaveCount(0)
})

/**
 * WHAT THE LEGEND CLAIMS, in the case that exposed it.
 *
 * With one student chosen the bar read "1 of 1 marked · 4 passages" and
 * "1 people": a fraction that can only ever be 1 of 1, and a plural for one
 * person. Both were on screen for every single-student view.
 *
 * "students" rather than "people" is not a synonym chosen for tone — peers are
 * matched positively on role LEARNER (actions/overlays.ts), so faculty and
 * instructors are not in the number and the word says so.
 */
test("the legend counts students, and says it in the singular", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)
  const bar = page.locator(".pdf-overlay-bar")

  /**
   * NO TRAILING WORD BOUNDARY. The bar is a flex row of separate spans, so
   * innerText runs them together: the scale's "1" cap, the swatches and the
   * top cap read as "...33 passages18 students4 not placed". A  after
   * "students" would sit between "s" and "4" -- two word characters, so no
   * boundary at all, and the assertion failed on text that was correct.
   */
  // The cohort: a fraction worth reading, and a plural that is true.
  await expect(bar).toContainText(/\d+ of \d+ marked/)
  await expect(bar).toContainText(/\d+ students/i)

  await chooseAStudent(page)
  await expect(bar).toContainText(/1 student/i)
  // Not "1 students", and not the tautology.
  await expect(bar).not.toContainText(/1 students/i)
  await expect(bar).not.toContainText(/of 1 marked/i)
  // The word it used to use for a count that was never people.
  await expect(bar).not.toContainText(/people/i)
})

/**
 * THE REQUEST IS ABOUT ONE STUDENT.
 *
 * A plain on/off survived a change of student, because the picker re-renders
 * this viewer without remounting it — so choosing a second student showed
 * THEIR cards under a button reading "hide cards" that nobody had pressed.
 * Caught in review on PR #32 and confirmed on the running app before the fix.
 */
test("cards asked for one student are not shown for the next", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)
  await chooseAStudent(page)
  await cardsToggle(page).click()
  await expect(page.locator(".pdf-railcard").first()).toBeVisible({ timeout: 25_000 })

  // A different student: their cards must not be on screen unasked.
  await chooseAStudent(page, "Test User C")
  await expect(cardsToggle(page)).toHaveText(/show cards/i, { timeout: 25_000 })
  await expect(page.locator(".pdf-railcard")).toHaveCount(0)
})

/**
 * ONE STUDENT IS THE TOP OF THEIR OWN SCALE (TJ, 2026-08-24: "i think when the
 * heatmap is showing one student, this should be the darkest of the ramp, this
 * appears to be the lightest").
 *
 * Both a lone student and a whole cohort who never agreed arrive as maxCount 1,
 * and they mean opposite things. Many people who never converged is a question
 * answered "none" — the faintest step. One person has no convergence question
 * at all: every run they marked carries the whole band. The peer count is what
 * tells the two apart (heatRects.heatBand).
 */
test("one student's marks are drawn at the darkest step, not the faintest", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)
  await chooseAStudent(page)

  const drawn = page.locator(".pdf-kept-heat rect")
  await expect(drawn.first()).toBeVisible({ timeout: 25_000 })

  // Every mark at the top step, because every run is the densest run.
  const bands = await drawn.evaluateAll((els) =>
    Array.from(new Set(els.map((el) => el.getAttribute("data-heat"))))
  )
  expect(bands).toEqual(["5"])

  /**
   * And the legend agrees: one swatch, and it is the dark end. Two swatch
   * counts of one exist and they draw opposite ends — which one is showing is
   * how a reader tells the two cases apart, so asserting "one swatch" alone
   * would pass on the faint one this replaced.
   */
  const swatches = page.locator(".pdf-overlay-scale i")
  await expect(swatches).toHaveCount(1)
  await expect(swatches.first()).toHaveAttribute("data-heat", "5")
  // No low end to name when one swatch is the whole scale.
  await expect(page.locator(".pdf-overlay-scale .cap")).toHaveCount(1)
  await expect(page.locator(".pdf-overlay-bar")).toContainText(/1 student/i)
})

/**
 * THE STUDENT PICKER READS IN ORDER (TJ, 2026-08-24: "the student dropdown
 * should be in alphabetical order. keep all students at the top").
 *
 * It followed whatever order the roster query returned — neither alphabetical
 * nor stable enough to learn, which makes a picker of sixty names one you
 * scroll twice.
 */
test("the student picker is alphabetical, with All students held at the top", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)
  const picker = page.getByLabel("Select active student")
  await expect(picker).toBeVisible({ timeout: 20_000 })

  const names = await picker.locator("option").evaluateAll((opts) =>
    (opts as HTMLOptionElement[]).map((o) => (o.textContent ?? "").trim())
  )
  expect(names.length, "the seed must place students in this course").toBeGreaterThan(2)

  // The scope you come back to, not one of the people — so it does not sort.
  expect(names[0]).toBe("All students")

  const people = names.slice(1)
  const inOrder = [...people].sort((a, b) => a.localeCompare(b))
  expect(people).toEqual(inOrder)
})

/**
 * THE STRIP'S SECTION IS THE HEAT'S SECTION (TJ, 2026-08-25: "selecting a
 * section seems to have no effect, why? is there not a test for this?").
 *
 * There was not, which is why it survived. AdminNav declared `section: true`
 * for this page and the value reached the margin cards alone — the heat went
 * on drawing the whole cohort while the strip said Faculty. The page's own
 * comment asserted the opposite, which is how it stayed invisible.
 *
 * The peer DENOMINATOR is what proves it: "8 of 13 marked" unscoped against
 * "8 of 8 marked" in a section is the query having been narrowed. Counting
 * rects would not — a section whose members made every mark draws the same
 * rectangles either way.
 */
test("choosing a section narrows the heat, not just the margin", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)
  const bar = page.locator(".pdf-overlay-bar")
  await expect(bar).toBeVisible({ timeout: 25_000 })

  const peersOf = async () => {
    const text = await bar.innerText()
    const match = /(\d+)\s+of\s+(\d+)\s+marked/.exec(text.replace(/\s+/g, " "))
    return match ? Number(match[2]) : NaN
  }
  const whole = await peersOf()
  expect(whole, "the cohort band must report a denominator").toBeGreaterThan(1)

  // A section the seed actually populates, so the comparison is meaningful.
  const picker = page.getByLabel("Select active section")
  const section = await picker.locator("option").evaluateAll((opts) =>
    (opts as HTMLOptionElement[]).find((o) => o.value && /section 1/i.test(o.textContent ?? ""))?.value ?? null
  )
  expect(section, "seed missing Section 1 — run `npm run seed:demo`").not.toBeNull()
  await picker.selectOption(section!)
  await expect(page).toHaveURL(/section=/, { timeout: 15_000 })
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 30_000 })
  await expect(bar).toBeVisible({ timeout: 25_000 })

  /**
   * The two controls agree FIRST, and that half is synchronous: the Overlay
   * picker renders with the scoped section and offers only it, since listing
   * every section again is the second control that let the strip and the
   * drawing disagree in the first place.
   */
  const overlay = page.getByLabel("Which section to compare")
  await expect(overlay).toHaveValue(section!, { timeout: 20_000 })
  // Off, and that section. "All sections" is not offered here: beside a strip
  // reading Section 1 it is the disagreement itself, one click away.
  await expect(overlay.locator("option")).toHaveCount(2)
  await expect(overlay.locator('option[value="all"]')).toHaveCount(0)

  /**
   * The denominator follows asynchronously — the overlay refetches after the
   * page settles, so reading it once races that request. Polled rather than
   * waited on with a clock, for the reason pdf-viewer.spec.ts learned the
   * hard way.
   */
  await expect
    .poll(peersOf, {
      timeout: 25_000,
      message: "the section's band never became smaller than the whole cohort's",
    })
    .toBeLessThan(whole)
})

/**
 * A CHOSEN STUDENT OUTRANKS THE SECTION SCOPE.
 *
 * The gap this closes was opened by the commit above it. Deriving the band
 * from the page's scope was written as "any band, once scoped, is the section
 * band", which is right for the cohort band and silently wrong for the third
 * one: choosing a name sets the band to "student", the scope rewrote it back
 * to "section", and the wash showed the section while the strip named a
 * person. Every spec passed, because none of them had ever put a section and
 * a student on screen together (Copilot caught it in review on #36).
 *
 * THE PEER DENOMINATOR IS THE TELL, again, and for a new reason: the bar
 * suppresses the fraction below two peers, since "1 of 1 marked" is a
 * tautology when the band IS one person. So the section band SHOWS "8 of 8
 * marked" and the student band shows no fraction at all — and before the fix,
 * choosing a student left the fraction on screen, because the query was still
 * the section's.
 */
test("with a section scoped, the wash still follows a chosen student", async ({ page }) => {
  await openHeatmaps(page, SEEDED_WITH_MARKS)
  const bar = page.locator(".pdf-overlay-bar")
  await expect(bar).toBeVisible({ timeout: 25_000 })
  const fraction = () => bar.innerText().then((t) => /\d+\s+of\s+\d+\s+marked/.test(t.replace(/\s+/g, " ")))

  const sections = page.getByLabel("Select active section")
  const section = await sections.locator("option").evaluateAll((opts) =>
    (opts as HTMLOptionElement[]).find((o) => o.value && /section 1/i.test(o.textContent ?? ""))?.value ?? null
  )
  expect(section, "seed missing Section 1 — run `npm run seed:demo`").not.toBeNull()
  await sections.selectOption(section!)
  await expect(page.getByLabel("Which section to compare")).toHaveValue(section!, { timeout: 20_000 })
  await expect.poll(fraction, { timeout: 25_000, message: "the section band must report a fraction" }).toBe(true)

  // Somebody from that section — the student picker follows the section, so
  // whoever is offered here is in it.
  const students = page.getByLabel("Select active student")
  const student = await students.locator("option").evaluateAll(
    (opts) => (opts as HTMLOptionElement[]).find((o) => o.value)?.value ?? null
  )
  expect(student, "seed missing a student in Section 1 — run `npm run seed:demo`").not.toBeNull()
  await students.selectOption(student!)
  await expect(page).toHaveURL(/student=/, { timeout: 20_000 })

  /**
   * THE SETTLED BAR, MATCHED POSITIVELY — and that difference is the whole
   * assertion.
   *
   * Written first as "poll until the fraction is ABSENT", which passed against
   * the bug it was written for: the refetch puts "reading that section…" on
   * the bar for a frame, that frame carries no fraction, and a poll for an
   * absence latches onto it and goes green while the wash settles back to the
   * section. It is the trap pair-and-throw.spec.ts documents, in a new place.
   *
   * So this matches a shape only the settled student band can produce — the
   * ramp legend reads "1 STUDENT", because the band is one person, where the
   * section band reads "1 … 8 STUDENTS". Measured live at 1536: fixed, the bar
   * reads "5 passages · 1 STUDENT"; against the bug it reads "8 of 8 marked ·
   * 22 passages · 1 · 8 STUDENTS", which never matches however long it polls.
   */
  await expect
    .poll(() => bar.innerText().then((text) => text.replace(/\s+/g, " ").trim()), {
      timeout: 25_000,
      message: "the wash is still the section's — a chosen student must be the band",
    })
    .toMatch(/passages? 1 STUDENT$/)
  expect(await fraction(), "one person is not a fraction of a cohort").toBe(false)

  // And back. Clearing the picker returns to the section, not to the whole
  // cohort and not to nothing — the scope is still on.
  await students.selectOption("")
  await expect
    .poll(fraction, { timeout: 25_000, message: "clearing the student must restore the section band" })
    .toBe(true)
  await expect(page.getByLabel("Which section to compare")).toHaveValue(section!)
})
