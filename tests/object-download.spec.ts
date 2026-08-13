import { test, expect } from '@playwright/test';
import { openReading } from './helpers';

test.use({ storageState: 'playwright/.auth/testa.json' });

/**
 * Download at the object (TJ, 2026-08-10). These files become the ONLY way a
 * student's work leaves Loom now that Keep is gone, so the thing worth guarding
 * is not that a button exists — it is that the button hands over a file with
 * the work actually in it. A builder that silently dropped passages would
 * still download something that opens.
 *
 * `:visible` on every locator matters: the workbench keeps all four panels
 * mounted (KEEP_ALIVE), so an unscoped match finds the hidden tab's copy.
 */
test.describe('Download at the object', () => {
  test('the cloth, its threads and the vocabulary each come out whole', async ({ page }) => {
    test.setTimeout(120_000);
    await openReading(page, 'Object Worlds');

    const readFile = async (click: Promise<void>) => {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), click]);
      const stream = await download.createReadStream();
      let text = '';
      for await (const chunk of stream) text += chunk;
      return { name: download.suggestedFilename(), text };
    };

    // --- the cloth, on its own card at the head of Your work ---
    await page.locator('#yourwork-toggle').click();
    await page.locator('details').filter({ hasText: 'Cloth Title' }).first().evaluate((d) => {
      (d as HTMLDetailsElement).open = true;
    });
    const cloth = await readFile(
      page.locator('.objdl button:visible', { hasText: /download .+ \.json/ }).first().click()
    );
    // The stamp is LAST, before the extension (TJ, 2026-08-12), so like files
    // group when a folder sorts: `…name.cloth.2608122215.json`.
    expect(cloth.name).toMatch(/\.cloth\.\d{10}\.json$/);
    const clothData = JSON.parse(cloth.text);
    expect(clothData.format).toBe('loom-cloth');
    // Whole, not a slice: the seeded reading's captures, their concepts, and
    // the projection made from them all travel in the one file.
    expect(clothData.graph.passages.length).toBeGreaterThan(0);
    expect(clothData.graph.concepts.length).toBeGreaterThan(0);
    expect(clothData.projections.length).toBeGreaterThan(0);
    // It says who and where it came from — the old whole-cloth export said
    // only "student".
    expect(clothData.provenance.student).toBeTruthy();
    expect(clothData.provenance.course).toBeTruthy();
    expect(clothData.provenance.exportedAt).toBeTruthy();

    // --- the threads, where they are thrown ---
    await page.locator('nav[aria-label="The journey"] button', { hasText: 'Linking' }).click();
    const threads = await readFile(
      page.locator('.objdl button:visible', { hasText: /download .+ \.md/ }).first().click()
    );
    expect(threads.name).toMatch(/\.threads\.\d{10}\.md$/);
    // Both ends NAMED — an id would say nothing away from Loom.
    expect(threads.text).toMatch(/- \*\*.+\*\* —\[.*\]→ \*\*.+\*\*/);

    // --- the vocabulary, on the tab that holds it ---
    await page.locator('nav[aria-label="The journey"] button', { hasText: 'Vocabulary' }).click();
    const vocab = await readFile(
      page.locator('.objdl button:visible', { hasText: /download .+ \.json/ }).first().click()
    );
    expect(vocab.name).toMatch(/\.vocabulary\.\d{10}\.json$/);
    const vocabData = JSON.parse(vocab.text);
    expect(vocabData.format).toBe('loom-vocabulary');
    // Unscoped by definition: more concepts than this one reading evidences.
    expect(vocabData.concepts.length).toBeGreaterThan(clothData.graph.concepts.length);
    expect(vocabData.concepts[0]).toHaveProperty('readings');
    expect(vocabData.concepts[0]).toHaveProperty('passages');
  });

  test('the Capture Log lives on the Knowledge Graph, scoped to the reading, and downloads', async ({ page }) => {
    test.setTimeout(120_000);
    await openReading(page, 'Object Worlds');
    await page.locator('nav[aria-label="The journey"] button', { hasText: 'Knowledge Graph' }).click();

    // It used to render here only at the whole weave — a surface nothing
    // links to, which is how it came to be stranded on Keep. It was the
    // station's third SECTION from 2026-08-12, and since 2026-08-13 it is the
    // second register of the CLOTH card: no heading of its own, one drawing on
    // the station rather than two, and the record still loading on arrival.
    await expect(page.locator('#map')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('input[aria-label="replay position, in acts"]')).toBeVisible({ timeout: 20_000 });

    // By NAME, not by being the only one: since 2026-08-12 the buttons say
    // what they hand over ("download the log .json"), and the concept-map kit
    // on this same station is an ObjectDownload too — a count of one was
    // asserting that the log was the station's only download, which it is not.
    const button = page.locator('.objdl button:visible', { hasText: /download the log \.json/ });
    await expect(button).toHaveCount(1, { timeout: 20_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      button.first().click(),
    ]);
    const stream = await download.createReadStream();
    let text = '';
    for await (const chunk of stream) text += chunk;
    const data = JSON.parse(text);

    expect(download.suggestedFilename()).toMatch(/\.capture-log\.\d{10}\.json$/);
    expect(data.format).toBe('loom-capture-log');
    // Scoped: the file names the reading and holds only its acts.
    expect(data.scopeLabel).toContain('Object Worlds');
    expect(data.entries.length).toBeGreaterThan(0);
    // Evidence-derived placement is doing its job: acts on objects that have
    // no reading of their own — concepts and threads — still appear here.
    const kinds = new Set(data.entries.map((e: { kind: string }) => e.kind));
    expect(kinds.has('concept.create')).toBe(true);
    expect(kinds.has('edge.throw')).toBe(true);
  });

  test('the practice loom shows no Capture Log', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/sandbox');
    // The practice loom opens on its own Library; one card enters the loom.
    // Retried because the shelf is server-rendered — see sandbox.spec.
    await expect(async () => {
      await page.locator('#practiceOpen').click({ timeout: 10_000 });
      // The workbench's toolbar — the notice floats over the shelf too.
      await expect(page.locator('#yourwork-toggle')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] });
    await page.locator('nav[aria-label="The journey"] button', { hasText: 'Knowledge Graph' }).click();
    // It reads the student's REAL record over its own route, bypassing the
    // provider — it must not appear inside a space that keeps nothing. Since
    // 2026-08-13 the log is a register of the cloth card rather than its own
    // section, so a missing heading would prove nothing: what must hold is that
    // the card still draws the practice cloth and carries no replay with it.
    await expect(page.locator('#map')).toHaveCount(1);
    await expect(page.locator('input[aria-label="replay position, in acts"]')).toHaveCount(0);
    await expect(page.locator('.objdl button', { hasText: /download the log/ })).toHaveCount(0);
  });
});
