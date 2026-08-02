import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';

/**
 * Multiple maps (spec §3 Map, ratified 7/31): per-scope parallel maps, each
 * holding its own tiers, essence sentence and paragraph.
 *
 * Serial: the suite builds one temporary map ("PW temp map") at the whole
 * weave, verifies it end to end, and deletes it in the last test, so the
 * account's real maps are never modified. If a mid-run failure strands it, it
 * is recognizable by name and safe to delete by hand.
 *
 * Local runs on this machine need the 3100-port scratch config (port 3000 sits
 * in a Windows excluded range — see NEXT_SESSION.md): keep globalSetup and
 * storageState or everything runs unauthenticated.
 */
test.describe.configure({ mode: 'serial' });

// Runs as Test User A (see playwright/global-setup.ts): the temp map — and a
// mid-run failure's stranded copy — lives on the test account, not a real one.
test.use({ storageState: 'playwright/.auth/testa.json' });

const TEMP_NAME = 'PW temp map';

/**
 * The journey bar now stays put while the loom loads, so its presence no
 * longer implies the graph has arrived — wait for the data itself. Clicking
 * Map mid-load lands on a map stack that is still empty, and every assertion
 * after it races the fetch.
 */
async function waitForLoom(page: Page) {
  await expect(page.getByText('Loading your loom...')).toHaveCount(0, { timeout: 20000 });
}

async function openWeaveMap(page: Page) {
  await page.goto('/weave');
  await waitForLoom(page);
  await page.locator('nav button', { hasText: 'Map' }).click();
  await expect(page.locator('#mapSwitcher')).toBeVisible({ timeout: 15000 });
}

/** A POST whose body carries `needle` has completed — the deterministic form
 *  of "that save landed". The save dot cannot distinguish WHICH save flashed
 *  (any save's 1500ms flash satisfies it), and under a warm dev server the
 *  previous save's flash is always still on screen — which let the reload
 *  below abort the essence write in flight. That abort (the WebServer
 *  "Error: aborted / ECONNRESET" in the logs) was the whole order-dependence:
 *  fast full-suite runs reloaded early and killed the write; cold solo runs
 *  were slow enough to sync by accident. */
function responseCarrying(page: Page, needle: string) {
  return page.waitForResponse(
    (r) => r.request().method() === 'POST' && (r.request().postData() ?? '').includes(needle),
    { timeout: 20_000 },
  );
}

test('a new map holds its own tiers and essence', async ({ page }) => {
  test.setTimeout(120_000);
  await openWeaveMap(page);

  // Self-heal: a failed earlier run strands its temp map (serial mode skips
  // the cleanup test), and a strand with this name breaks every locator below.
  const strands = page.locator('#mapSwitcher .chip', { hasText: TEMP_NAME });
  let strand = await strands.count();
  while (strand > 0) {
    await strands.first().click();
    await page.getByRole('button', { name: 'delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete this map', exact: true }).click();
    await expect(strands).toHaveCount(strand - 1, { timeout: 15000 });
    strand--;
  }

  const chipsBefore = await page.locator('#mapSwitcher .chip').count();
  const createSaved = responseCarrying(page, '"scopeKey"');
  await page.locator('#newMap').click();
  // The new map appears optimistically AND is selected; wait for its chip so
  // the rename below cannot land on the previously active map — and for the
  // CREATE to complete, because a rename typed while the create round-trip is
  // still in flight persists server-side but never reaches the chip in the UI
  // (the optimistic update targets the real id while the local row still has
  // the temp id — audit U-3(a)). On a warm server that race hits every time.
  await expect(page.locator('#mapSwitcher .chip')).toHaveCount(chipsBefore + 1);
  await expect(page.locator('#mapSwitcher .chip.on')).toHaveText(/^Map \d+$/);
  await createSaved;
  // Rename it so cleanup can find it whatever else this account holds — and
  // hold the test until the rename's own POST completes.
  const rename = page.getByLabel('Rename this map');
  await expect(rename).toBeVisible();
  await rename.fill(TEMP_NAME);
  const renameSaved = responseCarrying(page, TEMP_NAME);
  await rename.blur();
  await renameSaved;
  await expect(page.locator('#mapSwitcher .chip.on', { hasText: TEMP_NAME })).toBeVisible();

  // Tiers are per map: tier the first concept primary ON THIS MAP (skipped
  // when the account has no concepts — the switcher itself is still exercised).
  const firstRow = page.locator('#triageList .trow').first();
  const hasConcepts = (await page.locator('#triageList .trow').count()) > 0;
  if (hasConcepts) {
    const pChip = firstRow.locator('.tierchips .tchip').first();
    const tierSaved = responseCarrying(page, '"tiers"');
    await pChip.click();
    await expect(pChip).toHaveClass(/on/);
    await expect(page.locator('#mapMirror')).toContainText('1 primary');
    await tierSaved;
  }

  // The essence sentence belongs to the map. Blur flushes the 700ms debounce;
  // the reload waits for the essence's own POST to complete, so it can no
  // longer abort the write in flight.
  await page.locator('#mapEssence').fill('One line written by the Playwright suite.');
  const essenceSaved = responseCarrying(page, 'One line written by the Playwright suite.');
  await page.locator('#mapEssence').blur();
  await essenceSaved;
  // The claim under test is that THIS map kept its own name, tiers and
  // essence across a reload — so select it by name rather than leaning on
  // which map the switcher happens to open on. That default (most recently
  // updated) is a client-side cursor, not an artifact, and asserting it here
  // made the test fail for a reason it was never about.
  await expect(async () => {
    await page.reload();
    await waitForLoom(page);
    await page.locator('nav button', { hasText: 'Map' }).click();
    const tempChip = page.locator('#mapSwitcher .chip', { hasText: TEMP_NAME });
    await expect(tempChip).toHaveCount(1, { timeout: 5000 });
    await tempChip.click();
    await expect(tempChip).toHaveClass(/on/, { timeout: 5000 });
    await expect(page.locator('#mapEssence')).toHaveValue('One line written by the Playwright suite.', { timeout: 2000 });
    if (hasConcepts) {
      await expect(page.locator('#triageList .trow').first().locator('.tierchips .tchip').first()).toHaveClass(/on/, { timeout: 2000 });
    }
  }).toPass({ timeout: 45_000, intervals: [2_000, 3_000, 5_000] });
});

