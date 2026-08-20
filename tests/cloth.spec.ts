/**
 * The cloth loop, shelf → Reading → shelf (the model's reading-card ruling as
 * it stands since 2026-08-08: the card is the ONE door, no Create Cloth
 * button, the cloth row beneath is metadata — plus the Cloth
 * Title/Description, edited on 01 · Reading, the work surface a cloth starts
 * on).
 *
 * Unlike the journey file this spec cannot remove what it makes — the UI has
 * no single-cloth delete (reset was far too blunt, and went with Keep) — so
 * it is written to pass against both a virgin and an already-clothed seed:
 * entering the card opens the cloth either way, and the
 * title is only saved when it differs.
 */
import { test, expect } from "@playwright/test"
import { enterReadingFromCard, openYourWork } from "./helpers"

test.use({ storageState: "playwright/.auth/testa.json" })
test.beforeEach(() => test.setTimeout(120_000))

const CLOTH_TITLE = "A cloth titled by the Playwright suite"

async function loomLoaded(page: import("@playwright/test").Page) {
  await expect(page.getByText("Loading your loom...")).toHaveCount(0, { timeout: 20_000 })
}

test("the card opens the reading, and carries the cloth's name and last edit", async ({ page }) => {
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })

  // The cloth row renders once the loom has loaded. Creation is explicit —
  // the card link itself must never mint a cloth — so the row offers exactly
  // one of the two doors.
  // The card itself is the entry point — no Create Cloth button exists any
  // more, because there is no decision to make (TJ, 2026-08-08).
  await expect(card.getByRole("button", { name: "Create Cloth" })).toHaveCount(0)
  await enterReadingFromCard(page, card)
  await loomLoaded(page)

  // The cloth is named on the work surface for its scope — inside a reading
  // that is 01 · Reading, at the head of Your work (TJ, 2026-08-08).
  await openYourWork(page)
  const fold = page.locator("details.invitefold", { hasText: "This cloth" })
  await expect(fold).toBeVisible({ timeout: 15_000 })
  if (!(await fold.locator("input").first().isVisible())) {
    await fold.locator("summary").click()
  }

  const titleInput = fold.getByPlaceholder(/a sentence or headline/)
  await expect(titleInput).toBeVisible()
  if ((await titleInput.inputValue()) !== CLOTH_TITLE) {
    // The cloth autosaves (commit 30414ae, 2026-08-13) — there is no Save
    // button to press, and `onBlur={flushCloth}` writes ahead of the debounce.
    // This still asked for "Save cloth" until 2026-08-13 and passed anyway,
    // because an earlier run had already written CLOTH_TITLE: the branch that
    // does the saving only runs on a freshly seeded row, so the stale
    // assertion sat unreached until the next `npm run seed:demo`.
    await titleInput.fill(CLOTH_TITLE)
    await titleInput.blur()
    await expect(fold.getByRole("button", { name: /Save cloth|Saving…/ })).toHaveCount(0)
    // Saved = the summary reads the row back, not the field: it renders from
    // `activeCloth.title`, so it only says this once the write has landed.
    await expect(fold.locator("summary")).toContainText(CLOTH_TITLE, { timeout: 15_000 })
  }

  // Back on the shelf: the card speaks the cloth's name outright — no hover,
  // no count — and says when it was last worked on.
  await page.goto("/")
  const cardAgain = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(cardAgain.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })
  await expect(cardAgain.locator(".clothname")).toHaveText(CLOTH_TITLE, { timeout: 15_000 })
  await expect(cardAgain.locator(".clothmeta")).toContainText(/edited/)
  // The name is metadata; the card body is the one door.
  await expect(cardAgain.locator("a.shelfmain")).toHaveAttribute("href", /\/reading\/[^?]+$/)
  await expect(cardAgain.locator(".clothrow button")).toHaveCount(0)
})
