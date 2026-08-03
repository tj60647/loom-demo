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
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible({ timeout: 15_000 })

  const rowA = page.locator(".rosterrow", { hasText: "Test User A" })
  await expect(rowA, "seed missing — run `npm run seed:demo` first").toHaveCount(1)
  await expect(rowA.locator(".pill", { hasText: /\d+ concepts/ })).toBeVisible()
  await expect(rowA.getByRole("link", { name: "Open Loom" })).toBeVisible()

  await expect(page.locator(".rosterrow", { hasText: "Test User B" })).toHaveCount(1)
})

test("an invitation is issued, appears pending, and is withdrawn", async ({ page }) => {
  await page.goto("/admin")
  // The invite form starts folded; the summary is the only way in.
  await page.locator(".invitefold summary").click()
  await page.locator("textarea[name=emails]").fill(INVITEE)
  await page.getByRole("button", { name: "Invite", exact: true }).click()

  await expect(page.locator(".invitereport")).toContainText("1 invited", { timeout: 15_000 })
  const pending = page.locator(".rosterrow.pendingrow", { hasText: INVITEE })
  await expect(pending).toHaveCount(1, { timeout: 15_000 })
  await expect(pending.getByText("not signed in yet")).toBeVisible()

  await pending.getByRole("button", { name: /Withdraw the invitation/ }).click()
  await expect(page.locator(".rosterrow", { hasText: INVITEE })).toHaveCount(0, { timeout: 15_000 })
})

test("the per-student view renders Test User A's loom read-only", async ({ page }) => {
  await page.goto("/admin")
  const rowA = page.locator(".rosterrow", { hasText: "Test User A" })
  await rowA.getByRole("link", { name: "Open Loom" }).click()
  await expect(page).toHaveURL(/\/admin\/user\//, { timeout: 15_000 })
  // Seeded graph is visible in the concepts list. (Plain getByText traps
  // itself on the hidden SVG <title> tooltips, which carry the sentences.)
  await expect(page.locator(".clabel", { hasText: "object worlds" })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator(".clabel", { hasText: "community of practice" })).toBeVisible()
})

test("courses: schedule controls render for the course's readings", async ({ page }) => {
  await page.goto("/admin/courses")
  // Each reading row shows its Week/Core/Visible pills; the week+position form
  // sits behind the "schedule" disclosure.
  await expect(page.locator(".pill", { hasText: /Week \d+|Unscheduled/ }).first()).toBeVisible({ timeout: 15_000 })
  await page.locator("summary", { hasText: "schedule" }).first().click()
  await expect(page.locator("input[name=week]").first()).toBeVisible()
  await expect(page.locator("input[name=position]").first()).toBeVisible()
})

test("the cohort map renders the section's woven concepts", async ({ page }) => {
  await page.goto("/admin/aggregate")
  await expect(page.getByText("Aggregate data is temporarily unavailable")).toHaveCount(0)
  // Seeded work from Test User A is part of the cohort cloth — the SVG node
  // label, not the hidden <title> tooltip.
  await expect(page.locator("svg text", { hasText: "object worlds" }).first()).toBeVisible({ timeout: 20_000 })
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
