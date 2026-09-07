import { test, expect } from '@playwright/test';
import { openReading } from './helpers';

// Runs as Test User A (see playwright/global-setup.ts).
test.use({ storageState: 'playwright/.auth/testa.json' });

/**
 * The three layers of a page slot, in the order they paint.
 *
 * Page mode renders at the native tier, so all three are mounted at once: the
 * pre-rendered image is the under-layer that makes a page turn instant, our
 * pdf.js canvas is the sharp render that replaces it, and react-pdf's text
 * layer sits over both carrying selection, highlights and heat.
 *
 * Until this spec the image painted OVER the raster — an absolutely positioned
 * sibling outpaints an in-flow one whatever the DOM order — so the native
 * render was never visible and a BLANK image could hide a correct one.
 * Measured in Chromium on 2026-09-06 against the same markup: the hit-test read
 * `text > img > raster`. That is what let 19 white images hide a working render
 * of "As We May Think" for 17.9 hours.
 *
 * Hit-test order is used rather than a screenshot because it follows the same
 * stacking rules as painting and states the invariant directly: a screenshot
 * would pass whenever the two layers happen to show the same page, which is
 * every case except the one that matters.
 */
test('the pdf.js raster paints above the pre-rendered image', async ({ page }) => {
  await openReading(page, 'Object Worlds');

  // All three must actually be present, or the assertion below would pass on a
  // slot that simply has no image to be wrong about.
  const slot = page.locator('.pdf-slot-inner').first();
  await expect(slot.locator('.pdf-slot-img')).toBeVisible({ timeout: 15000 });
  await expect(slot.locator('canvas.pdf-raster')).toBeVisible({ timeout: 15000 });
  await expect(slot.locator('.react-pdf__Page__textContent')).toBeAttached({ timeout: 15000 });

  const order = await slot.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return document
      .elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      .map((element) => element.className?.toString?.() ?? '')
      .filter((name) => /pdf-slot-text|pdf-slot-img|pdf-raster/.test(name))
      .map((name) => (/pdf-slot-text/.test(name) ? 'text' : /pdf-slot-img/.test(name) ? 'img' : 'raster'));
  });

  // Text on top, so selection and highlights stay reachable. The raster next,
  // so a bad image can never hide a good render. The image underneath, where
  // its own comment has always said it was.
  expect(order).toEqual(['text', 'raster', 'img']);
});