test('export carries maps[] with id-valid tiers and the tier mirror', async ({ page }) => {
  await page.goto('/keep');
  // The export button snapshots current client state, which right after load
  // is still the blank pre-fetch state — retry until the loaded graph (with
  // the map test 1 made) is what lands in the file.
  let parsed: { graph: { maps?: { name: string; essence: string; read: string; tiers: Record<string, string> }[]; concepts: { id: string; tier?: string }[]; read?: string } } | undefined;
  await expect(async () => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export .json' }).click();
    const download = await downloadPromise;
    parsed = JSON.parse(fs.readFileSync((await download.path())!, 'utf8'));
    expect(Array.isArray(parsed!.graph.maps)).toBe(true);
    expect(parsed!.graph.maps!.length).toBeGreaterThan(0);
  }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 3_000] });
  if (!parsed) throw new Error('export never produced a parsed file');
  const conceptIds = new Set(parsed.graph.concepts.map((c: { id: string }) => c.id));
  for (const map of parsed.graph.maps!) {
    expect(typeof map.name).toBe('string');
    expect(typeof map.essence).toBe('string');
    expect(typeof map.read).toBe('string');
    for (const conceptId of Object.keys(map.tiers)) {
      expect(conceptIds.has(conceptId)).toBe(true);
    }
  }
  // The expand-phase mirror stays in the contract: every concept still carries
  // a tier, and the top-level read survives.
  for (const c of parsed.graph.concepts) {
    expect(c).toHaveProperty('tier');
  }
  expect(parsed.graph).toHaveProperty('read');
});

test('04 Map lives inside a reading workbench, scoped to it', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.shelfcard').first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card.locator('.shelftally')).not.toHaveText('…', { timeout: 15000 });
  await card.click();
  await expect(page).toHaveURL(/\/reading\//);

  await waitForLoom(page);
  await page.locator('nav button', { hasText: 'Map' }).click();
  await expect(page.locator('#mapSwitcher')).toContainText('Your maps of this reading');
  // The whole weave's maps do not leak into a reading's stack.
  await expect(page.locator('#mapSwitcher .chip', { hasText: TEMP_NAME })).toHaveCount(0);
});

test('cleanup: delete the temp map', async ({ page }) => {
  await openWeaveMap(page);
  const tempChips = page.locator('#mapSwitcher .chip', { hasText: TEMP_NAME });
  // A mid-run failure in an earlier suite run strands its temp map, and two
  // chips with one name break a single-chip locator — sweep every copy.
  await expect(tempChips.first()).toBeVisible();
  let remaining = await tempChips.count();
  while (remaining > 0) {
    await tempChips.first().click();
    await page.getByRole('button', { name: 'delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete this map', exact: true }).click();
    await expect(tempChips).toHaveCount(remaining - 1, { timeout: 15000 });
    remaining--;
  }
});
