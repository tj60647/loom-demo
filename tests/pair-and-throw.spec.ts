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
  /**
   * CENTRED, not merely "into view".
   *
   * `scrollIntoViewIfNeeded` does nothing for a node that is already inside
   * the viewport — including one resting in its last 28px, under the identity
   * footer. The band is `pointer-events:none` but `.footid` hands them back
   * (globals.css), so the bottom-left of the cloth sits under a live Sign out
   * button: measured at 1280x720, node 0 at y=712 with `.footid` spanning
   * 692-720, and `elementFromPoint` there returns BUTTON "Sign out". The
   * click would have signed the tester out rather than picking a concept.
   *
   * This is a resting-position problem, not a layout one — `main` reserves
   * 86px below its content for exactly this chrome, so there is always
   * somewhere to centre to. What put node 0 in the band on 2026-08-24 was the
   * cloth moving down 37px when 03's download buttons wrapped the mapbar from
   * 26px to 63px; measured by hiding them again, which returns node 0 to
   * y=675 and the pixel to the map.
   */
  await node.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }))
  // ONE evaluate: measuring the box in Playwright and hit-testing in the page
  // are two round trips, and a reflow between them tests a stale pixel.
  const onScreen = await node.evaluate((el) => {
    const b = el.getBoundingClientRect()
    return !!document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest("#map")
  })
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

  // --- the card is a bench, not a signpost (2026-08-19) --------------------
  // It offered a trip to 02 and nothing else; it now asks what the bench asks
  // — direction, and how they hang together — for the student who has done
  // this a dozen times and does not want a station change to write one
  // sentence. The door to 02 stays, and this spec still leaves by it.
  await pressNode(page, 0)
  await pressNode(page, 1, { shift: true })
  const names = await offer.locator(".pairpop-slot b").allTextContents()
  expect(names).toHaveLength(2)
  // From and To are named and the direction is pick order.
  await expect(offer.locator(".pairpop-slot").first()).toContainText("From")
  await expect(offer.locator(".pairpop-slot").last()).toContainText("To")
  // Swap reverses it, in place, without leaving the cloth.
  await offer.getByRole("button", { name: "swap" }).click()
  await expect
    .poll(async () => (await offer.locator(".pairpop-slot b").allTextContents()).join("|"))
    .toBe([names[1], names[0]].join("|"))
  await offer.getByRole("button", { name: "swap" }).click()
  await expect
    .poll(async () => (await offer.locator(".pairpop-slot b").allTextContents()).join("|"))
    .toBe(names.join("|"))
  // The description is editable here — and WITHOUT the bench's opener chips
  // (2026-08-19). They are the scaffold for a student stuck on how to begin,
  // and this card is the shortcut for one who is not; seven of them wrapping
  // over five rows was most of the popup. The bench keeps them, which
  // throw-tab's own coverage still holds.
  const say = offer.locator("textarea")
  await expect(say).toBeVisible()
  await expect(offer.locator(".openchip"), "the opener chips are the bench's, not the shortcut's").toHaveCount(0)
  await say.fill("this is a shortcut description")
  await expect(say).toHaveValue("this is a shortcut description")
  await say.fill("")

  // The label is offered and optional, and it lists the student's own Links so
  // a name already owned is REUSED rather than minted a second time — a Link
  // is an object (5.1), and findLink is the one place that decides two
  // spellings are the same word.
  const labelField = offer.locator("input.tinput")
  await expect(labelField).toBeVisible()
  await expect(labelField).toHaveValue("")
  await expect(offer.locator("#pairpop-links")).toHaveCount(1)

  await offer.getByRole("button", { name: /open on 02/ }).click()

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
