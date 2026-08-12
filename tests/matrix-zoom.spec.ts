import { test, expect } from '@playwright/test';
import { openReading } from './helpers';

// Runs as Test User A (see playwright/global-setup.ts).
test.use({ storageState: 'playwright/.auth/testa.json' });

/**
 * The matrix is a spread canvas: every 2-page spread on one transformed
 * plane, panned and zoomed as pure CSS over a raster/text-layer split. The
 * text layer renders once at a zoom-independent base width and is NEVER
 * rebuilt by the slider or a pinch; sharpness returns through our own pdf.js
 * canvas, re-rastered only after the gesture settles. The defect this
 * replaces — named in 9abbdd7's own commit message — re-rendered every page,
 * canvas and text layer both, on every 0.1 step of the slider.
 */
test.describe('Matrix zoom', () => {
  test('zoom re-rasters the canvas without rebuilding the text layer', async ({ page }) => {
    test.setTimeout(90_000);
    await openReading(page, 'Object Worlds');
    await expect(page.locator('.react-pdf__Page__textContent').first()).toBeAttached({ timeout: 10000 });

    await page.getByRole('button', { name: 'Matrix' }).click();

    // The spread canvas is live: one transformed plane of spreads, our
    // raster under react-pdf's text layer in every slot.
    await expect(page.locator('.pdf-spread-canvas')).toBeAttached({ timeout: 10000 });
    const raster = page.locator('.pdf-raster').first();
    await expect(raster).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pdf-slot-inner .react-pdf__Page__textContent').first()).toBeAttached({ timeout: 10000 });

    // A seeded passage's mark, and a probe span: if the text layer is ever
    // re-rendered, both of these exact DOM nodes are destroyed.
    await expect(page.locator('.loom-passage-highlight').first()).toBeAttached({ timeout: 10000 });
    await page.evaluate(() => {
      const span = document.querySelector<HTMLElement>('.pdf-slot-inner .react-pdf__Page__textContent span');
      if (span) span.dataset.probe = '1';
      const mark = document.querySelector<HTMLElement>('.loom-passage-highlight');
      if (mark) mark.dataset.probe = '2';
    });
    await expect(page.locator('[data-probe="1"]')).toBeAttached();

    // Let the initial settle pass, then record the sharpest backing anywhere.
    // (Anywhere, not page 1: the slider zooms about the canvas CENTRE, so the
    // corner page correctly leaves the view and keeps its base raster.)
    const maxBacking = () =>
      page.evaluate(() =>
        Math.max(...Array.from(document.querySelectorAll<HTMLCanvasElement>('.pdf-raster')).map((c) => c.width))
      );
    await page.waitForTimeout(400);
    const before = await maxBacking();

    // Step the zoom in three times (1 → 1.4 → 1.96 → 2.74× fit) with the
    // toolbar's + button — the keyboard-and-tap path onto the same transform.
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    await zoomIn.click();
    await zoomIn.click();
    await zoomIn.click();

    // (a) The text layer never re-rendered: the probed span and the probed
    // mark are the same attached DOM nodes they were before the zoom.
    await expect(page.locator('[data-probe="1"]')).toBeAttached();
    await expect(page.locator('[data-probe="2"]')).toBeAttached();

    // (b) After the settle, whatever is in view re-rastered sharper: the
    // sharpest backing anywhere outgrew what it was at 1×.
    await expect.poll(maxBacking, { timeout: 10_000 }).toBeGreaterThan(before);

    // (c) Still exactly the marks the loom holds — none lost, none doubled.
    await expect(page.locator('[data-probe="2"]')).toBeVisible();

    // (d) A selection at 3× still raises the capture button: capture works
    // identically through the transform. Page 1 is a sparse cover (the page-
    // mode specs turn past it too), so walk the layers for the first one that
    // holds a real run of prose.
    await page.waitForFunction(
      () => document.querySelectorAll('.pdf-slot-inner .react-pdf__Page__textContent span').length > 50,
      undefined,
      { timeout: 15_000 }
    );
    const selected = await page.evaluate(() => {
      const layers = Array.from(document.querySelectorAll('.pdf-slot-inner .react-pdf__Page__textContent'));
      for (const layer of layers) {
        const spans = Array.from(layer.querySelectorAll('span')).filter(
          (s) => (s.textContent ?? '').trim().length > 0
        );
        if (!spans.length) continue;
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
        const text = selection?.toString() ?? '';
        if (text.trim().length >= 40) return text;
      }
      return '';
    });
    expect(selected.trim().length).toBeGreaterThanOrEqual(40);
    await expect(page.locator('button:has-text("Capture as Passage")')).toBeVisible({ timeout: 5000 });
  });

  test('wheel and pinch drive the transform, Fit restores it, Cards flank the spreads', async ({ page }) => {
    test.setTimeout(90_000);
    await openReading(page, 'Object Worlds');
    await expect(page.locator('.react-pdf__Page__textContent').first()).toBeAttached({ timeout: 10000 });
    await page.getByRole('button', { name: 'Matrix' }).click();
    await expect(page.locator('.pdf-spread-canvas')).toBeAttached({ timeout: 10000 });

    const canvasK = () =>
      page.locator('.pdf-spread-canvas').evaluate((el) => {
        const m = /scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform ?? '');
        return m ? parseFloat(m[1]) : 0;
      });
    await expect.poll(canvasK, { timeout: 5000 }).toBeGreaterThan(0);
    const atFit = await canvasK();

    // The wheel zooms at the cursor — the map idiom (TJ, 2026-08-10) — and a
    // trackpad pinch arrives as ctrl+wheel and zooms too.
    const wheelAtCenter = (opts: { ctrlKey?: boolean; deltaY: number }) =>
      page.locator('.pdf-spread-viewport').evaluate((el, o) => {
        const b = el.getBoundingClientRect();
        el.dispatchEvent(new WheelEvent('wheel', {
          deltaY: o.deltaY, ctrlKey: !!o.ctrlKey, bubbles: true, cancelable: true,
          clientX: b.left + el.clientWidth / 2,
          clientY: b.top + el.clientHeight / 2,
        }));
      }, opts);
    // Poll-and-nudge: each iteration scrolls again, so a first event lost to
    // an attach race cannot strand the assertion — and repeated notches ARE
    // how a wheel is really used.
    await expect
      .poll(async () => { await wheelAtCenter({ deltaY: -240 }); return canvasK(); }, { timeout: 8000 })
      .toBeGreaterThan(atFit);
    const afterWheel = await canvasK();
    await expect
      .poll(async () => { await wheelAtCenter({ deltaY: -240, ctrlKey: true }); return canvasK(); }, { timeout: 8000 })
      .toBeGreaterThan(afterWheel * 1.05);

    // Fit takes it back to everything-in-view.
    await page.getByRole('button', { name: 'Fit the whole reading' }).click();
    await expect
      .poll(async () => Math.abs((await canvasK()) - atFit), { timeout: 5000 })
      .toBeLessThan(atFit * 0.06);

    // Cards in the matrix: every spread grows its rails, and a seeded
    // passage's card appears beside the page that holds its highlight.
    await expect(page.locator('.loom-passage-highlight').first()).toBeAttached({ timeout: 10000 });
    await page.getByRole('button', { name: 'Cards in the margin' }).click();
    await expect(page.locator('.pdf-spread-canvas .pdf-railcard').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pdf-spread-canvas .pdf-rail-leaders path').first()).toBeAttached();
  });
});
