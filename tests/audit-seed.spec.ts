import { test } from '@playwright/test';
import { openReading } from './helpers';

test.describe('Audit Seed Bytes', () => {
  test('verify seed bytes are highlighted', async ({ page }) => {
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
    
    // Pick Designing Engineers off the shelf and open its text (tab 00).
    await openReading(page, 'Object Worlds');
    
    // Go to page 4
    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(1000);
    
    // Check how many highlights exist
    const highlights = page.locator('.loom-byte-highlight');
    const count = await highlights.count();
    console.log(`Found ${count} highlighted elements on Page 4.`);
    
    // Dump text content of all text layers on screen
    const textLayers = page.locator('.react-pdf__Page__textContent');
    const layerCount = await textLayers.count();
    for (let i=0; i<layerCount; i++) {
      const text = await textLayers.nth(i).innerText();
      console.log(`\n--- Text Layer ${i} Content ---\n${text.substring(0, 500)}`);
    }
  });
});
