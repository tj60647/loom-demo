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
import { enterReadingFromCard, isDeletePost } from "./helpers"

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
 * Open a station inside Object Worlds. Everything here used to happen at
 * `/weave`; TJ retired the whole weave on 2026-08-11, so a reading is the only
 * scope a student — or this test — works in.
 */
async function openStation(page: import("@playwright/test").Page, station: "Linking" | "Vocabulary") {
  await page.goto("/")
  await enterReadingFromCard(page, page.locator(".shelfcard", { hasText: "Object Worlds" }).first())
  await page.locator("nav button", { hasText: station }).click()
  await loomLoaded(page)
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
/**
 * The thread CARD a sentence belongs to, by the card's own id.
 *
 * This was `sent.locator("..")` in three places until 2026-08-18, which made
 * the row's internal shape a contract nobody had agreed to: any wrapper between
 * the card's root and its `.sent` re-pointed every following assertion at the
 * wrapper, silently and with the classes still matching. `.thread` and `.sent`
 * are exactly where they were; this only stops the test caring how far apart
 * they sit (ThreadCard.tsx, docs/thread-card.md).
 */
function threadOf(sent: import("@playwright/test").Locator) {
  return sent.locator("xpath=ancestor::*[@data-edge-id][1]")
}

async function removeThread(page: import("@playwright/test").Page, mustExist = false) {
  await openStation(page, "Linking")
  const sent = page.locator(".sent", { hasText: "holds the other open" })
  if (mustExist) {
    await expect(sent).toHaveCount(1, { timeout: 15_000 })
  } else {
    await expect(page.locator(".thread").first()).toBeVisible({ timeout: 15_000 })
    if ((await sent.count()) === 0) return
  }
  // The card by its own id, not `.sent`'s parent — see the note in
  // journey-learner where the same hop was rewritten.
  await threadOf(sent.first()).locator(".rm", { hasText: "remove" }).click()
  // The row goes optimistically while the delete is still in flight; ending
  // the test there closes the browser mid-action and strands the thread for
  // the next run.
  const committed = page.waitForResponse((res) => isDeletePost(res.request()) && res.ok())
  await page.getByRole("button", { name: "Remove thread" }).click()
  await expect(page.locator(".sent", { hasText: "holds the other open" })).toHaveCount(0, { timeout: 15_000 })
  await committed
}

test("a label coined with no thread is a row, and tapping it labels a thread", async ({ page }) => {
  await removeThread(page)

  // --- add it, with nothing using it ---
  // The button reads "Add" since 2026-08-12: the student's language is now
  // "label the link", and this is the one box where there is no link to label
  // yet. The id and the action behind it are unchanged (`#coinLabel`,
  // `link.coin`) — the record keeps its own names.
  await openStation(page, "Vocabulary")
  const row = page.locator(`.lrow[data-link-label="${COINED}"]`)

  if ((await row.count()) === 0) {
    await page.locator("#coinLabel").fill(COINED)
    await page.getByRole("button", { name: "Add" }).click()
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
  // thread in existence to carry it. A reload lands on the reading's first
  // station, so come back to Vocabulary the way a student would.
  await page.reload()
  await loomLoaded(page)
  await page.locator("nav button", { hasText: "Vocabulary" }).click()
  await expect(row, "the coined label survives a reload").toHaveCount(1, { timeout: 15_000 })
  await page.locator("#labelFilter").fill(COINED)
  await openRow(row)
  await expect(row.locator(".linkOwnDescription")).toHaveValue(GLOSS)

  // --- reach for it at coin time, by tapping ---
  await openStation(page, "Linking")
  const warp = page.locator(".crow")
  await expect(warp.first(), "seed missing — run `npm run seed:demo` first").toBeVisible({ timeout: 15_000 })
  // Picking is its own control since 2026-08-18: clicking the row OPENS the
  // concept card, as it does in Your work, and the "select" button loads it
  // into the bench. One tap used to do both, which is why a dot had to exist
  // to reach the card at all.
  await warp.filter({ hasText: "object worlds" }).first().getByRole("button", { name: /select/i }).click()
  await warp.filter({ hasText: "artifact as compromise" }).first().getByRole("button", { name: /select/i }).click()
  await page.getByPlaceholder("…or just start typing. Long and awkward is fine.").fill(SENTENCE)
  /* WAIT FOR THE THROW TO LAND BEFORE TOUCHING THE ROW. `addEdge` paints the
     thread optimistically under a temporary `crypto.randomUUID()` and swaps in
     the server's id when the create returns (LoomProvider.addEdge). The card is
     keyed by that id, so opening it inside the round-trip means opening a row
     that is about to be replaced — it remounts closed, and the assertions after
     it fail on a card that was open a moment ago. Measured: "open-after-click:
     1" then "open-after-chip: 0", with the label attached correctly either way.
     Nothing here is testing the optimistic paint, so waiting is honest. */
  const thrown = page.waitForResponse(
    (res) => res.request().method() === "POST" && (res.request().postData() ?? "").includes("holds the other open")
  )
  await page.getByRole("button", { name: "Throw it" }).click()
  await thrown

  const sent = page.locator(".sent", { hasText: "holds the other open" })
  await expect(sent).toHaveCount(1, { timeout: 15_000 })
  const thread = threadOf(sent)
  await expect(thread).toHaveCount(1)
  await expect(thread.locator(".pill", { hasText: "description" })).toBeVisible()

  // The card opens to its fields — one disclosure, not an "edit label" toggle
  // (TJ, 2026-08-19). The chips ride the Label field inside it.
  await thread.locator(".trip").click()
  const chip = page.locator(".verbchip.borrowed", { hasText: COINED })
  await expect(chip, "a label coined ahead of use is offered as a chip").toHaveCount(1)

  // The whole point: tapped, not typed, and no Save button anywhere on the
  // card — the tap attaches the Link OBJECT rather than copying its word.
  // attachLink's payload is the thread, the Link, and the reading the act
  // happened in. Matched on shape rather than on any POST: an any-POST waiter
  // latches onto the throw still in flight, and the test then navigates away
  // before the attach is ever sent.
  const attached = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      /^\["[0-9a-f-]{36}","[0-9a-f-]{36}"(,(null|"[0-9a-f-]{36}"))?\]$/.test(res.request().postData() ?? "")
  )
  await chip.click()
  await attached
  // The card STAYS OPEN. It used to shut on the tap, because a Save button
  // that did nothing would have invited a second write; there is no Save
  // button now, and shutting it would hide the label the tap just put in the
  // field. So the field holds it, and the head's pill states it.
  await expect(thread.locator(".threadlabel")).toHaveValue(COINED, { timeout: 15_000 })
  await expect(thread.locator(".pill", { hasText: "label" }).first()).toBeVisible({ timeout: 15_000 })
  await expect(thread.locator(".v")).toHaveText(COINED)
  // No Save anywhere on the card — it commits on blur (TJ, 2026-08-19). Named
  // rather than counted: the card DOES hold one button, the trip, which is its
  // disclosure.
  await expect(
    thread.getByRole("button", { name: /save/i }),
    "the card commits on blur; it has no Save"
  ).toHaveCount(0)

  // --- the count follows the object ---
  await openStation(page, "Vocabulary")
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
  // The standing band is gone (TJ, 2026-08-13): one search per station, in the
  // journey bar, scoped by where you stand. On the Library that is the loom —
  // which is the scope this test needs, since a Link with no thread on it
  // belongs to no reading.
  await page.locator(".stationsearch button").click()
  const box = page.locator(".stationsearch-panel input")
  await expect(box).toBeVisible({ timeout: 15_000 })
  await box.fill(COINED)

  await expect(page.getByText("your link labels")).toBeVisible({ timeout: 15_000 })
  const hit = page.locator(".searchhit", { hasText: COINED }).first()
  await expect(hit).toBeVisible()
  await expect(hit.getByText("not used yet")).toBeVisible()

  // No thread uses it, so there is no reading to open it in — and the result
  // says so rather than looking clickable and going nowhere. This is the state
  // 5.1 exists for, met at the one surface that can see every reading at once.
  await expect(hit).toContainClass("off")
  await expect(hit.getByText("a label with no link using it yet")).toBeVisible()
  await expect(hit.locator("a")).toHaveCount(0)
})
