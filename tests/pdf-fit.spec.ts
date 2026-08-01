import { test, expect } from '@playwright/test';
import { openReading } from './helpers';

// Runs as Test User A (see playwright/global-setup.ts) so nothing here touches
// a real account. The real session cookie makes mocking /api/auth/session
// unnecessary — and mocking it would misreport who is signed in.
test.use({ storageState: 'playwright/.auth/testa.json' });

test.describe('PDF Viewer Fit Modes', () => {
  test('fit to width should not cause horizontal scroll', async ({ page }) => {
    // 1. Navigate to the app and bypass walkthrough
    await page.addInitScript(() => {
      localStorage.setItem("loom_has_seen_walkthrough", "true");
    });
    // 2-4. Pick the reading off the shelf and open the text (tab 00).
    await openReading(page, 'Object Worlds');

    // Wait for the text layer to render on the first page
    const textLayer = page.locator('.react-pdf__Page__textContent');
    await expect(textLayer.first()).toBeAttached({ timeout: 10000 });

    // 5. Change Fit Mode to "Fit to Width"
    await page.getByRole('button', { name: 'Fit Width' }).click();

    // Give it a moment to resize
    await page.waitForTimeout(1000);

    // 6. Check if horizontal scrollbar exists
    const scrollMetrics = await page.evaluate(() => {
      const el = document.querySelector('.react-pdf__Document')?.parentElement?.parentElement;
      if (!el) return null;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });

    console.log('Scroll metrics:', scrollMetrics);
    expect(scrollMetrics).not.toBeNull();
    if (!scrollMetrics) {
      throw new Error('Unable to locate PDF scroll container for fit-width assertion.');
    }

    // Expect that scrollWidth is approximately equal to clientWidth (no horizontal scrolling)
    // We allow a tiny tolerance like 5px for borders, but not 200px.
    expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(scrollMetrics.clientWidth + 5);
  });
});
