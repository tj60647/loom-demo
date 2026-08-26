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

/**
 * PRESS IT AGAIN IF THE FIRST PRESS FELL ON A DEAD BUTTON.
 *
 * The download is built in the browser — RosterDownload is a client component
 * that shapes the file and hands it over — so before hydration the button is
 * on screen, visible and enabled, and does NOTHING when clicked. Playwright is
 * happy: it found a visible element and pressed it. The event simply never
 * comes, and the failure reads as "Timeout 25000ms exceeded while waiting for
 * event download", which sounds like a slow download and is not one.
 *
 * This is the same hydration-dependent click the CI workflow already records
 * against object-download's practice-loom entry (.github/workflows/ci.yml),
 * and it is why that file caps the read pass at two workers. One dev server
 * compiling routes on demand cannot hydrate four pages at once.
 *
 * So: a short wait, and one more press. A second press on a LIVE button is
 * harmless — it downloads the same file twice and the first event is the one
 * read — where a single press on a dead one is a false failure.
 */
async function take(page: Page, index: number) {
  const button = buttons(page).nth(index)
  await expect(button).toBeEnabled({ timeout: 20_000 })

  // The second press costs nothing when the first worked: the wait is armed
  // BEFORE the click, so a live button resolves it immediately and the loop
  // ends. Only a dead press pays the six seconds.
  let download = null
  for (let attempt = 0; attempt < 2 && !download; attempt += 1) {
    const arriving = page
      .waitForEvent("download", { timeout: attempt === 0 ? 6_000 : 20_000 })
      .catch(() => null)
    await button.click()
    download = await arriving
  }
  // A throw rather than an expect, so the reads below narrow: two dead presses
  // is a broken button, and saying so beats a null-pointer three lines later.
  if (!download) throw new Error("the download button was pressed twice and produced nothing")
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

/**
 * MORE THAN ONE ROLE AT ONCE (TJ, 2026-08-24: "we should be able to pick more
 * than one of these"). The chips were drawn as checkboxes and behaved as a
 * radio group; what makes that a bug rather than a preference is that the
 * glyph promised a set.
 */
test("the role chips are a set, and the download honours the set", async ({ page }) => {
  await page.goto("/admin?view=enrolled")
  await expect(chips(page).first()).toBeVisible({ timeout: 20_000 })
  const learners = await claimedCount(await chips(page).nth(1).innerText())
  const faculty = await claimedCount(await chips(page).nth(2).innerText())

  await chips(page).nth(1).click()
  await expect(page).toHaveURL(/role=learner/, { timeout: 15_000 })

  // Ticking a SECOND chip adds to the set rather than replacing it — this is
  // the whole change, and a radio group passes every other assertion here.
  await chips(page).nth(2).click()
  await expect(page).toHaveURL(/role=faculty,learner/, { timeout: 15_000 })
  await expect(chips(page).nth(1)).toHaveClass(/on/)
  await expect(chips(page).nth(2)).toHaveClass(/on/)

  const both = await take(page, 0)
  expect(both.text.split(",").length).toBe(learners + faculty)
  expect(both.name).toMatch(/enrolled_faculty_learner\.roster\./)

  // Unticking removes just that one.
  await chips(page).nth(1).click()
  await expect(page).toHaveURL(/role=faculty(?!,)/, { timeout: 15_000 })
})

/**
 * FIND SOMEBODY BY EMAIL, AS YOU TYPE (TJ, 2026-08-24: "can the find be done
 * as the field is completed?").
 *
 * Two things are being asserted and only one of them is the filtering. The
 * other is that TYPING COSTS NOTHING: the first version submitted a GET form,
 * so every search was a database round trip and a navigation, and a navigation
 * takes the focus out of the field. The count of document requests during
 * typing is what proves that is gone — filtering rows the page already holds
 * cannot regress into a query per keystroke without this number moving.
 *
 * It also crosses the tabs and the section picker, because the question is
 * "is this address on the roster, and in what state" — a search that read only
 * the open tab would answer "no" to a question about the course.
 */
test("a find filters as you type, without asking the server", async ({ page }) => {
  await page.goto("/admin?view=enrolled")
  const box = page.locator(".rosterfind input[type=search]")
  await expect(box).toBeVisible({ timeout: 20_000 })

  let documents = 0
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents += 1
  })

  // Standing on Enrolled, look for somebody who exists only as an invitation.
  await box.type("test-invited", { delay: 25 })
  const note = page.locator(".rosterfilter .cap")
  await expect(note, "the seed must carry the invited-never-signed-in address").toContainText(
    /matching "test-invited"/,
    { timeout: 10_000 }
  )
  await expect(note).toContainText(/every section, invited and enrolled/)
  await expect(page.locator("body")).toContainText("test-invited@loom.local")

  expect(documents, "typing must not fetch a page").toBe(0)
  // The field keeps the focus, which a navigation would have taken.
  await expect(box).toBeFocused()

  // The address bar still carries the search, so it can be reloaded or pasted.
  await expect(page).toHaveURL(/find=test-invited/)

  // A miss says so plainly, and says where to go next.
  await box.fill("glunk@berkeley.edu")
  await expect(note).toContainText(/nothing matching "glunk@berkeley.edu" anywhere in this course/)
  await expect(page.locator(".card.empty")).toContainText(/Not on this roster/)

  // Clearing hands the tab back.
  await box.fill("")
  await expect(chips(page)).toHaveCount(3)
  await expect(page).not.toHaveURL(/find=/)
  expect(documents, "clearing must not fetch a page either").toBe(0)
})

