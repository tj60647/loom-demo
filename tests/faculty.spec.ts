/**
 * The faculty path through a browser (ruling 18) — the half of P3.12 that had
 * only ever been type-checked and reasoned about.
 *
 * Runs as "Test Faculty": site role USER, course membership role FACULTY. That
 * distinction is the whole point, and it is why the admin storage state cannot
 * stand in here — an ADMIN passes every gate, so it would prove nothing about
 * the narrower door. Minted by /api/auth/test-login?as=faculty, homed in the
 * course's Faculty Section.
 *
 * The shape being asserted: faculty hold the READ side of their own course
 * (Roster, Cohort Graph, a student's loom) and nothing else — the write
 * surfaces, the roster's own write controls, and every other course stay shut.
 * Capabilities are additive, so their own learner workspace is untouched.
 */
import { test, expect } from "@playwright/test"

test.use({ storageState: "playwright/.auth/faculty.json" })

// The admin shell renders a roster and a cohort graph over real seeded work.
test.beforeEach(() => test.setTimeout(120_000))

test("faculty enter /admin bare and land on their own course's roster", async ({ page }) => {
  await page.goto("/admin")

  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 })
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible({ timeout: 15_000 })
  // getStaffViewer resolved a course for them rather than redirecting home:
  // the roster names it and carries rows.
  await expect(page.locator(".rosterrow", { hasText: "Test User A" })).toHaveCount(1)
})

test("the nav offers the read side only — no Readings, no Courses", async ({ page }) => {
  await page.goto("/admin")
  // Since 2026-08-09 (TJ) there is ONE bar: the journey, with the staff group
  // on its right. The separate admin tab row is gone, which is why there is no
  // "← My Loom" any more — 00 Library is right there on the same bar, and that
  // is the point of merging them (capabilities are additive).
  const nav = page.locator('nav[aria-label="The journey"]')
  const staff = nav.locator(".staffgroup")

  await expect(staff.getByRole("link", { name: "Roster" })).toBeVisible({ timeout: 15_000 })
  await expect(staff.getByRole("link", { name: "Cohort Graph" })).toBeVisible()
  // Their own learner surfaces, on the same bar and one click away.
  await expect(nav.getByRole("link", { name: /Library/ })).toBeVisible()
  await expect(nav.getByRole("link", { name: /Keep/ })).toBeVisible()
  // Workflows sits right of Courses in the staff group (TJ, 2026-08-09) and is
  // therefore NOT duplicated in the header — it is drawn there only for someone
  // with no staff group to carry it. It is still not an admin surface: a
  // student reads their own flow, and gets the header link instead.
  await expect(staff.getByRole("link", { name: "Workflows" })).toBeVisible()
  await expect(staff.getByRole("link", { name: "Access" })).toBeVisible()
  await expect(page.locator('header a[href="/workflows"]')).toHaveCount(0)

  // The write surfaces are absent from the bar, not merely disabled — the
  // staff group is filtered by isAdmin, and faculty are staff but not admin.
  await expect(nav.getByRole("link", { name: "Readings" })).toHaveCount(0)
  await expect(nav.getByRole("link", { name: "Courses" })).toHaveCount(0)
})

test("the roster is readable but carries none of its write controls", async ({ page }) => {
  await page.goto("/admin")
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator(".rosterrow").first()).toBeVisible()

  // Every admin-only control on this page, absent. A form rendered for someone
  // whose submit would redirect is the failure this guards against.
  await expect(page.locator(".invitefold")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Make faculty" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Return to learner" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /^Withdraw the invitation/ })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Assign", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Place", exact: true })).toHaveCount(0)

  // What they DO hold: the way into a student's work.
  await expect(page.getByRole("link", { name: "Open Loom" }).first()).toBeVisible()
})

