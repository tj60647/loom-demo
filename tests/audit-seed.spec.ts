import { test } from '@playwright/test';
import { openReading } from './helpers';

// Diagnostic spec: logs what the highlighter finds on Test User A's account
// (see playwright/global-setup.ts). No mocked session — the cookie is real.
test.use({ storageState: 'playwright/.auth/testa.json' });

test.describe('Audit Seed Passages', () => {
  test('verify seed passages are highlighted', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("loom_has_seen_walkthrough", "true");
    });

    // Pick the reading off the shelf and open its text (tab 00).
    await openReading(page, 'Object Worlds');

    // Go to page 4
    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(1000);

    // Check how many highlights exist
    const highlights = page.locator('.loom-passage-highlight');
    const count = await highlights.count();
    console.log(`Found ${count} highlighted elements on Page 4.`);

    // Dump text content of all text layers on screen
    const textLayers = page.locator('.react-pdf__Page__textContent');
    const layerCount = await textLayers.count();
    for (let i = 0; i < layerCount; i++) {
      const text = await textLayers.nth(i).innerText();
      console.log(`\n--- Text Layer ${i} Content ---\n${text.substring(0, 500)}`);
    }
  });
});
