/**
 * SAVING A PASSAGE MUST NOT DRAW A FORK.
 *
 * TJ, 2026-08-26: "the save a passage is acting weird. i see a three pronged
 * shape before the rail card shows up."
 *
 * WHAT IT WAS. `addPassage` inserts an optimistic passage the moment Save is
 * pressed (LoomProvider), and CaptureFields keeps the editor open until the
 * server answers, so a failed save does not throw away what was typed. Both
 * are right, and together they put the SAME passage on screen twice for the
 * length of the request: the draft card, and a real rail card at the same
 * anchor. ConceptRail draws one leader line per card, so two lines left the
 * same point in the text — and with the neighbouring card's line beside them,
 * that is the three prongs.
 *
 * WHAT IS ASSERTED, and why it is this and not a screenshot. The defect has an
 * exact signature in the DOM — two `<path>` elements whose `M x y` is
 * identical — and it is gone by the time the save settles, so no `expect` that
 * polls a resting state can ever see it. The page therefore samples itself on
 * every frame across the save, and the assertion runs on the record
 * afterwards. Against the bug it reports 92 of 269 frames, about a second and
 * a half; with either half of the fix in place, none.
 *
 * AGAINST A BASELINE, NOT AGAINST ZERO. Two leaders from one point is not
 * always wrong: capture the same words twice and there are honestly two
 * passages at one anchor. What must not happen is the save ADDING such a pair.
 * So the frame before the press is the baseline and the assertion is on the
 * increase — which also means a reading left dirty by an earlier run cannot
 * turn this green or red on its own.
 *
 * IT WRITES, and cleans up in afterEach rather than at the end of the body:
 * three earlier runs of this spec failed after saving, stranded their captures
 * on the seed, and the next run then measured five real passages at one anchor
 * and blamed the code. Cleanup that only runs on success is not cleanup.
 */
import { test, expect, type Page } from "@playwright/test"
import { deletePassageInPassagesView, openReading, openYourWork } from "./helpers"

test.use({ storageState: "playwright/.auth/testa.json" })
test.beforeEach(() => test.setTimeout(180_000))

type Frame = { t: number; leaders: number; dupes: number; cards: number; drafts: number }

/** Set by the test as soon as the passage exists, so afterEach can remove it. */
let strandedId: string | null = null

test.afterEach(async ({ page }) => {
  if (!strandedId) return
  // Its OWN budget. Hooks spend the test's remaining time, and this body uses
  // most of 180s opening a 60-page scan — so the first version of this cleanup
  // timed out and failed a run whose assertions had all passed.
  test.setTimeout(120_000)
  const id = strandedId
  strandedId = null
  try {
    // Back into the reading with Your work open: the helper drives the panel's
    // own controls, and on the shelf there are none — the first version went
    // to "/" and hung there until the hook's budget ran out.
    if (!(await page.locator("#yourwork").isVisible().catch(() => false))) {
      await openReading(page, "Object Worlds")
      await openYourWork(page, "passages")
    }
    await deletePassageInPassagesView(page, id)
  } catch {
    // Say it rather than swallow it: a stranded capture is what made three
    // runs of this spec lie, and the next reader needs the id to sweep it.
    console.error(`[capture-leaders] could not remove passage ${id} — remove it by hand`)
  }
})

/** How many leader lines leave a point that another leader also leaves from. */
const dupesOf = (page: Page) =>
  page.evaluate(() => {
    const origins = [...document.querySelectorAll(".pdf-rail-leaders path")].map(
      (n) => (n.getAttribute("d") ?? "").split(" L ")[0]
    )
    return origins.length - new Set(origins).size
  })

