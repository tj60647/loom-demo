import { test, expect, type Page } from "@playwright/test"

/**
 * The course switch (CourseSwitch.tsx): the header's course label becomes a
 * dropdown when — and only when — one account carries more than one course
 * (TJ, 2026-08-21: one class needs no disambiguation, no dropdown).
 *
 * Two identities, on purpose:
 * - testa holds ONE course and must see the plain label — the single-course
 *   case is a fixture contract, not an accident.
 * - "Test Two Courses" (?as=twocourse) holds the seeded oldest course plus
 *   the on-demand "Second Course (e2e)" (test-login creates it newer than
 *   every seeded course, so the suite's oldest-course dependencies hold; it
 *   carries no readings, which is what makes the re-scope VISIBLE here).
 *
 * Statefulness: a switch stamps course_membership.selectedAt server-side.
 * test-login nulls it on every backdoor sign-in, so each RUN starts from
 * "never switched" — but a retry within a run may land mid-state, so the
 * switching test normalizes to the second course's absence first rather
 * than assuming where it starts.
 *
 * What is NOT asserted here: the flush-before-stamp ordering in the pick
 * handler (debounced cloth writes landing in the OLD course). That ordering
 * is constructional — flushCloth/flushMapText fire before setActiveCourse is
 * awaited, and server actions from one client serialize — and its DB-side
 * semantics are asserted deterministically in scripts/check-auth.ts --db; a
 * keystroke race against a 700ms debounce would make this suite timing-
 * sensitive, which it deliberately is not.
 */

const SECOND = "Second Course (e2e)"

/** The fixture name carries regex metacharacters — "(e2e)" — so every match
 *  goes through this escape rather than a raw `new RegExp(name)`. */
const rx = (literal: string) => new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

/** The switch trigger — its aria-label names the count, so this matches only
 *  the multi-course control, never the plain span. */
const trigger = (page: Page) =>
  page.getByRole("button", { name: /You are in 2 courses/ })

async function switchTo(page: Page, courseName: string) {
  await trigger(page).click()
  const menu = page.getByRole("menu", { name: "Your courses" })
  await expect(menu).toBeVisible()
  const item = menu.getByRole("menuitemradio", { name: rx(courseName) })
  // Picking the current course must be a no-op close, so only click through
  // when it is actually the other one.
  if ((await item.getAttribute("aria-checked")) === "true") {
    await page.keyboard.press("Escape")
    return
  }
  // waitForURL cannot guard this navigation: the page already sits at "/",
  // and playwright-core resolves waitForURL immediately for an
  // already-matching URL (verified against 1.61's implementation) — so it
  // would assert nothing. A marker on the old document does what the guard
  // must: it survives any soft refresh and dies only with the document, so
  // its absence once the label has changed IS the full load.
  await page.evaluate(() => {
    ;(window as unknown as { __loomPreSwitch?: boolean }).__loomPreSwitch = true
  })
  await item.click()
  // The label change carries the wait: a server-action round trip plus a
  // full document load on a dev server needs more than the 5s expect default.
  await expect(trigger(page)).toHaveText(rx(courseName), { timeout: 20_000 })
  expect(
    await page.evaluate(
      () => (window as unknown as { __loomPreSwitch?: boolean }).__loomPreSwitch
    )
  ).toBeUndefined()
}

test.describe("one course", () => {
  test.use({ storageState: "playwright/.auth/testa.json" })

  test("a single-course account gets the plain label, no dropdown", async ({ page }) => {
    // Armed before goto: the negatives below are only meaningful once the
    // course payload has actually arrived — .weekhead is no readiness signal
    // (the always-rendered "your own readings" section carries one too).
    const coursePayload = page.waitForResponse(
      (r) => r.url().includes("/api/course") && r.ok(),
      { timeout: 20_000 }
    )
    await page.goto("/")
    await coursePayload
    await expect(page.locator("header span.label").first()).toBeVisible()
    await expect(page.locator(".courseswitch")).toHaveCount(0)
    await expect(page.getByRole("button", { name: /courses; switch/ })).toHaveCount(0)
  })
})

test.describe("two courses", () => {
  test.use({ storageState: "playwright/.auth/twocourse.json" })

  test("the label is a control, and the menu names both — current marked by id", async ({ page }) => {
    await page.goto("/")
    await expect(trigger(page)).toBeVisible({ timeout: 15_000 })

    await trigger(page).click()
    const menu = page.getByRole("menu", { name: "Your courses" })
    await expect(menu).toBeVisible()
    const items = menu.getByRole("menuitemradio")
    await expect(items).toHaveCount(2)
    await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(1)
    await expect(menu.getByRole("menuitemradio", { checked: true })).toContainText("you are here")

    // Escape closes AND hands focus back — HeaderMenu's contract, borrowed
    // verbatim.
    await page.keyboard.press("Escape")
    await expect(menu).not.toBeVisible()
    await expect(trigger(page)).toBeFocused()
  })

  test("switching re-scopes the shelf, and the choice survives a fresh load", async ({ page }) => {
    await page.goto("/")
    await expect(trigger(page)).toBeVisible({ timeout: 15_000 })

    await switchTo(page, SECOND)

    // The shelf is now the OTHER course's shelf — the fixture course carries
    // no readings, so the honest empty state is the proof the re-scope
    // reached the data, not just the label (switchTo already asserted the
    // label and the full document load).
    await expect(page.locator(".empty")).toContainText(/no readings published/i, { timeout: 15_000 })

    // Server-side, not a cookie: a brand-new document with only the session
    // cookie still lands in the chosen course.
    await page.goto("/")
    await expect(trigger(page)).toHaveText(rx(SECOND), { timeout: 15_000 })

    // Back to the seeded course: the readings return. Leaves the account in
    // its oldest course for whoever runs next (test-login re-nulls the stamp
    // at the next global-setup regardless). Same marker guard as switchTo —
    // the unchecked row is the seeded course, whichever its name. The wait
    // is the LABEL leaving the fixture course: .weekhead cannot carry it,
    // because "your own readings" renders one on every shelf and the old
    // document would satisfy it before the navigation lands.
    await trigger(page).click()
    const other = page
      .getByRole("menu", { name: "Your courses" })
      .getByRole("menuitemradio", { checked: false })
    await page.evaluate(() => {
      ;(window as unknown as { __loomPreSwitch?: boolean }).__loomPreSwitch = true
    })
    await other.click()
    await expect(trigger(page)).not.toHaveText(rx(SECOND), { timeout: 20_000 })
    expect(
      await page.evaluate(
        () => (window as unknown as { __loomPreSwitch?: boolean }).__loomPreSwitch
      )
    ).toBeUndefined()
    // And the seeded course's actual week sections are back — the own-readings
    // weekhead alone would not prove that.
    await expect(
      page.locator(".weekhead").filter({ hasText: /week/i }).first()
    ).toBeVisible({ timeout: 15_000 })
  })
})
