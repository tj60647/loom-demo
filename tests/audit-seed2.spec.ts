import { test } from '@playwright/test';
import { openReading } from './helpers';

// Runs as Test User A (see playwright/global-setup.ts); the session cookie is
// real, so no mocked /api/auth/session.
test.use({ storageState: 'playwright/.auth/testa.json' });

test.describe('Audit Seed Passages', () => {
  test('verify mark.js fuzzy match', async ({ page }) => {
    
    // Pick Designing Engineers off the shelf and open its text (tab 00).
    await openReading(page, 'Object Worlds');
    
    // Go to page 4
    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(2000);
    
    // Evaluate mark.js directly on the page!
    const matches = await page.evaluate(() => {
      // @ts-expect-error window.Mark is injected in browser runtime only
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
        done: (c: number) => count += c
      });
      
      return count;
    });
    
    console.log(`Mark.js found ${matches} matches.`);
    
    // Try without acrossElements?
    // Try with exact accuracy?
  });
});
