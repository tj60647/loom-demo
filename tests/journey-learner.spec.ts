/**
 * The learner journey, end to end, against the seeded demonstration account.
 *
 * Requires `npm run seed:demo` to have run: Test User A holds 8 concepts,
 * 10 passages from two readings, 6 threads and 2 projections, one per reading
 * ("Object worlds, sorted" and "A practice lens").
 * Every mutation this file makes, it removes again — the seeded data is
 * asserted, never changed.
 *
 * Station coverage this file adds over the older specs: 01 Open's by-hand
 * capture form, 02 Linking (previously untested entirely), 03 Vocabulary
 * (same), and per-reading projection assertions on 04.
 *
 * Everything here happens inside a reading. It used to reach several stations
 * through `/weave`, which was the whole-weave workbench; TJ retired that on
 * 2026-08-11 and a reading is now the only scope a student works in.
 *
 * Since 2026-08-08, 03 is the holdings tab and the cloth reflection it used to
 * hold lives on 04 — the 03 test asserts the words, the 04 test asserts the
 * prompts and the read.
 */
import { test, expect } from "@playwright/test"
import { cardOwnReading, deleteConceptInVocabulary, deletePassageInPassagesView, enterReadingFromCard, isDeletePost, removeOwnReading } from "./helpers"

test.use({ storageState: "playwright/.auth/testa.json" })

/**
 * The eight concepts `seed-demo.ts` gives Test User A. Named here so the
 * Vocabulary test can assert they are ALL present without also asserting that
 * nothing else on the account exists — which is a different claim, and one no
 * spec sharing an account can honestly make.
 */
const SEEDED_CONCEPTS = [
  "object worlds",
  "design as social process",
  "artifact as compromise",
  "community of practice",
  "legitimate peripheral participation",
  "reification",
  "negotiation of meaning",
  "shared vocabulary",
] as const

// Each test is independent and removes what it adds — no serial mode, so one
// failure never hides the rest of the journey. Dev-server compile latency puts
// several 15s waits in sequence, hence the generous per-test budget.
test.beforeEach(() => test.setTimeout(120_000))

const SENTENCE = "A journey-suite sentence: one sustains the other."

async function loomLoaded(page: import("@playwright/test").Page) {
  await expect(page.getByText("Loading your loom...")).toHaveCount(0, { timeout: 20_000 })
}

/** Open a reading's Knowledge Graph and make one of its projections active,
 *  regardless of what another spec left most-recently-updated. */
async function selectProjection(
  page: import("@playwright/test").Page,
  reading: string,
  name: string
) {
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: reading }).first()
  await enterReadingFromCard(page, card)
  await page.locator("nav button", { hasText: "Knowledge Graph" }).click()
  await expect(page.locator("#mapSwitcher")).toBeVisible({ timeout: 15_000 })
  const chip = page.locator("#mapSwitcher .chip", { hasText: name })
  await expect(chip.first(), "seed missing — run `npm run seed:demo` first").toBeVisible()
  await chip.first().click()
}

test("00 · the shelf shows the readings with the student's own tallies", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator(".shelfcard").first()).toBeVisible({ timeout: 15_000 })
  const tally = page.locator(".shelftally").first()
  await expect(tally).not.toHaveText("…", { timeout: 15_000 })
  // The seeded account is not empty: at least one card carries real counts.
  await expect(page.locator(".shelftally", { hasText: /[1-9]/ }).first()).toBeVisible()

  // "A reading of your own" leads with the PDF upload; a book or lecture can
  // still be carded without one (the title stays required in that case).
  await page.getByRole("button", { name: "+ a reading of your own" }).click()
  await expect(page.locator('input[type="file"]')).toBeVisible()
  await expect(page.getByPlaceholder("Plans and Situated Actions")).toBeVisible()
  await expect(page.getByRole("button", { name: "Add to my shelf" })).toBeDisabled()

  // The fixed footer must not eat the click: scroll the input into the
  // footer's own band and click raw coordinates, the way a mouse does —
  // "Choose file" silently did nothing there until the footer stopped
  // catching pointer events. (setInputFiles never clicks, so only a real
  // click catches this class of regression.)
  // Recompute the point on every attempt: cover images decoding late reflow
  // the shelf, and a coordinate snapshotted before the shift clicks where the
  // input used to be (same fix as the settings-dialog retry-past-hydration).
  await expect(async () => {
    const point = await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]')!
      const footer = document.querySelector("footer")!
      const main = document.querySelector("main")!
      main.scrollTop += input.getBoundingClientRect().top - (footer.getBoundingClientRect().top + 8)
      const rect = input.getBoundingClientRect()
      // Clear of the bottom-left corner: the Next dev-tools badge floats there
      // in dev builds (it appears whenever some resource 404s) and would eat
      // the click before the input — a different shield than the one under test.
      return { x: rect.left + Math.min(rect.width - 20, 260), y: rect.top + rect.height / 2 }
    })
    const chooser = page.waitForEvent("filechooser", { timeout: 3_000 })
    await page.mouse.click(point.x, point.y)
    await chooser
  }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 3_000] })

  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
})

