/**
 * The admin journey: roster, invitations, per-student view, course scheduling,
 * cohort map — and the authorization boundary a learner must bounce off.
 *
 * Runs as the admin (the suite's default storage state). Relies on
 * `npm run seed:demo`: Test User A enrolled with a worked loom, Test User B
 * enrolled and empty. The one mutation (an invitation) is withdrawn again in
 * the same test.
 */
import { test, expect } from "@playwright/test"

// Independent tests, no serial mode — a failure shouldn't hide the rest.
test.beforeEach(() => test.setTimeout(120_000))

const INVITEE = "pw-journey-invitee@loom.local"

test("roster shows enrolled demo learners with their counts", async ({ page }) => {
  await page.goto("/admin")
  // The h1 left on 2026-08-21; the roster's tabs lead, Enrolled active.
  await expect(page.locator(".rostertabs a.on", { hasText: "Enrolled" })).toBeVisible({ timeout: 15_000 })

  const rowA = page.locator(".rosterrow", { hasText: "Test User A" })
  await expect(rowA, "seed missing — run `npm run seed:demo` first").toHaveCount(1)
  // Counts are number-only pills in their own sortable columns; the header
  // names each one. Three of them since 2026-08-22 — cloths, concepts,
  // threads — which is why this no longer matches on `.pill.beaten` alone:
  // cloths and concepts both wear it, and the bare locator resolved to two.
  // Each carries its breakdown in an aria-label, so asserting on that checks
  // the number AND that the breakdown reached a non-mouse reader.
  const stats = rowA.locator(".pill[aria-label]")
  await expect(stats).toHaveCount(3)
  await expect(stats.nth(0)).toHaveAttribute("aria-label", /cloth/)
  await expect(stats.nth(1)).toHaveAttribute("aria-label", /concept/)
  await expect(stats.nth(2)).toHaveAttribute("aria-label", /thread/)
  await expect(rowA.locator(".pill", { hasText: /^\d+$/ }).first()).toBeVisible()
  await expect(rowA.getByRole("link", { name: "Open Loom" })).toBeVisible()

  await expect(page.locator(".rosterrow", { hasText: "Test User B" })).toHaveCount(1)
})

test("an invitation is issued, appears pending, and is withdrawn", async ({ page }) => {
  await page.goto("/admin")
  // The invite form left its fold for a tab of its own (2026-08-21), and the
  // pending appear on the Invited tab — the invitation's ledger.
  await page.locator(".rostertabs a", { hasText: "Invite learners" }).click()
  await page.locator("textarea[name=emails]").fill(INVITEE)
  await page.getByRole("button", { name: "Invite", exact: true }).click()

  await expect(page.locator(".invitereport")).toContainText("1 invited", { timeout: 15_000 })
  await page.locator(".rostertabs a", { hasText: "Invited" }).first().click()
  const pending = page.locator(".rosterrow.pendingrow", { hasText: INVITEE })
  await expect(pending).toHaveCount(1, { timeout: 15_000 })
  // The role column says "invited" for a pending row; the old phrase lives
  // in its title.
  await expect(pending.locator(".pill", { hasText: "invited" })).toBeVisible()

  await pending.getByRole("button", { name: /Withdraw the invitation/ }).click()
  await expect(page.locator(".rosterrow", { hasText: INVITEE })).toHaveCount(0, { timeout: 15_000 })
})

test("the per-student view renders Test User A's loom read-only", async ({ page }) => {
  await page.goto("/admin")
  const rowA = page.locator(".rosterrow", { hasText: "Test User A" })
  await rowA.getByRole("link", { name: "Open Loom" }).click()

  // Open Loom (2026-08-21): the app itself, reading A's loom — the float
  // names them and carries the whole-loom download; faculty.spec walks the
  // exit. The old summary page remains routable, unlinked.
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 })
  const float = page.locator(".teachfloat")
  await expect(float).toBeVisible({ timeout: 15_000 })
  await expect(float).toContainText("Test User A")
  await expect(float.getByRole("link", { name: "Download loom" })).toBeVisible()
  // Leave the mode so no later test reads A's loom by accident.
  await float.getByRole("link", { name: "Exit" }).click()
  await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 })
})

