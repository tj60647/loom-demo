import { expect, type Locator, type Page, type Request } from '@playwright/test';

/**
 * Is this POST a delete round-trip?
 *
 * Told apart from every other server-action call by its payload shape: an id,
 * optionally followed by the reading the act happened in. That second argument
 * arrived on 2026-08-11, when every act began recording where the student did
 * it — deleting a concept or a thread included. An EDIT posts an object as its
 * second argument and a CREATE posts one as its first, so neither matches.
 *
 * Tests wait on this because the row vanishes optimistically: ending a test at
 * the disappearance closes the browser mid-flight and strands the row for the
 * next run.
 */
export const isDeletePost = (request: Request) =>
  request.method() === 'POST' &&
  /^\["[0-9a-f-]{36}"(,(null|"[0-9a-f-]{36}"))?\]$/.test(request.postData() ?? '');

/**
 * Reading-first navigation.
 *
 * The shelf is the home screen, so opening a reading means picking its card,
 * which lands on `/reading/[sourceId]`. The text itself is tab 00 inside that
 * workbench rather than a course-wide Library tab.
 */
/**
 * Enter a reading through its shelf card, the way a student does.
 *
 * The card IS the entry point (TJ, 2026-08-08): one cloth per reading per user
 * and your Base Cloth is simply there, so there is no Create Cloth button and
 * no decision — opening the reading opens your work on it. The row beneath is
 * metadata, never a control.
 */
export async function enterReadingFromCard(page: Page, card: Locator) {
  // Wait for the loom to load first. The card renders "…" in its tally while
  // the graph is in flight and re-renders when the counts arrive — clicking
  // into that re-render detaches the node and the click lands on nothing.
  await expect(card.locator('.shelftally')).not.toHaveText('…', { timeout: 15000 });
  await card.locator('a.shelfmain').click();
  await expect(page).toHaveURL(/\/reading\//, { timeout: 15000 });
}

export async function openReading(page: Page, title: string) {
  await page.goto('/');

  const card = page.locator('.shelfcard', { hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await enterReadingFromCard(page, card);

  // Scoped to the journey bar. Since the text and capture merged (2026-08-08)
  // the reading station is the DEFAULT tab, so the viewer — and its own
  // "Search this reading" button — is already on screen; an unscoped
  // /Reading/i now matches both and is a strict-mode violation.
  await page.locator('nav[aria-label="The journey"] button', { hasText: 'Reading' }).click();
  await expect(page.locator('text=Loading PDF...')).toBeHidden({ timeout: 15000 });
}

/**
 * Card a book or a lecture — a reading with NO PDF — and open it.
 *
 * The only place typing a passage is offered since 2026-08-13 (TJ: "lets make
 * it only visible in a reading without a pdf"). Every seeded reading carries a
 * file, so a spec that needs the typed form has to make its own card; there is
 * no fixture to borrow.
 *
 * Unique titles, for the reason reuse-seam gives about labels: Test User A's
 * shelf is shared with the rest of the suite and accumulates across runs, so a
 * fixed title would match a card from a previous run and open that instead.
 */
export async function cardOwnReading(page: Page, title: string) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ a reading of your own' }).click();
  const form = page.locator('.card', { hasText: 'A reading of your own' }).first();
  await expect(form).toBeVisible({ timeout: 15000 });
  // No file: that is what makes it reference-only, and what puts the capture
  // form on 01 rather than a PDF.
  await form.getByPlaceholder('Plans and Situated Actions').fill(title);
  await form.getByRole('button', { name: 'Add to my shelf' }).click();

  const card = page.locator('.shelfcard', { hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 20000 });
  await enterReadingFromCard(page, card);
  await page.locator('nav[aria-label="The journey"] button', { hasText: 'Reading' }).click();
  await expect(page.getByText('Loading your loom...')).toHaveCount(0, { timeout: 20000 });
}

/**
 * Slide Your work out over the text.
 *
 * Since 2026-08-09 the sheet is always in the DOM, parked off the right edge,
 * so its presence proves nothing and the old `count() === 0` guard would skip
 * the click and then fail the visibility assertion. The toggle's aria-expanded
 * is the only honest reading of whether it is open. Idempotent on purpose — a
 * capture may have opened it already, and a blind click would send it back.
 */
export async function openYourWork(page: Page) {
  // By id, not by role+name: the head bar's close button is named "Close your
  // work", which a /Your work/i role match also finds. `.first()` would work
  // today by DOM order and break the day somebody reorders the toolbar.
  const toggle = page.locator('#yourwork-toggle');
  await expect(toggle).toBeVisible({ timeout: 15000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  const panel = page.locator('#yourwork');
  await expect(panel).toBeVisible({ timeout: 15000 });
  // The sheet takes 200ms to arrive and Playwright's actionability check does
  // not wait for a transform to settle: a click dispatched mid-slide lands
  // where the panel was, not where it is.
  await expect
    .poll(() => panel.evaluate((el) => getComputedStyle(el).transform), { timeout: 5000 })
    .toBe('none');
  return panel;
}
