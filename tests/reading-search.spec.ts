/**
 * Search, both sizes: across the shelf ("which reading says this?") and
 * inside one reading ("where does it say it?").
 *
 * Runs as the seeded learner (Test User A), whose course includes "Object
 * Worlds" — asserted by the journey suite, so this spec leans on the same
 * fixture. Search is read-only: nothing to clean up.
 */
import { test, expect } from "@playwright/test"
import { enterReadingFromCard } from "./helpers"

test.use({ storageState: "playwright/.auth/testa.json" })
// Dev-server compile latency puts several 15s waits in sequence.
test.beforeEach(() => test.setTimeout(120_000))

test("the shelf search finds a reading and stands in for the shelf while live", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator(".shelfcard").first()).toBeVisible({ timeout: 15_000 })

  // The search field is PERSISTENT on wide screens (TJ, 2026-08-10) — no
  // toggle to click; the labelled bar simply sits under the title, and its
  // name says how far it reaches.
  const box = page.getByRole("searchbox", { name: "Search your loom — readings, cloths, projections, concepts, link labels and passages" })
  await expect(box).toBeVisible()
  await expect(page.locator(".searchbar label", { hasText: "Search" })).toBeVisible()
  await box.fill("object worlds")

  // A hit card names the reading and says where it matched.
  const hit = page.locator(".searchhit", { hasText: "Object Worlds" }).first()
  await expect(hit).toBeVisible({ timeout: 15_000 })
  await expect(hit.locator(".searchwhere")).toBeVisible()

  // While the query is live the results own the page — no week rows behind them.
  await expect(page.locator(".weekhead")).toHaveCount(0)

  // Clearing the box puts the shelf back.
  await box.fill("")
  await expect(page.locator(".searchhit")).toHaveCount(0)
  await expect(page.locator(".shelfcard").first()).toBeVisible({ timeout: 15_000 })

  // A hit is a door to the text itself — 00 · Reading, not 01 · Open — and
  // the query rides along: the reading's own search opens pre-filled, so the
  // trail of marks continues into the text.
  await box.fill("object worlds")
  const doorway = page.locator(".searchhit", { hasText: "Object Worlds" }).first()
  await expect(doorway).toBeVisible({ timeout: 15_000 })
  await doorway.click()
  await expect(page).toHaveURL(/\/reading\/[^?]+\?tab=reading&q=object(%20|\+)worlds/, { timeout: 15_000 })
  await expect(page.locator("nav button.active", { hasText: "Reading" })).toBeVisible({ timeout: 15_000 })
  const inReading = page.getByRole("searchbox", { name: "Search this reading for a word or phrase" })
  await expect(inReading).toBeVisible({ timeout: 15_000 })
  await expect(inReading).toHaveValue("object worlds")
  await expect(page.locator(".pdf-search-hit").first()).toBeVisible({ timeout: 15_000 })

  // Regression guard for the shelf bounce (NEXT_SESSION 08-07): the search
  // that just ran is a read made after a client-side entry, and it used to be
  // answered with the library half the time. Still standing in the reading IS
  // the assertion.
  await expect(page).toHaveURL(/\/reading\//)
})

test("search inside a reading lists matching pages and marks the words on the text", async ({ page }) => {
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(card).toBeVisible({ timeout: 15_000 })
  // Same trap tests/helpers.ts documents: clicking during the tally
  // re-render detaches the card mid-click.
  await expect(card.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })
  await enterReadingFromCard(page, card)
  await expect(page).toHaveURL(/\/reading\//, { timeout: 15_000 })

  // Tab 00 — the text itself.
  await page.locator("nav button", { hasText: "Reading" }).click()
  await expect(page.locator("text=Loading PDF...")).toBeHidden({ timeout: 15_000 })

  await page.getByRole("button", { name: "Search this reading" }).click()
  const box = page.getByRole("searchbox", { name: "Search this reading for a word or phrase" })
  await expect(box).toBeVisible()
  await box.fill("object")

  // Hits arrive in page order, each with a marked snippet.
  const hits = page.locator(".pdf-search-hit")
  await expect(hits.first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator(".pdf-search-snip .snipmark").first()).toBeVisible()

  // Clicking a hit lands on its page with the words marked on the text layer.
  await hits.first().click()
  await expect(page.locator(".loom-search-hit").first()).toBeVisible({ timeout: 15_000 })

  // Closing the panel takes the marks with it.
  await page.getByRole("button", { name: "Close search" }).click()
  await expect(page.locator(".pdf-search-hit")).toHaveCount(0)
  await expect(page.locator(".loom-search-hit")).toHaveCount(0, { timeout: 15_000 })

  // Regression guard for the shelf bounce: this test enters by clicking the
  // card and then searches — exactly the sequence that used to bounce to the
  // library about half the time.
  await expect(page).toHaveURL(/\/reading\//)
})
