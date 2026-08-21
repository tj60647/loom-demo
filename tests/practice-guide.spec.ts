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
 * So: every beat, its real gesture, and after each one that beat's own pip
 * must carry its tick. A beat that cannot be completed by doing what it says
 * fails here and nowhere else.
 *
 * Requires `npm run seed:demo`. Writes nothing — this is the practice loom.
 */
import { test, expect, type Page } from "@playwright/test"
import { GUIDE_STEPS } from "../src/lib/practiceGuide"

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

/** Which page(s) the viewer is showing — a spread reads as "6,7". */
async function pageLabel(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".react-pdf__Page[data-page-number]"))
      .map((el) => el.getAttribute("data-page-number"))
      .join(",")
  )
}

/** The whole instruction the card is showing, beat name included. */
async function says(page: Page) {
  return ((await page.locator(".guidepop .gsay").textContent()) ?? "").trim()
}

/**
 * The glow is sitting on `selector` — compared by geometry, because that is
 * what a student sees. Tolerant of the ring's own padding.
 */
async function ringSits(page: Page, selector: string) {
  await expect
    .poll(async () =>
      page.evaluate((sel) => {
        const ring = document.querySelector(".guideglow")?.getBoundingClientRect()
        const target = document.querySelector(sel)?.getBoundingClientRect()
        if (!ring || !target) return "missing"
        const off = Math.abs(ring.top - target.top) + Math.abs(ring.left - target.left)
        return off < 20 ? "on" : `off by ${Math.round(off)}px`
      }, selector)
    , { timeout: 15_000, message: `the glow should be on ${selector}` })
    .toBe("on")
}