test("01 · a passage typed into a carded reading lands in the coding log — and cleans up", async ({ page }) => {
  // Typing a passage is offered ONLY where there is nothing to select (TJ,
  // 2026-08-13) — a book or a lecture the library does not hold. Beside a PDF
  // it is gone: it was a fold at the foot of Your work, and it justified itself
  // with things you cannot type anyway (a diagram is a screen grab).
  //
  // Every seeded reading carries a file, so this cards its own. On that station
  // the capture form IS the page: no sheet to slide out, no fold to open.
  const ownBook = `A book carded by the journey suite ${Date.now().toString().slice(-6)}`
  await cardOwnReading(page, ownBook)
  await expect(page.locator("#bText")).toBeVisible({ timeout: 15_000 })

  await page.locator("#bText").fill("A passage typed by the journey suite, verbatim enough for the log.")
  await page.getByPlaceholder("e.g. boundary objects · satisficing · valence").fill("journey test concept")
  // By id, not by placeholder: since 2026-08-09 the Location field offers the
  // page you are actually on ("p. 11"), so the old literal never matched.
  await page.locator("#bLocation").fill("p. 999")
  await page.getByRole("button", { name: "Add passage" }).click()

  // No `#yourwork` here — that sheet belongs to the PDF station. On a carded
  // reading the log is a card on the page, and it is the only surface with rows.
  //
  // The log holds two views since 2026-08-17 and opens on PASSAGES — the right
  // landing for a student who has just captured one. This assertion is about a
  // CONCEPT row, so it says which view it wants.
  await page.locator(".segmented button", { hasText: "Concepts" }).click()
  const row = page.locator(".lrow", { hasText: "journey test concept" })
  await expect(row).toHaveCount(1, { timeout: 15_000 })

  // Cleanup through the product's own controls. Since 0021 a passage survives
  // its concept (P0.1) — remove the passage first so nothing unlabeled lingers,
  // then the concept. The optimistic UI clears instantly, so each delete's
  // server-action POST must be awaited: ending the test any earlier closes
  // the page and aborts the serially-queued fetches, and the "deleted" rows
  // resurface on the next load as residue.
  await row.locator(".lhead").click()
  const passageId = await row.locator("[data-passage-id]").first().getAttribute("data-passage-id")
  // The passage goes from the PASSAGES view — the concept view only unfiles.
  await deletePassageInPassagesView(page, passageId!)
  // 04 is the only station that deletes a concept since 2026-08-17.
  await deleteConceptInVocabulary(page, "journey test concept")

  // And the reading itself — the one mutation this file could not undo until
  // 2026-08-17, despite promising at the top that it undoes them all. Archived
  // rather than deleted, so this takes the card off the shelf and leaves the
  // row; see helpers' removeOwnReading.
  await removeOwnReading(page, ownBook)
})

