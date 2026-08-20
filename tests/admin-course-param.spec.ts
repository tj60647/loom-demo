import { test, expect } from "@playwright/test"

/**
 * A URL is a claim about what the page shows. AdminNav falls back to the
 * first course when ?course= resolves to nothing, and until 2026-08-20 the
 * address kept the dead name while the page showed something else; it now
 * router.replace()s the URL to the course actually shown.
 *
 * The param here must be one that has NEVER existed. The obvious-looking
 * fossil — course-foundations-studio — is a trap this spec's first draft
 * fell into: that is a REAL course id (the July 6 placeholder row, since
 * renamed to Design Frameworks Test 0729; ids outlive renames), so it
 * resolves and rightly heals nothing. The heal is for links whose course was
 * deleted after they were minted.
 *
 * A faculty session, because AdminNav renders on the admin shell's read side
 * and the heal is the same client effect an admin gets.
 */
test.use({ storageState: "playwright/.auth/faculty.json" })

test("a ?course= that resolves to nothing heals to the course actually shown", async ({ page }) => {
  await page.goto("/admin?course=course-that-never-existed")

  // The dead name goes — replace(), so it does not survive in history —
  // and what stands in its place is the shown course's real id, which is
  // what the picker itself would have written.
  await expect(page).not.toHaveURL(/course-that-never-existed/, { timeout: 15_000 })
  await expect(page).toHaveURL(/course=course-foundations-studio/)
  await expect(page.getByLabel("Select active course")).toBeVisible()
})