test("courses: schedule controls render for the course's readings", async ({ page }) => {
  await page.goto("/admin/courses")

  // New Course starts folded — the same idiom as the library's Add Readings
  // and the roster's Invite learners.
  const fold = page.locator("details.invitefold")
  await expect(fold).toBeVisible({ timeout: 15_000 })
  await expect(fold.locator("input[name=name]")).toBeHidden()

  // Course controls are one uniform row: Edit Metadata (disclosure — it edits
  // name/slug/term/description only), Archive, and Delete as the red pill.
  const firstCourse = page
    .locator("section.card", { has: page.locator("summary", { hasText: "Edit Metadata" }) })
    .first()
  await expect(firstCourse.locator("summary", { hasText: "Edit Metadata" })).toBeVisible()
  await expect(firstCourse.locator("summary.pillbtn", { hasText: "Delete" })).toBeVisible()

  // Each reading row shows its Week/Core/Visible pills; the week+position form
  // sits behind the "Schedule" disclosure.
  await expect(page.locator(".pill", { hasText: /Week \d+|Unscheduled/ }).first()).toBeVisible({ timeout: 15_000 })

  // The reading's three tools are one uniform set — Schedule and Hide as plain
  // buttons, Remove as the red pill — not a mix of link-sized words.
  const readingRow = page
    .locator(".lrow", { has: page.locator("summary", { hasText: "Schedule" }) })
    .first()
  await expect(readingRow.locator("summary.btn.mini", { hasText: "Schedule" })).toBeVisible()
  await expect(readingRow.locator("button.btn.mini", { hasText: /Hide|Reveal/ })).toBeVisible()
  await expect(readingRow.locator("button.btn.pillbtn", { hasText: "Remove from Course" })).toBeVisible()

  await readingRow.locator("summary", { hasText: "Schedule" }).click()
  await expect(readingRow.locator("input[name=week]")).toBeVisible()
  await expect(readingRow.locator("input[name=position]")).toBeVisible()
  // Core/supplemental is a radio pair, so the unchosen name is on screen too,
  // and exactly one of them is always chosen.
  await expect(readingRow.locator(".radiopick input[name=isCore]")).toHaveCount(2)
  await expect(readingRow.locator("input[name=isCore]:checked")).toHaveCount(1)
})

test("the cohort map renders the section's woven concepts", async ({ page }) => {
  await page.goto("/admin/aggregate")
  await expect(page.getByText("Aggregate data is temporarily unavailable")).toHaveCount(0)
  // Seeded work from Test User A is part of the cohort cloth — the SVG node
  // label, not the hidden <title> tooltip.
  await expect(page.locator("svg text", { hasText: "object worlds" }).first()).toBeVisible({ timeout: 20_000 })

  // The cloth's material is listed, not only drawn: every concept, and every
  // thread as the thread itself. The thread list stopped carrying each
  // sentence on 2026-08-22 — it is a list of 67 you scan, and the description
  // belongs to the one you pick — so what is asserted here is the pair of
  // ends every card still names.
  await expect(page.locator(".crow", { hasText: "object worlds" }).first()).toBeVisible()
  await expect(page.locator(".canvasmenu.atright .thread .trip").first()).toBeVisible()

  // A concept reads out on the canvas — who owns it, its counts — and opens
  // the passages behind it, the student's own captures with attribution,
  // plus the threads that cross it.
  //
  // The evidence is FOLDED since 2026-08-22: this is a map, and a read-out
  // that unfolded by default covered the warp it annotates. The resting line
  // is asserted first, then the fold is opened for the passages.
  await page.locator(".crow", { hasText: "object worlds" }).first().click()
  await expect(page.locator(".threadhead", { hasText: "object worlds" })).toBeVisible()
  await page.locator(".canvasfoot .footmore > summary").click()
  await expect(page.locator(".passagequote").first()).toBeVisible()
  await expect(page.locator(".passagequote").first()).toContainText("Test User A")
})

