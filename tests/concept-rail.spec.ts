import { test, expect } from '@playwright/test';
import { isDeletePost, openReading, openYourWork } from './helpers';

// Runs as Test User A (see playwright/global-setup.ts): the concepts and passages
// this spec captures belong to the test account, never to a real person's loom.
test.use({ storageState: 'playwright/.auth/testa.json' });

/**
 * The margin cards, always on (2026-08-15): a passage captured on the open
 * pages grows a card beside its page, leader-lined to the highlight. The card
 * edits in place, and the corner › is still a door to Your work. There is no
 * Cards toggle any more; both rails stand in page mode, a card's side is its
 * page number's parity (odd left, even right) in every view, and turning the
 * layout under a card (1 page, 2 pages, canvas) must never strand it.
 *
 * THE CARD'S SUBJECT IS THE PASSAGE (TJ, PR #9), which is what the second
 * test here holds: a passage with no concept is a legal end state (model
 * §Passage), so its card must still be fully workable — its own note written,
 * and a concept named from it without leaving the reading.
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
    await page.getByPlaceholder('e.g. boundary objects', { exact: true }).fill(conceptName);
    await page.locator('button:has-text("Save Passage")').click();
    await expect(page.getByRole('heading', { name: 'Capture Passage' })).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.loom-passage-highlight').first()).toBeVisible({ timeout: 5000 });

    // The rails are standing — no toggle to press, and none offered. Both
    // rails on a desktop viewport, and the fresh capture's card beside its
    // page with a leader to the span.
    await expect(page.getByRole('button', { name: 'Cards in the margin' })).toHaveCount(0);
    await expect(page.locator('.pdf-rail')).toHaveCount(2);
    // The label is a textarea now (cards edit in place), so text-content
    // locators can't see it — the door button's accessible name carries the
    // concept's name instead.
    const cardFor = (scope = '') =>
      page.locator(`${scope ? scope + ' ' : ''}.pdf-railcard`.trim(), {
        has: page.getByRole('button', { name: `Open ${conceptName} in your work` }),
      });
    const card = cardFor().first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.pdf-rail-leaders path').first()).toBeAttached();

    // The card edits in place (2026-08-15): the definition writes through to
    // the concept itself, so it must survive a view switch — the card
    // re-adopts its fields from the graph, not from its own memory.
    const defField = card.getByRole('textbox', { name: 'Working definition' });
    await defField.fill('A rail-edited working definition');
    await defField.blur();

    // One page → both rails still stand (a card's side is its page's parity,
    // so the room is permanent), and the card survives the re-layout.
    await page.getByRole('button', { name: '1 page' }).click();
    await expect(page.locator('.pdf-rail')).toHaveCount(2, { timeout: 5000 });
    await expect(cardFor().first()).toBeVisible({ timeout: 5000 });
    await expect(cardFor().first().getByRole('textbox', { name: 'Working definition' }))
      .toHaveValue('A rail-edited working definition');

    // In the canvas the same capture's card flanks its spread (Strip is
    // hidden — TJ 2026-08-10, the canvas supersedes it — so there is no
    // fourth mode to check).
    await page.getByRole('button', { name: 'Canvas' }).click();
    await expect(cardFor('.pdf-spread-canvas').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Strip' })).toHaveCount(0);

    // Back to the spread: the capture was on an odd page, so its card
    // returns to the left rail — well clear of the search panel about to
    // open at the right edge.
    await page.getByRole('button', { name: '2 pages' }).click();
    await expect(page.locator('.pdf-rail')).toHaveCount(2, { timeout: 5000 });
    await expect(cardFor().first()).toBeVisible({ timeout: 10_000 });

    // The card is a door, not an editor: clicking it opens Your work at the
    // passage's row (red line #5 — the work is never out of reach). And the
    // door closes Find on the way — the sheet and the search panel share the
    // right edge, and a panel left open underneath eats the first Escape.
    // Scoped to the PDF's own toolbar: since 2026-08-13 the journey bar carries
    // a search too, and its button is also named for this reading.
    await page.locator('.pdf-toolbar').getByRole('button', { name: 'Search this reading' }).click();
    await expect(page.locator('.pdf-search-panel')).toBeVisible();
    // The corner › is the door now — the card body is an editor.
    await page.getByRole('button', { name: `Open ${conceptName} in your work` }).first().click();
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
    const conceptDeleted = page.waitForResponse((r) => isDeletePost(r.request()));
    await row.getByRole('button', { name: 'remove concept' }).click();
    await page.getByRole('button', { name: 'Delete concept' }).click();
    await conceptDeleted;
    await expect(page.locator('.lconcept', { hasText: conceptName })).toHaveCount(0, { timeout: 5000 });

    // With its passage gone, the card goes too — the rail draws only what the
    // loom still holds.
    await expect(cardFor()).toHaveCount(0, { timeout: 5000 });
  });

  test('an unlabeled passage\'s card takes its note, and names a concept from the page', async ({ page }) => {
    test.setTimeout(90_000);
    const conceptName = 'Rail Test Concept B';

    await openReading(page, 'Object Worlds');
    const textLayer = page.locator('.react-pdf__Page__textContent');
    await expect(textLayer.first()).toBeAttached({ timeout: 10000 });
    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(1000);

    const selected = await textLayer.first().evaluate((layer) => {
      const spans = Array.from(layer.querySelectorAll('span')).filter(
        (s) => (s.textContent ?? '').trim().length > 0
      );
      if (!spans.length) return '';
      let start = spans.findIndex((s) => (s.textContent ?? '').trim().length >= 40);
      if (start === -1) start = 0;
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

    // Captured with NO concept — the Unlabeled Passage, saved as a whole act.
    await page.locator('button:has-text("Capture as Passage")').click();
    await page.locator('button:has-text("Save unlabeled")').click();
    await expect(page.getByRole('heading', { name: 'Capture Passage' })).toBeHidden({ timeout: 30_000 });

    const unlabeled = page
      .locator('.pdf-railcard', { has: page.getByRole('button', { name: 'Open Unlabeled passage in your work' }) })
      .first();
    await expect(unlabeled).toBeVisible({ timeout: 10_000 });

    // (a) The NOTE is the passage's own, so it is writable with no concept in
    // sight — the state that used to render as truncated read-only text.
    const noteField = unlabeled.getByRole('textbox', { name: 'Your note on this passage' });
    await noteField.fill('A note that needed no concept');
    await noteField.blur();
    // It writes through to the passage, so it survives a re-layout: the card
    // re-adopts from the graph, never from its own memory.
    await page.getByRole('button', { name: '1 page' }).click();
    await expect(unlabeled.getByRole('textbox', { name: 'Your note on this passage' }))
      .toHaveValue('A note that needed no concept', { timeout: 10_000 });

    // (b) A concept is named FROM the card — coined and filed in one gesture,
    // without leaving the page. The card then heads itself with that name and
    // offers the gloss it could not offer a moment ago.
    const nameField = unlabeled.getByRole('textbox', { name: 'Name a concept for this passage' });
    await nameField.fill(conceptName);
    await nameField.blur();

    const named = page
      .locator('.pdf-railcard', { has: page.getByRole('button', { name: `Open ${conceptName} in your work` }) })
      .first();
    await expect(named).toBeVisible({ timeout: 10_000 });
    await expect(named.getByRole('textbox', { name: 'Working definition' })).toBeVisible();
    // The note the passage already carried came through the naming intact.
    await expect(named.getByRole('textbox', { name: 'Your note on this passage' }))
      .toHaveValue('A note that needed no concept');

    // Cleanup through the same UI a student would use.
    await page.getByRole('button', { name: `Open ${conceptName} in your work` }).first().click();
    await expect(page.locator('#yourwork')).toBeVisible({ timeout: 5000 });
    const row = page
      .locator('#yourwork .lrow', { has: page.locator('.lconcept', { hasText: conceptName }) })
      .first();
    await expect(row).toBeVisible({ timeout: 5000 });
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
    const conceptDeleted = page.waitForResponse((r) => isDeletePost(r.request()));
    await row.getByRole('button', { name: 'remove concept' }).click();
    await page.getByRole('button', { name: 'Delete concept' }).click();
    await conceptDeleted;
    await expect(page.locator('.lconcept', { hasText: conceptName })).toHaveCount(0, { timeout: 5000 });
  });

  test('the standing rails never move the stage', async ({ page }) => {
    await openReading(page, 'Object Worlds');
    // The rails are simply there — part of the page-mode layout, not a mode.
    await expect(page.locator('.pdf-rail')).toHaveCount(2);
    const stage = page.locator('.pdf-stage');
    const before = await stage.boundingBox();
    // The rails live INSIDE the stage; the stage's own box — what the sheet,
    // the toolbar and the fit math all measure against — must not move when
    // the layout under it turns.
    await page.getByRole('button', { name: '1 page' }).click();
    expect((await stage.boundingBox())?.width).toBe(before?.width);
    await page.getByRole('button', { name: '2 pages' }).click();
    expect((await stage.boundingBox())?.width).toBe(before?.width);
    await openYourWork(page);
    await expect(page.locator('#yourwork')).toBeVisible();
  });
});
