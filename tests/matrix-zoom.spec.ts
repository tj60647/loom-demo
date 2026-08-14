import { test, expect } from '@playwright/test';
import { openReading } from './helpers';

// Runs as Test User A (see playwright/global-setup.ts).
test.use({ storageState: 'playwright/.auth/testa.json' });

/**
 * The matrix is a spread canvas: every 2-page spread on one transformed
 * plane, panned and zoomed as pure CSS over a level-of-detail ladder. At
 * fit-all every page is its pre-rendered image (the impostor) — no canvas,
 * no text layer, which is what lets a long scan open as a contact sheet
 * instead of decoding the whole book. Crossing reading zoom mounts react-pdf
 * text layers for the pages near the view; those render once at a
 * zoom-independent base width and are NEVER rebuilt by the slider or a
 * pinch — sharpness returns through our own pdf.js canvas, re-rastered only
 * after the gesture settles. The defect the split replaced — named in
 * 9abbdd7's own commit message — re-rendered every page, canvas and text
 * layer both, on every 0.1 step of the slider.
 */
test.describe('Matrix zoom', () => {
  test('fit-all is impostors; zoom mounts text once and re-rasters without rebuilding it', async ({ page }) => {
    test.setTimeout(90_000);
    await openReading(page, 'Object Worlds');
    await expect(page.locator('.react-pdf__Page__textContent').first()).toBeAttached({ timeout: 10000 });

    await page.getByRole('button', { name: 'Matrix' }).click();

    // The spread canvas is live, and at fit-all it is a contact sheet of
    // pre-rendered images: no page canvas, no text layer, no spans — the
    // whole economy of the impostor tier, asserted as such.
    await expect(page.locator('.pdf-spread-canvas')).toBeAttached({ timeout: 10000 });
    await expect(page.locator('.pdf-slot-img').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pdf-slot-inner .react-pdf__Page__textContent')).toHaveCount(0);
    await expect(page.locator('.pdf-raster')).toHaveCount(0);

    // Two steps in (1 → 1.4 → 1.96× fit) with the toolbar's + button — the
    // keyboard-and-tap path onto the same transform. At this zoom the whole
    // 9-page reading sits within the promote-or-keep margins, so every text
    // layer mounts — the seeded passage's page included, wherever it is.
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    await zoomIn.click();
    await zoomIn.click();
    await expect(page.locator('.pdf-slot-inner .react-pdf__Page__textContent').first()).toBeAttached({ timeout: 15000 });

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

    // One more step (→ 2.74×), so the settle retargets while the probes watch.
    await zoomIn.click();

    // (a) The text layer never re-rendered: the probed span and the probed
    // mark are the same attached DOM nodes they were before the zoom.
    await expect(page.locator('[data-probe="1"]')).toBeAttached();
    await expect(page.locator('[data-probe="2"]')).toBeAttached();

    // (b) After the settle, whatever is in view re-rastered sharper: some
    // page's canvas backing outgrew its CSS box — the native tier at work.
    // (At fit-all there were no canvases at all, so any native raster is
    // already proof of the ladder promoting; this asserts it is also SHARP.)
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLCanvasElement>('.pdf-raster')).some(
              (c) => c.width > c.clientWidth + 1
            )
          ),
        { timeout: 10_000 }
      )
      .toBe(true);

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

    // The overview inset, while zoomed: visible, and clicking it MOVES the
    // view — the jump goes through the same zb.transform, same extents, so
    // nothing else needs to know a minimap exists. (At fit-all it hides: a
    // map of where-you-already-are is furniture, asserted after Fit below.)
    const minimap = page.getByTestId('matrix-minimap');
    await expect(minimap).toBeVisible({ timeout: 5000 });
    const beforeJump = await page
      .locator('.pdf-spread-canvas')
      .evaluate((el) => (el as HTMLElement).style.transform);
    const box = (await minimap.boundingBox())!;
    await page.mouse.click(box.x + 5, box.y + 5);
    await expect
      .poll(() =>
        page.locator('.pdf-spread-canvas').evaluate((el) => (el as HTMLElement).style.transform)
      )
      .not.toBe(beforeJump);

    // Fit takes it back to everything-in-view — and sends the overview away.
    await page.getByRole('button', { name: 'Fit the whole reading' }).click();
    await expect
      .poll(async () => Math.abs((await canvasK()) - atFit), { timeout: 5000 })
      .toBeLessThan(atFit * 0.06);
    await expect(minimap).toBeHidden({ timeout: 5000 });

    // Cards in the matrix, AT FIT-ALL: no text layer is mounted down here —
    // fit-all is the impostor tier — so the card anchors analytically, off
    // the passage's stored page and offset against the manifest's text
    // length. This is the concept-map reading of the far zoom: pages as
    // thumbnails, cards at reading size, leaders still drawn. A mounted
    // highlight is exactly what this assertion must NOT wait for.
    await page.getByRole('button', { name: 'Cards in the margin' }).click();
    await expect(page.locator('.pdf-spread-canvas .pdf-railcard').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pdf-spread-canvas .pdf-rail-leaders path').first()).toBeAttached();
  });
});
