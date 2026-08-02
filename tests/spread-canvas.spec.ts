import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// Smoke test for the spread canvas: open it from a reading's workbench, make a
// highlight with a concept name + working definition, check the card and
// highlight render, then round-trip the single/spread/freeform toggle and
// spread navigation.
test.describe('Spread Canvas', () => {
  test('highlight a passage and file it as a concept card', async ({ page }) => {
    // Serve the PDF bytes directly so the test does not depend on what the
    // seeded source's storage key points at.
    await page.route('**/api/readings/e2e-object-worlds', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: readFileSync(join(__dirname, '..', 'storage', 'readings', 'Bucciarelli-Designing Engineers.pdf')),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('loom_has_seen_walkthrough', 'true');
    });

    // Shelf → reading workbench → canvas overlay.
    await page.goto('/');
    const card = page.locator('.shelfcard', { hasText: 'Object Worlds' }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(page).toHaveURL(/\/reading\//, { timeout: 15000 });
    await page.locator('button:has-text("Read on Canvas")').click();

    // Canvas boots into spread mode fitted to spread 1.
    await expect(page.locator('.sc-canvas')).toBeVisible({ timeout: 20000 });
    const textLayer = page.locator('.sc-canvas .react-pdf__Page__textContent');
    await expect(textLayer.first()).toBeAttached({ timeout: 15000 });
    await expect(page.locator('.sc-indicator')).toContainText('pages 1–2');
    await expect(page.locator('.sc-mask-left')).toBeVisible();

    // Select a span of page text and capture it. Page 1 of the fixture PDF is
    // a cover with no extractable text, so take the first meaty span anywhere.
    const pageSpan = page.locator('.sc-canvas .react-pdf__Page__textContent span', { hasText: /[a-zA-Z]{4,}/ }).first();
    await expect(pageSpan).toBeVisible({ timeout: 15000 });
    await pageSpan.evaluate((el) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    });
    await page.locator('.sc-capture-btn').click();

    // The draft card takes a name and working definition.
    const draftCard = page.locator('.sc-card-draft');
    await expect(draftCard).toBeVisible();
    const conceptName = `Canvas Test ${Date.now()}`;
    await draftCard.getByPlaceholder('concept name').fill(conceptName);
    await draftCard.getByPlaceholder('working definition').fill('a working definition for the smoke test');
    // No save button: the draft saves as you type and hands over when focus leaves.
    await page.locator('.sc-title').click();
    await expect(draftCard).toBeHidden({ timeout: 10000 });

    // The saved card and its highlight render on the rail. Titles are React-
    // controlled textareas, so match on the live value rather than DOM text.
    await expect
      .poll(async () =>
        page
          .locator('.sc-card:not(.sc-card-draft) .sc-card-title textarea')
          .evaluateAll(
            (els, name) => els.some((el) => (el as HTMLTextAreaElement).value === name),
            conceptName
          ),
        { timeout: 10000 }
      )
      .toBe(true);
    await expect(page.locator('.sc-hl').first()).toBeAttached({ timeout: 10000 });

    // Freeform hides the masks; back to spread mode restores them.
    await page.locator('.sc-toggle button:has-text("Freeform")').click();
    await expect(page.locator('.sc-mask-left')).toBeHidden();
    await page.locator('.sc-toggle button:has-text("Spread")').click();
    await expect(page.locator('.sc-mask-left')).toBeVisible();

    // Next spread advances the indicator; single mode narrows to one page.
    await page.getByRole('button', { name: 'Next Spread' }).click();
    await expect(page.locator('.sc-indicator')).toContainText('pages 3–4');
    await page.locator('.sc-toggle button:has-text("Single")').click();
    await expect(page.locator('.sc-indicator')).toContainText('page 3 of');
    await page.getByRole('button', { name: 'Next Spread' }).click();
    await expect(page.locator('.sc-indicator')).toContainText('page 4 of');

    // Back closes the overlay and lands on the workbench again.
    await page.locator('button:has-text("← Back")').click();
    await expect(page.locator('.sc-canvas')).toBeHidden();
    await expect(page.locator('.scopebar')).toBeVisible();
  });
});
