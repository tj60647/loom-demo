/**
 * The cloth loop, shelf → Reading → shelf (the model's reading-card ruling:
 * explicit Create Cloth, the cloth opened by name — rulings 20–22, 33 — plus
 * the Cloth Title/Description, which since 2026-08-08 are edited on 01 ·
 * Reading, the work surface a cloth starts on).
 *
 * Unlike the journey file this spec cannot remove what it makes — the UI has
 * no single-cloth delete (Keep's reset clears everything, far too blunt) — so
 * it is written to pass against both a virgin and an already-clothed seed:
 * whichever of Create/Open the card offers is the door it takes, and the
 * title is only saved when it differs.
 */
import { test, expect } from "@playwright/test"
import { enterReadingFromCard, openCaptureLog } from "./helpers"

test.use({ storageState: "playwright/.auth/testa.json" })
test.beforeEach(() => test.setTimeout(120_000))

const CLOTH_TITLE = "A cloth titled by the Playwright suite"

async function loomLoaded(page: import("@playwright/test").Page) {
  await expect(page.getByText("Loading your loom...")).toHaveCount(0, { timeout: 20_000 })
}

test("a cloth is created explicitly on the card, named in Reading, and opens by name", async ({ page }) => {
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })

  // The cloth row renders once the loom has loaded. Creation is explicit —
  // the card link itself must never mint a cloth — so the row offers exactly
  // one of the two doors.
  // Exactly one door (TJ, 2026-08-08): with a cloth the card body is the link,
  // without one Create Cloth is the only act. Either opens the READING — a
  // cloth starts where you read and gather, not where you name it.
  const create = card.getByRole("button", { name: "Create Cloth" })
  const door = card.locator("a.shelfmain")
  await expect(create.or(door)).toBeVisible({ timeout: 15_000 })
  await enterReadingFromCard(page, card)
  await loomLoaded(page)

  // The cloth is named on the work surface for its scope — inside a reading
  // that is 01 · Reading, at the head of the capture rail (TJ, 2026-08-08).
  await openCaptureLog(page)
  const fold = page.locator("details.invitefold", { hasText: "This cloth" })
  await expect(fold).toBeVisible({ timeout: 15_000 })
  if (!(await fold.locator("input").first().isVisible())) {
    await fold.locator("summary").click()
  }

  const titleInput = fold.getByPlaceholder(/a sentence or headline/)
  await expect(titleInput).toBeVisible()
  if ((await titleInput.inputValue()) !== CLOTH_TITLE) {
    await titleInput.fill(CLOTH_TITLE)
    const save = fold.getByRole("button", { name: /Save cloth|Saving…/ })
    await expect(save).toBeEnabled()
    await save.click()
    // Saved = no longer dirty: the button falls back to disabled once the
    // server row round-trips.
    await expect(save).toBeDisabled({ timeout: 15_000 })
  }

  // Back on the shelf: the card speaks the cloth's name outright — no hover,
  // no count — and says when it was last worked on.
  await page.goto("/")
  const cardAgain = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(cardAgain.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })
  await expect(cardAgain.locator(".clothname")).toHaveText(CLOTH_TITLE, { timeout: 15_000 })
  await expect(cardAgain.locator(".clothmeta")).toContainText(/edited/)
  // The name is information; the card body is the door, and there is only one.
  await expect(cardAgain.locator("a.shelfmain")).toHaveAttribute("href", /\/reading\/[^?]+$/)
  await expect(cardAgain.getByRole("button", { name: "Create Cloth" })).toHaveCount(0)
})