test("readings say which version of their file they serve", async ({ page }) => {
  await page.goto("/admin/library")
  // "Readings" exactly — the page also carries an "All Readings" section head.
  // Generous: this page queries the whole shared shelf before it renders.
  await expect(page.getByRole("heading", { name: "Readings", exact: true })).toBeVisible({
    timeout: 60_000,
  })

  /**
   * Two invariants, read off every card at once rather than one card at a
   * time — the library is the whole shared shelf and iterating it in Playwright
   * costs a round trip per reading.
   *
   * A reading's version is its `source_revision` count + 1, so:
   *   - history is disclosed exactly where the file has been replaced, and
   *   - the disclosure holds one line per version, v1 (the upload) included.
   *
   * Deliberately not asserting that any particular reading is repaired: the CI
   * database is seeded, not remediated, so the honest assertion is the relation
   * between badge and disclosure, which holds at v1 as well as at v6.
   */
  const readings = await page.evaluate(() =>
    [...document.querySelectorAll(".card")].flatMap((card) => {
      const badge = [...card.querySelectorAll(".pill")].find((pill) =>
        /^v\d+$/.test(pill.textContent?.trim() ?? "")
      )
      if (!badge) return []
      return [
        {
          title: card.querySelector("h3")?.textContent?.trim().slice(0, 40) ?? "?",
          version: Number(badge.textContent!.trim().slice(1)),
          hasHistory: [...card.querySelectorAll("summary")].some((summary) =>
            summary.textContent?.includes("File History")
          ),
          lines: card.querySelectorAll(".revline").length,
        },
      ]
    })
  )

  expect(readings.length, "seed missing — run `npm run seed:sources` first").toBeGreaterThan(0)
  expect(readings.filter((r) => !Number.isFinite(r.version))).toEqual([])

  // History is disclosed when, and only when, the file has been replaced.
  expect(readings.filter((r) => r.hasHistory !== r.version > 1)).toEqual([])

  // Where it is disclosed, it accounts for every version including the upload.
  expect(readings.filter((r) => r.hasHistory && r.lines !== r.version)).toEqual([])
})

test.describe("authorization boundary", () => {
  test.use({ storageState: "playwright/.auth/testa.json" })

  test("a learner who types /admin is returned to the shelf", async ({ page }) => {
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
    await page.goto("/admin/library")
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  })
})

/**
 * A THREAD READS AS A SENTENCE (TJ, 2026-08-24: "let put the label, or if no
 * label is available the description, between the concepts instead of the
 * badge. this way it reads more like a sentence, which i believe was the
 * intention").
 *
 * The read-out used to put a sage badge between the two concepts — or, with no
 * Link on the thread, a dashed pill reading the literal word "description" —
 * and trail the thread's own words after the author's name. Three facts in a
 * row, with the one that joins the concepts not standing between them.
 */
test("the cohort read-out says a thread between its two concepts", async ({ page }) => {
  await page.goto("/admin/aggregate")
  const cards = page.locator(".ywthread")
  await expect(cards.first()).toBeVisible({ timeout: 30_000 })

  /**
   * Some threads are drawn and never spoken — no Link, no description — and
   * those keep a dashed pill, since a gap would read as a rendering fault. So
   * this walks until it finds one with something to say rather than assuming
   * the first seeded thread has any.
   */
  let spoken: string | null = null
  const head = page.locator(".threadhead")
  const tries = Math.min(await cards.count(), 8)
  for (let i = 0; i < tries; i += 1) {
    await cards.nth(i).click()
    await expect(head).toBeVisible({ timeout: 15_000 })
    const shape = await head.evaluate((el) =>
      Array.from(el.children).map((child) => child.className)
    )
    if (shape[1]?.includes("said")) {
      // BETWEEN the two concepts, which is the whole change: a red name, what
      // the student said, the other red name.
      expect(shape[0]).toContain("red")
      expect(shape[2]).toContain("red")
      spoken = (await head.locator(".said").innerText()).trim()
      break
    }
  }

  expect(spoken, "no seeded thread carries a label or a description — run `npm run seed:demo`").not.toBeNull()
  expect(spoken!.length).toBeGreaterThan(0)
  // And it is the student's words, never the name of the field they are in.
  expect(spoken).not.toBe("description")

  // The badge that used to stand there is gone from every read-out.
  await expect(page.locator(".threadhead .vpill", { hasText: /^description$/ })).toHaveCount(0)
})

