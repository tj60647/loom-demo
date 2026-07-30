# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: library-verify.spec.ts >> Library verification >> admin Library manager renders source cards with edit disclosure and controls
- Location: tests\library-verify.spec.ts:48:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.card').filter({ has: locator('img') }).first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('.card').filter({ has: locator('img') }).first()

```

```yaml
- banner:
  - img
  - text: Loom lay the warp · throw the weft — Test Admin
  - button "Sign out"
  - text: about
  - button "how Loom works — open the walkthrough": "?"
- alert
- navigation:
  - button "00 —Library"
  - button "01 —Open"
  - button "02 —Throw"
  - button "03 —Read"
  - button "04 —Map"
  - button "05 —Keep"
- main:
  - heading "Capture a byte Two ways to capture a byte" [level=2]:
    - text: Capture a byte
    - button "Two ways to capture a byte"
  - paragraph: Do this — paste a passage here, or select text in a Library PDF. Then name the concept it evidences, and gloss it in your own words.
  - paragraph: A “byte” = one passage + its citation. Choosing the passage is your judgment — that's the point. Loom can carry over source details and offer passage words to tap; it does not summarize or choose the concept for you.
  - text: Source — author, work
  - textbox "who wrote it, and what work it's from":
    - /placeholder: Suchman, Plans and Situated Actions
  - text: Location
  - textbox "page, chapter, or timestamp — so you (and readers) can get back to the source":
    - /placeholder: ch. 3, p. 49
  - text: Passage — the author's words, verbatim
  - textbox "verbatim, with citation — this is your evidence":
    - /placeholder: paste or type the passage…
  - text: A concept is the idea this passage evidences — a short noun phrase, often the author's own words. If she names it ("boundary objects"), use her name for it. Your own-words gloss goes in the working definition — a sentence is fine there, crude is welcome. Rename anything later. One passage can hold several concepts — capture it once, then "also file under another concept" from the log. Stuck naming it? Point at the words in the passage that carry the point and tap to build the concept from the author's own words. …paste a passage above and its words appear here to tap.
  - group: still stuck? a few ways in
  - text: Concept — a short noun phrase naming the idea (one per byte — you can file the same passage under a second concept from the log)
  - combobox "a noun phrase, not a sentence — if the author names it, use her name for it"
  - text: Working definition — the concept in your own words (optional)
  - textbox "your own-words gloss — a sentence is fine; this is where crude is welcome":
    - /placeholder: e.g. a thing that means different things to different groups but still holds them together
  - button "Add byte" [disabled]
  - paragraph: Paste or type a passage, then name the concept it evidences.
  - heading "Coding log (34 bytes · 15 concepts)" [level=2]
  - paragraph: Everything you capture lands here, newest on top — your growing pile of concepts.
  - paragraph: Click a row to open it — edit the working definition, or file the same passage under another concept. When you have a handful, go to 02 — Throw and start connecting them.
  - text: Test Concept for Object Worlds 6 bytes Test Concept for Communities of Practice 7 bytes Test Concept for Boundary Objects 7 bytes practice as community conversation 1 bytes mythology building explanations 1 bytes geometric ideology 1 bytes object as system component 1 bytes reframing "works" from object to impact 1 bytes scientific knowledge tension 1 bytes loops 2 bytes latent knowledge 1 bytes system vs object analysis 1 bytes the fuzzy edges of things 1 bytes Community of practice 1 bytes object vs context 2 bytes
  - combobox "add a concept with no byte yet (rare)"
  - button "Add"
- contentinfo: 01 — OPEN LAY THE WARP
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Visual + structural verification of the student Library tab and the
  5  |  * admin Library manager. Uses the same client-side session mock pattern as
  6  |  * the existing PDF viewer specs so the UI renders in an authenticated state.
  7  |  */
  8  | 
  9  | const ADMIN_SESSION = {
  10 |   user: { name: 'Test Admin', email: 'tjm@tjmcleish.com', id: 'test-admin-id', role: 'ADMIN' },
  11 |   expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  12 | };
  13 | 
  14 | async function mockSession(page: import('@playwright/test').Page) {
  15 |   await page.route('**/api/auth/session', async (route) => {
  16 |     await route.fulfill({
  17 |       status: 200,
  18 |       contentType: 'application/json',
  19 |       body: JSON.stringify(ADMIN_SESSION),
  20 |     });
  21 |   });
  22 |   await page.addInitScript(() => {
  23 |     localStorage.setItem('loom_has_seen_walkthrough', 'true');
  24 |   });
  25 | }
  26 | 
  27 | test.describe('Library verification', () => {
  28 |   test('student Library tab renders cards with thumbnail, read and download', async ({ page }) => {
  29 |     await mockSession(page);
  30 |     await page.goto('/');
  31 | 
  32 |     await page.getByRole('button', { name: /Library/i }).click();
  33 | 
  34 |     // Source cards carry a thumbnail image. Scope to the visible panel: tabs
  35 |     // 01-04 stay mounted once visited, hidden with CSS.
  36 |     const cards = page.locator('.panel.active .card').filter({ has: page.locator('img') });
  37 |     await expect(cards.first()).toBeVisible({ timeout: 15000 });
  38 |     expect(await cards.count()).toBeGreaterThan(0);
  39 | 
  40 |     const firstCard = cards.first();
  41 |     await expect(firstCard.locator('img')).toBeVisible();
  42 |     await expect(firstCard.getByRole('button', { name: /Read in Loom/i })).toBeVisible();
  43 |     await expect(firstCard.getByRole('link', { name: /Download PDF/i })).toBeVisible();
  44 | 
  45 |     await page.screenshot({ path: 'test-results/library-student.png', fullPage: true });
  46 |   });
  47 | 
  48 |   test('admin Library manager renders source cards with edit disclosure and controls', async ({ page }) => {
  49 |     await mockSession(page);
  50 |     await page.goto('/admin/library');
  51 | 
  52 |     // Scope to source cards (they contain a thumbnail); skip the add-reading form card.
  53 |     const cards = page.locator('.card').filter({ has: page.locator('img') });
> 54 |     await expect(cards.first()).toBeVisible({ timeout: 15000 });
     |                                 ^ Error: expect(locator).toBeVisible() failed
  55 | 
  56 |     const firstCard = cards.first();
  57 |     await expect(firstCard.locator('img')).toBeVisible();
  58 | 
  59 |     // Controls: Edit (disclosure summary), Hide/Reveal, Download, Remove.
  60 |     const editSummary = firstCard.locator('summary', { hasText: 'Edit' });
  61 |     await expect(editSummary).toBeVisible();
  62 |     await expect(firstCard.getByRole('button', { name: /Hide|Reveal/i })).toBeVisible();
  63 |     await expect(firstCard.getByRole('link', { name: /Download PDF/i })).toBeVisible();
  64 |     await expect(firstCard.getByRole('button', { name: /^Remove$/i })).toBeVisible();
  65 | 
  66 |     // Edit must be a disclosure, not an always-open form: title field hidden until opened.
  67 |     const titleInput = firstCard.locator('input[name="title"]');
  68 |     await expect(titleInput).toBeHidden();
  69 |     await editSummary.click();
  70 |     await expect(titleInput).toBeVisible();
  71 | 
  72 |     await page.screenshot({ path: 'test-results/library-admin.png', fullPage: true });
  73 |   });
  74 | });
  75 | 
```