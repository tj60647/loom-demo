import { test, expect } from '@playwright/test';

test.describe('Files tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { name: 'Test Admin', email: 'tjm@tjmcleish.com', id: 'test-admin-id' },
          expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
        }),
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem("loom_has_seen_walkthrough", "true");
    });
  });

  test('lists concepts as markdown files and supports edit round-trip', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Files/i }).click();

    const cards = page.locator('.card');
    const count = await cards.count();
    if (count === 0) {
      test.skip(true, 'No concepts exist for the seeded test user');
    }

    await cards.first().click();
    const pre = page.locator('pre').first();
    await expect(pre).toContainText('## Definition');
    await expect(pre).toContainText('## Evidence');
    await expect(pre).toContainText('## Connections');

    await page.getByRole('button', { name: 'Edit' }).click();
    const textarea = page.locator('textarea');
    const original = await textarea.inputValue();
    await textarea.fill(original.replace(/^## Notes\n\n[\s\S]*?\n\n## Evidence/, '## Notes\n\nUpdated via Files tab test.\n\n## Evidence'));
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(page.locator('.hint', { hasText: /error/i })).toHaveCount(0);
  });

  test('export endpoint returns a zip', async ({ page }) => {
    const response = await page.request.get('/api/export/vault');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/zip');
    expect(response.headers()['content-disposition']).toContain('loom-vault.zip');
  });
});
