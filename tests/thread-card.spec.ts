/**
 * The thread card, drawn the same way wherever it appears (docs/thread-card.md).
 *
 * WHAT THIS GUARDS is not that a thread renders — three other specs already
 * lean on that — but the INVARIANT the card exists to hold, which no spec could
 * state while every surface hand-rolled its own row:
 *
 *     a pill appears if and only if the thread has a label.
 *
 * That is exactly what /admin/user/[id] got wrong until it adopted this card (2026-08-18). It
 * put `→` inside the SOLID `.v` — the cloth's mark for a beaten thread — so its
 * six threads drew six pills over one real label, and every loose thread on the
 * page read as labelled. Nothing failed; the page simply said something untrue.
 *
 * READ-ONLY, with the evidence playwright.config asks for: every assertion here
 * is a count or a class on an already-rendered list. It opens no editor, presses
 * no `.act`, no `.rm` and no `#throwIt`, and the two admin surfaces have no
 * write controls on them at all.
 */
import { test, expect, type Page, type Locator } from "@playwright/test"

/**
 * The one rule, asserted over whatever cards are on screen.
 *
 * Counted rather than walked per row on purpose: `.v` is what claims "labelled"
 * and `.pill.beaten` is what states it, so the two totals disagreeing IS the
 * defect, whichever row caused it. `.tarrow` takes up the slack — every card
 * shows one or the other between its ends, never both and never neither.
 */
async function pillsMatchLabels(scope: Page | Locator, where: string) {
  const cards = scope.locator(".thread[data-edge-id]")
  const n = await cards.count()
  expect(n, `${where}: no thread cards to check — the fixture is empty`).toBeGreaterThan(0)

  const labelled = await scope.locator(".thread .pill.beaten").count()
  const loose = await scope.locator(".thread .pill.loose").count()
  const pills = await scope.locator(".thread .v").count()
  const arrows = await scope.locator(".thread .tarrow").count()

  expect(labelled + loose, `${where}: every card says what it is, exactly once`).toBe(n)
  expect(pills, `${where}: a label pill appears if and only if there is a label`).toBe(labelled)
  expect(arrows, `${where}: an unlabelled card shows direction instead of a label`).toBe(loose)

  /* The sentence is a DIRECT child of the card root — the contract three other
     specs depend on (see `threadOf` in link-object.spec.ts). Counted against
     every `.sent` there IS rather than against the number of cards: a thread
     may be thrown and not yet described (P0.3), and since 2026-08-19 a card
     with nothing to quote draws no `.sent` at all rather than an empty pair of
     quote marks. What must hold is that none of them is nested. */
  const sentences = await scope.locator(".thread .sent").count()
  expect(
    await scope.locator(".thread[data-edge-id] > .sent").count(),
    `${where}: every .sent is a direct child of its card`
  ).toBe(sentences)
  expect(sentences, `${where}: no card carries two sentences`).toBeLessThanOrEqual(n)
}

test.describe("The thread card", () => {
  test.beforeEach(() => test.setTimeout(120_000))

  test.describe("the student's own threads", () => {
    test.use({ storageState: "playwright/.auth/testa.json" })

    test("02 · Linking draws every thread as a card, and a pill means a label", async ({ page }) => {
      await page.goto("/")
      const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
      await expect(card).toBeVisible({ timeout: 15_000 })
      await expect(card.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })
      await card.locator("a.shelfmain").click()
      await expect(page).toHaveURL(/\/reading\//, { timeout: 15_000 })
      await expect(page.getByText("Loading your loom...")).toHaveCount(0, { timeout: 20_000 })
      await page.locator("nav button", { hasText: "Linking" }).click()

      const list = page.locator("#threadList")
      await expect(list.locator(".thread").first()).toBeVisible({ timeout: 20_000 })
      await pillsMatchLabels(list, "02 · Linking")

      // The card, not a hand-rolled row: the spine that says which object this
      // is, and the id that three other specs now take as their handle.
      const cards = list.locator(".thread")
      const n = await cards.count()
      await expect(list.locator(".thread.ywcard.ywthread")).toHaveCount(n)
      await expect(list.locator(".thread[data-edge-id]")).toHaveCount(n)
    })
  })

  test.describe("a student's threads, read by staff", () => {
    test.use({ storageState: "playwright/.auth/user.json" })

    test("/admin/user/[id] draws the same card — and no longer pills an unlabelled thread", async ({ page }) => {
      // The roster's Open Loom became the read-only mode's door on
      // 2026-08-21; the summary page this test exercises is still routable,
      // just unlinked — reach it by the id the enter link carries.
      await page.goto("/admin")
      const door = page.locator("a.openloom").first()
      await expect(door).toBeVisible({ timeout: 20_000 })
      const href = await door.getAttribute("href")
      const userId = new URL(href ?? "", "http://resolve.invalid").searchParams.get("user")
      expect(userId, "the enter link carries the student's id").toBeTruthy()
      await page.goto(`/admin/user/${userId}`)
      await expect(page.getByRole("heading", { name: "Student Loom (Read-Only)" })).toBeVisible({ timeout: 20_000 })
      await expect(page.locator(".thread").first()).toBeVisible({ timeout: 20_000 })

      // THE REGRESSION THIS FILE IS NAMED FOR. Before the card, this page drew
      // `<span class="v">{handle || "→"}</span>` — one solid pill per thread
      // whether or not there was a label to put in it.
      await pillsMatchLabels(page, "/admin/user/[id]")
      await expect(
        page.locator(".thread .v", { hasText: "→" }),
        "an arrow is direction, and must never be drawn in the label pill"
      ).toHaveCount(0)
    })

    test("/admin/aggregate draws the same card, reduced, and says whose each thread is when asked", async ({ page }) => {
      await page.goto("/admin/aggregate")
      await expect(page.locator(".thread").first()).toBeVisible({ timeout: 30_000 })
      // The invariant this file exists for holds on the reduced card too: the
      // pill is what `compact` keeps.
      await pillsMatchLabels(page, "/admin/aggregate")

      // THE LIST IS COMPACT since 2026-08-22 (TJ: "the thread cards need to
      // be simpler, jsut show the thread, not description or contributor,
      // that will show up below when selected"). So the list's cards carry
      // neither sentence nor attribution — asserted as ZERO rather than left
      // unstated, since "no .sent anywhere" would otherwise let the shared
      // helper's sentence checks pass vacuously here.
      const list = page.locator(".canvasmenu.atright")
      const n = await list.locator(".thread[data-edge-id]").count()
      expect(n, "no thread cards — the fixture is empty").toBeGreaterThan(0)
      await expect(list.locator(".thread .sent")).toHaveCount(0)
      await expect(list.locator(".thread .tmeta .cap")).toHaveCount(0)

      // "Below when selected" is the other half of the same sentence, and it
      // is where attribution went — this is still the only surface with more
      // than one student in it, so it must still say whose a thread is.
      await list.locator(".thread[data-edge-id]").first().click()
      const readout = page.locator(".canvasfoot")
      await expect(readout.locator(".threadhead")).toBeVisible()
      await expect(readout.locator(".threadhead .n")).not.toBeEmpty()
    })
  })
})
