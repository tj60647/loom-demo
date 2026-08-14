import { test, expect } from '@playwright/test';
import { enterReadingFromCard } from './helpers';

/**
 * Visual + structural verification of the student Library tab and the
 * admin Library manager. Uses the same client-side session mock pattern as
 * the existing PDF viewer specs so the UI renders in an authenticated state.
 */

const ADMIN_SESSION = {
  user: { name: 'Test Admin', email: 'tjm@tjmcleish.com', id: 'test-admin-id', role: 'ADMIN' },
  expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
};

async function mockSession(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ADMIN_SESSION),
    });
  });
}

test.describe('Library verification', () => {
  test('the shelf renders reading cards with thumbnail and counts, and opens a workbench', async ({ page }) => {
    await mockSession(page);
    await page.goto('/');

    // Reading-first: the shelf is the home screen and each card is a link into
    // that reading's workbench.
    const cards = page.locator('.shelfcard');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    expect(await cards.count()).toBeGreaterThan(0);

    const firstCard = cards.first();
    await expect(firstCard.locator('img')).toBeVisible();
    // Counted, never scored — the card reports the student's own acts.
    await expect(firstCard.locator('.shelftally')).toBeVisible();
    // Wait out the tally re-render (same trap tests/helpers.ts documents):
    // clicking while the loom data lands detaches the card mid-click.
    await expect(firstCard.locator('.shelftally')).not.toHaveText('…', { timeout: 15000 });

    await page.screenshot({ path: 'test-results/shelf.png', fullPage: true });

    await enterReadingFromCard(page, firstCard);
    await expect(page).toHaveURL(/\/reading\//, { timeout: 15000 });
    // Download moved off the library card onto the reading's scope bar.
    await expect(page.getByRole('link', { name: /Download PDF/i })).toBeVisible();
    // Scoped to the workbench nav: the station is "01 — Reading" since the
    // text and capture merged (2026-08-08), and an unscoped match would also
    // hit the help button and the Next dev-tools button in a dev build.
    // `.station`: the bar also carries this station's search since 2026-08-13,
    // and its button is named for the reading too.
    await expect(page.locator('nav button.station', { hasText: 'Reading' })).toBeVisible();

    await page.screenshot({ path: 'test-results/reading-workbench.png', fullPage: true });
  });

  test('admin Library manager renders source cards with edit disclosure and controls', async ({ page }) => {
    test.setTimeout(60_000); // 20+ thumbnail requests against a dev server
    await mockSession(page);
    // domcontentloaded, not the default 'load': goto would otherwise wait for
    // every cover thumbnail, and a missing cover re-renders from the PDF on
    // demand (Cache-Control: no-store) — on a cold CI runner the library's
    // 20+ images can hold the load event past any sane timeout. The cards and
    // controls under test are in the DOM long before the images finish.
    await page.goto('/admin/library', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // The header panel (tabs + course picker) sits outside the scroll: only
    // .adminbody scrolls, so the nav must still be in view at the bottom.
    const nav = page.locator('.adminshell nav');
    await expect(nav).toBeVisible({ timeout: 15000 });
    const adminBody = page.locator('.adminbody');
    await adminBody.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(nav).toBeInViewport();
    await adminBody.evaluate((el) => { el.scrollTop = 0; });

    // Add Readings starts folded — scanning the library is the daily visit,
    // uploading is occasional. The summary is the only way in.
    const addFold = page.locator('details.invitefold');
    const fileInput = addFold.locator('input[type="file"]');
    await expect(addFold).toBeVisible();
    await expect(fileInput).toBeHidden();
    await addFold.locator('summary').click();
    await expect(fileInput).toBeVisible();
    await addFold.locator('summary').click(); // back to the default state
    await expect(fileInput).toBeHidden();

    // Scope to source cards (they contain a thumbnail); skip the add-reading fold card.
    const cards = page.locator('.card').filter({ has: page.locator('img') });
    await expect(cards.first()).toBeVisible({ timeout: 15000 });

    const firstCard = cards.first();
    await expect(firstCard.locator('img')).toBeVisible();

    // Controls the library itself owns, one uniform row: Edit Entry
    // (disclosure), Download PDF, Rescore, Archive, and Delete — a red pill,
    // also a disclosure, since it destroys the file.
    //
    // Per-course visibility is NOT here and this spec used to assert it was.
    // Hide/Reveal moved to the Courses tab when the library became
    // course-agnostic: a reading can be published in one course and staged in
    // another, so that decision belongs to the join, not to the reading.
    const editSummary = firstCard.locator('summary', { hasText: 'Edit Entry' });
    const downloadLink = firstCard.getByRole('link', { name: /Download PDF/i });
    const rescoreButton = firstCard.getByRole('button', { name: /^rescore$/i });
    const archiveButton = firstCard.getByRole('button', { name: /^archive$/i });
    const deleteSummary = firstCard.locator('summary.pillbtn', { hasText: 'Delete' });
    await expect(editSummary).toBeVisible();
    await expect(downloadLink).toBeVisible();
    await expect(rescoreButton).toBeVisible();
    await expect(archiveButton).toBeVisible();
    await expect(deleteSummary).toBeVisible();

    // Every control in the row explains itself on hover.
    for (const control of [editSummary, downloadLink, rescoreButton, archiveButton, deleteSummary]) {
      await expect(control).toHaveAttribute('data-tip', /.+/);
    }

    // Edit must be a disclosure, not an always-open form: title field hidden
    // until opened — and opening it must not move the buttons, because the
    // disclosed form lands on its own line *below* the row.
    const titleInput = firstCard.locator('input[name="title"]');
    await expect(titleInput).toBeHidden();
    // Baseline only once the row is fully in view: boundingBox is
    // viewport-relative, and a click on an off-screen summary auto-scrolls,
    // which would read as a phantom 100px+ "move".
    await editSummary.scrollIntoViewIfNeeded();
    const rowBefore = await editSummary.boundingBox();
    await editSummary.click();
    await expect(titleInput).toBeVisible();
    const rowAfter = await editSummary.boundingBox();
    expect(rowAfter!.x).toBeCloseTo(rowBefore!.x, 0);
    expect(rowAfter!.y).toBeCloseTo(rowBefore!.y, 0);
    const titleBox = await titleInput.boundingBox();
    expect(titleBox!.y).toBeGreaterThan(rowBefore!.y + rowBefore!.height - 1);

    // A second open disclosure stacks below as well; the row still holds.
    await deleteSummary.click();
    await expect(firstCard.getByRole('button', { name: /Delete Permanently/i })).toBeVisible();
    const rowAfterDelete = await editSummary.boundingBox();
    expect(rowAfterDelete!.x).toBeCloseTo(rowBefore!.x, 0);
    expect(rowAfterDelete!.y).toBeCloseTo(rowBefore!.y, 0);

    // Viewport, not fullPage: a full-page capture rasterizes every one of the
    // library's 20+ cards (and waits on their images) — it timed out the test
    // while adding nothing the top of the page doesn't show.
    await page.screenshot({ path: 'test-results/library-admin.png' });
  });
});
