import { expect, type Locator, type Page } from '@playwright/test';

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
 * Since 2026-08-08 (TJ) a card has exactly ONE door. With a cloth, the card
 * body is the link. Without one, the body is inert and **Create Cloth** is the
 * only act — "just read" is a procedure inside a cloth (browse and capture
 * nothing), not a path around it. So a spec cannot assume `.shelfmain` is a
 * link; it must take whichever door the card offers, and creation is a real
 * write the first time a spec meets an unclothed reading.
 */
export async function enterReadingFromCard(page: Page, card: Locator) {
  // Wait for the loom to load first. The card renders "…" in its tally while
  // the graph is in flight and re-renders when the counts arrive — clicking
  // into that re-render detaches the node and the click lands on nothing. It
  // is also what decides which door is rendered.
  await expect(card.locator('.shelftally')).not.toHaveText('…', { timeout: 15000 });
  const door = card.locator('a.shelfmain');
  if (await door.count()) {
    await door.click();
  } else {
    await card.getByRole('button', { name: 'Create Cloth' }).click();
  }
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
 * Show the capture log rail beside the text.
 *
 * Since the merge there is no Open tab to click: the log is a rail on the
 * reading station, closed by default. Idempotent on purpose — a capture may
 * have opened it already, and a blind toggle would close it again.
 */
export async function openCaptureLog(page: Page) {
  const rail = page.locator('.readinglog');
  if ((await rail.count()) === 0) {
    await page.getByRole('button', { name: /Capture log/i }).first().click();
  }
  await expect(rail).toBeVisible({ timeout: 15000 });
}
