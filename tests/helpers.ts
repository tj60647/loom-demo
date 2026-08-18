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
 * Delete a concept — from 04 · Vocabulary, which is the only place that does it.
 *
 * Your work used to carry its own "delete this concept". It went on
 * 2026-08-17 (TJ: "i sense that delete concept should only be in vocabulary.
 * and that in reading it is remove concept from passage"): a concept belongs
 * to the student and travels through every text they have read, so destroying
 * it from inside one reading was a loom-wide act behind a reading-scoped door.
 *
 * So cleanup takes the route a student now takes. Slower than the old two
 * clicks, and it exercises the real path rather than a shortcut that no longer
 * exists.
 *
 * Waits on the POST, not the row: the list clears optimistically, and ending a
 * test at the disappearance strands the delete for the next run.
 */
export async function deleteConceptInVocabulary(page: Page, label: string) {
  await page
    .locator('nav[aria-label="The journey"] button.station', { hasText: 'Vocabulary' })
    .click();
  const row = page
    .locator('.lrow[data-concept-id]', { has: page.locator('.lconcept', { hasText: label }) })
    .first();
  await expect(row).toBeVisible({ timeout: 20000 });
  await row.locator('.lhead').click();
  const deleted = page.waitForResponse((r) => isDeletePost(r.request()));
  await row.getByRole('button', { name: 'remove concept' }).click();
  await page.getByRole('button', { name: 'Delete concept' }).click();
  await deleted;
  await expect(page.locator('.lconcept', { hasText: label })).toHaveCount(0, { timeout: 15000 });
}

/**
 * Take a reading of your own off the shelf, the way a student does.
 *
 * Every spec that cards a reading should end with this. Until 2026-08-17 none
 * of them could: the only delete in the app was `deleteSource`, which opens
 * with `requireAdmin` — so `journey-learner` and `reuse-seam` left a card
 * behind on every run, and 80 of them had piled up on the test account by the
 * time anyone counted. `journey-learner`'s own docstring said it removed
 * everything it made; the reading was the one thing it could not.
 *
 * Archived, not deleted, so this is cleanup of the SHELF rather than of the
 * database — which is the honest thing to promise and matches what the button
 * does.
 */
export async function removeOwnReading(page: Page, title: string) {
  await page.goto('/');
  const card = page.locator('.shelfcard', { hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.locator('.shelfremove').click();
  await page.getByRole('button', { name: 'Remove from my shelf' }).click();
  await expect(page.locator('.shelfcard', { hasText: title })).toHaveCount(0, { timeout: 20000 });
}

/**
 * Assert which reading is open, from where the title actually lives.
 *
 * It was `.scopetitle`, in a band above the journey, until 2026-08-17. That
 * band is gone and the title is in the footer — and the footer stands down on
 * the reading station, because with the text open the station is the text. The
 * workbench also OPENS on the reading station, so there is no moment after
 * entering when the title is on screen.
 *
 * So this steps to 02 · Linking, where the footer stands and names the same
 * reading, and steps back. The title is the reading's, not the station's.
 */
export async function expectReadingTitle(page: Page, title: RegExp) {
  const station = (name: string) =>
    page.locator('nav[aria-label="The journey"] button.station', { hasText: name });
  await station('Linking').click();
  await expect(page.locator('footer .foottitle')).toContainText(title, { timeout: 10_000 });
  await station('Reading').click();
  // Back on the text before the caller carries on with it.
  await expect(page.locator('.pdf-toolbar')).toBeVisible({ timeout: 15_000 });
}

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
  // "In the text" button — is already on screen; an unscoped
  // /Reading/i now matches both and is a strict-mode violation.
  await page.locator('nav[aria-label="The journey"] button.station', { hasText: 'Reading' }).click();
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
  await page.locator('nav[aria-label="The journey"] button.station', { hasText: 'Reading' }).click();
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
export async function openYourWork(page: Page, view?: 'passages' | 'concepts') {
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
  // The sheet has held two views since 2026-08-17 and opens on PASSAGES, which
  // is what a student wants after a capture. A spec hunting a CONCEPT row has
  // to say so — before that, `.lconcept` simply was not rendered and the
  // failure read as a missing concept rather than a different view.
  if (view) {
    await panel.locator('.segmented button', { hasText: view === 'passages' ? 'Passages' : 'Concepts' }).click();
    await expect(
      panel.locator('.segmented button', { hasText: view === 'passages' ? 'Passages' : 'Concepts' })
    ).toHaveAttribute('aria-pressed', 'true');
  }
  return panel;
}
