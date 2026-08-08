import { expect, type Page } from '@playwright/test';

/**
 * Reading-first navigation.
 *
 * The shelf is the home screen, so opening a reading means picking its card,
 * which lands on `/reading/[sourceId]`. The text itself is tab 00 inside that
 * workbench rather than a course-wide Library tab.
 */
export async function openReading(page: Page, title: string) {
  await page.goto('/');

  const card = page.locator('.shelfcard', { hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  // Wait for the loom to load before clicking. The card renders "…" in its
  // tally while the graph is still in flight and re-renders when the counts
  // arrive — clicking into that re-render detaches the node and the click
  // lands on nothing.
  await expect(card.locator('.shelftally')).not.toHaveText('…', { timeout: 15000 });
  // The reading link is .shelfmain — the card also carries the cloth row
  // (Create/Open Cloth), so a click on the card's center is no longer a click
  // on the reading.
  await card.locator('.shelfmain').click();
  // 15s, not the 5s default: in dev the route compiles on demand and the App
  // Router only commits the URL once the server has rendered, which under
  // parallel workers can outlast the default expect timeout.
  await expect(page).toHaveURL(/\/reading\//, { timeout: 15000 });

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
