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
  await card.click();
  await expect(page).toHaveURL(/\/reading\//);

  await page.getByRole('button', { name: /Reading/i }).click();
  await expect(page.locator('text=Loading PDF...')).toBeHidden({ timeout: 15000 });
}