test.describe("The guide", () => {
  test("every beat can be completed by doing what it says", async ({ page }) => {
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
    // The page these words came from — the student must still be on it after
    // the capture lands (below).
    const capturedOn = await pageLabel(page)

    await page.locator("#captureNow").click({ timeout: 15_000 })
    await ticked(page, 2)
    // No press here: the dialog opening IS the hand-off, and the guide is
    // already on the beat about that dialog.
    await expect(page.locator(".guidepop .gsay b")).toHaveText(/Keep it, and name it/, { timeout: 10_000 })
    expect(await pageLabel(page), "the hand-off must not turn the page").toBe(capturedOn)

    // ---- 3. keep it, and name it ------------------------------------------
    // Both halves: the passage's own note, and a concept — which is optional
    // now (TJ, 2026-08-12), so the unlabeled path gets its own test below.
    // The note first, because the caret starts there now (2026-08-19) and the
    // form is written in that order. Naming is behind a disclosure, closed by
    // default, so the concept costs a press before it can be typed — which is
    // the point of the beat: keeping the words and naming them are two acts.
    await page.locator("#capturePassageNote").fill("A practice note on why these words.")
    await page.locator("#captureConceptToggle").click()
    await page.locator("#captureConcept").fill("going on anyway")
    await page.locator("#capturePassageSave").click()
    await ticked(page, 3)

    // TJ, 2026-08-12: *"stage 3 of guide does not stay on page where passage
    // was captured."* The focus effect depended on `state.passages`, so the
    // instant a capture landed it re-fired and turned to the FIRST passage
    // carrying a page number — one of the worked cloth's, elsewhere in the
    // book. Poll: the jump took a beat to happen, so an immediate read passed.
    await page.waitForTimeout(1_500)
    expect(await pageLabel(page), "capturing must not throw you off the page").toBe(capturedOn)
    await onward(page)
    // ---- 4. throw a thread -------------------------------------------------
    // Three gestures, and the ring walks them (TJ, 2026-08-12: *"there are 3
    // parts to step 4. tap 2 concepts, describe the link, and throw it. the
    // glow should move with this."*). The hole stays the whole bench — the
    // ring is the pointer, not the constraint.
    const warp = page.locator("#warp .crow")
    await expect(warp.first()).toBeVisible({ timeout: 20_000 })
    await ringSits(page, "#warp")
    expect(await says(page)).toContain("Press Select on a concept in the warp")

    // Select, not the row: since 2026-08-18 clicking a warp row OPENS the
    // concept card, as it does in Your work, and picking has its own button.
    await warp.nth(0).getByRole("button", { name: /select/i }).click()
    await warp.nth(1).getByRole("button", { name: /select/i }).click()
    await ringSits(page, "#throwBench .form-row")
    expect(await says(page)).toContain("The bench is awake")

    await page.getByPlaceholder("…or just start typing. Long and awkward is fine.")
      .fill("A practice thread: the one keeps turning into the other.")
    await ringSits(page, "#throwIt")
    expect(await says(page)).toContain("Throw it")

    await page.locator("#throwIt").click()
    await ticked(page, 4)
    await onward(page)
    expect(await beat(page)).toContain("Make a projection")

    // ---- 5. make a projection ---------------------------------------------
    await page.locator("#newMap").click({ timeout: 20_000 })
    await ticked(page, 5)
    await onward(page)
    expect(await beat(page)).toContain("Sort into tiers")

    // ---- 6. sort it --------------------------------------------------------
    // The new projection arrives EMPTY, so every chip is a real press — which
    // is the whole reason making one comes first (TJ, 2026-08-12).
    const firstRow = page.locator("#triageList .trow").first()
    await expect(firstRow).toBeVisible({ timeout: 20_000 })
    const primary = firstRow.locator(".tierchips .tchip").first()
    await expect(primary).not.toHaveClass(/on/)
    await primary.click()
    await expect(primary).toHaveClass(/on/)
    await ticked(page, 6)
    await onward(page)
    expect(await beat(page)).toContain("Arrange the board")

    // ---- 7. arrange the board ---------------------------------------------
    // A real drag of a real card. The sorted concept landed on the board a
    // moment ago; move it and the beat follows.
    const card = page.locator("#cardTable g[data-card]").first()
    await expect(card).toBeVisible({ timeout: 20_000 })
    // Bring the CARD itself into the scroller before pressing on it. `visible`
    // is not "on screen": an SVG node scrolled above the top of `main` still
    // reports a box, and a raw mouse.down at those coordinates lands on
    // whatever is painted there — the journey bar. That is what made this beat
    // fail two runs in three (2026-08-12); the guide's own scroll now aligns a
    // too-tall target by its top, and this makes the test independent of it.
    await card.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    const box = (await card.boundingBox())!
    const onScreen = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest("#cardTable"),
      [box.x + box.width / 2, box.y + box.height / 2]
    )
    expect(onScreen, "the card the beat asks you to drag must be on screen").toBe(true)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40, { steps: 12 })
    await page.mouse.up()
    await ticked(page, 7)
    await onward(page)
    expect(await beat(page)).toContain("Take the kit")

    // ---- 8. take the kit ---------------------------------------------------
    // The kit is an ObjectDownload since 2026-08-12, so `#mapKit` is the pair
    // and either file completes the beat. Taking the .md, which is what the
    // beat is about — the sheet you draw the map from.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#mapKit button", { hasText: /\.md$/ }).click({ timeout: 20_000 }),
    ])
    expect(await download.suggestedFilename()).toContain("concept-map-kit")
    await ticked(page, 8)

    // Every pip green, and the whole walk wrote nothing to the server.
    await expect(page.locator(".gstep.done")).toHaveCount(8)
    expect(writes, `the guide wrote to the server: ${writes.join(", ")}`).toHaveLength(0)

    // ---- the ending ---------------------------------------------------------
    // The walk above ticked every beat and then stopped, which is exactly how
    // the guide shipped with no ending: the last beat said "Press next" over a
    // button that was `disabled` because there was nowhere to advance to (TJ,
    // 2026-08-12: *"the instructions are to press next, but the next is not
    // active"*). So the last thing this test does is press it.
    const finish = page.locator(".guidefoot .btn").nth(1)
    await expect(finish).toBeEnabled()
    await expect(finish).toHaveText("done ›")
    await expect(page.locator(".guidepop .gdone")).not.toContainText("Press next")
    await finish.click()

    // Done EXITS (TJ, 2026-08-21: "clicking done on the last slide should
    // exit guide") — a document navigation back to the real shelf, not a
    // hide behind a reopen chip. Finishing the walkthrough ends it; the
    // header's guide link is the way back in, and it still works.
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })
    await expect(page.locator(".guidepop")).toHaveCount(0)
    await page.goto("/sandbox")
    await expect(page.locator(".guidepop")).toBeVisible({ timeout: 30_000 })
  })

  test("scrolling away from the glow leaves a way back to it", async ({ page }) => {
    test.setTimeout(120_000)

    // TJ, 2026-08-12: *"in many pages it is possible to scroll away from the
    // 'glowing button/card'. how do we indicate where the 'glow' is?"* — on
    // a Library many cards deep, and the beat goes on saying "press
    // the glowing card" with nothing glowing anywhere on screen.
    await page.goto("/sandbox")
    await expect(page.locator(".guidepop")).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(".guideglow")).toBeVisible()
    await expect(page.locator(".gfind")).toHaveCount(0)

    // Scroll the one openable card clean out of the viewport — UPWARD, which
    // is the direction that does it: the practice reading sorts last on the
    // shelf, so the guide arrives with the Library scrolled to its foot
    // and scrolling back to the top is what loses the glow. This is also the
    // wheel going through a mask pane, which used to swallow it entirely: a
    // fixed pane is not in `main`'s scroll chain, so the page moved or did not
    // depending on where the pointer happened to be.
    await page.mouse.move(700, 500)
    await expect
      .poll(async () => page.evaluate(() => document.querySelector(".gpane") !== null))
      .toBe(true)
    await page.mouse.wheel(0, -2_500)
    await expect
      .poll(async () =>
        page.locator("#practiceOpen").evaluate((el) => {
          const box = el.getBoundingClientRect()
          return box.bottom < 0 || box.top > window.innerHeight
        })
      , { timeout: 10_000 })
      .toBe(true)

    // The card offers the way back, and taking it brings the glow with it.
    const find = page.locator(".gfind")
    await expect(find).toBeVisible({ timeout: 10_000 })
    await find.click()
    await expect
      .poll(async () =>
        page.locator("#practiceOpen").evaluate((el) => {
          const box = el.getBoundingClientRect()
          return box.top >= 0 && box.bottom <= window.innerHeight
        })
      , { timeout: 10_000 })
      .toBe(true)
    await expect(page.locator(".guideglow")).toBeVisible()
    await expect(find).toHaveCount(0)
  })

  test("no beat can strand you with neither a glow nor a way back to it", async ({ page }) => {
    test.setTimeout(180_000)

    // TJ, 2026-08-12: *"this is something each beat needs, if the action to
    // take is off screen the guide card needs to offer some direction."* So
    // this is the rule, checked on every beat at both ends of the scroll:
    // whenever the beat has a live control on the page, the student can either
    // SEE it glowing or press one button to get back to it. Never neither.
    await page.goto("/sandbox")
    await expect(page.locator(".guidepop")).toBeVisible({ timeout: 30_000 })
    await expect(async () => {
      await page.locator("#practiceOpen").click()
      await expect(page.locator("#yourwork-toggle")).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] })

    await expect(page.locator(".gstep")).toHaveCount(GUIDE_STEPS.length)

    for (const [i, step] of GUIDE_STEPS.entries()) {
      await page.locator(".gstep").nth(i).click()
      await page.waitForTimeout(1_200)
      const label = await beat(page)

      // A beat already performed is exempt: its card says "Done. Press next."
      // and there is no action left to be off screen.
      if (await page.locator(".gstep").nth(i).evaluate((el) => el.classList.contains("done"))) continue

      for (const end of ["top", "bottom"] as const) {
        await page.evaluate((to) => {
          for (const el of Array.from(document.querySelectorAll<HTMLElement>("main, .scrollbox"))) {
            el.scrollTop = to === "top" ? 0 : el.scrollHeight
          }
        }, end)
        await page.waitForTimeout(800)

        // Exempt too: a beat whose control does not exist yet — the capture
        // dialog is not on the page until a selection opens it, and there is
        // nothing to scroll to.
        const hasLiveTarget = await page.evaluate((selectors) =>
          selectors.some((selector) => {
            const box = document.querySelector(selector)?.getBoundingClientRect()
            return !!box && box.width > 0 && box.height > 0
          })
        , step.targets)
        if (!hasLiveTarget) continue

        const glow = await page.locator(".guideglow").count()
        const find = await page.locator(".gfind").count()
        expect(
          glow + find,
          `beat "${label}" scrolled to the ${end}: no glow on screen and no "show me" offered`
        ).toBeGreaterThan(0)
      }
    }
  })

  test("the band says where you are and offers the way out", async ({ page }) => {
    test.setTimeout(120_000)

    // TJ, 2026-08-12: *"add an 'exit guide' button to the 'you are in the
    // guide' card"* — until then the only exits were the browser's Back button
    // and the header. And the promise the band used to make came out in the
    // same breath: *"of course everything should work. i dont expect tutorial
    // to keep my work."*
    await page.goto("/sandbox")
    const band = page.locator(".practiceband")
    await expect(band).toBeVisible({ timeout: 30_000 })
    await expect(band).toContainText("You are in the guide")
    await expect(band).not.toContainText(/nothing is kept/i)

    // Pressable — it sits inside chrome that deliberately takes no pointer
    // events, so this is the assertion that keeps it from being a picture.
    const exit = page.locator(".bandexit")
    await expect(exit).toBeVisible()
    const eaten = await page.evaluate(() => {
      const box = document.querySelector(".bandexit")?.getBoundingClientRect()
      if (!box) return "missing"
      const el = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return el?.closest(".bandexit") ? "reachable" : (el?.className?.toString() ?? "nothing")
    })
    expect(eaten, "something is sitting on top of the exit").toBe("reachable")

    await exit.click()
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })
    await expect(page.locator(".practiceband")).toHaveCount(0)
  })

  test("pip 1 goes back to the Library, and the work survives it", async ({ page }) => {
    test.setTimeout(120_000)

    // TJ, 2026-08-12: *"the 'open a reading' button 1 does not take us back to
    // 'pick a reading in library', is that intentional?"* — it was not. Every
    // other pip navigates to where its beat happens; that one silently did
    // nothing, and showed a beat about a glowing card with no card on screen.
    await page.goto("/sandbox")
    await expect(async () => {
      await page.locator("#practiceOpen").click()
      await expect(page.locator("#yourwork-toggle")).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] })

    const before = ((await page.locator("#yourwork-toggle").textContent()) ?? "").trim()

    await page.locator(".gstep").nth(0).click()
    await expect(page.locator("#practiceOpen")).toBeVisible({ timeout: 20_000 })
    await expect(page.locator(".guideglow")).toBeVisible()

    // Back in, holding everything — the loom's state lives above the stage.
    await page.locator("#practiceOpen").click()
    await expect(page.locator("#yourwork-toggle")).toBeVisible({ timeout: 20_000 })
    await expect(page.locator("#yourwork-toggle")).toHaveText(before)
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
    // It names the ONE thing this capture is going without, in the same words
    // as the disclosure it refers to (2026-08-19). Not "unlabeled": the reader
    // has a note typed by now, so a button calling the whole thing unlabelled
    // is describing something that is not true of what is on screen.
    await expect(page.locator("#capturePassageSave")).toHaveText("Save without concept")
    // The concept's own description is not asked for when there is no concept.
    // Twice over now: it renders only once a label is typed, AND it sits inside
    // the closed disclosure. Count, not visibility, so this keeps meaning what
    // it meant — that the field does not exist, not merely that it is folded.
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
