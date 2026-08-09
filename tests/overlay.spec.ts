/**
 * The Overlays (ruling 28): the read-only comparison of a section's or the
 * cohort's marks.
 *
 * **Faculty and admins only** (TJ, 2026-08-08). They were student-facing when
 * built; they are not now, so this runs as **Test Faculty** and the last test
 * asserts a learner is offered nothing at all.
 *
 * Relies on `npm run seed:demo`, which seeds Test Users A, C and D with
 * overlapping captures and shared labels — without them every assertion here
 * would pass against an empty comparison, which is the failure this spec
 * exists to catch. Note the COHORT band is the one under test: a faculty
 * viewer sits in the Faculty Section, and `peersOf` excludes faculty, so their
 * "section" is structurally empty — see the note in NEXT_SESSION.md.
 *
 * Read-only throughout: nothing here writes, so it needs no cleanup.
 */
import { test, expect, type Page } from "@playwright/test"
import { enterReadingFromCard } from "./helpers"

test.use({ storageState: "playwright/.auth/faculty.json" })
test.beforeEach(() => test.setTimeout(120_000))

const READING = "Object Worlds"

async function loomLoaded(page: Page) {
  await expect(page.getByText("Loading your loom...")).toHaveCount(0, { timeout: 20_000 })
}

/**
 * Open a reading's workbench, found by title on the shelf but entered by URL.
 *
 * Deliberately NOT a click on the card. This entry was chosen while the shelf
 * bounce was live (client-side entry left the router's canonical URL on `/`
 * about half the time, and the next server function POST bounced the student
 * to the library). That fault is fixed — client reads now go through
 * src/lib/reads.ts, off the action queue, and tests/reading-search.spec.ts
 * guards the click-entry path — but href entry stays here: this spec is about
 * overlays, and the end-of-test still-on-the-reading assertions below keep
 * their meaning either way.
 */
async function openReadingByHref(page: Page, title: string) {
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: title }).first()
  await expect(card, "seed missing — run `npm run seed:demo` first").toBeVisible({ timeout: 15_000 })
  // Whichever door the card offers: since 2026-08-08 an unclothed reading has
  // no link at all, only Create Cloth. (The name is historical — entering by
  // href was how this spec dodged the navigation bounce, which is now fixed.)
  await enterReadingFromCard(page, card)
  await loomLoaded(page)
}

test("the passages overlay shades the section's marks, deepest where they agree", async ({ page }) => {
  await openReadingByHref(page, READING)
  await page.locator("nav button", { hasText: "Reading" }).click()
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 20_000 })

  // Off until asked for: the page is the student's own first.
  await expect(page.locator(".loom-overlay-heat")).toHaveCount(0)

  await page.getByLabel("Which section to compare").selectOption({ label: "All sections" })

  const bar = page.locator(".pdf-overlay-bar")
  await expect(bar).toBeVisible({ timeout: 20_000 })
  // Counted in people, and the denominator is stated so a count is readable.
  await expect(bar).toContainText(/\d+ of \d+ in (that section|the cohort) (has|have) marked this reading/, {
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

  // Several people captured the same span, so that run is shaded deeper than
  // one only a single person marked. This is the whole point of a heatmap — a
  // per-span count that never resolves to a person.
  //
  // Depth, not an exact number: the seed has A, C and D on the same passage,
  // and how many of them are peers depends on who is looking (the viewer is
  // always excluded). Pinning "2" broke the moment this spec became a faculty
  // viewer, for whom A is a peer too.
  await expect(
    page.locator('.loom-overlay-heat[data-heat="2"], .loom-overlay-heat[data-heat="3"], .loom-overlay-heat[data-heat="4"]').first()
  ).toBeVisible({ timeout: 15_000 })
  // The comparison is never a door into anybody: no names, and no handlers.
  await expect(heat.first()).toHaveAttribute("aria-hidden", "true")

  // Turning it off takes the wash away and leaves the reading as it was.
  await page.getByLabel("Which section to compare").selectOption("off")
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

  await panel.getByLabel("Which section to compare").selectOption({ label: "All sections" })
  await expect(panel).toContainText(/\d+ of \d+ in (that section|the cohort)/, { timeout: 20_000 })

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

test.describe("a student is offered no comparison at all", () => {
  test.use({ storageState: "playwright/.auth/testa.json" })

  test("neither control is drawn, on the text or in Vocabulary", async ({ page }) => {
    // Overlays became faculty/admin-only (TJ, 2026-08-08). The old per-reading
    // capture gate went with them: it existed so the crowd could not pre-code a
    // student's reading, and there is no student reading one now.
    await openReadingByHref(page, READING)
    await page.locator("nav button", { hasText: "Reading" }).click()
    await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 20_000 })
    await expect(page.getByLabel("Which section to compare")).toHaveCount(0)

    await page.locator("nav button", { hasText: "Vocabulary" }).click()
    await expect(page.locator(".card", { hasText: "What others named" })).toHaveCount(0)
    // And their own holdings are untouched — this removed a comparison, not a tab.
    await expect(page.locator(".lrow[data-concept-id]").first()).toBeVisible({ timeout: 15_000 })
  })
})
