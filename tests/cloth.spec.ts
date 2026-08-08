/**
 * The cloth loop, shelf → Linking → shelf (the model's reading-card ruling:
 * badge with titles, explicit Create Cloth, Open Cloth by name — rulings
 * 20–22, 33 — plus the Cloth Title/Description edited on 02 · Linking).
 *
 * Unlike the journey file this spec cannot remove what it makes — the UI has
 * no single-cloth delete (Keep's reset clears everything, far too blunt) — so
 * it is written to pass against both a virgin and an already-clothed seed:
 * whichever of Create/Open the card offers is the door it takes, and the
 * title is only saved when it differs.
 */
import { test, expect } from "@playwright/test"

test.use({ storageState: "playwright/.auth/testa.json" })
test.beforeEach(() => test.setTimeout(120_000))

const CLOTH_TITLE = "A cloth titled by the Playwright suite"

async function loomLoaded(page: import("@playwright/test").Page) {
  await expect(page.getByText("Loading your loom...")).toHaveCount(0, { timeout: 20_000 })
}

test("a cloth is created explicitly on the card, titled in Linking, and opens by name", async ({ page }) => {
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })

  // The cloth row renders once the loom has loaded. Creation is explicit —
  // the card link itself must never mint a cloth — so the row offers exactly
  // one of the two doors.
  const create = card.getByRole("button", { name: "Create Cloth" })
  const open = card.locator(".clothopen")
  await expect(create.or(open.first())).toBeVisible({ timeout: 15_000 })

  // Either door opens the READING (TJ, 2026-08-08): a cloth starts where you
  // read and gather, not where you name it.
  if (await create.isVisible()) {
    await create.click()
  } else {
    await open.first().click()
  }
  await expect(page).toHaveURL(/\/reading\//, { timeout: 15_000 })

  // The title lives on 02 · Linking, and is named whenever the student likes —
  // an untitled cloth is a fine state.
  await page.locator("nav button", { hasText: "Linking" }).click()
  await loomLoaded(page)
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
  // It opens the reading — where reading and gathering happen.
  await expect(cardAgain.locator(".clothopen")).toHaveAttribute("href", /\/reading\/[^?]+$/)
})
