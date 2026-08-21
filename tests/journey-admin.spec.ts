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
  // Counts became number-only pills in their own sortable columns — the
  // concepts pill is the beaten one, the header names the column.
  await expect(rowA.locator(".pill.beaten", { hasText: /^\d+$/ })).toBeVisible()
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

  // Course controls are one uniform row: Edit Course (disclosure), Archive,
  // and Delete as the red pill disclosure.
  const firstCourse = page
    .locator("section.card", { has: page.locator("summary", { hasText: "Edit Course" }) })
    .first()
  await expect(firstCourse.locator("summary", { hasText: "Edit Course" })).toBeVisible()
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

  // The cloth's material is listed, not only drawn: every concept and every
  // thread, each attributed to its student.
  await expect(page.locator(".crow", { hasText: "object worlds" }).first()).toBeVisible()
  await expect(page.locator(".thread .sent").first()).toBeVisible()

  // A concept opens the passages behind it — the student's own captures, with
  // attribution — plus the threads that cross it.
  await page.locator(".crow", { hasText: "object worlds" }).first().click()
  await expect(page.locator(".threadhead", { hasText: "object worlds" })).toBeVisible()
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
