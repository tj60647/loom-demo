import { test, expect, type Page } from "@playwright/test"

/**
 * Taking the roster away (TJ, 2026-08-24: "we need a 'download email list' on
 * the roster. we should be able to filter by role and section").
 *
 * WHAT IS WORTH ASSERTING IS THAT THE FILE AGREES WITH THE SCREEN. A download
 * that quietly exports the whole course while the page shows fourteen people
 * is the failure this has to be tested against — it looks right, it downloads,
 * and the professor mails sixty-four students instead of the fourteen who
 * never answered. So every check below ties a number in the file to a number
 * the page is showing at that moment, rather than to a seeded constant.
 *
 * Nothing here writes. Faculty rather than admin, for the reason
 * tests/faculty.spec.ts gives: an admin passes every gate, so it would prove
 * nothing about the narrower door — and faculty is who reads a roster.
 */
test.use({ storageState: "playwright/.auth/faculty.json" })
test.beforeEach(() => test.setTimeout(90_000))

const chips = (page: Page) => page.locator(".rosterfilter a")
const buttons = (page: Page) => page.locator(".rosterdl button")

/** The count a filter chip or a download button is claiming. */
async function claimedCount(text: string): Promise<number> {
  const match = /(\d+)/.exec(text.replace(/\s+/g, " "))
  return match ? Number(match[1]) : NaN
}

async function take(page: Page, index: number) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 25_000 }),
    buttons(page).nth(index).click(),
  ])
  const stream = await download.createReadStream()
  let text = ""
  for await (const chunk of stream) text += chunk
  return { name: download.suggestedFilename(), text }
}

test("the role filter narrows the roster, and the download follows it", async ({ page }) => {
  await page.goto("/admin?view=enrolled")
  await expect(chips(page).first()).toBeVisible({ timeout: 20_000 })

  // Three chips: everyone, learners, faculty — each carrying its own count.
  await expect(chips(page)).toHaveCount(3)
  const everyone = await claimedCount((await chips(page).nth(0).innerText()) ?? "")
  const learners = await claimedCount((await chips(page).nth(1).innerText()) ?? "")
  const faculty = await claimedCount((await chips(page).nth(2).innerText()) ?? "")
  expect(everyone, "the seed must enrol somebody — run `npm run seed:demo`").toBeGreaterThan(0)
  // A role each, so the two parts cannot exceed the whole. Not equality: a
  // course may carry a role these two chips do not name.
  expect(learners + faculty).toBeLessThanOrEqual(everyone)

  /**
   * THE ASSERTION THAT MATTERS. The button says how many addresses it is
   * about to hand over; the file has to contain exactly that many. Checked
   * unfiltered first, then again under a filter, because a download wired to
   * the unfiltered query passes the first and fails the second.
   */
  const wholeLabel = await buttons(page).first().innerText()
  expect(await claimedCount(wholeLabel)).toBe(everyone)
  const whole = await take(page, 0)
  expect(whole.text.split(",").length).toBe(everyone)

  // Now narrow to faculty and do it again.
  await chips(page).nth(2).click()
  await expect(page).toHaveURL(/role=faculty/, { timeout: 15_000 })
  await expect(buttons(page).first()).toBeVisible({ timeout: 20_000 })

  const narrowedLabel = await buttons(page).first().innerText()
  expect(await claimedCount(narrowedLabel)).toBe(faculty)
  const narrowed = await take(page, 0)
  expect(narrowed.text.split(",").length).toBe(faculty)
  expect(faculty, "a filter that changes nothing proves nothing").toBeLessThan(everyone)

  // The file says which slice it was, so a roster on disk is not anybody's.
  expect(narrowed.name).toMatch(/enrolled_faculty\.roster\.\d{10}\.txt$/)
})

test("the csv carries who they are and none of their work", async ({ page }) => {
  await page.goto("/admin?view=enrolled")
  await expect(buttons(page).nth(1)).toBeVisible({ timeout: 20_000 })

  const file = await take(page, 1)
  expect(file.name).toMatch(/\.roster\.\d{10}\.csv$/)

  const lines = file.text.split("\r\n").filter(Boolean)
  expect(lines[0]).toBe("email,name,status,section,role")
  expect(lines.length, "a header and at least one person").toBeGreaterThan(1)

  /**
   * A CONTACT LIST, NOT AN EXPORT OF ANYBODY'S LOOM. The roster table shows
   * cloth, concept and thread counts beside every name; none of that belongs
   * in a file handed around for mailing people, and a student's work has its
   * own exports on its own objects (red line 5, by object).
   */
  for (const column of ["cloths", "concepts", "threads", "passages"]) {
    expect(lines[0], `${column} must not be in a contact list`).not.toContain(column)
  }

  // Every data row is an address first.
  for (const line of lines.slice(1)) {
    expect(line, `"${line}" should begin with an email address`).toMatch(/^[^\s@,]+@[^\s@,]+\.[^\s@,]+,/)
  }
})

test("on the Invited tab it exports the invitations, silent ones alone when asked", async ({ page }) => {
  await page.goto("/admin?view=invited")
  await expect(buttons(page).first()).toBeVisible({ timeout: 20_000 })
  const all = await claimedCount(await buttons(page).first().innerText())

  // "No response yet" is the one filter this tab carries.
  await chips(page).first().click()
  await expect(page).toHaveURL(/filter=noresponse/, { timeout: 15_000 })
  await expect(buttons(page).first()).toBeVisible({ timeout: 20_000 })

  const silent = await claimedCount(await buttons(page).first().innerText())
  expect(silent, "the silent are a subset of the invited").toBeLessThanOrEqual(all)

  const file = await take(page, 0)
  expect(file.text.split(",").length).toBe(silent)
  expect(file.name).toMatch(/invited_no_response\.roster\.\d{10}\.txt$/)
})
