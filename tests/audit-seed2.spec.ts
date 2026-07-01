import { test, expect } from '@playwright/test';

test.describe('Audit Seed Bytes', () => {
  test('verify mark.js fuzzy match', async ({ page }) => {
    // 0. Mock auth
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
    
    await page.goto('/');
    await page.getByRole('button', { name: /Library/i }).click();
    
    // Open Designing Engineers
    const card = page.locator('.card', { hasText: 'Object Worlds' });
    await card.locator('button:has-text("Read in Loom")').click();
    
    // Wait for PDF to load
    await expect(page.locator('text=Loading PDF...')).toBeHidden({ timeout: 15000 });
    
    // Go to page 4
    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(2000);
    
    // Evaluate mark.js directly on the page!
    const matches = await page.evaluate(() => {
      // @ts-ignore
      const Mark = window.Mark;
      if (!Mark) return 'Mark not found';
      
      const layer = document.querySelector('.react-pdf__Page__textContent');
      if (!layer) return 'Layer not found';
      
      const instance = new Mark(layer);
      
      const content = ". One might\nclaim that the underlying form of the chair was\nembedded in the crafter's rules of thumb, sense\nof symmetry, feel for an awl in making a cut, or\nknow-how about joining wood to wood, but that\nknowledge remained unarticulated, tacit, and\nsensual (as far as we know).";
      
      let count = 0;
      instance.mark(content, {
        accuracy: "partially",
        separateWordSearch: false,
        className: "test-highlight",
        acrossElements: true,
        diacritics: true,
        ignoreJoiners: true,
        ignorePunctuation: [":", ";", ",", ".", "-", "—", " ", "\n", "\r", "\t", "”", "“", '"', "'", "(", ")", "[", "]"],
        done: (c) => count += c
      });
      
      return count;
    });
    
    console.log(`Mark.js found ${matches} matches.`);
    
    // Try without acrossElements?
    // Try with exact accuracy?
  });
});
