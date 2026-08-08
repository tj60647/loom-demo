/**
 * The student Overlays (P3.14, ruling 28): the read-only comparison of your
 * marks with your discussion section's and your cohort's.
 *
 * Runs as Test User A. Relies on `npm run seed:demo`, which now seeds two
 * colleagues — Test User C and Test User D, both in A's Section 1 — who each
 * captured the SAME passage A did on each reading plus one of their own, and
 * who share two labels between them. Without them every assertion below would
 * pass against an empty comparison, which is exactly the failure this spec
 * exists to catch.
 *
 * Read-only throughout: nothing here writes, so it needs no cleanup.
 */
import { test, expect, type Page } from "@playwright/test"

test.use({ storageState: "playwright/.auth/testa.json" })
test.beforeEach(() => test.setTimeout(120_000))

const READING = "Object Worlds"

async function loomLoaded(page: Page) {
  await expect(page.getByText("Loading your loom...")).toHaveCount(0, { timeout: 20_000 })
}

/**
 * Open a reading's workbench, found by title on the shelf but entered by URL.
 *
 * Deliberately NOT a click on the card. Entering a reading by client-side
 * navigation leaves the App Router's canonical URL on `/` about half the time,
 * and the next server function then POSTs to `/` and the router replaces the
 * workbench with the library — a pre-existing fault (the reading's own search
 * reproduces it identically; see scripts/repro-action-bounce.mjs and
 * NEXT_SESSION.md). Going in by href takes that coin toss out of a spec that
 * is about overlays; every test below still asserts it is standing on the
 * reading when it finishes, so a bounce can never be mistaken for a pass.
 */
async function openReadingByHref(page: Page, title: string) {
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: title }).first()
  await expect(card, "seed missing — run `npm run seed:demo` first").toBeVisible({ timeout: 15_000 })
  const href = await card.locator(".shelfmain").getAttribute("href")
  expect(href, "the reading card has no link").toBeTruthy()
  await page.goto(href!)
  await expect(page).toHaveURL(/\/reading\//, { timeout: 15_000 })
  await loomLoaded(page)
}

test("the passages overlay shades the section's marks, deepest where they agree", async ({ page }) => {
  await openReadingByHref(page, READING)
  await page.locator("nav button", { hasText: "Reading" }).click()
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 20_000 })

  // Off until asked for: the page is the student's own first.
  await expect(page.locator(".loom-overlay-heat")).toHaveCount(0)

  await page.getByRole("group", { name: "Compare your marks with others" })
    .getByRole("button", { name: "Section" })
    .click()

  const bar = page.locator(".pdf-overlay-bar")
  await expect(bar).toBeVisible({ timeout: 20_000 })
  // Counted in people, and the denominator is stated so a count is readable.
  await expect(bar).toContainText(/\d+ of \d+ in your section (has|have) marked this reading/, {
    timeout: 20_000,
  })
  await expect(bar).toContainText("counted, not judged · no names")

  // The shading itself. Which page carries it depends on where the seed's
  // sentence picker landed, so walk the spreads — but WAIT on each one before
  // turning past it. The marks are applied from a MutationObserver a tick
  // after the data lands, so a bare count() on arrival reads zero on the very
  // page that has them, and an eager walk turns past the answer.
  const heat = page.locator(".loom-overlay-heat")
  let shaded = false
  for (let spread = 0; spread < 6 && !shaded; spread += 1) {
    shaded = await heat
      .first()
      .waitFor({ state: "visible", timeout: 6_000 })
      .then(() => true, () => false)
    if (shaded) break
    const next = page.getByRole("button", { name: "Next Page" })
    if (!(await next.isEnabled())) break
    await next.click()
  }
  expect(shaded, "no page of this reading shows the section's marks").toBe(true)

  // Two colleagues captured the same span, so that run is one shade deeper
  // than a span only one of them marked. This is the whole point of a heatmap
  // — a per-span count that never resolves to a person.
  await expect(page.locator('.loom-overlay-heat[data-heat="2"]').first()).toBeVisible({
    timeout: 15_000,
  })
  // The comparison is never a door into anybody: no names, and no handlers.
  await expect(heat.first()).toHaveAttribute("aria-hidden", "true")

  // Turning it off takes the wash away and leaves the reading as it was.
  await page.getByRole("group", { name: "Compare your marks with others" })
    .getByRole("button", { name: "Section" })
    .click()
  await expect(page.locator(".pdf-overlay-bar")).toHaveCount(0)
  await expect(page.locator(".loom-overlay-heat")).toHaveCount(0, { timeout: 15_000 })
  // Asking for a comparison must never cost you your place in the reading.
  await expect(page).toHaveURL(/\/reading\//)
  await expect(page.locator(".pdf-shell")).toBeVisible()
})

test("the vocabulary overlay counts a word by people, and names nobody", async ({ page }) => {
  await openReadingByHref(page, READING)
  await page.locator("nav button", { hasText: "Vocabulary" }).click()

  const panel = page.locator(".card", { hasText: "What others named" })
  await expect(panel).toBeVisible({ timeout: 15_000 })
  // Nothing is compared until asked.
  await expect(panel).toContainText("Nothing is compared until you ask")

  await panel.getByRole("button", { name: "My section" }).click()
  await expect(panel).toContainText(/\d+ of \d+ in your section/, { timeout: 20_000 })

  // Both colleagues reached for this label, so it counts two PEOPLE — not the
  // four rows their passages make.
  const shared = panel.locator(".readitem", { hasText: "object world talk" })
  await expect(shared.first()).toBeVisible({ timeout: 15_000 })
  await expect(shared.first()).toContainText("2 people")

  // Link Labels come across too, with their descriptions.
  const link = panel.locator(".readitem", { hasText: "makes possible" })
  await expect(link.first()).toBeVisible()
  await expect(link.first()).toContainText("2 people")

  // Anonymous by construction: section and cohort are the only bands in v1.
  await expect(panel).not.toContainText("Test User")
  // And the margin never travels — notes, questions and tiers stay private.
  await expect(panel).toContainText("counted, not judged")
  await expect(page).toHaveURL(/\/reading\//)
})

test("the gate holds: a reading you have not coded refuses the comparison", async ({ page }) => {
  await page.goto("/")
  await loomLoaded(page)

  // A card the student has captured nothing from says so on its tally, which
  // is how this spec finds one without hard-coding a title that may be
  // rescheduled or archived out of the course.
  const uncoded = page
    .locator(".shelfcard")
    .filter({ has: page.getByText("nothing captured here yet") })
    .first()
  await expect(uncoded, "every reading is coded — seed a fresh library to test the gate")
    .toBeVisible({ timeout: 15_000 })
  const href = await uncoded.locator(".shelfmain").getAttribute("href")
  await page.goto(href!)
  await expect(page).toHaveURL(/\/reading\//, { timeout: 15_000 })
  await loomLoaded(page)

  await page.locator("nav button", { hasText: "Vocabulary" }).click()
  const panel = page.locator(".card", { hasText: "What others named" })
  await panel.getByRole("button", { name: "My section" }).click()

  await expect(panel).toContainText("Your marks first", { timeout: 20_000 })
  await expect(panel).toContainText("The crowd must not pre-code the text")
  // And nothing of anyone else's leaked in alongside the refusal.
  await expect(panel.locator(".readitem")).toHaveCount(0)
  await expect(page).toHaveURL(/\/reading\//)
})
