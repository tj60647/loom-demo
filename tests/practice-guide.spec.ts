/**
 * The guide, walked end to end — the journey a student actually takes.
 *
 * TJ, 2026-08-12: *"there is still work to do… they are still out of sync.
 * can you smoke test or playwright test? there needs to be a journey type test
 * for the guide."*
 *
 * That is what this is, and it is the only thing that can find the fault he
 * is describing. Every other guard on the guide checks a PREDICATE in
 * isolation — `scripts/check-practice-guide.ts` proves that `stepDone("sort")`
 * ticks for a state where a tier changed. What it cannot prove is that the
 * gesture the beat's own copy describes PRODUCES that state, through the
 * actual controls, with the mask up. That gap is where "out of sync" lives.
 *
 * So: seven beats, seven real gestures, and after each one the beat's own pip
 * must carry its tick. A beat that cannot be completed by doing what it says
 * fails here and nowhere else.
 *
 * Requires `npm run seed:demo`. Writes nothing — this is the practice loom.
 */
import { test, expect, type Page } from "@playwright/test"

test.use({ storageState: "playwright/.auth/testa.json" })

/** The pip for beat n (1-indexed) carries a tick. */
async function ticked(page: Page, n: number) {
  await expect(page.locator(".gstep").nth(n - 1)).toHaveClass(/done/, { timeout: 20_000 })
}

/** Move the guide on. The primary is "next ›" once the beat is done. */
async function onward(page: Page) {
  await page.locator(".guidefoot .btn").nth(1).click()
}

/** The beat the card is showing. */
async function beat(page: Page) {
  return ((await page.locator(".guidepop .gsay b").textContent()) ?? "").trim()
}