/**
 * A THREAD WITH NOTHING TO SAY KEEPS THE CARDS' ARROW (TJ, 2026-08-24: "in the
 * threads we use an arrow, right? maybe the side not is ... something like
 * that that matches language").
 *
 * ThreadCard draws `.tarrow` between the ends of an unlabelled thread and
 * calls the state "not described" on its pill. The read-out now says both the
 * same way, so the two surfaces and the cloth's dashed arc agree.
 */
test("an undescribed thread reads as an arrow, and says what is missing", async ({ page }) => {
  await page.goto("/admin/aggregate")
  const cards = page.locator(".ywthread")
  await expect(cards.first()).toBeVisible({ timeout: 30_000 })

  const head = page.locator(".threadhead")
  let found = false
  const tries = Math.min(await cards.count(), 8)
  for (let i = 0; i < tries; i += 1) {
    await cards.nth(i).click()
    await expect(head).toBeVisible({ timeout: 15_000 })
    const parts = await head.evaluate((el) =>
      Array.from(el.children).map((child) => child.className)
    )
    if (parts[1]?.includes("tarrow")) {
      // An arrow between the two concepts, never a stand-in word.
      expect(parts[0]).toContain("red")
      expect(parts[2]).toContain("red")
      // And the absence named once, to the side, in the cards' own words.
      await expect(head.locator(".vpill")).toHaveText("not described")
      found = true
      break
    }
  }
  expect(found, "the seed must carry one thread with neither a label nor a description").toBe(true)
})

/**
 * PICKING ON THE DRAWING REVEALS THE CARD (TJ, 2026-08-24: "should selecting a
 * node or a link in the graph change what is shown in the concepts and
 * threads? like we had selected one in their respective panels?").
 *
 * It always CHANGED it — the panels have marked the picked card all along —
 * but with a hundred concepts in a scrollbox the mark sat below the fold, and
 * a selection you cannot see is the same as no selection. Measured before the
 * fix: a thread picked off the cloth marked its card at y=576 while the
 * panel's box ended at 480 and its scrollTop stayed 0.
 */
test("picking on the cloth scrolls the panels to what was picked", async ({ page }) => {
  await page.goto("/admin/aggregate")
  await expect(page.locator("#map").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(".ywcard").first()).toBeVisible({ timeout: 30_000 })

  /**
   * A node whose card sorts LATE, so the list has somewhere to scroll to. The
   * first node on the warp would pass this whether or not anything scrolled.
   */
  const marks = page.locator("#map circle")
  const total = await marks.count()
  expect(total, "the seeded cohort must draw a warp worth scrolling").toBeGreaterThan(20)

  const seen = await page.locator(".ywcard").count()
  expect(seen, "the panels must list more cards than fit, or this proves nothing").toBeGreaterThan(10)

  await marks.nth(Math.floor(total * 0.7)).click({ force: true })

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const card = document.querySelector(".ywcard.picked, .ywcard.sel")
          if (!card) return null
          const box = card.getBoundingClientRect()
          const scroller = card.closest(".scrollbox")
          if (!scroller) return null
          const within = scroller.getBoundingClientRect()
          return box.bottom > within.top && box.top < within.bottom
        }),
      { timeout: 15_000, message: "the picked card never came into its panel's view" }
    )
    .toBe(true)
})
