import { test, expect } from '@playwright/test';
import { openReading } from './helpers';

// Runs as Test User A (see playwright/global-setup.ts): the concepts and bytes
// this spec captures belong to the test account, never to a real person's loom.
test.use({ storageState: 'playwright/.auth/testa.json' });

const pdfsToTest = [
  { cardTitle: 'Object Worlds', expectedText: 'Object Worlds' },
  { cardTitle: 'Communities of Practice', expectedText: 'Communities of Practice' },
  { cardTitle: 'Boundary Objects', expectedText: 'Boundary Objects' }
];

test.describe('PDF Viewer and Highlighting', () => {
  for (const pdf of pdfsToTest) {
    test(`should highlight captured byte in ${pdf.cardTitle}`, async ({ page }) => {
      // Three of these run in parallel against a dev server that compiles on
      // demand; the save round-trip alone can outlast the 30s default.
      test.setTimeout(60_000);
      const conceptName = `Test Concept for ${pdf.cardTitle}`;

      await page.addInitScript(() => {
        localStorage.setItem("loom_has_seen_walkthrough", "true");
      });
      // The shelf is the home screen: pick the reading off it, which opens
      // that reading's workbench, and read the text from tab 00 inside it.
      await openReading(page, pdf.cardTitle);
      // Case-insensitive: shelf titles are the readings' own ("Communities of
      // practice and social learning systems"), not the test's shorthand.
      await expect(page.locator('.scopetitle')).toContainText(
        new RegExp(pdf.expectedText, 'i')
      );

      // Wait for the text layer to render on the first page
      const textLayer = page.locator('.react-pdf__Page__textContent');
      await expect(textLayer.first()).toBeAttached({ timeout: 10000 });

      // Go to Page 2 (simulating user turning page)
      await page.getByRole('button', { name: 'Next Page' }).click();

      // Wait a moment for page 2 to render
      await page.waitForTimeout(1000);

      // Select a FULL PASSAGE — a run of consecutive text-layer lines adding
      // up to a real excerpt — never a stray fragment of a word. The selection
      // starts at the first line of substantial prose and extends across
      // siblings until it holds a passage's worth of text.
      const selected = await textLayer.first().evaluate((layer) => {
        const spans = Array.from(layer.querySelectorAll('span')).filter(
          (s) => (s.textContent ?? '').trim().length > 0
        );
        let start = spans.findIndex((s) => (s.textContent ?? '').trim().length >= 40);
        if (start === -1) start = 0;
        if (!spans.length) return '';
        let end = start;
        let length = (spans[start].textContent ?? '').length;
        while (end + 1 < spans.length && length < 200) {
          end++;
          length += (spans[end].textContent ?? '').length;
        }
        const range = document.createRange();
        range.setStartBefore(spans[start].firstChild ?? spans[start]);
        range.setEndAfter(spans[end].firstChild ?? spans[end]);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        // Dispatch mouseup to trigger the app's text selection listener
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        return selection?.toString() ?? '';
      });
      // The selection itself must be a passage, not a scrap.
      expect(selected.trim().length).toBeGreaterThanOrEqual(80);

      const captureButton = page.locator('button:has-text("Capture as Byte")');
      await expect(captureButton).toBeVisible();
      await captureButton.click();

      // Modal appears, save the byte. Exact match: the Open tab's concept
      // input starts with the same words and is still mounted behind this.
      const conceptInput = page.getByPlaceholder('e.g. boundary objects', { exact: true });
      await conceptInput.fill(conceptName);

      const saveButton = page.locator('button:has-text("Save Byte")');
      await saveButton.click();

      // Wait for the MODAL to close, not for the button's text: while the
      // save is in flight the button reads "Saving..." — which makes a
      // "Save Byte" locator report hidden while the modal's scrim is still
      // up, swallowing every click that follows. The heading disappears only
      // when the capture has really landed and the modal unmounted.
      await expect(page.getByRole('heading', { name: 'Capture Byte' })).toBeHidden({ timeout: 30_000 });

      // Verify the highlight is applied to the DOM immediately
      const highlight = page.locator('.loom-byte-highlight').first();
      await expect(highlight).toBeVisible({ timeout: 5000 });

      // The capture WAS the test — the data must not outlive it, or every run
      // stacks another identical concept onto the account. Since 0021 a byte
      // survives its concept (P0.1), so remove the byte first, then the
      // concept, through the same UI a student would use — and await each
      // delete's server-action POST: the optimistic UI clears instantly, and
      // ending the test earlier aborts the queued fetches, leaving residue.
      await page.locator('nav button', { hasText: 'Open' }).click();
      const row = page
        .locator('.lrow', { has: page.locator('.lconcept', { hasText: conceptName }) })
        .first();
      await expect(row).toBeVisible({ timeout: 5000 });
      await row.locator('.lhead').click();
      const byteId = await row.locator('[data-byte-id]').first().getAttribute('data-byte-id');
      const byteDeleted = page.waitForResponse((r) =>
        r.request().method() === 'POST' && (r.request().postData() ?? '').includes(byteId!)
      );
      await row.getByRole('button', { name: 'remove byte' }).click();
      await byteDeleted;
      const conceptDeleted = page.waitForResponse((r) =>
        r.request().method() === 'POST' && /^\["[0-9a-f-]{36}"\]$/.test(r.request().postData() ?? '')
      );
      await row.getByRole('button', { name: 'remove concept' }).click();
      await page.getByRole('button', { name: 'Delete concept' }).click();
      await conceptDeleted;
      await expect(page.locator('.lconcept', { hasText: conceptName })).toHaveCount(0, { timeout: 5000 });
    });
  }
});