test("a student's loom opens read-only from the roster", async ({ page }) => {
  await page.goto("/admin")
  const rowA = page.locator(".rosterrow", { hasText: "Test User A" })
  await expect(rowA).toHaveCount(1, { timeout: 15_000 })
  await rowA.getByRole("link", { name: "Open Loom" }).click()

  await expect(page).toHaveURL(/\/admin\/user\//, { timeout: 15_000 })
  await expect(page.getByRole("heading", { name: "Student Loom (Read-Only)" })).toBeVisible()
  // Seeded work, actually rendered — not an empty shell that would pass every
  // assertion above while the read gate silently returned nothing.
  await expect(page.locator(".clabel", { hasText: "object worlds" })).toBeVisible({ timeout: 15_000 })
})

test("the cohort graph renders for faculty", async ({ page }) => {
  await page.goto("/admin/aggregate")
  await expect(page.getByRole("heading", { name: "Cohort Graph" })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Aggregate data is temporarily unavailable")).toHaveCount(0)
  await expect(page.locator(".crow", { hasText: "object worlds" }).first()).toBeVisible({ timeout: 20_000 })
})

test("the write surfaces turn faculty away instead of erroring", async ({ page }) => {
  // Regression: /admin/library had no page-level gate, so the shell admitted
  // faculty and getLibraryOverview's `Unauthorized` throw met them as a 500
  // error page. Both write tabs now redirect, the way a learner's does.
  for (const route of ["/admin/library", "/admin/courses"]) {
    const response = await page.goto(route)
    expect(response?.status(), `${route} should not error`).toBeLessThan(400)
    await expect(page, `${route} should return faculty to the shelf`).toHaveURL(/\/$/, { timeout: 15_000 })
  }
})

test("faculty keep their own learner workspace", async ({ page }) => {
  // Capabilities are additive (ruling 18): the read-side view is granted
  // alongside their own loom, never instead of it.
  await page.goto("/")
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expect(page.locator(".shelfcard").first()).toBeVisible({ timeout: 15_000 })
})

test("the student lens hides every staff surface, and gives a way back", async ({ page }) => {
  // TJ, 2026-08-09: "i think we need a 'view as student' flag by the
  // admin/faculty pill in the header." Its failure mode is SILENT — a lens
  // that leaves staff chrome on screen is worse than none, because it invites
  // a faculty member to conclude a student sees something they do not. So this
  // asserts the absence, not just the presence.
  await page.goto("/")
  const nav = page.locator('nav[aria-label="The journey"]')
  const pill = page.locator("header .pill.beaten")
  const staff = nav.locator(".staffgroup a")

  await expect(pill).toHaveText("Faculty", { timeout: 15_000 })
  await expect(staff).toHaveCount(4)   // Roster · Cohort Graph · Workflows · Access

  await page.locator("header button", { hasText: "View as student" }).click()

  // Everything staff, gone — and the pill with it, since the lens masks the
  // course's isStaff/isAdmin rather than each consumer.
  await expect(page.locator("header button", { hasText: "Viewing as student" }))
    .toBeVisible({ timeout: 15_000 })
  await expect(staff).toHaveCount(0)
  await expect(pill).toHaveCount(0)
  // ...and Workflows comes BACK to the header, because that is where a student
  // finds it. The lens masks isStaff, and the header draws the link for anyone
  // without a staff group — so this falls out rather than being special-cased.
  await expect(page.locator('header a[href="/workflows"]')).toBeVisible()

  // Workflows is decided on the SERVER, which is why the flag is a cookie: a
  // client-only mask could not have reached this one. A student reads their
  // own flow, so the picker has nothing to pick between and hides itself.
  await page.goto("/workflows")
  await expect(page.locator(".flowpicker button")).toHaveCount(1, { timeout: 15_000 })

  // The way back, from an ordinary learner surface — the toggle draws from the
  // UNMASKED role for exactly this reason.
  await page.goto("/")
  await page.locator("header button", { hasText: "Viewing as student" }).click()
  await expect(pill).toHaveText("Faculty", { timeout: 15_000 })
  await expect(staff).toHaveCount(4)
})

test("Workflows and Access keep the frame, and Access is staff only", async ({ page }) => {
  // TJ, 2026-08-09: "the workflows tab should behave like the others, change
  // what is below, not replacing the frame." These used to be a bare <main>,
  // so reaching one from the bar made the bar itself disappear.
  for (const route of ["/workflows", "/access"]) {
    await page.goto(route)
    await expect(page.locator('nav[aria-label="The journey"]'), `${route} keeps the journey`)
      .toBeVisible({ timeout: 15_000 })
    await expect(page.locator(".scopebar"), `${route} keeps the scopebar`).toBeVisible()
    await expect(page.locator("footer"), `${route} keeps the footer`).toBeVisible()
  }
  await expect(page.locator(".mtable")).toBeVisible()
  // The matrix left the workflows page when it became its own tab.
  await page.goto("/workflows")
  await expect(page.locator(".mtable")).toHaveCount(0)
})
