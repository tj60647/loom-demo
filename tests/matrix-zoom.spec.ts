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

    await page.getByRole('button', { name: 'Canvas' }).click();

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

  test('scroll pans, pinch zooms smoothly, Fit restores it, Cards flank the spreads', async ({ page }) => {
    test.setTimeout(90_000);
    await openReading(page, 'Object Worlds');
    await expect(page.locator('.react-pdf__Page__textContent').first()).toBeAttached({ timeout: 10000 });
    await page.getByRole('button', { name: 'Canvas' }).click();
    await expect(page.locator('.pdf-spread-canvas')).toBeAttached({ timeout: 10000 });

    const canvasT = () =>
      page.locator('.pdf-spread-canvas').evaluate((el) => {
        // DOMMatrix, not a regex over the inline style: a and e/f ARE the
        // scale and the translate, whatever form the browser serialised.
        const m = new DOMMatrix(getComputedStyle(el as HTMLElement).transform);
        return { x: m.e, y: m.f, k: m.a };
      });
    const canvasK = async () => (await canvasT()).k;
    await expect.poll(canvasK, { timeout: 5000 }).toBeGreaterThan(0);
    const atFit = await canvasT();

    // The Figma idiom (TJ, 2026-08-19): a plain wheel — a trackpad's
    // two-finger drag — PANS, and only a pinch, which every browser reports as
    // ctrl+wheel, ZOOMS at the cursor.
    const wheelAtCenter = (opts: { ctrlKey?: boolean; deltaY?: number; deltaX?: number; deltaMode?: number }) =>
      page.locator('.pdf-spread-viewport').evaluate((el, o) => {
        const b = el.getBoundingClientRect();
        el.dispatchEvent(new WheelEvent('wheel', {
          deltaY: o.deltaY ?? 0, deltaX: o.deltaX ?? 0, deltaMode: o.deltaMode ?? 0,
          ctrlKey: !!o.ctrlKey, bubbles: true, cancelable: true,
          clientX: b.left + el.clientWidth / 2,
          clientY: b.top + el.clientHeight / 2,
        }));
      }, opts);


    /**
     * The tuning, which is why the first attempt at this idiom was refused
     * (docs/ui-cleanup-pass-1.md §12): ONE mouse notch must not overshoot. A
     * notch is deltaY 100 in Chrome/Edge and deltaY 3 deltaMode 1 in Firefox,
     * and ZOOM_STEP_CLAMP caps both at 2^0.2 = 1.15x. Unclamped it is
     * 2^(-100 x 0.02) = 4x out of a single click of the wheel.
     *
     * This runs FIRST, from fit-all, and that placement is the assertion's
     * teeth: the ceiling is maxMultiplier (>= 8) x fit-all from here, so a 4x
     * step lands intact and trips the upper bound. Run it after the pinch
     * below and the scale extent absorbs the overshoot into a 1.000x no-op —
     * the test still fails, but for the wrong reason, which is how it was
     * first written here.
     *
     * The settle wait is the smoothness half: the step is eased by a rAF
     * chase loop, so 1.15x is where the loop LANDS. Read a frame in, it is
     * smaller — that is the easing, and it is why this waits rather than
     * asserting on the next tick.
     */
    for (const notch of [{ deltaY: -100 }, { deltaY: -3, deltaMode: 1 }]) {
      const before = await canvasK();
      await wheelAtCenter({ ...notch, ctrlKey: true });
      await page.waitForTimeout(500);
      const ratio = (await canvasK()) / before;
      const said = `one notch ${JSON.stringify(notch)} zoomed ${ratio.toFixed(3)}x`;
      expect(ratio, said).toBeGreaterThan(1.08);
      expect(ratio, said).toBeLessThan(1.25);
    }

    // Pinch first, and far enough in that the plane is bigger than the stage:
    // at fit-all the translate extent correctly PINS the canvas — everything
    // is in view, so there is nowhere to pan to — and a pan can only be
    // observed once there is somewhere to go.
    //
    // Poll-and-nudge: each iteration pinches again, so a first event lost to
    // an attach race cannot strand the assertion — and repeated notches ARE
    // how a trackpad is really used.
    await expect
      .poll(async () => { await wheelAtCenter({ deltaY: -240, ctrlKey: true }); return canvasK(); }, { timeout: 10000 })
      .toBeGreaterThan(atFit.k * 2);
    await page.waitForTimeout(400); // let the chase loop below settle before measuring
    const afterPinch = await canvasT();

    // A two-finger drag pans, on BOTH axes, and never touches the zoom. The
    // sign is the scroll convention: fingers up (deltaY > 0) sends the canvas
    // up, so the translate DEcreases.
    await wheelAtCenter({ deltaY: 200 });
    await page.waitForTimeout(200);
    const afterPanY = await canvasT();
    expect(afterPanY.y).toBeLessThan(afterPinch.y);
    await wheelAtCenter({ deltaX: 200 });
    await page.waitForTimeout(200);
    const afterPanX = await canvasT();
    expect(afterPanX.x).toBeLessThan(afterPanY.x);
    // Neither pan moved the zoom.
    expect(Math.abs(afterPanX.k - afterPinch.k)).toBeLessThan(afterPinch.k * 0.01);

    // The overview inset, while zoomed: visible, and clicking it MOVES the
    // view — the jump goes through the same zb.transform, same extents, so
    // nothing else needs to know a minimap exists. It stands at every zoom
    // now (2026-08-19); what changes with the zoom is the view-rect, which is
    // asserted after Fit below.
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
      .poll(async () => Math.abs((await canvasK()) - atFit.k), { timeout: 5000 })
      .toBeLessThan(atFit.k * 0.06);
    // The inset STAYS — it no longer vanishes at fit-all — and what says you
    // are at fit-all is its rect, which now covers the whole map. Asserting
    // the rect rather than the visibility keeps the real invariant under test:
    // the overview tracks the view. A bare "still visible" would pass just as
    // well if the rect had stopped moving altogether.
    await expect(minimap).toBeVisible({ timeout: 5000 });
    await expect
      .poll(async () =>
        minimap.evaluate((el) => {
          const map = el.getBoundingClientRect();
          const view = el.querySelector('.pdf-minimap-view')!.getBoundingClientRect();
          // How much of the map the view-rect covers, on the tighter axis.
          return Math.min(view.width / map.width, view.height / map.height);
        }), { timeout: 5000 })
      .toBeGreaterThan(0.9);

    // Cards in the matrix, AT FIT-ALL: no text layer is mounted down here —
    // fit-all is the impostor tier — so the card anchors analytically, off
    // the passage's stored page and offset against the manifest's text
    // length. This is the concept-map reading of the far zoom: pages as
    // thumbnails, cards at reading size, leaders still drawn. A mounted
    // highlight is exactly what this assertion must NOT wait for.
    //
    // No toggle to press: the rails stand permanently (TJ, 2026-08-17).
    await expect(page.locator('.pdf-spread-canvas .pdf-railcard').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pdf-spread-canvas .pdf-rail-leaders path').first()).toBeAttached();
  });

  /**
   * A CARD IS EDITABLE EXACTLY WHILE IT IS NOT BEING SHRUNK.
   *
   * TJ, 2026-08-19: looking at a two-page spread in canvas, he expected the
   * cards to behave as they do in 2-page view — detail, editability, selection.
   * They did not, because the threshold was expressed against ONE page and its
   * rail (1.35 page widths) while a spread with its rails is 2.72. Viewing the
   * thing the canvas is built out of fell outside the editable band.
   *
   * It is now spreadFitK, which is also the scale --invk starts counter-scaling
   * at — so the rule and the test are the same sentence: a card carries its
   * controls exactly while --invk is 1. That is what this asserts, at every
   * zoom stop rather than at one chosen number, so it holds whatever railW,
   * the page aspect or the stage size do to the arithmetic.
   *
   * Measured at 1536x960 on Object Worlds before the change: controls first
   * appeared at ratio 1.56 (page 985px), three stops inside the spread. After:
   * ratio 2.18 (page 703px), the stop where --invk reaches 1.
   */
  test('a rail is all editable or all read-only, and the note goes with the controls', async ({ page }) => {
    test.setTimeout(90_000);
    await openReading(page, 'Object Worlds');
    await expect(page.locator('.react-pdf__Page__textContent').first()).toBeAttached({ timeout: 10000 });
    await page.getByRole('button', { name: 'Canvas' }).click();
    await expect(page.locator('.pdf-spread-canvas')).toBeAttached({ timeout: 10000 });

    const snap = () =>
      page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.pdf-spread-canvas .pdf-railcard'));
        return {
          cards: cards.length,
          plus: document.querySelectorAll('.pdf-spread-canvas .pdf-railcard-add').length,
          notes: document.querySelectorAll('.pdf-spread-canvas .pdf-railcard-note').length,
          empty: cards.filter((c) => !c.querySelector('.pdf-railcard-chip')).length,
        };
      });
    await expect.poll(async () => (await snap()).cards, { timeout: 8000 }).toBeGreaterThan(0);

    // Nothing internal is read here — not --k, not spreadFitK, not a ratio.
    // The rule is a PAIRING between things the reader can see, so the test
    // asserts the pairing and lets the implementation move under it. An earlier
    // version keyed off --invk and quietly stopped testing anything the day
    // that variable was deleted: parseFloat('') is NaN, the fallback said 1,
    // and every stop looked full-size.
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    let sawReadOnly = false;
    let sawEditable = false;
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(700);
      const s = await snap();
      const where = `stop ${i}: ${s.cards} cards, ${s.plus} plus, ${s.notes} notes`;
      // A rail is all one thing or all the other — never half-editable.
      expect([0, s.cards], `some cards editable and some not (${where})`).toContain(s.plus);
      // The note appears with the controls and goes with them (TJ, 2026-08-19).
      expect(s.notes, `notes and controls disagree (${where})`).toBe(s.plus);
      if (s.plus === 0 && s.cards > 0) {
        sawReadOnly = true;
        // Out here a card IS its concepts: nothing empty is drawn.
        expect(s.empty, `an empty card was drawn while read-only (${where})`).toBe(0);
      } else if (s.cards > 0) {
        sawEditable = true;
      }
      if (i < 5) await zoomIn.click();
    }
    expect(sawReadOnly, 'never saw a read-only card — the ladder did not cover the range').toBe(true);
    expect(sawEditable, 'never saw an editable card — editing is unreachable from Fit').toBe(true);
  });

  /**
   * "Go to this passage" cannot park the canvas where a drag would haul it
   * back from.
   *
   * d3's `zb.transform()` writes `__zoom` without running the behaviour's
   * `constrain` — only the gesture handlers call that. So every programmatic
   * move here (Fit, − / +, this goto, the wheel's chase loop) used to be able
   * to leave the plane outside the translate extent, and the next drag closed
   * the gap in one frame. Measured before the fix at 1536x900: zoomed out to
   * 0.51x fit, the goto left the canvas 309px outside, and the following drag
   * jumped it back 300px.
   *
   * Asserted as the reader experiences it rather than by re-deriving d3's
   * constraint: zoom out until the whole reading is in view, take the door,
   * then drag. A drag that moves the canvas at all means the goto left it
   * somewhere the extent forbids.
   */
  test('a passage door cannot leave the canvas outside the translate extent', async ({ page }) => {
    test.setTimeout(90_000);
    await openReading(page, 'Object Worlds');
    await expect(page.locator('.react-pdf__Page__textContent').first()).toBeAttached({ timeout: 10000 });
    await page.getByRole('button', { name: 'Canvas' }).click();
    await expect(page.locator('.pdf-spread-canvas')).toBeAttached({ timeout: 10000 });
    await expect(page.locator('.pdf-slot-img').first()).toBeVisible({ timeout: 10000 });

    const transform = () =>
      page.locator('.pdf-spread-canvas').evaluate((el) => (el as HTMLElement).style.transform);

    // Below fit-all, so the plane is smaller than the stage on both axes and
    // the extent allows exactly one position. Nothing here can legally move.
    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    await zoomOut.click();
    await zoomOut.click();
    await page.waitForTimeout(900);
    const pinned = await transform();

    // The door: a passage row in Your work sets the reading's page, which the
    // canvas answers by centring that page.
    await page.locator('#yourwork-toggle').click();
    const doors = page.locator('#yourwork .passage.isdoor');
    await expect(doors.first()).toBeVisible({ timeout: 15000 });
    await doors.first().click();
    await page.waitForTimeout(1200);

    // Everything is already in view, so the goto has nowhere to go.
    expect(await transform()).toBe(pinned);

    // And the drag that used to expose it finds nothing to correct.
    const box = (await page.locator('.pdf-spread-viewport').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 220, cy - 140, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    expect(await transform()).toBe(pinned);
  });

  /**
   * A concept label stays inside the card it belongs to, at every zoom.
   *
   * The card's width is capped (min(railW * invk, railW + gap + pageW)) but
   * the type it holds is counter-scaled by --invk with no cap, so far enough
   * out the label outgrows its box. It was not being clipped either: the
   * ellipsis sits on .pdf-chip-open, and a button is inline-block, so it
   * shrink-to-fit its own label and nothing capped it. Measured at the zoom
   * floor on Object Worlds at 1920x1080 before the fix: four of seven cards
   * overflowed, the worst at 1301 against a 607-unit box — and cards tile
   * with 0.02 * pageW between the halves of a spread, so the label landed on
   * the neighbouring card.
   *
   * scrollWidth vs clientWidth is the assertion because it is what overflow
   * IS, and it needs no viewport arithmetic to be true.
   */
  test('a concept label never outgrows its card, at Fit or at the zoom floor', async ({ page }) => {
    test.setTimeout(90_000);
    await openReading(page, 'Object Worlds');
    await expect(page.locator('.react-pdf__Page__textContent').first()).toBeAttached({ timeout: 10000 });
    await page.getByRole('button', { name: 'Canvas' }).click();
    await expect(page.locator('.pdf-spread-canvas')).toBeAttached({ timeout: 10000 });
    await expect(page.locator('.pdf-spread-canvas .pdf-railcard').first()).toBeVisible({ timeout: 10000 });

    // Cards whose content is wider than their own box, and by how much.
    const overflowing = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('.pdf-spread-canvas .pdf-railcard'))
          .map((c) => ({
            label: (c.textContent || '').trim().slice(0, 30),
            over: c.scrollWidth - c.clientWidth,
          }))
          // 1px of tolerance: sub-pixel layout rounds, a real overflow here
          // was 3 to 694 units.
          .filter((x) => x.over > 1)
      );

    await page.getByRole('button', { name: 'Fit the whole reading' }).click();
    await page.waitForTimeout(1500);
    expect(await overflowing()).toEqual([]);

    // The floor: - clamps at 0.5x fit, so four steps is past it wherever the
    // reading started. --invk roughly doubles between here and Fit.
    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    for (let i = 0; i < 4; i++) {
      await zoomOut.click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1500);
    expect(await overflowing()).toEqual([]);
  });

  /**
   * A mark measured at reading zoom survives the text layer going away.
   *
   * The LOD ladder is a cliff, not a slope: retargetView promotes nothing once
   * `t.k * basePageWidth` drops under TEXT_TIER_MIN_W, so one notch takes the
   * whole document to the impostor tier and mark.js loses every mark at once.
   * Measured on Object Worlds at 1920x1080, that threshold is k = 0.530
   * against a Fit of k = 0.506 — the cliff sits at 1.05x Fit, which is why it
   * reads as "fine at almost Fit, broken a touch below" (TJ, 2026-08-18).
   *
   * The rects are measured in canvas units, which are transform-independent,
   * so what was true at reading zoom is still true at fit-all. This asserts
   * the surviving geometry is the SAME geometry, not merely that something is
   * drawn — a redraw in the wrong place would pass a count.
   */
  test('a mark measured at reading zoom survives the drop to impostors', async ({ page }) => {
    test.setTimeout(90_000);
    await openReading(page, 'Object Worlds');
    await expect(page.locator('.react-pdf__Page__textContent').first()).toBeAttached({ timeout: 10000 });
    await page.getByRole('button', { name: 'Canvas' }).click();
    await expect(page.locator('.pdf-spread-canvas')).toBeAttached({ timeout: 10000 });
    await expect(page.locator('.pdf-slot-img').first()).toBeVisible({ timeout: 10000 });

    const kept = page.locator('.pdf-kept-marks rect');
    const real = page.locator('.loom-passage-highlight');
    const boxes = () =>
      kept.evaluateAll((els) =>
        els.map((r) => [
          r.getAttribute('x'),
          r.getAttribute('y'),
          r.getAttribute('width'),
          r.getAttribute('height'),
        ].join(','))
      );

    // Above the cliff: the real marks are up, so nothing is redrawn.
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    for (let i = 0; i < 4; i++) {
      await zoomIn.click();
      await page.waitForTimeout(300);
    }
    await expect(real.first()).toBeAttached({ timeout: 20_000 });
    const realCount = await real.count();
    expect(realCount).toBeGreaterThan(0);
    await expect(kept).toHaveCount(0);

    // Back to Fit — under the cliff. Every text layer goes, and with it every
    // mark.js mark; the measured geometry is what is left.
    await page.getByRole('button', { name: 'Fit the whole reading' }).click();
    await page.waitForTimeout(2000);
    await expect(page.locator('.pdf-slot-inner .react-pdf__Page__textContent')).toHaveCount(0);
    await expect(real).toHaveCount(0);
    await expect(kept).toHaveCount(realCount);
    const atFit = await boxes();

    // Further out still: same coordinates, because canvas units do not care
    // about the transform.
    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    for (let i = 0; i < 4; i++) {
      await zoomOut.click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1500);
    expect(await boxes()).toEqual(atFit);
  });
});
