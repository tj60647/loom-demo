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
 * capture form, 02 Throw (previously untested entirely), 03 Read (same),
 * multi-map assertions on 04, and the whole-cloth export on 06 Keep.
 */
import { test, expect } from "@playwright/test"

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
})

test("01 · a byte captured by hand lands in the coding log — and cleans up", async ({ page }) => {
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(card.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })
  await card.click()
  await expect(page).toHaveURL(/\/reading\//, { timeout: 15_000 })
  // Station buttons are named "01 —Open" etc. — match by substring, never exact.
  await page.locator("nav button", { hasText: "Open" }).click()
  await loomLoaded(page)

  await page.locator("#bText").fill("A passage typed by the journey suite, verbatim enough for the log.")
  await page.getByPlaceholder("e.g. boundary objects · satisficing · valence").fill("journey test concept")
  await page.getByPlaceholder("ch. 3, p. 49").fill("p. 999")
  await page.getByRole("button", { name: "Add byte" }).click()

  const row = page.locator(".lrow", { hasText: "journey test concept" })
  await expect(row).toHaveCount(1, { timeout: 15_000 })

  // Cleanup through the product's own controls.
  await row.locator(".lhead").click()
  await row.getByRole("button", { name: "remove concept" }).click()
  await page.getByRole("button", { name: "Delete concept" }).click()
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
  await expect(thread.locator(".pill", { hasText: "sentence" })).toBeVisible()

  // Coin a term on the new thread.
  await thread.locator(".act", { hasText: "coin a term" }).click()
  await page.getByPlaceholder("your word… e.g. leads to · contradicts · is part of").fill("journey-term")
  await thread.getByRole("button", { name: "Save term" }).click()
  await expect(thread.locator(".pill", { hasText: "term" }).first()).toBeVisible({ timeout: 15_000 })

  // Remove the thread; both concepts stay (they are seeded).
  await thread.locator(".rm", { hasText: "remove" }).click()
  await page.getByRole("button", { name: "Remove thread" }).click()
  await expect(page.locator(".sent", { hasText: "one sustains the other" })).toHaveCount(0, { timeout: 15_000 })
})

test("03 · the cloth counts what it sees, and the read belongs to the active map", async ({ page }) => {
  await selectWholeCloth(page)
  await page.locator("nav button", { hasText: "Read" }).click()

  // Counted prompts render; the two visible failure states are counted, not hidden:
  // the seeded no-evidence concept and the seeded sentence-only thread.
  await expect(page.locator(".prompt").first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/no evidence/).first()).toBeVisible()
  await expect(page.getByText(/no term yet/).first()).toBeVisible()

  // Essence and paragraph are the seeded whole-cloth map's own.
  await expect(page.locator("#readEssence")).toHaveValue(/Disciplinary worlds hold together/, { timeout: 15_000 })
  await expect(page.locator("#yourRead")).toHaveValue(/Bucciarelli watches designers/)

  // Persistence: a fresh load re-derives the same map, same text.
  await page.reload()
  await loomLoaded(page)
  await selectWholeCloth(page)
  await page.locator("nav button", { hasText: "Read" }).click()
  await expect(page.locator("#readEssence")).toHaveValue(/Disciplinary worlds hold together/, { timeout: 15_000 })
})

test("04 · three maps, and each scope keeps its own tiers and essence", async ({ page }) => {
  // Whole weave: the seeded whole-cloth map with its own essence.
  await selectWholeCloth(page)
  await expect(page.locator("#mapEssence")).toHaveValue(/Disciplinary worlds hold together/, { timeout: 15_000 })

  // Inside Object Worlds: its own map, its own essence, its own mirror counts —
  // and the whole-weave map does not leak in.
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(card.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })
  await card.click()
  await expect(page).toHaveURL(/\/reading\//, { timeout: 15_000 })
  await page.locator("nav button", { hasText: "Map" }).click()
  await expect(page.locator("#mapSwitcher")).toContainText("Your maps of this reading", { timeout: 15_000 })
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
  // The mirror holds: concept tiers reflect the oldest whole-weave map.
  const whole = data.graph.maps.find((m: { name: string }) => m.name === "The whole cloth")
  expect(data.graph.read).toBe(whole.read)
})
