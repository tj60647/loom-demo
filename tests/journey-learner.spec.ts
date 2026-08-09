/**
 * The learner journey, end to end, against the seeded demonstration account.
 *
 * Requires `npm run seed:demo` to have run: Test User A holds 8 concepts,
 * 10 bytes from two readings, 6 threads and 3 maps ("The whole cloth" at the
 * whole weave, "Object worlds, sorted" and "A practice lens" per reading).
 * Every mutation this file makes, it removes again — the seeded data is
 * asserted, never changed.
 *
 * Station coverage this file adds over the older specs: 01 Open's by-hand
 * capture form, 02 Linking (previously untested entirely), 03 Vocabulary
 * (same), multi-map assertions on 04, and the whole-cloth export on 06 Keep.
 *
 * Since 2026-08-08, 03 is the holdings tab and the cloth reflection it used to
 * hold lives on 04 — the 03 test asserts the words, the 04 test asserts the
 * prompts and the read.
 */
import { test, expect } from "@playwright/test"
import { enterReadingFromCard, openCaptureLog } from "./helpers"

test.use({ storageState: "playwright/.auth/testa.json" })
// Each test is independent and removes what it adds — no serial mode, so one
// failure never hides the rest of the journey. Dev-server compile latency puts
// several 15s waits in sequence, hence the generous per-test budget.
test.beforeEach(() => test.setTimeout(120_000))

const SENTENCE = "A journey-suite sentence: one sustains the other."

async function loomLoaded(page: import("@playwright/test").Page) {
  await expect(page.getByText("Loading your loom...")).toHaveCount(0, { timeout: 20_000 })
}

/** The seeded whole-weave map, made active regardless of what other specs
 *  left most-recently-updated in this scope. */
