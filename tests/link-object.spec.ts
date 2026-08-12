/**
 * A Link is an object the student owns (5.1) — asserted through the interface.
 *
 * Two states were unrepresentable before this: a Link Label coined with a
 * gloss and NO thread using it yet, and reaching for a word you already own
 * without retyping it. Both are here, in the order a student meets them —
 * coin in Vocabulary, reach for it in Linking, see the count follow.
 *
 * The failure this guards against is quiet. If the coin-time chip went back
 * to filling the text box, everything would still look right: the thread gets
 * its word, the row still counts. What breaks is the vocabulary, weeks later,
 * once the same idea has been typed four slightly different ways. So the test
 * taps the chip and never types the word twice.
 *
 * Requires `npm run seed:demo`. The thread this file throws, it removes. The
 * coined Link stays: deleting a Link is not built yet (open-work 5.1e), and
 * the test is written to adopt the one a previous run left rather than mint a
 * second — which is the same rule the app itself follows.
 */
import { test, expect } from "@playwright/test"

test.use({ storageState: "playwright/.auth/testa.json" })
test.beforeEach(() => test.setTimeout(120_000))

// Unique enough that a crashed run cannot collide with the next one, stable
// enough to clean up by name.
const COINED = "linkobj-holds-open"
const SENTENCE = "A link-object sentence: this one holds the other open."
const GLOSS = "one keeps the other from closing"

async function loomLoaded(page: import("@playwright/test").Page) {
  await expect(page.getByText("Loading your loom...")).toHaveCount(0, { timeout: 20_000 })
}

/**
 * Open a Link row, if it is not already.
 *
 * Coining one opens it for you — the gloss field is the next thing you want —
 * so a blind click on the head FOLDS the row that was just handed to you, and
 * the test then hunts for a body that is closed by its own doing.
 */
async function openRow(row: import("@playwright/test").Locator) {
  if (!((await row.getAttribute("class")) ?? "").split(" ").includes("open")) {
    await row.locator(".lhead").click()
  }
  await expect(row).toContainClass("open")
}

/**
 * Remove this file's thread. `mustExist` when we just threw it; otherwise
 * this is the opportunistic sweep of whatever a crashed run left behind.
 *
 * Either way the list has to be ON SCREEN before anything is counted — the
 * loom finishes loading a beat before the threads render, and a count taken
 * in that gap reads zero and strands the very row it came to remove.
 */
async function removeThread(page: import("@playwright/test").Page, mustExist = false) {
  await page.goto("/weave?tab=throw")
  await loomLoaded(page)
  const sent = page.locator(".sent", { hasText: "holds the other open" })
  if (mustExist) {
    await expect(sent).toHaveCount(1, { timeout: 15_000 })
  } else {
    await expect(page.locator(".thread").first()).toBeVisible({ timeout: 15_000 })
    if ((await sent.count()) === 0) return
  }
  await sent.first().locator("..").locator(".rm", { hasText: "remove" }).click()
  // The row goes optimistically while the delete is still in flight; ending
  // the test there closes the browser mid-action and strands the thread for
  // the next run. deleteEdge's payload is a bare ["<uuid>"] — wait for it.
  const committed = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      /^\["[0-9a-f-]{36}"\]$/.test(res.request().postData() ?? "") &&
      res.ok()
  )
  await page.getByRole("button", { name: "Remove thread" }).click()
  await expect(page.locator(".sent", { hasText: "holds the other open" })).toHaveCount(0, { timeout: 15_000 })
  await committed
}

