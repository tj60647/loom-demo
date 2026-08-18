import { test, expect } from '@playwright/test';
import { deleteConceptInVocabulary, deletePassageInPassagesView, openReading, openYourWork } from './helpers';

// Runs as Test User A (see playwright/global-setup.ts): the concepts and passages
// this spec captures belong to the test account, never to a real person's loom.
test.use({ storageState: 'playwright/.auth/testa.json' });

/**
 * THE + BESIDE A PASSAGE FILES A CONCEPT WITHOUT LEAVING THE TEXT.
 *
 * Until 2026-08-18 that + opened Your work, switched it to Passages and
 * scrolled to the passage — a whole panel for the smallest act the card
 * offers. It now opens one card in the margin instead, and this spec is the
 * only thing that watches it: `concept-rail.spec.ts` presses the BADGE
 * (`.pdf-chip-open`), which still opens Your work and is a different door.
 *
 * Names carry a per-run stamp. Test User A's vocabulary is shared with the
 * rest of the suite and accumulates across runs, so a fixed label would match
 * a row a previous run left behind and reuse it instead of coining one — the
 * exact case this spec is trying to tell apart.
 */
test.describe('Add concept beside the passage', () => {
  test('the + opens a card in the margin, files a concept, and refuses a duplicate', async ({ page }) => {
    // One journey: capture → rail → open the card → coin → reuse-refusal →
    // dismissal → cleanup, against a dev server that compiles on demand.
    test.setTimeout(120_000);
    const stamp = Date.now().toString().slice(-6);
    const seedConcept = `addcard seed ${stamp}`;
    const filedConcept = `addcard filed ${stamp}`;

    await openReading(page, 'Object Worlds');

    const textLayer = page.locator('.react-pdf__Page__textContent');
    await expect(textLayer.first()).toBeAttached({ timeout: 10000 });
    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(1000);

    // Same selection pattern as pdf-viewer.spec.ts and concept-rail.spec.ts:
    // a run of consecutive text-layer lines adding up to a real passage.
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
    await page.locator('.info-scrim').getByPlaceholder('e.g. boundary objects', { exact: true }).fill(seedConcept);
    await page.locator('button:has-text("Save Passage")').click();
    await expect(page.getByRole('heading', { name: 'Capture Passage' })).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.loom-passage-highlight').first()).toBeVisible({ timeout: 5000 });

    // One page, so there is exactly one rail and one card to reason about.
    await page.getByRole('button', { name: '1 page' }).click();
    const stack = page.locator('.pdf-railcard-stack', { hasText: seedConcept }).first();
    await expect(stack).toBeVisible({ timeout: 10_000 });

    // Where the passage card sits BEFORE the editor exists. Absolute drift
    // from the highlight is not the measure: `layoutRail` packs a crowded rail
    // and legitimately moves cards off their anchors, so a fresh capture next
    // to an existing one is 50px out before anything opens. What must not
    // happen is the OPENING moving it — placement used to centre the whole
    // stack on the anchor, so a ~190px editor lifted the card ~95px and bent
    // the leader, which aims at the passage card's middle.
    const cardMiddle = () =>
      stack.locator('.pdf-railcard').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      });
    const before = await cardMiddle();

    // THE ACT UNDER TEST. The + must not open the sheet: that is the whole
    // point of the change, and the failure mode is silent — the card would
    // still "work", just somewhere else.
    await stack.locator('.pdf-railcard-add').click();
    // section, not a bare aria-label match: Your work's per-passage "add"
    // button carries the SAME aria-label, and its rows stay in the DOM while
    // the sheet is shut, so an unqualified match is a strict-mode violation.
    const editor = page.locator('section[aria-label="Add concept to passage"]');
    await expect(editor).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#yourwork')).toBeHidden();

    // Measured on an uncrowded rail at 1536, this delta is 0.0 both ways.
    expect(Math.abs((await cardMiddle()) - before)).toBeLessThan(12);

    // Coin a concept from here. The button says what it will do, and the new
    // chip lands on the card that opened the editor.
    await editor.getByLabel('Concept label').fill(filedConcept);
    await expect(editor.locator('button[type="submit"]')).toHaveText(/create \+ add to passage/i);
    await editor.getByLabel('Concept description').fill('coined from the margin card');
    await editor.locator('button[type="submit"]').click();
    await expect(editor).toBeHidden({ timeout: 15_000 });
    await expect(stack.locator('.pdf-railcard-chip', { hasText: filedConcept })).toBeVisible({ timeout: 10_000 });

    // A concept already on this passage cannot be filed twice: the server
    // throws "Already filed under that concept.", so the card refuses before
    // asking. The caption also flips to reuse, which is how you can tell it
    // resolved the label to the existing OBJECT rather than a new one.
    await stack.locator('.pdf-railcard-add').click();
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.getByLabel('Concept label').fill(filedConcept);
    await expect(editor.locator('button[type="submit"]')).toHaveText(/add to passage/i);
    await expect(editor.locator('button[type="submit"]')).toBeDisabled();

    // Escape dismisses without writing.
    await editor.getByLabel('Concept label').press('Escape');
    await expect(editor).toBeHidden({ timeout: 5000 });
    await expect(stack.locator('.pdf-railcard-chip')).toHaveCount(2);

    // Cleanup through the same UI a student would use, awaiting each delete's
    // POST — the optimistic UI clears instantly and ending earlier aborts the
    // queued fetches, leaving residue for the next run.
    const passageId = await stack.locator('[data-add-concept-for]').getAttribute('data-add-concept-for');
    // deletePassageInPassagesView needs the sheet: this spec never opened it,
    // which is the point of the test, so open it now for the teardown only.
    await openYourWork(page, 'passages');
    await deletePassageInPassagesView(page, passageId!);
    await deleteConceptInVocabulary(page, filedConcept);
    await deleteConceptInVocabulary(page, seedConcept);
  });
});