async function selectWholeCloth(page: import("@playwright/test").Page) {
  await page.goto("/weave?tab=map")
  await loomLoaded(page)
  await expect(page.locator("#mapSwitcher")).toBeVisible({ timeout: 15_000 })
  const chip = page.locator("#mapSwitcher .chip", { hasText: "The whole cloth" })
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

test("01 · a byte captured by hand lands in the coding log — and cleans up", async ({ page }) => {
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await enterReadingFromCard(page, card)
  // Station buttons are named "01 —Reading" etc. — match by substring, never
  // exact. Since the 2026-08-08 merge the capture form IS this station: the
  // text on the left, the capture rail on the right, opened from the toolbar.
  await page.locator("nav button", { hasText: "Reading" }).click()
  await loomLoaded(page)
  await openCaptureLog(page)
  // Beside a text you can select, capture-by-hand is a fold at the foot of the
  // log (TJ, 2026-08-08) — typing a passage that is on screen is the exception,
  // so it is one deliberate click away rather than the first thing you meet.
  await page.locator(".readinglog details.handfold > summary").click()
  await expect(page.locator("#bText")).toBeVisible({ timeout: 15_000 })

  await page.locator("#bText").fill("A passage typed by the journey suite, verbatim enough for the log.")
  await page.getByPlaceholder("e.g. boundary objects · satisficing · valence").fill("journey test concept")
  await page.getByPlaceholder("ch. 3, p. 49").fill("p. 999")
  await page.getByRole("button", { name: "Add passage" }).click()

  const row = page.locator(".lrow", { hasText: "journey test concept" })
  await expect(row).toHaveCount(1, { timeout: 15_000 })

  // Cleanup through the product's own controls. Since 0021 a passage survives
  // its concept (P0.1) — remove the byte first so nothing unlabeled lingers,
  // then the concept. The optimistic UI clears instantly, so each delete's
  // server-action POST must be awaited: ending the test any earlier closes
  // the page and aborts the serially-queued fetches, and the "deleted" rows
  // resurface on the next load as residue.
  await row.locator(".lhead").click()
  const byteId = await row.locator("[data-byte-id]").first().getAttribute("data-byte-id")
  const byteDeleted = page.waitForResponse((r) =>
    r.request().method() === "POST" && (r.request().postData() ?? "").includes(byteId!)
  )
  await row.getByRole("button", { name: "remove passage" }).click()
  await byteDeleted
  const conceptDeleted = page.waitForResponse((r) =>
    r.request().method() === "POST" && /^\["[0-9a-f-]{36}"\]$/.test(r.request().postData() ?? "")
  )
  await row.getByRole("button", { name: "remove concept" }).click()
  await page.getByRole("button", { name: "Delete concept" }).click()
  await conceptDeleted
  await expect(page.locator(".lrow", { hasText: "journey test concept" })).toHaveCount(0, { timeout: 15_000 })
})

test("02 · pick two, say the sentence, throw the thread, coin a term — then unpick it all", async ({ page }) => {
  await page.goto("/weave?tab=throw")
  await loomLoaded(page)

  const warp = page.locator(".crow")
  await expect(warp.first(), "seed missing — run `npm run seed:demo` first").toBeVisible({ timeout: 15_000 })
  await warp.filter({ hasText: "object worlds" }).first().click()
  await warp.filter({ hasText: "reification" }).first().click()
  await expect(page.locator(".slot.filled")).toHaveCount(2)

  await page.getByPlaceholder("…or just start typing. Long and awkward is fine.").fill(SENTENCE)
  await page.getByRole("button", { name: "Throw it" }).click()

  // The .trip head truncates the sentence with an ellipsis; the full text
  // lives in the sibling .sent — anchor there and walk up to the row.
  const sent = page.locator(".sent", { hasText: "one sustains the other" })
  await expect(sent).toHaveCount(1, { timeout: 15_000 })
  const thread = sent.locator("..")
  await expect(thread.locator(".pill", { hasText: "description" })).toBeVisible()

  // Coin a label on the new thread.
  await thread.locator(".act", { hasText: "coin a label" }).click()
  await page.getByPlaceholder("your word… e.g. leads to · contradicts · is part of").fill("journey-term")
  await thread.getByRole("button", { name: "Save label" }).click()
  await expect(thread.locator(".pill", { hasText: "label" }).first()).toBeVisible({ timeout: 15_000 })

  // Remove the thread; both concepts stay (they are seeded).
  await thread.locator(".rm", { hasText: "remove" }).click()
  // The row disappears optimistically while the server delete is still in
  // flight — and ending the test there closes the browser mid-action,
  // stranding the thread for the NEXT run (which then finds two and fails).
  // Hold for deleteEdge's own round-trip — its payload is a bare ["<uuid>"],
  // unlike createEdge's [{...}] or updateEdge's [id, {...}] — then prove the
  // delete stuck with a fresh load.
  const removeCommitted = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      /^\["[0-9a-f-]{36}"\]$/.test(res.request().postData() ?? "") &&
      res.ok()
  )
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

  // All 8 seeded concepts, not this reading's slice — including the seeded
  // evidence-less one, which is counted rather than hidden.
  const conceptRows = page.locator(".lrow[data-concept-id]")
  await expect(conceptRows, "seed missing — run `npm run seed:demo` first").toHaveCount(8, { timeout: 15_000 })
  await expect(page.locator(".lrow[data-link-label]").first()).toBeVisible()

  // Filtering narrows the list and finding nothing says so.
  await page.locator("#conceptFilter").fill("object")
  await expect(conceptRows).toHaveCount(2)
  await page.locator("#conceptFilter").fill("zzzznothing")
  await expect(conceptRows).toHaveCount(0)
  await expect(page.getByText(/No concept matches/)).toBeVisible()
  await page.locator("#conceptFilter").fill("")
  await expect(conceptRows).toHaveCount(8)

  // A concept opens to its description and its merge control — the two
  // affordances the model puts here (merge lives ONLY here now).
  await page.locator(".lrow[data-concept-id]", { hasText: "object worlds" }).first().locator(".lhead").click()
  await expect(page.locator(".conceptDescription").first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Merge" }).first()).toBeVisible()

  // The read editor and the cloth prompts moved to 04 — they must not be here.
  await expect(page.locator("#yourRead, #readEssence")).toHaveCount(0)
  await expect(page.locator("#clothPrompts")).toHaveCount(0)
})

test("04 · three maps, and each scope keeps its own tiers and essence", async ({ page }) => {
  // Whole weave: the seeded whole-cloth map with its own essence.
  await selectWholeCloth(page)
  await expect(page.locator("#mapEssence")).toHaveValue(/Disciplinary worlds hold together/, { timeout: 15_000 })
  await expect(page.locator("#yourRead2")).toHaveValue(/Bucciarelli watches designers/)

  // The cloth reflection moved here from 03: counted prompts, and the two
  // states counted rather than hidden — the seeded concept with no passage and
  // the seeded sentence-only thread. Both are designations, not faults: a
  // concept may be named ahead of its evidence (TJ, 2026-08-08), which is why
  // the wording is "no passage yet" and not a red instruction to fix it.
  await expect(page.locator("#clothPrompts .prompt").first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/no passage/).first()).toBeVisible()
  await expect(page.getByText(/no label yet/).first()).toBeVisible()
  // The whole weave carries the development record; a single reading does not.
  await expect(page.locator(".cap", { hasText: "Capture Log" })).toHaveCount(1)

  // Inside Object Worlds: its own map, its own essence, its own mirror counts —
  // and the whole-weave map does not leak in.
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await enterReadingFromCard(page, card)
  await page.locator("nav button", { hasText: "Knowledge Graph" }).click()
  await expect(page.locator("#mapSwitcher")).toContainText("Your projections of this reading", { timeout: 15_000 })
  await expect(page.locator("#mapSwitcher .chip", { hasText: "The whole cloth" })).toHaveCount(0)

  const readingMap = page.locator("#mapSwitcher .chip", { hasText: "Object worlds, sorted" })
  await expect(readingMap, "seed missing — run `npm run seed:demo` first").toHaveCount(1)
  await readingMap.click()
  await expect(page.locator("#mapEssence")).toHaveValue(/between worlds/, { timeout: 15_000 })
  await expect(page.locator("#mapMirror")).toContainText("1 primary")
})