test("02 · pick two, say the sentence, throw the thread, label the link — then unpick it all", async ({ page }) => {
  // Inside the reading, because linking works on the concepts a reading
  // evidences (TJ, 2026-08-08) — and since 2026-08-11 a reading is the only
  // scope there is. Both ends are Object Worlds' own, and the pair is one the
  // seed leaves uncrossed.
  await page.goto("/")
  await enterReadingFromCard(page, page.locator(".shelfcard", { hasText: "Object Worlds" }).first())
  await page.locator("nav button", { hasText: "Linking" }).click()
  await loomLoaded(page)

  const warp = page.locator(".crow")
  await expect(warp.first(), "seed missing — run `npm run seed:demo` first").toBeVisible({ timeout: 15_000 })
  // Picking is its own control since 2026-08-18: clicking the row OPENS the
  // concept card, as it does in Your work, and the "select" button loads it
  // into the bench. One tap used to do both, which is why a dot had to exist
  // to reach the card at all.
  await warp.filter({ hasText: "object worlds" }).first().getByRole("button", { name: /select/i }).click()
  await warp.filter({ hasText: "artifact as compromise" }).first().getByRole("button", { name: /select/i }).click()
  await expect(page.locator(".slot.filled")).toHaveCount(2)

  await page.getByPlaceholder("…or just start typing. Long and awkward is fine.").fill(SENTENCE)
  /* Wait for the create to land — see the note in link-object.spec.ts: the row
     is painted under a temporary id and re-keyed when the server answers, so a
     card opened inside that window remounts closed. */
  const thrown = page.waitForResponse(
    (res) => res.request().method() === "POST" && (res.request().postData() ?? "").includes("one sustains the other")
  )
  await page.getByRole("button", { name: "Throw it" }).click()
  await thrown

  // Anchor on the sentence, then take the CARD it belongs to by its own id.
  // This walked up with `.locator("..")` until 2026-08-18, which made the row's
  // internal shape a contract: any wrapper between the card's root and its
  // sentence silently re-pointed eight assertions at the wrapper. `.thread` and
  // `.sent` are still exactly where they were — this only stops the test caring
  // how far apart they sit (ThreadCard.tsx, docs/thread-card.md).
  const sent = page.locator(".sent", { hasText: "one sustains the other" })
  await expect(sent).toHaveCount(1, { timeout: 15_000 })
  const thread = sent.locator("xpath=ancestor::*[@data-edge-id][1]")
  await expect(thread, "the thread card must carry data-edge-id").toHaveCount(1)
  await expect(thread.locator(".pill", { hasText: "description" })).toBeVisible()

  // Coin a label on the new thread. THE CARD OPENS AND THE FIELD IS THERE
  // (TJ, 2026-08-19: "in the others isnt the description and label directly
  // editable?"). Until then this was two controls and a Save button — an "edit
  // label" toggle opening a fold — which made the thread the one object in the
  // set that did not edit the way a concept or a passage does. Clicking the
  // trip opens it, as clicking a concept's name opens its card, and the label
  // commits on blur with no button to press.
  await thread.locator(".trip").click()
  await thread.getByPlaceholder("your word… e.g. leads to · contradicts · is part of").fill("journey-term")
  // The blur IS the save. Clicking the column heading is a real click away.
  await page.locator("#threadList h2").first().click()
  await expect(thread.locator(".pill", { hasText: "label" }).first()).toBeVisible({ timeout: 15_000 })

  // Remove the thread; both concepts stay (they are seeded).
  await thread.locator(".rm", { hasText: "remove" }).click()
  // The row disappears optimistically while the server delete is still in
  // flight — and ending the test there closes the browser mid-action,
  // stranding the thread for the NEXT run (which then finds two and fails).
  // Hold for deleteEdge's own round-trip, then prove the delete stuck with a
  // fresh load.
  const removeCommitted = page.waitForResponse((res) => isDeletePost(res.request()) && res.ok())
  await page.getByRole("button", { name: "Remove thread" }).click()
  await expect(page.locator(".sent", { hasText: "one sustains the other" })).toHaveCount(0, { timeout: 15_000 })
  await removeCommitted
  await page.reload()
  await loomLoaded(page)
  await expect(page.locator(".sent", { hasText: "one sustains the other" })).toHaveCount(0, { timeout: 15_000 })

})

