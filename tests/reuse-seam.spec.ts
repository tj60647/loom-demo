import { test, expect } from "@playwright/test"
import { cardOwnReading } from "./helpers"

/**
 * The seam between readings — naming a concept you already named somewhere else.
 *
 * Ruled by TJ, 2026-08-09. Three capture paths used to disagree: naming ahead
 * of evidence asked, hand capture asserted "it is one concept, not two", and
 * capture from the PDF said nothing at all. They now all render `ReuseOffer`,
 * which reports the reuse and offers the way out.
 *
 * Guarded here because the interesting half is INVISIBLE to a type-checker and
 * to every other spec: the offer must appear when the concept was met in
 * ANOTHER reading and must NOT appear when it was only ever met in this one.
 * Both are label-and-scope arithmetic that compiles fine when wrong.
 *
 * Labels are unique per run. Test User A's graph is shared with the rest of the
 * suite and accumulates across runs, so a fixed label would pass once and then
 * describe a different situation forever after.
 */

test.use({ storageState: "playwright/.auth/testa.json" })

const unique = (stem: string) => `${stem} ${Date.now().toString().slice(-6)}`

/**
 * Type a passage into whichever CARDED reading is open. Asserts it landed.
 *
 * Typing is offered only on a reading with no PDF since 2026-08-13 (TJ), so
 * these tests card their own books rather than borrowing a seeded reading —
 * there is no Your work sheet here, and no fold: the capture form is the page.
 */
async function captureByHand(page: import("@playwright/test").Page, label: string, gloss = "") {
  await page.locator("#bText").fill(`A passage supporting ${label}.`)
  // By placeholder, not nth(): three inputs on this station share the concept
  // datalist — the capture form's, the refile row inside an opened log row, and
  // "the concept you are looking for". Only this one has this placeholder.
  await page.getByPlaceholder("e.g. boundary objects · satisficing · valence").fill(label)
  if (gloss) {
    await page.locator(".form-row", { hasText: "Description — the concept in your own words" })
      .locator("input").fill(gloss)
  }
  await page.getByRole("button", { name: "Add passage" }).click()
  // Wait for the write to LAND, not just for the click. `handleAddPassage`
  // clears the passage box only after `addPassage` resolves, so an empty
  // #bText is the first honest sign the round trip finished. Without this the
  // next `openReading` navigates mid-save and the capture never persists —
  // which fails the test two steps later, as "no seam appeared", for a reason
  // nothing on screen would explain.
  await expect(page.locator("#bText")).toHaveValue("", { timeout: 20000 })
}

test("a concept met only in THIS reading raises no seam", async ({ page }) => {
  const label = unique("single reading concept")
  const book = unique("a carded book")
  await cardOwnReading(page, book)

  await captureByHand(page, label)
  await expect(page.locator(".seam")).toHaveCount(0)

  // A second passage under the same concept, still in the same reading, is not
  // ambiguous either — this is the case that would fire if the trigger were
  // "the label already exists" rather than "met in another reading".
  await captureByHand(page, label)
  await expect(page.locator(".seam")).toHaveCount(0)
})

test("the same concept in a second reading offers the way out, and taking it splits them", async ({ page }) => {
  const label = unique("crossing concept")
  // Two carded books, because the seam is about meeting a concept in ANOTHER
  // reading and typing only happens on a reading with no PDF.
  const first = unique("first carded book")
  const second = unique("second carded book")

  await cardOwnReading(page, first)
  await captureByHand(page, label)

  // Same label, different reading — the only ambiguous case.
  await cardOwnReading(page, second)
  await captureByHand(page, label)

  const seam = page.locator(".seam")
  await expect(seam).toBeVisible({ timeout: 15000 })
  // It names the reading you met the concept in — the first book, not this one.
  await expect(seam).toContainText(first)
  // The ruling, in one assertion: it reports, it does not rule. The old copy
  // said "it is one concept, not two".
  await expect(seam).not.toContainText("not two")
  const offer = seam.getByRole("button", { name: /Make it a separate concept/i })
  await expect(offer).toBeVisible()

  await offer.click()
  await expect(seam).toHaveCount(0, { timeout: 20000 })

  // Two concepts now share the label, each holding one passage. Homonyms are a
  // ratified legal state; Vocabulary tells them apart by their passage counts.
  await expect
    .poll(
      async () =>
        page.evaluate(async (l) => {
          const d = await (await fetch("/api/loom", { cache: "no-store" })).json()
          const mine = (d.concepts ?? []).filter((c: { label: string }) => c.label === l)
          const held = (id: string) =>
            (d.passages ?? []).filter((p: { conceptIds?: string[] }) => (p.conceptIds ?? []).includes(id)).length
          return mine.map((c: { id: string }) => held(c.id)).sort()
        }, label),
      { timeout: 25000 }
    )
    .toEqual([1, 1])
})