test("06 · keep lists every map, and the whole-cloth export carries them all", async ({ page }) => {
  await page.goto("/keep")
  // Wait out the loading window: export is only trustworthy once the tallies are real.
  await expect(page.getByText(/[1-9]\d* concepts/).first()).toBeVisible({ timeout: 20_000 })
  for (const name of ["The whole cloth", "Object worlds, sorted", "A practice lens"]) {
    await expect(page.getByText(name).first()).toBeVisible()
  }

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export .json" }).click(),
  ])
  const fs = await import("fs")
  const data = JSON.parse(fs.readFileSync(await download.path(), "utf-8"))

  expect(data.graph.concepts.length).toBeGreaterThanOrEqual(8)
  expect(data.graph.maps.length).toBeGreaterThanOrEqual(3)
  const names = data.graph.maps.map((m: { name: string }) => m.name)
  expect(names).toEqual(expect.arrayContaining(["The whole cloth", "Object worlds, sorted", "A practice lens"]))
  // Bytes carry their reading (anchor provenance survives the export contract).
  const anchored = data.graph.bytes.filter((b: { anchor?: { sourceId?: string } }) => b.anchor?.sourceId)
  expect(anchored.length).toBeGreaterThanOrEqual(10)
  // The P0 contract: every byte carries its concept pointers as an array.
  for (const b of data.graph.bytes) {
    expect(Array.isArray(b.conceptIds)).toBe(true)
  }
  // The whole-weave cloth carries the read paragraph — the 0021 successor to
  // the dropped mirror (the seed writes it equal to the whole-cloth map's).
  const whole = data.graph.maps.find((m: { name: string }) => m.name === "The whole cloth")
  const weaveCloth = data.graph.cloths?.find((c: { scopeKey: string }) => c.scopeKey === "")
  expect(weaveCloth?.description).toBe(whole.read)
})
