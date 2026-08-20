import { expect, type Page } from '@playwright/test';

/**
 * Reading-first navigation.
 *
 * The shelf is the home screen, so opening a reading means picking its card,
 * which lands on `/studio/reading/[sourceId]` in the Studio workspace.
 */
export async function openReading(page: Page, title: string) {
  await page.goto('/library');

  const card = page.locator('.shelfcard', { hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  // Wait for the loom to load before clicking. The card renders "…" in its
  // tally while the graph is still in flight and re-renders when the counts
  // arrive — clicking into that re-render detaches the node and the click
  // lands on nothing.
  await expect(card.locator('.shelftally')).not.toHaveText('…', { timeout: 15000 });
  await card.click();
  // 15s, not the 5s default: in dev the route compiles on demand and the App
  // Router only commits the URL once the server has rendered, which under
  // parallel workers can outlast the default expect timeout.
  await expect(page).toHaveURL(/\/studio\/reading\//, { timeout: 15000 });

  await page.getByRole('button', { name: /Source/i }).click();
  await expect(page.locator('text=Loading PDF...')).toBeHidden({ timeout: 15000 });
}
