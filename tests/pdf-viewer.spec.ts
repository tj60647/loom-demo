import { test, expect } from '@playwright/test';

const pdfsToTest = [
  { cardTitle: 'Object Worlds', expectedText: 'Object Worlds' },
  { cardTitle: 'Communities of Practice', expectedText: 'Communities of Practice' },
  { cardTitle: 'Boundary Objects', expectedText: 'Boundary Objects' }
];

test.describe('PDF Viewer and Highlighting', () => {
  for (const pdf of pdfsToTest) {
    test(`should highlight captured byte in ${pdf.cardTitle}`, async ({ page }) => {
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

      // 1. Navigate to the app (auth is handled by mock)
      await page.addInitScript(() => {
        localStorage.setItem("loom_has_seen_walkthrough", "true");
      });
      await page.goto('/');
      
      // 1b. Click on the Library tab (default is Open tab)
      await page.getByRole('button', { name: /Library/i }).click();
      
      // 2. Wait for the Library to load
      await expect(page.locator(`text=${pdf.expectedText}`)).toBeVisible();
      
      // 3. Click "Read in Loom" on the respective card
      const card = page.locator('.card', { hasText: pdf.cardTitle });
      await card.locator('button:has-text("Read in Loom")').click();
      
      // 4. Wait for PDF to load
      await expect(page.locator('text=Loading PDF...')).toBeHidden({ timeout: 15000 });
      
      // Wait for the text layer to render on the first page
      const textLayer = page.locator('.react-pdf__Page__textContent');
      await expect(textLayer.first()).toBeAttached({ timeout: 10000 });
      
      // 5. Go to Page 2 (simulating user turning page)
      await page.getByRole('button', { name: 'Next Page' }).click();
      
      // Wait a moment for page 2 to render
      await page.waitForTimeout(1000);
      
      // 6. Highlight text using the mouse
      const pageSpan = textLayer.first().locator('span', { hasText: /[a-zA-Z]+/ }).first();
      await expect(pageSpan).toBeVisible();
      
      // Simulate selection reliably using JS, then dispatch mouseup to trigger the app's listener
      await pageSpan.evaluate((el) => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        selection?.removeAllRanges();
        selection?.addRange(range);
        
        // Dispatch mouseup to trigger the app's text selection listener
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      });
      const captureButton = page.locator('button:has-text("Capture as Byte")');
      await expect(captureButton).toBeVisible();
      await captureButton.click();
      
      // 8. Modal appears, save the byte
      const conceptInput = page.getByPlaceholder('e.g. boundary objects');
      await conceptInput.fill(`Test Concept for ${pdf.cardTitle}`);
      
      const saveButton = page.locator('button:has-text("Save Byte")');
      await saveButton.click();
      
      // 9. Wait for modal to close
      await expect(saveButton).toBeHidden();
      
      // 10. Verify the highlight is applied to the DOM immediately
      const highlight = page.locator('.loom-byte-highlight').first();
      await expect(highlight).toBeVisible({ timeout: 5000 });
    });
  }
});