test.describe("The guide", () => {
  test("all seven beats can be completed by doing what they say", async ({ page }) => {
    test.setTimeout(180_000)

    const writes: string[] = []
    page.on("request", (r) => {
      if (r.method() === "POST" && !/\/api\/auth|_next|test-login/.test(r.url())) writes.push(r.url())
    })

    await page.goto("/sandbox")
    await expect(page.locator(".guidepop")).toBeVisible({ timeout: 30_000 })
    expect(await beat(page)).toContain("Open a reading")

    // ---- 1. open a reading -------------------------------------------------
    // Retried: the shelf is server-rendered, so the card is clickable a beat
    // before React has hydrated its handler.
    await expect(async () => {
      await page.locator("#practiceOpen").click()
      await expect(page.locator("#yourwork-toggle")).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] })
    await ticked(page, 1)
    await onward(page)
    expect(await beat(page)).toContain("Highlight a passage")

    // ---- 2. highlight a passage -------------------------------------------
    // A real drag, with the mask up. The beat turns the viewer to a page that
    // has words on it; the layer renders after the page does.
    await expect(page.locator(".react-pdf__Page__textContent span").first())
      .toBeAttached({ timeout: 40_000 })
    const line = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll(".react-pdf__Page__textContent span"))
        .filter((s) => (s.textContent ?? "").trim().length > 8)
      if (!spans.length) return null
      const a = spans[0].getBoundingClientRect()
      const b = spans[Math.min(3, spans.length - 1)].getBoundingClientRect()
      return { x1: a.left + 2, y1: a.top + a.height / 2, x2: b.right - 2, y2: b.top + b.height / 2 }
    })
    expect(line, "the guide turned to a page with text on it").toBeTruthy()
    await page.mouse.move(line!.x1, line!.y1)
    await page.mouse.down()
    await page.mouse.move(line!.x2, line!.y2, { steps: 14 })
    await page.mouse.up()
    await page.locator("#captureNow").click({ timeout: 15_000 })
    await ticked(page, 2)
    // No press here: the dialog opening IS the hand-off, and the guide is
    // already on the beat about that dialog.
    await expect(page.locator(".guidepop .gsay b")).toHaveText(/Keep it, and name it/, { timeout: 10_000 })

    // ---- 3. keep it, and name it ------------------------------------------
    // Both halves: the passage's own note, and a concept — which is optional
    // now (TJ, 2026-08-12), so the unlabeled path gets its own test below.
    await page.locator("#captureConcept").fill("going on anyway")
    await page.locator("#capturePassageNote").fill("A practice note on why these words.")
    await page.locator("#capturePassageSave").click()
    await ticked(page, 3)
    await onward(page)
    expect(await beat(page)).toContain("Say what you make of it")

    // ---- 4. the cloth ------------------------------------------------------
    await page.locator("#yourwork-toggle").click()
    await page.locator("#clothFold summary").click()
    await page.locator("#clothTitle").fill("A practice reading of the going")
    await page.locator("#clothSave").click()
    await ticked(page, 4)
    await onward(page)
    expect(await beat(page)).toContain("Throw a thread")

    // ---- 5. throw a thread -------------------------------------------------
    const warp = page.locator("#warp .crow")
    await expect(warp.first()).toBeVisible({ timeout: 20_000 })
    await warp.nth(0).click()
    await warp.nth(1).click()
    await page.getByPlaceholder("…or just start typing. Long and awkward is fine.")
      .fill("A practice thread: the one keeps turning into the other.")
    await page.locator("#throwIt").click()
    await ticked(page, 5)
    await onward(page)
    expect(await beat(page)).toContain("Make a projection")

    // ---- 6. make a projection ---------------------------------------------
    await page.locator("#newMap").click({ timeout: 20_000 })
    await ticked(page, 6)
    await onward(page)
    expect(await beat(page)).toContain("Take the kit")

    // ---- 7. take the kit ---------------------------------------------------
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#mapKit").click({ timeout: 20_000 }),
    ])
    expect(await download.suggestedFilename()).toContain("concept-map-kit")
    await ticked(page, 7)

    // Every pip green, and the whole walk wrote nothing to the server.
    await expect(page.locator(".gstep.done")).toHaveCount(7)
    expect(writes, `the guide wrote to the server: ${writes.join(", ")}`).toHaveLength(0)
  })

  test("a passage can be kept with no concept at all", async ({ page }) => {
    test.setTimeout(120_000)

    // The model has always allowed this — "A Passage with no Concepts is a
    // legal state… It may never gain a Concept, which is fine" — and the
    // capture dialog was the one surface in the app that refused it, holding
    // Save disabled until a name was typed (TJ, 2026-08-12).
    await page.goto("/sandbox")
    await expect(async () => {
      await page.locator("#practiceOpen").click()
      await expect(page.locator("#yourwork-toggle")).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] })

    const before = Number(
      ((await page.locator("#yourwork-toggle").textContent()) ?? "").match(/·\s*(\d+)/)?.[1] ?? 0
    )

    await page.locator(".gstep").nth(1).click()
    await expect(page.locator(".react-pdf__Page__textContent span").first())
      .toBeAttached({ timeout: 40_000 })
    const line = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll(".react-pdf__Page__textContent span"))
        .filter((s) => (s.textContent ?? "").trim().length > 8)
      if (!spans.length) return null
      const a = spans[0].getBoundingClientRect()
      const b = spans[Math.min(3, spans.length - 1)].getBoundingClientRect()
      return { x1: a.left + 2, y1: a.top + a.height / 2, x2: b.right - 2, y2: b.top + b.height / 2 }
    })
    expect(line).toBeTruthy()
    await page.mouse.move(line!.x1, line!.y1)
    await page.mouse.down()
    await page.mouse.move(line!.x2, line!.y2, { steps: 14 })
    await page.mouse.up()
    await page.locator("#captureNow").click({ timeout: 15_000 })

    // No concept. The button says so, and the note is the whole of what this
    // capture carries.
    await expect(page.locator("#capturePassageSave")).toBeEnabled()
    await expect(page.locator("#capturePassageSave")).toHaveText("Save unlabeled")
    // The concept's own description is not asked for when there is no concept.
    await expect(page.locator("#captureConceptDef")).toHaveCount(0)
    await page.locator("#capturePassageNote").fill("Kept before I knew what to call it.")
    await page.locator("#capturePassageSave").click()

    // It landed, and it says what it is rather than what it lacks.
    await expect(page.locator(".captoast")).toContainText(/unlabeled/i, { timeout: 15_000 })
    await expect
      .poll(async () =>
        Number(((await page.locator("#yourwork-toggle").textContent()) ?? "").match(/·\s*(\d+)/)?.[1] ?? 0)
      , { timeout: 15_000 })
      .toBe(before + 1)
  })
})