test("a label coined with no thread is a row, and tapping it labels a thread", async ({ page }) => {
  await removeThread(page)

  // --- coin it, with nothing using it ---
  await page.goto("/weave?tab=read")
  await loomLoaded(page)
  const row = page.locator(`.lrow[data-link-label="${COINED}"]`)

  if ((await row.count()) === 0) {
    await page.locator("#coinLabel").fill(COINED)
    await page.getByRole("button", { name: "Coin" }).click()
  }
  await expect(row, "the coined label is a row of its own").toHaveCount(1, { timeout: 15_000 })
  await expect(row.locator(".lsrc")).toHaveText(/0 threads/)

  // Filter to it before opening anything. The list is a scrollbox above a
  // fixed footer, and a row near the bottom has its head under that footer —
  // the click lands on the chrome and the row never opens.
  await page.locator("#labelFilter").fill(COINED)
  await expect(page.locator(".lrow[data-link-label]")).toHaveCount(1)

  // It opens to its OWN gloss — one meaning, shared by every thread that will
  // ever use it — and says plainly that nothing uses it yet.
  await openRow(row)
  await expect(row.getByText("No thread uses this yet")).toBeVisible()
  // Only write when it would be a change — the field saves on blur ONLY if the
  // value differs, so an unconditional wait hangs on a re-run that adopts the
  // Link a previous run left glossed.
  const gloss = row.locator(".linkOwnDescription")
  if ((await gloss.inputValue()) !== GLOSS) {
    // Specific to THIS write: any-POST waiters latch onto whatever request
    // happens to be in flight and let the page navigate before the real one
    // is even sent.
    const glossSaved = page.waitForResponse(
      (res) => res.request().method() === "POST" && (res.request().postData() ?? "").includes(GLOSS)
    )
    await gloss.fill(GLOSS)
    await gloss.blur()
    await glossSaved
  }

  // The gloss is the Link's, not a thread's — it survives a reload with no
  // thread in existence to carry it.
  await page.reload()
  await loomLoaded(page)
  await expect(row, "the coined label survives a reload").toHaveCount(1, { timeout: 15_000 })
  await page.locator("#labelFilter").fill(COINED)
  await openRow(row)
  await expect(row.locator(".linkOwnDescription")).toHaveValue(GLOSS)

  // --- reach for it at coin time, by tapping ---
  await page.goto("/weave?tab=throw")
  await loomLoaded(page)
  const warp = page.locator(".crow")
  await expect(warp.first(), "seed missing — run `npm run seed:demo` first").toBeVisible({ timeout: 15_000 })
  await warp.filter({ hasText: "object worlds" }).first().click()
  await warp.filter({ hasText: "reification" }).first().click()
  await page.getByPlaceholder("…or just start typing. Long and awkward is fine.").fill(SENTENCE)
  await page.getByRole("button", { name: "Throw it" }).click()

  const sent = page.locator(".sent", { hasText: "holds the other open" })
  await expect(sent).toHaveCount(1, { timeout: 15_000 })
  const thread = sent.locator("..")
  await expect(thread.locator(".pill", { hasText: "description" })).toBeVisible()

  await thread.locator(".act", { hasText: "coin a label" }).click()
  const chip = page.locator(".verbchip.borrowed", { hasText: COINED })
  await expect(chip, "a label coined ahead of use is offered as a chip").toHaveCount(1)

  // The whole point: tapped, not typed, and no Save. The fold closes because
  // the act is finished.
  // attachLink's payload is exactly two ids — the thread and the Link. An
  // any-POST waiter matches the throw that is still in flight instead, and the
  // test navigates away before the attach is ever sent.
  const attached = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      /^\["[0-9a-f-]{36}","[0-9a-f-]{36}"\]$/.test(res.request().postData() ?? "")
  )
  await chip.click()
  await attached
  await expect(thread.locator(".distill")).toHaveCount(0)
  await expect(thread.locator(".pill", { hasText: "label" }).first()).toBeVisible({ timeout: 15_000 })
  await expect(thread.locator(".v")).toHaveText(COINED)

  // --- the count follows the object ---
  await page.goto("/weave?tab=read")
  await loomLoaded(page)
  await expect(row, "still ONE row — reuse attached, it did not mint a twin").toHaveCount(1, { timeout: 15_000 })
  await expect(row.locator(".lsrc")).toHaveText(/1 thread(?!s)/)
  await page.locator("#labelFilter").fill(COINED)
  await expect(page.locator(".lrow[data-link-label]"), "one row, not a near-duplicate pair").toHaveCount(1)

  await removeThread(page, true)
})

test("a Link nothing uses is findable — search covers the object, not just the threads", async ({ page }) => {
  // Runs after the test above, which leaves the coined Link in place with no
  // thread on it. Before 5.1 there was nothing to find: search read labels off
  // the threads, so a word coined ahead of its first use was invisible.
  await page.goto("/")
  const box = page.locator("#shelfSearchInput")
  await expect(box).toBeVisible({ timeout: 15_000 })
  await box.fill(COINED)

  await expect(page.getByText("your link labels")).toBeVisible({ timeout: 15_000 })
  const hit = page.locator(".searchhit", { hasText: COINED }).first()
  await expect(hit).toBeVisible()
  await expect(hit.getByText("not used yet")).toBeVisible()

  // The door goes to Vocabulary, where Link Labels live.
  await hit.click()
  await expect(page).toHaveURL(/\/weave\?tab=read/)
})
