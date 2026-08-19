/**
 * Pair and throw, from the cloth (TJ, 2026-08-18: "select 2 nodes and throw
 * them which would put you in linking with the 2 concept nodes populating the
 * 'throw a thread'").
 *
 * WHY THIS FILE EXISTS. The gesture is three states and two of them are
 * invisible to every other spec: nothing in the suite has ever clicked inside
 * the cloth SVG — the three specs that name it assert `#map` exists and stop
 * there — so the day a node stops taking a click, the suite stays green and
 * the feature is simply gone.
 *
 * READ-ONLY, and that is checkable rather than hopeful. Every step below is
 * client state: the pick and the offer live in ClothReflection, the station is
 * the Workbench's own tab, and the two slots are ThrowTab's `pairA`/`pairB`.
 * The one control on that path that reaches the server is `#throwIt`, which
 * this file never presses. That is the evidence playwright.config asks for
 * before a spec may join `READ_ONLY`.
 *
 * The nodes are SVG circles inside a scroller under fixed chrome, so the
 * clicks follow the pattern practice-guide's board drag had to learn the hard
 * way: bring the target into the scroller, prove with `elementFromPoint` that
 * the pixel really belongs to the cloth, and only then press.
 */
import { test, expect, type Page } from "@playwright/test"

test.use({ storageState: "playwright/.auth/testa.json" })
test.beforeEach(() => test.setTimeout(120_000))

/** The cloth's node hit circles — the wide invisible twins, not the drawn dots. */
const nodesOf = (page: Page) => page.locator('#map circle[cursor="pointer"]')

async function openTheCloth(page: Page) {
  await page.goto("/")
  const card = page.locator(".shelfcard", { hasText: "Object Worlds" }).first()
  await expect(card).toBeVisible({ timeout: 15_000 })
  // The tally renders "…" while the graph is in flight; clicking into that
  // re-render detaches the node (see helpers.enterReadingFromCard).
  await expect(card.locator(".shelftally")).not.toHaveText("…", { timeout: 15_000 })
  await card.locator("a.shelfmain").click()
  await expect(page).toHaveURL(/\/reading\//, { timeout: 15_000 })
  await expect(page.getByText("Loading your loom...")).toHaveCount(0, { timeout: 20_000 })
  await page.locator("nav button", { hasText: "Knowledge Graph" }).click()
  await expect(page.locator("#map")).toHaveCount(1, { timeout: 20_000 })
}

/**
 * Press a concept node. `visible` is not "on screen" for an SVG child: one
 * scrolled under the journey bar still reports a box, and a click at those
 * coordinates lands on the bar instead.
 */
async function pressNode(page: Page, i: number, opts: { shift?: boolean } = {}) {
  const node = nodesOf(page).nth(i)
  await expect(node).toBeVisible({ timeout: 15_000 })
  await node.scrollIntoViewIfNeeded()
  const box = (await node.boundingBox())!
  const onScreen = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x, y)?.closest("#map"),
    [box.x + box.width / 2, box.y + box.height / 2]
  )
  expect(onScreen, "the concept being pressed must be on screen, not under the chrome").toBe(true)
  await node.click(opts.shift ? { modifiers: ["Shift"] } : undefined)
}

test("a concept picks, a shift-click pairs it, and the offer takes both to 02", async ({ page }) => {
  await openTheCloth(page)

  const nodes = nodesOf(page)
  expect(
    await nodes.count(),
    "seed missing — run `npm run seed:demo` first; the pair needs two concepts"
  ).toBeGreaterThanOrEqual(2)

  const offer = page.locator(".pairpop")
  const picked = page.locator('#map circle[fill="var(--red)"]')

  // --- one pick, then a second -------------------------------------------
  await pressNode(page, 0)
  await expect(picked).toHaveCount(1)
  await expect(offer).toBeHidden()

  await pressNode(page, 1, { shift: true })
  await expect(picked).toHaveCount(2)
  await expect(offer).toBeVisible()
  // It names both, in pick order — the only thing on screen that says which
  // way the thread will run.
  await expect(offer.locator("b")).toHaveCount(2)

  // --- the × puts the pair down (TJ: "there is a 'cancel' x in the popup") -
  await offer.getByRole("button", { name: /^Cancel/ }).click()
  await expect(offer).toBeHidden()
  await expect(picked).toHaveCount(0)

  // --- Escape does too, without a key handler of ours (popover="auto") ----
  await pressNode(page, 0)
  await pressNode(page, 1, { shift: true })
  await expect(offer).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(offer).toBeHidden()
  await expect(picked).toHaveCount(0)

  // --- the throw ----------------------------------------------------------
  await pressNode(page, 0)
  await pressNode(page, 1, { shift: true })
  const names = await offer.locator("b").allTextContents()
  await offer.getByRole("button", { name: /Link these two on 02/ }).click()

  // The bench arrives loaded, on the station the offer named. `:visible`
  // matters everywhere here: the workbench keeps all four panels mounted
  // (Workbench's KEEP_ALIVE), so an unscoped match finds a hidden tab's copy.
  await expect(page.locator("#throwBench .slot.filled")).toHaveCount(2, { timeout: 15_000 })
  const slots = await page.locator("#throwBench .slot").allInnerTexts()
  expect(slots[0]).toContain(names[0])
  expect(slots[1]).toContain(names[1])
  // Step 3 of the rail, which is what "say how they hang together first"
  // promised — the two picks are already made.
  await expect(page.locator(".steprail .rstep.now")).toContainText("Say how they relate")
  // And the offer went with the trip, rather than following the student here.
  await expect(offer).toBeHidden()

  // NOTHING IS THROWN. `#throwIt` is the one control on this path that writes,
  // and leaving it unpressed is what keeps this spec in the read-only project.
  await expect(page.locator("#throwIt")).toBeEnabled()
})

test("a third concept, pressed while the offer is up, starts the pair over", async ({ page }) => {
  await openTheCloth(page)
  const nodes = nodesOf(page)
  test.skip((await nodes.count()) < 3, "needs three concepts in the seeded cloth")

  const offer = page.locator(".pairpop")
  const picked = page.locator('#map circle[fill="var(--red)"]')

  await pressNode(page, 0)
  await pressNode(page, 1, { shift: true })
  await expect(offer).toBeVisible()

  /* The one case the browser makes genuinely hard. A plain click on a third
     node both light-dismisses the popover and picks — and the popover's
     `toggle` fires in a task of its OWN, measured ~17ms after the click, so a
     dismiss handler that simply cleared the pair always landed last and threw
     the new pick away. One red node here is the whole assertion. */
  await pressNode(page, 2)
  await expect(offer).toBeHidden()
  /* THE PAUSE IS THE ASSERTION, and this spec did not catch the bug without
     it. The failure is a LATE clear, so for one frame the pick is correct even
     when it is about to be thrown away — and `toHaveCount` polls, so it
     latched onto that frame and went green against a deliberately reverted
     fix. Waiting past the toggle is what makes the assertion about the
     settled state. Measured at 17ms on Chromium; 400 is the margin. */
  await page.waitForTimeout(400)
  await expect(picked).toHaveCount(1)
  await expect(offer).toBeHidden()
})
