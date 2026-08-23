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
 * "section" is structurally empty (`peersOf` counts LEARNER rows only, and a
 * faculty viewer sits in the Faculty Section — src/actions/overlays.ts).
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
 * Open a reading's workbench by clicking its shelf card (via
 * enterReadingFromCard, like every other spec). The NAME is historical: this
 * used to enter by composed href, chosen while the shelf bounce was live
 * (client-side entry left the router's canonical URL on `/` about half the
 * time). That fault is fixed — client reads go through src/lib/reads.ts, off
 * the action queue — and the body now clicks the card like a student does.
 */
async function openReadingByHref(page: Page, title: string) {
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: title }).first()
  await expect(card, "seed missing — run `npm run seed:demo` first").toBeVisible({ timeout: 15_000 })
  // The card is the one door (TJ, 2026-08-08) — no Create Cloth button
  // exists; entering opens the cloth, minting it on first entry.
  await enterReadingFromCard(page, card)
  await loomLoaded(page)
}

/**
 * THE READING STATION OFFERS NO OVERLAY AT ALL, ruled 2026-08-23 (TJ: "the
 * overlay view should only be available in the heatmap, not in reading").
 *
 * This test used to be the opposite: it drove the picker in the reading
 * toolbar and asserted the wash it produced. That behaviour is gone, and what
 * replaced it is asserted on the tab that owns it now — tests/heatmap.spec.ts
 * carries the shading, the depth and the scale.
 *
 * Worth keeping as a test rather than deleting, because the picker was the
 * ONLY way to turn an overlay on: with it gone from here, no heat can be
 * fetched or drawn on the reading station, and that is the claim.
 */
test("no overlay is offered on the reading station, not even to faculty", async ({ page }) => {
  await openReadingByHref(page, READING)
  await page.locator("nav button.station", { hasText: "Reading" }).click()
  await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 20_000 })

  // The control is gone…
  await expect(page.getByLabel("Which section to compare")).toHaveCount(0)
  await expect(page.locator(".pdf-overlay-ctl")).toHaveCount(0)

  // …and with it the only door to the wash, so neither the heat nor the bar
  // that explains it can appear here.
  await expect(page.locator(".loom-overlay-heat")).toHaveCount(0)
  await expect(page.locator(".pdf-overlay-bar")).toHaveCount(0)

  // The reading itself is untouched — this removed a comparison, not a tool.
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
    await page.locator("nav button.station", { hasText: "Reading" }).click()
    await expect(page.getByText("Loading PDF...")).toBeHidden({ timeout: 20_000 })
    await expect(page.getByLabel("Which section to compare")).toHaveCount(0)

    await page.locator("nav button", { hasText: "Vocabulary" }).click()
    await expect(page.locator(".card", { hasText: "What others named" })).toHaveCount(0)
    // And their own holdings are untouched — this removed a comparison, not a tab.
    await expect(page.locator(".lrow[data-concept-id]").first()).toBeVisible({ timeout: 15_000 })
  })
})