/**
 * WHEN THEY WERE ASKED, AND WHEN THEY ANSWERED (TJ, 2026-08-24: "the roster
 * needs an invited date and an accepted date. keep them small, and sortable").
 *
 * Neither date needed a migration: `invited` is `course_allowed_email
 * .createdAt` and `accepted` is `course_membership.createdAt`, written by
 * `enrolInvitedCourses` the first time somebody signs in.
 */
test("the roster shows when each person was invited and when they accepted", async ({ page }) => {
  await page.goto("/admin?view=invited")
  const headers = page.locator(".rosterhead button")
  await expect(headers.first()).toBeVisible({ timeout: 20_000 })

  const labels = await headers.evaluateAll((els) =>
    els.map((el) => (el.textContent ?? "").replace(/[▲▼]/g, "").trim())
  )
  expect(labels).toContain("invited")
  expect(labels).toContain("accepted")

  /**
   * A PENDING ROW HAS AN INVITED DATE AND NO ACCEPTED ONE. That pair is the
   * whole point of the two columns — the gap between them is how long the
   * silence has lasted — so a spec that only checked the columns existed
   * would pass on two columns of em dashes.
   */
  const pending = page.locator(".rosterrow.pendingrow").first()
  await expect(pending).toBeVisible({ timeout: 20_000 })
  const stamps = pending.locator(".rosterstamp")
  await expect(stamps).toHaveCount(2)
  await expect(stamps.nth(0)).toHaveText(/^\d{1,2}\/\d{1,2}$/)
  await expect(stamps.nth(1)).toHaveText("—")

  // Sortable, like every other column: clicking reorders rather than doing
  // nothing, and clicking again reverses.
  const firstName = () => page.locator(".rosterrow .rostername").first().innerText()
  const before = await firstName()
  await page.locator(".rosterhead button", { hasText: /^invited/ }).click()
  await expect(page.locator(".rosterhead button.on")).toHaveText(/invited/)
  const asc = await firstName()
  await page.locator(".rosterhead button", { hasText: /^invited/ }).click()
  const desc = await firstName()
  expect([before, asc, desc].some((name) => name !== before) || asc !== desc).toBe(true)
})

/**
 * THE ROW FITS THE CARD IT IS IN.
 *
 * Adding the two dates pushed the row to 1128px inside a card the reading
 * measure capped at 1098 — so it scrolled sideways, identically at 1280 and
 * 1536, because the cap was the measure and never the viewport. The page now
 * carries `workwide`, the measure the admin course console already uses.
 * Asserted at the floor, where it is tightest.
 */
test("the roster does not scroll sideways at the desktop floor", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto("/admin?view=enrolled")
  await expect(page.locator(".rosterlist")).toBeVisible({ timeout: 20_000 })

  const fit = await page.locator(".rosterlist").evaluate((el) => ({
    over: el.scrollWidth - el.clientWidth,
    bodyOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  expect(fit.over, "the roster row must fit its card at 1280").toBeLessThanOrEqual(0)
  expect(fit.bodyOver, "and the page must not scroll sideways either").toBeLessThanOrEqual(0)
})

/**
 * THE ROSTER SORTS BY ADDRESS, NOT ONLY BY NAME.
 *
 * TJ, 2026-08-26: "we need sort by email on the roster." The first column
 * carries both — the name in ink, the address under it — and only the name
 * could order the table. The address is the half a professor has in hand when
 * a student writes in, and the half that groups a class by institution.
 *
 * ALPHABETICAL IN THE READER'S SENSE, not the database's: the comparator
 * lowercases, because `C.UTF-8` collation puts every capital ahead of every
 * lowercase letter and "Zoe@" would sort before "adam@" (the same trap the
 * student picker hit on 2026-08-24).
 */
test("the roster sorts by email, both ways", async ({ page }) => {
  await page.goto("/admin")
  const headers = page.locator(".rosterhead button")
  await expect(headers.first()).toBeVisible({ timeout: 20_000 })

  const emailSort = page.locator(".rosterhead button", { hasText: /^email/ })
  await expect(emailSort, "the roster offers no sort by email").toHaveCount(1)

  const addresses = () =>
    page.locator(".rosterrow .rosteremail").evaluateAll((els) =>
      els.map((el) => (el.textContent ?? "").trim().toLowerCase()).filter(Boolean)
    )

  await emailSort.click()
  await expect(page.locator(".rosterhead button.on")).toHaveText(/email/)
  const asc = await addresses()
  expect(asc.length, "no addresses on the roster — run `npm run seed:demo`").toBeGreaterThan(3)
  expect(asc, "ascending must be A→Z by address").toEqual([...asc].sort((a, b) => a.localeCompare(b)))

  await emailSort.click()
  const desc = await addresses()
  expect(desc, "a second click must reverse it").toEqual([...asc].reverse())

  /**
   * AND THE NAME SORT STILL SORTS BY NAME. Written first as "the name order
   * must differ from the address order", which is true of this seed and not
   * true in principle: a roster whose names and addresses happen to run in the
   * same direction — "Test User A" at test-user-a@ — would fail a spec with
   * both sorts wired correctly (Copilot, #43). So it asserts the property
   * instead of the difference, which is also the thing worth knowing.
   */
  await page.locator(".rosterhead button", { hasText: /^name/ }).click()
  await expect(page.locator(".rosterhead button.on")).toHaveText(/name/)
  const names = await page.locator(".rosterrow .rostername").evaluateAll((els) =>
    els.map((el) => (el.textContent ?? "").trim().toLowerCase()).filter(Boolean)
  )
  expect(names.length, "no names on the roster — run `npm run seed:demo`").toBeGreaterThan(3)
  expect(names, "the name sort must order the name column A→Z").toEqual(
    [...names].sort((a, b) => a.localeCompare(b))
  )
})
