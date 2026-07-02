import { test, expect } from '@playwright/test';

test.describe('PDF Viewer Fit Modes', () => {
  test('fit to width should not cause horizontal scroll', async ({ page }) => {
    // 0. Mock the NextAuth session API so the client-side thinks we are logged in
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

    // 1. Navigate to the app and bypass walkthrough
    await page.addInitScript(() => {
      localStorage.setItem("loom_has_seen_walkthrough", "true");
    });
    await page.goto('/');
    
    // 2. Click on the Library tab
    await page.getByRole('button', { name: /Library/i }).click();
    await expect(page.locator('text=Object Worlds')).toBeVisible();
    
    // 3. Click "Read in Loom" on the first card
    const card = page.locator('.card', { hasText: 'Object Worlds' });
    await card.locator('button:has-text("Read in Loom")').click();
    
    // 4. Wait for PDF to load
    await expect(page.locator('text=Loading PDF...')).toBeHidden({ timeout: 15000 });
    
    // Wait for the text layer to render on the first page
    const textLayer = page.locator('.react-pdf__Page__textContent');
    await expect(textLayer.first()).toBeAttached({ timeout: 10000 });

    // 5. Change Fit Mode to "Fit to Width"
    // Find the toggle/button for fit mode. It's a checkbox or radio in the toolbar?
    // Let's check PdfViewer.tsx for the exact text/button.
    // It has: <button className={fitMode === "width" ? "btn mini" : "btn ghost mini"} onClick={() => setFitMode("width")}>Fit Width</button>
    await page.getByRole('button', { name: 'Fit Width' }).click();

    // Give it a moment to resize
    await page.waitForTimeout(1000);

    // 6. Check if horizontal scrollbar exists
    // The scroll container is likely the flex container. Let's just check document body or the main container.
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
