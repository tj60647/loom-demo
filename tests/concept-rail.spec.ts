import { test, expect } from '@playwright/test';
import { deleteConceptInVocabulary, openReading, openYourWork } from './helpers';

// Runs as Test User A (see playwright/global-setup.ts): the concepts and passages
// this spec captures belong to the test account, never to a real person's loom.
test.use({ storageState: 'playwright/.auth/testa.json' });

/**
 * The margin cards: a passage captured on the open spread grows a card
 * beside its page, leader-lined to the highlight, and the card is a door to
 * Your work — never an editor. The rails stand permanently (TJ, 2026-08-17):
 * they are not a mode, so changing the layout under them (one page, two
 * pages, canvas) must never strand a card.
 */
test.describe('Concept rail', () => {
  test('a captured passage gets a card, and the card opens Your work', async ({ page }) => {
    // One long journey through capture → rail → layouts → click-through →
    // cleanup, against a dev server that compiles on demand.
    test.setTimeout(90_000);
    const conceptName = 'Rail Test Concept A';

    await openReading(page, 'Object Worlds');

    const textLayer = page.locator('.react-pdf__Page__textContent');
    await expect(textLayer.first()).toBeAttached({ timeout: 10000 });
    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(1000);

    // Same selection pattern as pdf-viewer.spec.ts: a run of consecutive
    // text-layer lines adding up to a real passage.
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
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      return selection?.toString() ?? '';
    });
    expect(selected.trim().length).toBeGreaterThanOrEqual(80);

    await page.locator('button:has-text("Capture as Passage")').click();
    await page.locator('.info-scrim').getByPlaceholder('e.g. boundary objects', { exact: true }).fill(conceptName);
    await page.locator('button:has-text("Save Passage")').click();
    await expect(page.getByRole('heading', { name: 'Capture Passage' })).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.loom-passage-highlight').first()).toBeVisible({ timeout: 5000 });

    // The rails stand permanently (TJ, 2026-08-17) — there is no Cards
    // toggle to press. Two pages on a desktop viewport → a rail on each
    // side, and the fresh capture's card beside its page with a leader to
    // the span.
    await expect(page.getByRole('button', { name: 'Cards in the margin' })).toHaveCount(0);
    await page.getByRole('button', { name: '2 pages' }).click();
    await expect(page.locator('.pdf-rail')).toHaveCount(2, { timeout: 5000 });
    const card = page.locator('.pdf-railcard', { hasText: conceptName }).first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.pdf-rail-leaders path').first()).toBeAttached();

    // One page → a single rail, and the card survives the re-layout. Layout
    // is one control with three states now, so this is a button, not the
    // "2-Page Spread" checkbox it used to be.
    await page.getByRole('button', { name: '1 page' }).click();
    await expect(page.locator('.pdf-rail')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.pdf-railcard', { hasText: conceptName }).first()).toBeVisible({ timeout: 5000 });

    // The rails follow the mode: on the canvas the same capture's card
    // flanks its spread (Strip is hidden — TJ 2026-08-10, the canvas
    // supersedes it — so there is no fourth state to check).
    await page.getByRole('button', { name: 'Canvas' }).click();
    await expect(page.locator('.pdf-spread-canvas .pdf-railcard', { hasText: conceptName }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Strip' })).toHaveCount(0);
    await page.getByRole('button', { name: '1 page' }).click();
    await expect(page.locator('.pdf-railcard', { hasText: conceptName }).first()).toBeVisible({ timeout: 10_000 });

    // Back to the spread: the capture was on the left page, so its card
    // returns to the left rail — well clear of the search panel about to
    // open at the right edge.
    await page.getByRole('button', { name: '2 pages' }).click();
    await expect(page.locator('.pdf-rail')).toHaveCount(2, { timeout: 5000 });

    // The card is a door, not an editor: clicking it opens Your work at the
    // passage's row (red line #5 — the work is never out of reach). And the
    // door closes Find on the way — the sheet and the search panel share the
    // right edge, and a panel left open underneath eats the first Escape.
    // The toolbar's search is "in the text" since 2026-08-17; the journey
    // bar's is "this reading". They no longer share a name, but the scope
    // stays because a bare /search/i would still find both.
    await page.locator('.pdf-toolbar').getByRole('button', { name: 'Search the text of this reading' }).click();
    await expect(page.locator('.pdf-search-panel')).toBeVisible();
    await page.locator('.pdf-railcard', { hasText: conceptName }).first().click();
    await expect(page.locator('#yourwork')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.pdf-search-panel')).toBeHidden();
    const row = page
      .locator('#yourwork .lrow', { has: page.locator('.lconcept', { hasText: conceptName }) })
      .first();
    await expect(row).toBeVisible({ timeout: 5000 });

    // Cleanup through the same UI a student would use, awaiting each delete's
    // POST — the optimistic UI clears instantly and ending earlier aborts the
    // queued fetches, leaving residue for the next run.
    // The card's goto may have expanded the row already — .lhead is a toggle,
    // so clicking it blind would fold the row back up and hide the passage.
    const pidLoc = row.locator('[data-passage-id]').first();
    if (!(await pidLoc.isVisible().catch(() => false))) {
      await row.locator('.lhead').click();
    }
    await expect(pidLoc).toBeVisible({ timeout: 5000 });
    const passageId = await pidLoc.getAttribute('data-passage-id');
    const passageDeleted = page.waitForResponse((r) =>
      r.request().method() === 'POST' && (r.request().postData() ?? '').includes(passageId!)
    );
    await row.getByRole('button', { name: 'remove passage' }).click();
    await passageDeleted;
    // The concept itself goes from 04, which is the only station that deletes
    // one since 2026-08-17 — see helpers' deleteConceptInVocabulary.
    await deleteConceptInVocabulary(page, conceptName);

    // With its passage gone, the card goes too — the rail draws only what the
    // loom still holds.
    await expect(page.locator('.pdf-railcard', { hasText: conceptName })).toHaveCount(0, { timeout: 5000 });
  });

  test('the rails never move the stage', async ({ page }) => {
    await openReading(page, 'Object Worlds');
    const stage = page.locator('.pdf-stage');
    // There is no rail toggle any more (TJ, 2026-08-17), so the way to change
    // how many rails are standing is to change the layout: two pages puts one
    // on each side, one page leaves one. The claim under test is unchanged —
    // the rails live INSIDE the stage, so the stage's own box, which the
    // sheet, the toolbar and the fit math all measure against, must not move.
    await page.getByRole('button', { name: '2 pages' }).click();
    await expect(page.locator('.pdf-rail')).toHaveCount(2, { timeout: 5000 });
    const before = await stage.boundingBox();
    await page.getByRole('button', { name: '1 page' }).click();
    await expect(page.locator('.pdf-rail')).toHaveCount(1, { timeout: 5000 });
    expect((await stage.boundingBox())?.width).toBe(before?.width);
    await openYourWork(page);
    await expect(page.locator('#yourwork')).toBeVisible();
  });
});
