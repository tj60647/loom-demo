import { test, expect } from '@playwright/test';

/**
 * Visual + structural verification of the student Library tab and the
 * admin Library manager. Uses the same client-side session mock pattern as
 * the existing PDF viewer specs so the UI renders in an authenticated state.
 */

const ADMIN_SESSION = {
  user: { name: 'Test Admin', email: 'tjm@tjmcleish.com', id: 'test-admin-id', role: 'ADMIN' },
  expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
};

async function mockSession(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ADMIN_SESSION),
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('loom_has_seen_walkthrough', 'true');
  });
}

test.describe('Library verification', () => {
  test('the shelf renders reading cards with thumbnail and counts, and opens a workbench', async ({ page }) => {
    await mockSession(page);
    await page.goto('/');

    // Reading-first: the shelf is the home screen and each card is a link into
    // that reading's workbench.
    const cards = page.locator('.shelfcard');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    expect(await cards.count()).toBeGreaterThan(0);

    const firstCard = cards.first();
    await expect(firstCard.locator('img')).toBeVisible();
    // Counted, never scored — the card reports the student's own acts.
    await expect(firstCard.locator('.shelftally')).toBeVisible();

    await page.screenshot({ path: 'test-results/shelf.png', fullPage: true });

    await firstCard.click();
    await expect(page).toHaveURL(/\/reading\//);
    // Download moved off the library card onto the reading's scope bar.
    await expect(page.getByRole('link', { name: /Download PDF/i })).toBeVisible();
    // Scoped to the workbench nav: "open" also matches the help button and the
    // Next dev-tools button in a dev build.
    await expect(page.locator('nav').getByRole('button', { name: /Open/i })).toBeVisible();

    await page.screenshot({ path: 'test-results/reading-workbench.png', fullPage: true });
  });

  test('admin Library manager renders source cards with edit disclosure and controls', async ({ page }) => {
    await mockSession(page);
    await page.goto('/admin/library');

    // Scope to source cards (they contain a thumbnail); skip the add-reading form card.
    const cards = page.locator('.card').filter({ has: page.locator('img') });
    await expect(cards.first()).toBeVisible({ timeout: 15000 });

    const firstCard = cards.first();
    await expect(firstCard.locator('img')).toBeVisible();

    // Controls: Edit (disclosure summary), Hide/Reveal, Download, Remove.
    const editSummary = firstCard.locator('summary', { hasText: 'Edit' });
    await expect(editSummary).toBeVisible();
    await expect(firstCard.getByRole('button', { name: /Hide|Reveal/i })).toBeVisible();
    await expect(firstCard.getByRole('link', { name: /Download PDF/i })).toBeVisible();
    await expect(firstCard.getByRole('button', { name: /^Remove$/i })).toBeVisible();

    // Edit must be a disclosure, not an always-open form: title field hidden until opened.
    const titleInput = firstCard.locator('input[name="title"]');
    await expect(titleInput).toBeHidden();
    await editSummary.click();
    await expect(titleInput).toBeVisible();

    await page.screenshot({ path: 'test-results/library-admin.png', fullPage: true });
  });
});