test("03 · vocabulary is every word you own, across all your readings", async ({ page }) => {
  // Unscoped on purpose (model §3 tab 4): a concept does not belong to a
  // reading, so the holdings are the same list inside a reading as at the
  // whole weave. Entering through a reading is the stronger check.
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await enterReadingFromCard(page, card)
  await page.locator("nav button", { hasText: "Vocabulary" }).click()

  // Every seeded concept, not this reading's slice — including the
  // evidence-less one, which is counted rather than hidden.
  //
  // NAMED, not counted (2026-08-17). This asserted `toHaveCount(8)` on every
  // concept row on the page, which made it a test of the whole ACCOUNT rather
  // than of this list: any spec that ran earlier in the `write` project and
  // left a concept behind turned it red, for a reason that had nothing to do
  // with Vocabulary being unscoped. It failed at 9 in a full run and passed
  // alone, which is the signature of that mistake.
  //
  // What the test is actually for is that Vocabulary shows concepts from
  // EVERY reading rather than this one's slice — so it names the eight and
  // checks they are all there. A ninth row from a neighbouring spec is not a
  // failure of that claim.
  const conceptRows = page.locator(".lrow[data-concept-id]")
  await expect(conceptRows.first(), "seed missing — run `npm run seed:demo` first")
    .toBeVisible({ timeout: 15_000 })
  for (const label of SEEDED_CONCEPTS) {
    await expect(
      page.locator(".lrow[data-concept-id]", { has: page.locator(".lconcept", { hasText: label }) }),
      `seeded concept missing: ${label}`
    ).toHaveCount(1, { timeout: 15_000 })
  }
  await expect(page.locator(".lrow[data-link-label]").first()).toBeVisible()

  // Filtering narrows the list and finding nothing says so. "object" matches
  // two of the seeded eight; a filter that finds nothing must say so whatever
  // else the account holds.
  await page.locator("#conceptFilter").fill("object worlds")
  await expect(conceptRows).toHaveCount(1)
  await page.locator("#conceptFilter").fill("zzzznothing")
  await expect(conceptRows).toHaveCount(0)
  await expect(page.getByText(/No concept matches/)).toBeVisible()
  // Clearing the filter restores the list. Counted as "at least the seeded
  // eight" for the same reason as above: this spec shares an account, so the
  // total is not its to assert.
  await page.locator("#conceptFilter").fill("")
  for (const label of SEEDED_CONCEPTS) {
    await expect(
      page.locator(".lrow[data-concept-id]", { has: page.locator(".lconcept", { hasText: label }) })
    ).toHaveCount(1, { timeout: 15_000 })
  }

  // A concept opens to its description. It opened to a MERGE control too
  // until 2026-08-12, when TJ hid that pending what merge means and what it
  // costs (`MERGE_VISIBLE` in VocabularyTab). Asserted absent rather than
  // deleted from the spec: the control is one flag away from returning, and
  // the flag flipping by accident should turn this suite red.
  await page.locator(".lrow[data-concept-id]", { hasText: "object worlds" }).first().locator(".lhead").click()
  await expect(page.locator(".conceptDescription").first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Merge" })).toHaveCount(0)

  // The read editor and the cloth prompts moved to 04 — they must not be here.
  await expect(page.locator("#yourRead, #readEssence")).toHaveCount(0)
  await expect(page.locator("#clothPrompts")).toHaveCount(0)
})

test("04 · a projection per reading, and each keeps its own tiers and essence", async ({ page }) => {
  // Object Worlds: its own projection, its own essence, its own mirror counts.
  await selectProjection(page, "Object Worlds", "Object worlds, sorted")
  await expect(page.locator("#mapSwitcher")).toContainText("Your projections of this reading")
  await expect(page.locator("#mapEssence")).toHaveValue(/between worlds/, { timeout: 15_000 })
  await expect(page.locator("#yourRead2")).toHaveValue(/Bucciarelli's argument hangs on the object world/)
  await expect(page.locator("#mapMirror")).toContainText("1 primary")

  // The cloth reflection lives here too. Its counted-prompts panel — and with
  // it the "no label yet" and "no passage yet" designations — is hidden behind
  // SHOW_PROMPTS since 2026-08-13, so the graph takes the whole column. What
  // the station shows is the cloth itself.
  await expect(page.locator("#clothPrompts")).toHaveCount(0)
  // The log rides with the reading, one panel, not one per projection. It was
  // its own section from 2026-08-12 until 2026-08-13, when it became the second
  // register of the CLOTH card — so it has no heading of its own to find, and
  // the station draws the cloth exactly once. It used to draw it twice: the
  // live one here and the log's own copy a screen below.
  await expect(page.locator(".sectionhead", { hasText: "The log" })).toHaveCount(0)
  await expect(page.locator("#map")).toHaveCount(1, { timeout: 15_000 })
  await expect(page.locator('input[aria-label="replay position, in acts"]')).toHaveCount(1, { timeout: 20_000 })

  // The other reading keeps its own, and neither leaks into the other.
  await selectProjection(page, "Communities of practice", "A practice lens")
  await expect(page.locator("#mapEssence")).toHaveValue(/Belonging is doing/, { timeout: 15_000 })
  await expect(page.locator("#mapSwitcher .chip", { hasText: "Object worlds, sorted" })).toHaveCount(0)
})

// The "06 · keep" test stood here and asserted the WHOLE-CLOTH export: every
// projection in one file, and the whole-weave cloth's read paragraph inside
// it. Both halves are gone — the whole weave with TJ's 2026-08-11 ruling, and
// the one-file export with the move to a download at each object. What it
// guarded is covered per object by tests/object-download.spec.ts.