test("saving a passage never adds a second leader from one place in the text", async ({ page }) => {
  await openReading(page, "Object Worlds")
  await expect(page.locator(".loom-text-layer span, .textLayer span").first()).toBeAttached({ timeout: 60_000 })

  /**
   * A real selection, built in the page, over text NOBODY HAS MARKED. Playwright
   * cannot drag-select inside pdf.js's text layer reliably, and what arms the
   * capture is a Selection plus a mouseup — which is what this makes. Skipping
   * marked spans keeps the new passage's anchor its own, so the pair this
   * counts can only be the draft and its twin.
   */
  const selected = await page.evaluate(() => {
    const spans = [...document.querySelectorAll(".loom-text-layer span, .textLayer span")].filter(
      (s) => (s.textContent ?? "").trim().length > 25 && !s.querySelector(".loom-passage-highlight")
    )
    if (!spans.length) return ""
    const span = spans[Math.min(20, spans.length - 1)]
    const range = document.createRange()
    range.selectNodeContents(span)
    const selection = getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    return (span.textContent ?? "").trim()
  })
  expect(selected.length, "no unmarked selectable text — is the seed's text layer intact?").toBeGreaterThan(20)

  await page.locator("#captureNow").click()
  await expect(page.locator(".pdf-draftcard")).toBeVisible({ timeout: 20_000 })
  const baseline = await dupesOf(page)

  await page.evaluate(() => {
    const w = window as unknown as { __leaderFrames: unknown[]; __leaderStop: boolean }
    w.__leaderFrames = []
    w.__leaderStop = false
    const start = performance.now()
    const tick = () => {
      const origins = [...document.querySelectorAll(".pdf-rail-leaders path")].map(
        (n) => (n.getAttribute("d") ?? "").split(" L ")[0]
      )
      w.__leaderFrames.push({
        t: Math.round(performance.now() - start),
        leaders: origins.length,
        dupes: origins.length - new Set(origins).size,
        cards: document.querySelectorAll(".pdf-railcard").length,
        drafts: document.querySelectorAll(".pdf-draftcard").length,
      })
      if (!w.__leaderStop && performance.now() - start < 6_000) requestAnimationFrame(tick)
    }
    tick()
  })

  await page.getByRole("button", { name: /save without concept/i }).click()
  await expect(page.locator(".pdf-draftcard")).toHaveCount(0, { timeout: 45_000 })
  // Past the id swap: the optimistic row is replaced by the server's, which
  // re-anchors the card, and that is the last thing that moves.
  await page.waitForTimeout(2_500)

  /**
   * STOP SAMPLING HERE. Everything below is the test finding the id and
   * cleaning up, and opening Your work narrows the spread and re-places every
   * card — which coincides origins for reasons that have nothing to do with a
   * save. Left running, the sampler reported ~150 forked frames against code
   * that was already fixed, and I believed it for three runs.
   */
  await page.evaluate(() => {
    ;(window as unknown as { __leaderStop: boolean }).__leaderStop = true
  })

  /**
   * The id FIRST, so a failing assertion below still leaves a cleanable trail.
   * Through the helper, not a bare click on the toggle: it checks
   * `aria-expanded` before pressing — a blind click closes a panel that is
   * already open — and polls until the sheet's 200ms slide has settled, which
   * Playwright's actionability check does not wait for (Copilot, #41).
   */
  await openYourWork(page, "passages")
  const row = page.locator("#yourwork .ywpassage").filter({ hasText: selected.slice(0, 24) }).first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  strandedId = await row.getAttribute("data-passage-id")
  expect(strandedId, "the capture did not reach the server").toMatch(/^[0-9a-f-]{36}$/)

  const frames = (await page.evaluate(
    () => (window as unknown as { __leaderFrames: Frame[] }).__leaderFrames
  )) as Frame[]
  expect(frames.length, "the sampler never ran").toBeGreaterThan(30)

  const worst = Math.max(...frames.map((f) => f.dupes))
  expect(
    worst,
    `the save added ${worst - baseline} leader(s) from a point that already had one, in ${
      frames.filter((f) => f.dupes > baseline).length
    } of ${frames.length} frames — the draft and its optimistic twin are both on screen (see isDraftTwin in PdfViewer)`
  ).toBeLessThanOrEqual(baseline)
})

/**
 * AND IT MUST NOT HIDE WORK THAT WAS ALREADY THERE.
 *
 * The first version of the fix matched the optimistic row by anchor alone, so
 * it could not tell "the echo of this save" from "a passage that was on the
 * page before I started". Opening a capture over already-marked text therefore
 * erased that passage's card and highlight for as long as the editor stayed
 * open — and the editor stays open while a note is being typed. Measured
 * before the second fix: 1 rail card, then 0.
 *
 * Nothing covered it, which is how it shipped: the spec above asserts what a
 * save may not ADD, and this one asserts what opening a capture may not TAKE
 * AWAY. Copilot found it on #41 by reading the predicate against this file's
 * own stated premise — that two passages at one anchor are legitimate.
 *
 * READ-ONLY: it opens the editor and abandons it. Nothing is saved, so there
 * is nothing to sweep.
 */
test("opening a capture over marked text leaves that passage's card alone", async ({ page }) => {
  await openReading(page, "Object Worlds")
  const marks = page.locator(".loom-passage-highlight")
  await expect(marks.first(), "seed has no marked passage on this spread — run `npm run seed:demo`").toBeVisible({
    timeout: 60_000,
  })
  // The cards follow the marks by a beat — the anchors are measured from the
  // painted marks — so counting on the mark alone reads zero.
  await expect(page.locator(".pdf-railcard").first()).toBeVisible({ timeout: 30_000 })
  const cardsBefore = await page.locator(".pdf-railcard").count()
  expect(cardsBefore, "this spread must carry at least one existing card").toBeGreaterThan(0)

  // Select exactly what is already marked — the same words, so the same anchor.
  await page.evaluate(() => {
    const marked = [...document.querySelectorAll(".loom-passage-highlight")]
    const range = document.createRange()
    range.setStartBefore(marked[0])
    range.setEndAfter(marked[marked.length - 1])
    const selection = getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
  })
  await page.locator("#captureNow").click()
  await expect(page.locator(".pdf-draftcard")).toBeVisible({ timeout: 20_000 })

  // The draft is a card BESIDE the existing one, never instead of it.
  await expect(page.locator(".pdf-railcard")).toHaveCount(cardsBefore)
  await expect(marks.first()).toBeVisible()

  // Escape abandons the draft, and everything is as it was.
  await page.locator(".pdf-draftcard").press("Escape")
  await expect(page.locator(".pdf-draftcard")).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator(".pdf-railcard")).toHaveCount(cardsBefore)
})
