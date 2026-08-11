import { test, expect } from '@playwright/test';

// Runs as Test User A (see playwright/global-setup.ts).
test.use({ storageState: 'playwright/.auth/testa.json' });

/**
 * The practice loom — the real interface, real gestures, nothing kept.
 *
 * The promise this spec exists for is a NEGATIVE, and negatives rot quietly:
 * `SandboxLoomProvider` supplies the same context the real provider does, so
 * every tab works without knowing it is in a sandbox — and the day someone
 * adds a server call there, everything still looks right while a practice
 * capture lands in a real student's loom. `scripts/check-sandbox.ts` guards
 * the imports; this guards the behaviour, by watching the wire.
 */
test.describe('Practice loom', () => {
  test('the real interface works and nothing is written', async ({ page }) => {
    test.setTimeout(120_000);

    // Every POST the page makes, minus auth and Next's own traffic. A Server
    // Function write is a POST to the current route, so this catches them all
    // without needing to know which action fired.
    const writes: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && !/\/api\/auth|_next|test-login/.test(r.url())) writes.push(r.url());
    });

    await page.addInitScript(() => {
      localStorage.setItem("loom_has_seen_walkthrough", "true");
    });

    // What the student's real loom holds before any practice happens.
    const before = await page.request.get('/api/loom').then((r) => r.json());

    await page.goto('/sandbox');

    // The band is the safety argument — a student who cannot see it cannot
    // tell a practice space from data loss. Generous timeout: /sandbox is its
    // own route and compiles on demand under `next dev`, so a cold first hit
    // outruns the 5s default.
    await expect(page.locator('.practiceband')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.practiceband')).toContainText('Nothing is kept');

    // A REAL reading, with a real text layer to drag-select — not a mock.
    await expect(page.locator('.react-pdf__Page__textContent').first()).toBeAttached({ timeout: 40_000 });

    // Search is withheld here: it reads the student's real rows over its own
    // route, bypassing the provider entirely.
    await expect(page.getByRole('button', { name: 'Search everything' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Next Page' }).click();
    await page.waitForTimeout(1200);

    // Really select, really capture — the same path a student takes.
    const selected = await page.locator('.react-pdf__Page__textContent').first().evaluate((layer) => {
      const spans = Array.from(layer.querySelectorAll('span')).filter((s) => (s.textContent ?? '').trim().length > 0);
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
    expect(selected.trim().length).toBeGreaterThan(0);

    await page.locator('button:has-text("Capture as Passage")').click();
    await page.getByPlaceholder('e.g. boundary objects', { exact: true }).fill('practice concept');
    await page.locator('button:has-text("Save Passage")').click();

    // It really landed: the mark is drawn on the page and the capture is in
    // Your work, exactly as in the real app.
    await expect(page.locator('.loom-passage-highlight').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#yourwork-toggle')).toContainText('1');

    // The whole point.
    expect(writes, `the practice loom wrote to the server: ${writes.join(', ')}`).toHaveLength(0);

    // And the student's own loom is untouched — the assertion that would
    // catch a write escaping by a route this spec never thought of.
    const after = await page.request.get('/api/loom').then((r) => r.json());
    expect(after.concepts.length).toBe(before.concepts.length);
    expect(after.passages.length).toBe(before.passages.length);

    // Nothing survives the reload, by design. Asserted on the counts the
    // provider drives rather than on the highlights: a mark is absent while
    // the PDF is still rendering too, which would pass for the wrong reason.
    await page.reload();
    await expect(page.locator('.practiceband')).toBeVisible({ timeout: 30_000 });
    // The toggle carries "· N" only when there IS work, so a bare "Your work"
    // is the count being zero — it read "Your work · 1" a moment ago.
    await expect(page.locator('#yourwork-toggle')).toHaveText('Your work', { timeout: 15_000 });
    await expect(page.locator('.scopemeta').nth(1)).toContainText('0 concepts');
  });
});
