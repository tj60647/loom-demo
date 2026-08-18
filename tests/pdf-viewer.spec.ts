import { test, expect } from '@playwright/test';
import { deleteConceptInVocabulary, expectReadingTitle, openReading, openYourWork } from './helpers';

// Runs as Test User A (see playwright/global-setup.ts): the concepts and passages
// this spec captures belong to the test account, never to a real person's loom.
test.use({ storageState: 'playwright/.auth/testa.json' });

const pdfsToTest = [
  { cardTitle: 'Object Worlds', expectedText: 'Object Worlds' },
  { cardTitle: 'Communities of Practice', expectedText: 'Communities of Practice' },
  { cardTitle: 'Boundary Objects', expectedText: 'Boundary Objects' }
];

test.describe('PDF Viewer and Highlighting', () => {
  for (const pdf of pdfsToTest) {
    test(`should highlight captured passage in ${pdf.cardTitle}`, async ({ page }) => {
      // Three of these run in parallel against a dev server that compiles on
      // demand; the save round-trip alone can outlast the 30s default.
      test.setTimeout(60_000);
      const conceptName = `Test Concept for ${pdf.cardTitle}`;

      // The shelf is the home screen: pick the reading off it, which opens
      // that reading's workbench, and read the text from tab 00 inside it.
      await openReading(page, pdf.cardTitle);

      // Wait for the text layer to render on the first page
      const textLayer = page.locator('.react-pdf__Page__textContent');
      await expect(textLayer.first()).toBeAttached({ timeout: 10000 });

      // Case-insensitive: shelf titles are the readings' own ("Communities of
      // practice and social learning systems"), not the test's shorthand.
      // Checked from 02, where the footer that carries the title stands — the
      // reading station withholds it (helpers.ts).
      await expectReadingTitle(page, new RegExp(pdf.expectedText, 'i'));

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

      const captureButton = page.locator('button:has-text("Capture as Passage")');
      await expect(captureButton).toBeVisible();
      await captureButton.click();

      // Modal appears, save the passage. Exact match: Your work's own concept
      // input starts with the same words and is mounted behind this at all
      // times now — the sheet is parked off-screen, not unmounted.
      const conceptInput = page.locator('.info-scrim').getByPlaceholder('e.g. boundary objects', { exact: true });
      await conceptInput.fill(conceptName);

      const saveButton = page.locator('button:has-text("Save Passage")');
      await saveButton.click();

      // Wait for the MODAL to close, not for the button's text: while the
      // save is in flight the button reads "Saving..." — which makes a
      // "Save Passage" locator report hidden while the modal's scrim is still
      // up, swallowing every click that follows. The heading disappears only
      // when the capture has really landed and the modal unmounted.
      await expect(page.getByRole('heading', { name: 'Capture Passage' })).toBeHidden({ timeout: 30_000 });

      // Verify the highlight is applied to the DOM immediately
      const highlight = page.locator('.loom-passage-highlight').first();
      await expect(highlight).toBeVisible({ timeout: 5000 });

      // The capture WAS the test — the data must not outlive it, or every run
      // stacks another identical concept onto the account. Since 0021 a passage
      // survives its concept (P0.1), so remove the passage first, then the
      // concept, through the same UI a student would use — and await each
      // delete's server-action POST: the optimistic UI clears instantly, and
      // ending the test earlier aborts the queued fetches, leaving residue.
      await openYourWork(page, 'concepts');
      const row = page
        .locator('#yourwork .lrow', { has: page.locator('.lconcept', { hasText: conceptName }) })
        .first();
      await expect(row).toBeVisible({ timeout: 5000 });
      await row.locator('.lhead').click();
      const passageId = await row.locator('[data-passage-id]').first().getAttribute('data-passage-id');
      const passageDeleted = page.waitForResponse((r) =>
        r.request().method() === 'POST' && (r.request().postData() ?? '').includes(passageId!)
      );
      // Scoped to the passage this test made. Every passage row carries a
      // "remove passage" now that the control is unconditional, so a concept
      // holding more than one — including residue from an earlier failed run —
      // made an unscoped match ambiguous.
      await row.locator(`[data-passage-id="${passageId}"]`)
        // exact: Playwright matches accessible names by SUBSTRING, and the row
      // also holds "remove passage from concept" since 2026-08-17.
      .getByRole('button', { name: 'remove passage', exact: true }).click();
      await passageDeleted;
      // 04 is the only station that deletes a concept since 2026-08-17.
      await deleteConceptInVocabulary(page, conceptName);
    });
  }

  // The two properties the 2026-08-09 rebuild is FOR. Until then the capture
  // side was a rail that squeezed the text above 820px, so opening it re-fitted
  // the page and re-rasterised it under the reader.
  test('Your work slides over the text without moving the page', async ({ page }) => {
    await openReading(page, 'Object Worlds');
    const stage = page.locator('.pdf-stage');
    const before = await stage.boundingBox();
    await openYourWork(page, 'concepts');
    // The whole point: the stage keeps its box, so nothing re-fits, nothing
    // re-rasterises, and the words do not move under a selection in progress.
    expect((await stage.boundingBox())?.width).toBe(before?.width);
  });

  test('Escape sends Your work back and hands focus to its button', async ({ page }) => {
    await openReading(page, 'Object Worlds');
    await openYourWork(page, 'concepts');
    await page.keyboard.press('Escape');
    // toBeHidden is honest here only because the sheet goes visibility:hidden
    // at the end of the slide — a transform alone would still read as visible.
    await expect(page.locator('#yourwork')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('#yourwork-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#yourwork-toggle')).toBeFocused();
  });

  /**
   * A passage is ONE tab stop, however many fragments it is drawn in.
   *
   * mark.js wraps a <mark> per text-layer span a passage crosses, and the
   * seeded readings run 3–23 fragments per passage. Every fragment used to
   * carry tabindex="0" and the same aria-label, so a keyboard user crossing
   * one highlighted sentence stopped on it up to 23 times and heard the
   * identical citation each time.
   *
   * This is asserted rather than eyeballed because it is invisible: the marks
   * butt together at 0px, so nothing on screen shows that a passage is drawn
   * in twenty-three pieces. It regressed silently once and would again.
   */
  test('a passage is one tab stop, however many fragments it is drawn in', async ({ page }) => {
    await openReading(page, 'Object Worlds');
    await expect(page.locator('.loom-passage-highlight').first()).toBeVisible({ timeout: 15000 });

    const byPassage = await page.evaluate(() => {
      const rows: Record<string, { marks: number; tabStops: number; labelled: number }> = {};
      for (const m of Array.from(document.querySelectorAll('.loom-passage-highlight'))) {
        const id = m.getAttribute('data-loom-passage-id') ?? '?';
        const row = (rows[id] ||= { marks: 0, tabStops: 0, labelled: 0 });
        row.marks++;
        if (m.getAttribute('tabindex') === '0') row.tabStops++;
        if (m.getAttribute('aria-label')) row.labelled++;
      }
      return rows;
    });

    const rows = Object.values(byPassage);
    expect(rows.length).toBeGreaterThan(0);
    // Guard the guard: if a future change stopped fragmenting passages, the
    // assertions below would pass for the wrong reason and stop testing this.
    expect(rows.some((r) => r.marks > 1)).toBe(true);
    // Every fragment keeps the anchor — the rails resolve their cards off it.
    expect(Object.keys(byPassage)).not.toContain('?');
    for (const row of rows) {
      expect(row.tabStops).toBe(1);
      expect(row.labelled).toBe(1);
    }
  });
});
