import { test, expect } from '@playwright/test';
import { openReading } from './helpers';

// Runs as Test User A (see playwright/global-setup.ts).
test.use({ storageState: 'playwright/.auth/testa.json' });

/**
 * The matrix's zoom is a CSS transform over a raster/text-layer split: the
 * text layer renders once at a zoom-independent base width and is NEVER
 * rebuilt by the slider; sharpness returns through our own pdf.js canvas,
 * re-rastered only after the gesture settles. The defect this replaces —
 * named in 9abbdd7's own commit message — re-rendered every page, canvas and
 * text layer both, on every 0.1 step of the slider.
 */
test.describe('Matrix zoom', () => {
  test('zoom re-rasters the canvas without rebuilding the text layer', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      localStorage.setItem("loom_has_seen_walkthrough", "true");
    });
    await openReading(page, 'Object Worlds');
    await expect(page.locator('.react-pdf__Page__textContent').first()).toBeAttached({ timeout: 10000 });

    await page.getByRole('button', { name: 'Matrix' }).click();

    // The raster path is live: our canvas under react-pdf's text layer.
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

    // Let the initial settle pass, then record page 1's canvas backing width.
    await page.waitForTimeout(400);
    const before = await raster.evaluate((c) => (c as HTMLCanvasElement).width);

    // Drive the slider to 3× the React-controlled way: native setter + input.
    await page.locator('input[aria-label="Zoom the page matrix"]').evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '3');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // (a) The text layer never re-rendered: the probed span and the probed
    // mark are the same attached DOM nodes they were before the zoom.
    await expect(page.locator('[data-probe="1"]')).toBeAttached();
    await expect(page.locator('[data-probe="2"]')).toBeAttached();

    // (b) After the settle, the visible page re-rastered sharper: the canvas
    // backing outgrew what it was at 1×.
    await expect
      .poll(async () => raster.evaluate((c) => (c as HTMLCanvasElement).width), { timeout: 10_000 })
      .toBeGreaterThan(before);

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
});
