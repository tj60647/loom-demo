/**
 * The learner journey, end to end, against the seeded demonstration account.
 *
 * Requires `npm run seed:demo` to have run: Test User A holds 8 concepts,
 * 10 bytes from two readings, 6 threads and 3 maps ("The whole cloth" at the
 * whole weave, "Object worlds, sorted" and "A practice lens" per reading).
 * Every mutation this file makes, it removes again — the seeded data is
 * asserted, never changed.
 *
 * Studio coverage: Capture's by-hand form, Connect, Reflect, Map, and the
 * whole-workspace export in Files.
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
  await page.goto("/studio/weave?tool=map")
  await loomLoaded(page)
  await expect(page.locator("#mapSwitcher")).toBeVisible({ timeout: 15_000 })
  const chip = page.locator("#mapSwitcher .chip", { hasText: "The whole cloth" })
  await expect(chip.first(), "seed missing — run `npm run seed:demo` first").toBeVisible()
  await chip.first().click()
}

test("Library shows the readings with the student's own tallies", async ({ page }) => {
  await page.goto("/library")
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
  const chooser = page.waitForEvent("filechooser", { timeout: 10_000 })
  await page.mouse.click(point.x, point.y)
  await chooser

  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
})

test("Capture: a byte entered by hand lands in the coding log — and cleans up", async ({ page }) => {
  await page.goto("/library")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(card.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })
  await card.click()
  await expect(page).toHaveURL(/\/studio\/reading\//, { timeout: 15_000 })
  await page.locator(".studio-tools button", { hasText: "Capture" }).click()
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

test("Connect: pick two, say the sentence, throw the thread, coin a term — then unpick it all", async ({ page }) => {
  await page.goto("/studio/weave?tool=connect")
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

test("Reflect: the cloth counts what it sees, and the reflection belongs to the active map", async ({ page }) => {
  await selectWholeCloth(page)
  await page.locator(".studio-tools button", { hasText: "Reflect" }).click()

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
  await page.locator(".studio-tools button", { hasText: "Reflect" }).click()
  await expect(page.locator("#readEssence")).toHaveValue(/Disciplinary worlds hold together/, { timeout: 15_000 })
})

test("Map: three maps, and each scope keeps its own tiers and essence", async ({ page }) => {
  // Whole weave: the seeded whole-cloth map with its own essence.
  await selectWholeCloth(page)
  await expect(page.locator("#mapEssence")).toHaveValue(/Disciplinary worlds hold together/, { timeout: 15_000 })

  // Inside Object Worlds: its own map, its own essence, its own mirror counts —
  // and the whole-weave map does not leak in.
  await page.goto("/library")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(card.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })
  await card.click()
  await expect(page).toHaveURL(/\/studio\/reading\//, { timeout: 15_000 })
  await page.locator(".studio-tools button", { hasText: "Map" }).click()
  await expect(page.locator("#mapSwitcher")).toContainText("Your maps of this reading", { timeout: 15_000 })
  await expect(page.locator("#mapSwitcher .chip", { hasText: "The whole cloth" })).toHaveCount(0)

  const readingMap = page.locator("#mapSwitcher .chip", { hasText: "Object worlds, sorted" })
  await expect(readingMap, "seed missing — run `npm run seed:demo` first").toHaveCount(1)
  await readingMap.click()
  await expect(page.locator("#mapEssence")).toHaveValue(/between worlds/, { timeout: 15_000 })
  await expect(page.locator("#mapMirror")).toContainText("1 primary")
})

test("Files lists every map, and the whole-cloth export carries them all", async ({ page }) => {
  await page.goto("/files")
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

test("legacy learner URLs retain their destination and tool", async ({ page }) => {
  await page.goto("/reading/star?tab=open")
  await expect(page).toHaveURL(/\/studio\/reading\/star\?tool=capture/, { timeout: 15_000 })
  await page.goto("/weave?tab=read")
  await expect(page).toHaveURL(/\/studio\/weave\?tool=reflect/, { timeout: 15_000 })
  await page.goto("/keep")
  await expect(page).toHaveURL(/\/files$/, { timeout: 15_000 })
})
