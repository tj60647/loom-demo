# Server PDF Font Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give pdf.js a font source the app ships itself, so a server-side render never depends on which fonts the host machine happens to own — and make a blank render fail loudly instead of being stored as a success.

**Architecture:** Three independent changes, in order of what unblocks students soonest. (1) `src/lib/pdfjs.ts` gains a `standardFontDataUrl` resolver beside the existing `pdfjsWasmUrl`, both server render paths use it, and `next.config.ts` traces the font files into the Lambda. (2) `isCanvasVisuallyBlank` moves out of `pdfCover.ts` into its own module and `renderSourcePageImages` uses it to reject a page that has text but drew none. (3) `.pdf-raster` gets a stacking order so the pdf.js render paints *over* the pre-rendered image rather than under it, restoring the fallback the code already believes it has.

**Tech Stack:** Next.js 16 (App Router), pdfjs-dist 6.1.200 (legacy Node build), @napi-rs/canvas 1.0.5, Vercel Blob, tsx check scripts, Playwright.

**Spec:** This document — see **Findings** below. The investigation is in the 2026-09-06 session transcript; every number here was measured, and the measurement is named alongside it.

---

## Findings

What this plan rests on. Each line was measured on 2026-09-06 unless marked otherwise.

- **The stored page images for `9a231870-5cd8-496f-b19e-1370bcd6c001` ("As We May Think") are pure white.** All 19 at `w1280` are exactly 4,330 bytes and all 19 at `w320` are exactly 780 bytes. Downloaded page 5 and measured it: 1280×1657, 2,120,960 px, **one distinct colour**, `rgb(255,255,255)`, zero non-white pixels.
- **The same PDF renders correctly here.** `storageKey` is `c22aff33-dd63-4768-a17f-4abaec19f90e.pdf` (45,210 bytes, 19 pages). Rendered with `renderSourcePageImages`'s exact options on Node 24.12: pages 1–3 at 1280×1657 — the same dimensions as the blank blobs — with 5,677 / 7,518 / 8,724 ink pixels and 96 KB / 118 KB / 138 KB WebP.
- **The file does not embed its font.** pdf.js reports `TimesNewRoman embedded=NO missingFile=true`, and with system fonts taken away it says: `UnknownErrorException: Ensure that the standardFontDataUrl API parameter is provided.`
- **`standardFontDataUrl` has never been set on a live path.** `git log -S "standardFontDataUrl" --all` returns one commit, `733052a` (2026-08-15), which added `scripts/golden-page.ts` — since deleted — pointing at `/pdfjs/standard_fonts/`, a public path the build has never populated.
- **The build does not ship the fonts.** `scripts/copy-pdf-worker.mjs` copies the worker and `wasm/` into `public/`. `next.config.ts` `outputFileTracingIncludes` lists `pdf.mjs`, `pdf.worker.mjs`, `wasm/**`. Neither mentions `standard_fonts`. The directory is 804 KB, 16 files, and contains `FoxitSerif.pfb` — the exact file pdf.js tries to load for this document.
- **It has always been this way.** `src/lib/pdfPages.ts` arrived 2026-08-14 (`4363c0e`); `src/lib/pdfCover.ts` 2026-07-06 (`7056b40`). Neither has ever had a font fallback.
- **Why nothing tripped it until now.** Of 33 readings with page images, 32 were rendered 14–22 Aug with page-to-page varying sizes (2.7 KB – 469 KB); this one was rendered 2026-09-06 07:06 UTC. Every reading production has successfully rendered is a **scan** — `aug22-ingest.pdf` draws 3 images on pages 1–3 — so a missing font costs nothing visible. "As We May Think" draws **zero** images: every mark on the page is a glyph.
- **A blank render is recorded as a success.** `src/lib/pdfPages.ts:170-193` fills white, renders, and does `rendered += 1` with no check. `isCanvasVisuallyBlank` already exists at `src/lib/pdfCover.ts:21-41` and is module-private; covers refuse to store a blank, pages store it.
- **The pre-rendered image paints over the pdf.js raster.** `.pdf-slot-img` is `position:absolute` with no z-index (inline, `PageSlot.tsx:238`); `.pdf-raster` is in-flow with neither (`PdfViewer.tsx:3105`). Verified in Chromium with the same DOM: hit-test order `text > img > raster`, and the composited centre pixel is the image's colour. The comment at `PageSlot.tsx:229-232` claims the opposite ("Absolute under everything: the native raster blits over it").
- **Not established:** that Vercel's runtime has no Times New Roman. It cannot be tested from Windows — `@napi-rs/canvas` finds the OS font whatever flags are passed — and this reading's cover has ink and *may* have come from the inline production cover route at `src/app/api/readings/[sourceId]/cover/route.ts:66`. **Task 3 exists to settle this**, and it runs before anything touches production.

## Global Constraints

- **Node ≥ 22.7.0** (`package.json` engines). Vercel project runs 24.x.
- **Never touch `src/lib/pdfText.ts`'s or `src/lib/pdfStructure.ts`'s `getDocument` options in this plan.** `src/lib/pdfjs.ts:20-23`: the options are deliberately unshared, and `extractPdfPageText`'s "decide the exact text every stored highlight offset was measured against." Font data can change glyph-to-unicode mapping; changed text moves offsets; offsets are students' highlights in production. Those two files are a separate decision requiring `npm run check:textparity` evidence.
- **`standardFontDataUrl` must be a plain path with forward slashes and a trailing slash.** Measured, four forms: no parameter → `Ensure that the standardFontDataUrl API parameter is provided`; `pathToFileURL(...).href` (i.e. copying `pdfjsWasmUrl`) → `Unable to load font data at: file:///...`; Windows backslashes → throws `Invalid factory url: "...\" must include trailing slash`; forward slashes with trailing slash → clean. **The `file://` form fails the same silent way as the bug** — it warns and renders blank on a fontless host while looking perfect locally.
- **One decision per commit** (AGENTS.md). Each task below is one commit. Declare removals with a `Removes:` line.
- **Comments state how they know** (AGENTS.md). Every reason written in this plan's code cites the measurement, not an impression.
- **Desktop widths only**: 1280 · 1536 · 1728 · 1920 CSS px (contracts.md §2c-iii). Task 5 is the only one with a visual surface.
- **Production student work is never at risk in Tasks 1, 2, 3, 5.** Only Task 4 writes to production, and only to regenerable display caches.

---

### Task 1: Give pdf.js its own font source

**Files:**
- Modify: `src/lib/pdfjs.ts` (add resolver + options helper after `pdfjsWasmUrl`, line 78-80)
- Modify: `src/lib/pdfPages.ts:147-155` (the `getDocument` call in `renderSourcePageImages`)
- Modify: `src/lib/pdfCover.ts:50-57` (the `getDocument` call in `renderPdfCoverImage`)
- Modify: `next.config.ts:47-53` (`outputFileTracingIncludes`)
- Modify: `package.json` (register `check:pdffonts` and add it to the `check` chain)
- Test: `scripts/check-pdf-fonts.ts` (create)

**Interfaces:**
- Produces: `pdfjsStandardFontsUrl(): string` — absolute path, forward slashes, trailing slash.
- Produces: `renderFontOptions(): { useSystemFonts: false; standardFontDataUrl: string }` — spread into the `getDocument` options of the two **render** paths only. Task 2 does not use it. Nothing else may.

**Decision recorded here:** `useSystemFonts` goes to `false` on both render paths.

This was written up as a trade — determinism bought at the cost of the host's real typeface — and that was wrong. Measured 2026-09-06, page 1 of `c22aff33-…pdf` rendered both ways at 1280px: **the shipped substitute is the better render.** The host path produces a sans-serif face with broken letter spacing ("T he A tlantic M onthly", "perm ission"); the substitute produces correct Times-like serif text. 131,020 pixels differ (6.18% of the page, 88.6% of all inked pixels), and the difference is the substitute being right.

The cause is name matching: the PDF names its font `TimesNewRoman`, one word, which `@napi-rs/canvas` does not resolve to Windows' "Times New Roman". It falls back to a default face with different advance widths, and pdf.js places each glyph on the PDF's own metrics — Times' positions, another font's shapes. So `useSystemFonts: true` is not "the real typeface where it exists"; it is whatever the host guesses, forced into spacing that does not fit it.

`false` therefore buys determinism *and* correctness here. The residual cost is real but narrower than first stated: a PDF naming a genuinely non-standard face — `NewCenturySchlbk-Bold` appears in `W07_IH_Licklider-Taylor`, surveyed the same day — maps onto a base-14 substitute with the right metrics and a different personality. See **Deliberately not in this plan** for the upgrade if that ever shows.

- [ ] **Step 1: Write the failing test**

Create `scripts/check-pdf-fonts.ts`:

```ts
/**
 * Assertions for the font source the SERVER renders with — the wiring that
 * decides whether a PDF whose fonts are not embedded draws glyphs or draws
 * nothing at all.
 *
 *   npx tsx scripts/check-pdf-fonts.ts
 *
 * It earns a place in `npm run check` because the failure it guards is silent
 * and machine-shaped: with the parameter missing (or given in the wrong form)
 * pdf.js warns once and renders a white page, and on any developer machine
 * that owns Times New Roman the page looks perfect anyway. Measured
 * 2026-09-06 against c22aff33-…pdf ("As We May Think"), whose 19 stored page
 * images were 4,330 bytes each of pure white.
 *
 * The fixture is built here rather than checked in: a four-object PDF that
 * names Times-Roman and embeds nothing is the whole test case, and generating
 * it keeps the assertion legible and free of a binary nobody can read.
 */
import { existsSync, readFileSync } from "fs"
import path from "path"
import { loadPdfjs, destroyPdf, pdfjsStandardFontsUrl, renderFontOptions, pdfjsWasmUrl } from "../src/lib/pdfjs"

let failures = 0

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
  if (!ok && detail) console.log(`          ${detail}`)
}

/** A PDF that draws text in a font it does not carry. */
function minimalPdfWithNonEmbeddedFont(): Buffer {
  const stream = "BT /F1 24 Tf 20 100 Td (Hello Loom) Tj ET"
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Times-Roman>>",
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
  ]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(pdf, "latin1")
}

console.log("\nthe font directory is addressable in the form pdf.js accepts")
const fontsUrl = pdfjsStandardFontsUrl()
check("ends with a trailing slash", fontsUrl.endsWith("/"), `got ${JSON.stringify(fontsUrl)}`)
check("no backslashes — pdf.js throws 'Invalid factory url' on them", !fontsUrl.includes("\\"), `got ${JSON.stringify(fontsUrl)}`)
check("not a file:// URL — Node's fetch cannot open one", !fontsUrl.startsWith("file:"), `got ${JSON.stringify(fontsUrl)}`)
check("FoxitSerif.pfb is actually there", existsSync(path.join(fontsUrl, "FoxitSerif.pfb")))

console.log("\nthe font files ship to the Lambda")
const nextConfig = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8")
check(
  "next.config.ts traces standard_fonts into the output",
  /standard_fonts/.test(nextConfig),
  "outputFileTracingIncludes must list ./node_modules/pdfjs-dist/standard_fonts/**, or the path above points at nothing once deployed"
)

console.log("\na PDF that embeds no font draws its glyphs with no help from the host")
const pdfjsLib = await loadPdfjs()
const warnings: string[] = []
const originalWarn = console.warn
console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")) }
const loadingTask = pdfjsLib.getDocument({
  data: new Uint8Array(minimalPdfWithNonEmbeddedFont()),
  useWorkerFetch: false,
  isEvalSupported: false,
  wasmUrl: pdfjsWasmUrl(),
  useWasm: false,
  ...renderFontOptions(),
})
const doc = await loadingTask.promise
const page = await doc.getPage(1)
await page.getOperatorList()
console.warn = originalWarn
await destroyPdf(doc, loadingTask)

const fontWarning = warnings.find((w) => /font data|standardFontDataUrl/i.test(w))
check("pdf.js raises no font-data warning", !fontWarning, fontWarning ?? "")
check("renderFontOptions does not fall back to the host's fonts", renderFontOptions().useSystemFonts === false)

console.log(failures === 0 ? "\nall ok\n" : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/check-pdf-fonts.ts`
Expected: FAIL — the script does not compile, because `pdfjsStandardFontsUrl` and `renderFontOptions` are not exported from `src/lib/pdfjs.ts`.

- [ ] **Step 3: Add the resolver and the options helper**

In `src/lib/pdfjs.ts`, immediately after `pdfjsWasmUrl` (line 80):

```ts
/**
 * Where pdf.js finds a substitute face for a font a PDF does NOT embed.
 *
 * A PLAIN PATH, not a file:// URL — deliberately unlike `pdfjsWasmUrl` above,
 * and the difference is load-bearing. pdf.js fetches this one, and Node's
 * fetch cannot open file://. Measured 2026-09-06, all four forms, against
 * c22aff33-…pdf: no parameter gives "Ensure that the `standardFontDataUrl`
 * API parameter is provided"; the file:// form gives "Unable to load font
 * data at: file:///…"; a Windows path with backslashes THROWS "Invalid
 * factory url … must include trailing slash"; forward slashes with a
 * trailing slash loads. The first two fail the way the outage did — one
 * warning, then a white page on a host with no fonts, and a page that looks
 * perfect on a laptop that owns the font.
 */
export function pdfjsStandardFontsUrl() {
  return nodeModulePath("pdfjs-dist", "standard_fonts/").replace(/\\/g, "/")
}

/**
 * The font half of the options for the two paths that RENDER a page to a
 * canvas — `renderSourcePageImages` and `renderPdfCoverImage`.
 *
 * Not the whole options object: the note at the top of this file is right that
 * each caller owns its own, and `extractPdfPageText`'s in particular are the
 * substrate every stored highlight offset was measured against. This is only
 * the font wiring, which is the part that has to be got right in one place —
 * on 2026-09-06 a reading rendered 19 blank pages in production because it was
 * got wrong in two.
 *
 * `useSystemFonts: false` is a choice, and NOT the trade it looks like. The
 * obvious reading — host font where it exists, substitute where it doesn't —
 * assumes the host's font is the better one. Measured 2026-09-06, page 1 of
 * c22aff33-…pdf at 1280px, rendered both ways: it is not. The host path gives
 * a sans-serif face with broken letter spacing ("T he A tlantic M onthly");
 * the shipped substitute gives correct Times-like serif text. 131,020 pixels
 * differ, 88.6% of everything inked on the page, and the difference is the
 * substitute being right.
 *
 * The reason is name matching. This PDF names its font `TimesNewRoman`, one
 * word, which @napi-rs/canvas does not resolve to "Times New Roman". It falls
 * back to a default face with different advance widths, and pdf.js sets every
 * glyph on the PDF's own metrics — Times' positions, another font's shapes.
 * So true would not buy fidelity; it would buy whatever the host guesses.
 */
export function renderFontOptions() {
  return { useSystemFonts: false as const, standardFontDataUrl: pdfjsStandardFontsUrl() }
}
```

- [ ] **Step 4: Use it in both render paths**

In `src/lib/pdfPages.ts`, change the import on line 34 and the `getDocument` call at 147-155:

```ts
import { destroyPdf, loadPdfjs, pdfjsWasmUrl, renderFontOptions } from "@/lib/pdfjs"
```

```ts
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useWorkerFetch: false,
    isEvalSupported: false,
    wasmUrl: pdfjsWasmUrl(),
    useWasm: false,
    // The fonts come from the package, never from the host: see
    // renderFontOptions. Without this a PDF that embeds no font renders as a
    // white page here and nowhere else (measured 2026-09-06).
    ...renderFontOptions(),
  })
```

Note the removed `useSystemFonts: true` — `renderFontOptions()` sets it to `false`, and it must not be re-added above the spread where it would win.

Make the identical change in `src/lib/pdfCover.ts` at 50-57, importing `renderFontOptions` alongside the existing pdfjs imports.

- [ ] **Step 5: Trace the font files into the Lambda**

In `next.config.ts`, extend the list at 47-53:

```ts
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/wasm/**",
      // The substitute faces for a font a PDF does not embed (804KB, 16
      // files). Same hazard as the two lines above it: the path is resolved at
      // runtime, so tracing cannot see it, and without this the parameter
      // points at a directory that is not in the deployment. A reading
      // rendered 19 blank pages on 2026-09-06 for want of it.
      "./node_modules/pdfjs-dist/standard_fonts/**",
    ],
  },
```

- [ ] **Step 6: Register the check**

In `package.json`, add to the scripts block beside the other `check:*` entries:

```json
"check:pdffonts": "tsx scripts/check-pdf-fonts.ts",
```

and add `&& npm run check:pdffonts` to the end of the `check` chain on line 17.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx tsx scripts/check-pdf-fonts.ts`
Expected: PASS — every line `ok`, exit 0.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pdfjs.ts src/lib/pdfPages.ts src/lib/pdfCover.ts next.config.ts package.json scripts/check-pdf-fonts.ts
git commit -m "$(cat <<'EOF'
fix: the server renders with fonts we ship, not fonts the host happens to own

A PDF that does not embed its fonts asks the host for one by name. On a
laptop that answers; on a Lambda with no font files it does not, and pdf.js
draws nothing — silently, at correct page geometry, with no exception. On
2026-09-06 that put 19 pure-white page images into blob for "As We May
Think" (measured: 1280x1657, one distinct colour, zero non-white pixels)
and the render loop counted every one of them a success.

This has been true since the page renderer was written (4363c0e,
2026-08-14) and since the cover renderer before it (7056b40, 2026-07-06).
Nothing tripped it because every reading production had rendered until now
was a scan, whose ink is images: `aug22-ingest.pdf` draws 3 images on pages
1-3, "As We May Think" draws none at all.

standardFontDataUrl wants a plain path with forward slashes and a trailing
slash. Copying pdfjsWasmUrl's file:// form does NOT work — Node's fetch
cannot open file://, and it fails the same silent way the bug did.
Measured, all four forms, before writing the resolver.

useSystemFonts goes to false with it, and that is not the trade it looks
like. Rendered page 1 both ways at 1280px before choosing: the host path
gives a sans-serif face with broken spacing ("T he A tlantic M onthly"),
the shipped substitute gives correct serif text. 131,020 pixels differ and
the difference is the substitute being right — the PDF names its font
"TimesNewRoman", one word, which @napi-rs/canvas does not match, so it
guesses a face and pdf.js sets it on Times' metrics.

Removes: `useSystemFonts: true` from both render paths.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: A blank render is a failure, not a success

**Files:**
- Create: `src/lib/canvasInk.ts`
- Modify: `src/lib/pdfCover.ts:21-41` (delete the private copy, import instead)
- Modify: `src/lib/pdfPages.ts:161-196` (the per-page loop in `renderSourcePageImages`)
- Modify: `package.json` (register `check:canvasink`, add to the `check` chain)
- Test: `scripts/check-canvas-ink.ts` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `isCanvasVisuallyBlank(context: SKRSContext2D, width: number, height: number): boolean` from `src/lib/canvasInk.ts`. Same 245-threshold, 16-pixel stride, 24-pixel bar as the copy it replaces — it is a move, not a rewrite.

**Decision recorded here:** a page is only reported blank when it **has text and drew none**. Scanned books are full of genuinely empty versos; treating those as failures would strip their cached images and make `logWarn` noise on every scan. "This page has text and none of it was drawn" is the alarm worth raising.

- [ ] **Step 1: Write the failing test**

Create `scripts/check-canvas-ink.ts`:

```ts
/**
 * Assertions for `isCanvasVisuallyBlank` in src/lib/canvasInk.ts — the test
 * that decides whether a rendered page is a page or a white rectangle.
 *
 *   npx tsx scripts/check-canvas-ink.ts
 *
 * Pure, no fixtures and no network, so it runs inside `npm run check`. It
 * earns that place because the cover renderer has always used this test and
 * the page renderer never did: on 2026-09-06 that difference stored 19 blank
 * page images and reported them rendered.
 */
import { createCanvas } from "@napi-rs/canvas"
import { isCanvasVisuallyBlank } from "../src/lib/canvasInk"

let failures = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = got === want
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
  if (!ok) console.log(`          got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

function canvasWith(draw: (context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>) => void) {
  const canvas = createCanvas(400, 400)
  const context = canvas.getContext("2d")
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, 400, 400)
  draw(context)
  return { context, width: canvas.width, height: canvas.height }
}

console.log("\nwhat production actually stored is recognised as blank")
{
  const { context, width, height } = canvasWith(() => {})
  check("a page of nothing but white", isCanvasVisuallyBlank(context, width, height), true)
}

console.log("\na page with ink on it is not blank")
{
  const { context, width, height } = canvasWith((c) => {
    c.fillStyle = "#000000"
    c.fillRect(0, 0, 400, 40)
  })
  check("a solid black band", isCanvasVisuallyBlank(context, width, height), false)
}

console.log("\nthe threshold is on visible darkness, not on any pixel differing")
{
  const { context, width, height } = canvasWith((c) => {
    // 250 is lighter than the 245 bar: paper texture, not ink.
    c.fillStyle = "rgb(250,250,250)"
    c.fillRect(0, 0, 400, 400)
  })
  check("near-white fill still reads as blank", isCanvasVisuallyBlank(context, width, height), true)
}

console.log("\na few stray dark pixels are not a page")
{
  const { context, width, height } = canvasWith((c) => {
    c.fillStyle = "#000000"
    // Under the 24-sample bar once the 16-pixel stride is applied.
    c.fillRect(0, 0, 2, 2)
  })
  check("a 2x2 speck", isCanvasVisuallyBlank(context, width, height), true)
}

console.log(failures === 0 ? "\nall ok\n" : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/check-canvas-ink.ts`
Expected: FAIL — `src/lib/canvasInk.ts` does not exist.

- [ ] **Step 3: Move the function into its own module**

Create `src/lib/canvasInk.ts`:

```ts
/**
 * Has anything been drawn here, or is this a white rectangle?
 *
 * Lived privately in pdfCover.ts from 2026-07-06, which is why the cover
 * renderer has always refused to store a blank and the page renderer has
 * always stored one. On 2026-09-06 that asymmetry put 19 pure-white images
 * into blob for a reading and reported them rendered. Same code, moved so
 * both callers can reach it — the thresholds are unchanged.
 */
import type { createCanvas } from "@napi-rs/canvas"

type Context2D = ReturnType<ReturnType<typeof createCanvas>["getContext"]>

export function isCanvasVisuallyBlank(context: Context2D, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height)
  let meaningfulPixels = 0
  const sampleStride = 16

  for (let index = 0; index < data.length; index += 4 * sampleStride) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const alpha = data[index + 3]

    if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
      meaningfulPixels += 1
      if (meaningfulPixels >= 24) {
        return false
      }
    }
  }

  return true
}
```

In `src/lib/pdfCover.ts`, delete lines 21-41 (the private copy) and import it instead:

```ts
import { isCanvasVisuallyBlank } from "@/lib/canvasInk"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx scripts/check-canvas-ink.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: clean — `pdfCover.ts` still compiles against the moved function.

- [ ] **Step 5: Reject a blank page in the page renderer**

In `src/lib/pdfPages.ts`, import it:

```ts
import { isCanvasVisuallyBlank } from "@/lib/canvasInk"
```

and inside the per-page `try` in `renderSourcePageImages`, immediately after `await page.render({ canvasContext: context, viewport }).promise`:

```ts
        // A render that draws nothing does not throw — it leaves the white
        // fill above exactly as it was, and `rendered += 1` below would call
        // that a success. That is how 19 blank images reached blob on
        // 2026-09-06 (measured: one distinct colour, zero non-white pixels).
        //
        // Only a page that HAS text and drew none is a failure: scanned books
        // are full of genuinely empty versos, and failing those would strip
        // their cached images and make this warning noise on every scan.
        if (isCanvasVisuallyBlank(context, canvas.width, canvas.height)) {
          const { items } = await page.getTextContent()
          if (items.length > 0) {
            throw new Error(`page has ${items.length} text items and rendered blank`)
          }
        }
```

The existing `catch` already does the right thing with it — `failed.push(pageNumber)` and `logWarn("pages.image-render-failed", ...)` — and because nothing is stored, the viewer's 404 path falls back to rendering from the PDF.

- [ ] **Step 6: Verify the whole check suite still passes**

Run: `npm run check`
Expected: PASS. Note from prior sessions: `check:vocabulary` reports known baseline findings and still exits 0 — that is not a new failure.

- [ ] **Step 7: Commit**

```bash
git add src/lib/canvasInk.ts src/lib/pdfCover.ts src/lib/pdfPages.ts package.json scripts/check-canvas-ink.ts
git commit -m "$(cat <<'EOF'
fix: a page that drew nothing is a failed render, not a rendered page

renderSourcePageImages fills the canvas white, renders, and increments
`rendered`. A render that draws nothing does not throw, so the white fill is
what gets encoded and stored, and the count says it worked. On 2026-09-06
that stored 19 pure-white images for "As We May Think" and left no trace in
any log; it surfaced because a person looked at a screen.

The test for this already existed. isCanvasVisuallyBlank has been private to
pdfCover.ts since 2026-07-06 — which is exactly why covers refuse to store a
blank and page images store one. Moved to src/lib/canvasInk.ts unchanged,
same thresholds, so both callers share it.

Blank alone is not the bar: scanned books open on empty versos, and failing
those would strip their cached images and make the warning noise. The alarm
is a page that HAS text and drew none of it.

Removes: the private copy of isCanvasVisuallyBlank in pdfCover.ts.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Prove it on the runtime that broke — before touching production

**Files:** none. This task runs the deployed code and reads blob storage.

**Interfaces:**
- Consumes: Tasks 1 and 2, deployed to a Vercel preview.
- Produces: the one fact this plan could not establish locally — whether the Vercel runtime has the font, and therefore whether Task 1 is the fix or only a good idea.

**Why this ordering:** re-rendering from a developer's machine (Task 4) works whether or not Task 1 helped, because that machine owns Times New Roman. Healing production first would destroy the evidence. Previews write to `env/preview-<branch>/` while reads fall back to production's copy (`src/lib/storage.ts:80-86`), so this cannot touch a single production object.

- [ ] **Step 1: Push the branch and let the preview build**

```bash
git push -u origin HEAD
```

Wait for the Vercel preview to report Ready. Confirm the deployment picked up the trace change:

```bash
MSYS_NO_PATHCONV=1 vercel ls | head -5
```

- [ ] **Step 2: Confirm the preview drawer is empty before the test**

```bash
MSYS_NO_PATHCONV=1 vercel blob list \
  --rw-token "$(grep '^BLOB_READ_WRITE_TOKEN=' .env.local | sed 's/^[^=]*=//' | tr -d '"')" \
  --prefix "env/preview-<branch>/pages/9a231870-5cd8-496f-b19e-1370bcd6c001/"
```

Expected: no blobs. If any exist from an earlier run, delete them first so the result is unambiguous.

- [ ] **Step 3: Make the preview render the reading**

Open the preview URL, sign in, and go to
`/reading/9a231870-5cd8-496f-b19e-1370bcd6c001?tab=reading`, then switch to **CANVAS**. That 404s every page image in the preview drawer and fires `ensureSourcePageImages` through `after()` — the same path that produced the blanks in production on 2026-09-06. Give it a minute; it renders all 19 pages plus the sheet.

- [ ] **Step 4: Read the verdict off the byte sizes**

Re-run the listing from Step 2.

- **PASS:** 19 `w1280` images with **sizes that differ from each other**, in the 40 KB–200 KB range. Task 1 is confirmed on the runtime that broke, and Task 4 may proceed.
- **FAIL:** **no images at all**, and `pages.image-render-failed` in the runtime logs carrying `page has N text items and rendered blank`. Task 2 now catches the blank before it is stored, so a still-broken render leaves nothing behind rather than 19 white files — a clearer signal than the one this step was first written against. The font source is not the cause, or is not reaching the Lambda. **Stop.** Check whether the trace landed (`vercel build` output, or a temporary route reporting `existsSync(pdfjsStandardFontsUrl() + "FoxitSerif.pfb")`) and do not proceed to Task 4.
- **Also FAIL, and worse:** 19 images of identical size (~4,330 bytes). That would mean Task 2's guard did not fire either, and both need investigating before anything else.

Confirm the page looks right in the preview's Canvas view as well as measuring the bytes: a screenshot is what TJ reviews, and a green byte count is not a picture.

- [ ] **Step 5: Record the result in the plan**

Append the measured sizes to this file under Task 3 and commit:

```bash
git add docs/superpowers/plans/2026-09-06-server-pdf-font-source.md
git commit -m "docs: what the preview render produced, measured

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Heal the 19 blank images in production

**Files:** none. This task writes to production blob storage and the production database.

**Interfaces:**
- Consumes: a PASS from Task 3, and the fix merged to `master` and deployed to production.

**Not for an agent.** Every step writes to production. Run these by hand, and read each result before running the next.

**Why the fix alone does not heal it:** the page-image route only regenerates on a 404, and these blobs exist. Production will keep serving the white ones until they are gone.

- [ ] **Step 1: Merge and deploy**

Merge the branch to `master` and confirm the production deployment is Ready before touching any blob. Regenerating against the old build would just rewrite the blanks.

- [ ] **Step 2: Record what is there now**

```bash
MSYS_NO_PATHCONV=1 vercel blob list \
  --rw-token "$(grep '^BLOB_READ_WRITE_TOKEN=' .env.local | sed 's/^[^=]*=//' | tr -d '"')" \
  --prefix "pages/9a231870-5cd8-496f-b19e-1370bcd6c001/" --limit 50
```

Expected: 39 objects — 19 × `w1280` at 4,330 bytes, 19 × `w320` at 780 bytes, one `sheet.w2560.webp` at 6,758 bytes. Keep this output; it is the before-picture.

- [ ] **Step 3: Delete them, including the sheet**

The sheet is composed from the same blank thumbs, so leaving it behind leaves the matrix white at fit-all — all 39 objects go.

```bash
export MSYS_NO_PATHCONV=1
TOKEN=$(grep '^BLOB_READ_WRITE_TOKEN=' .env.local | sed 's/^[^=]*=//' | tr -d '"')
SRC=9a231870-5cd8-496f-b19e-1370bcd6c001
for n in $(seq 1 19); do
  vercel blob del "pages/$SRC/$n.w1280.webp" --rw-token "$TOKEN"
  vercel blob del "pages/$SRC/$n.w320.webp"  --rw-token "$TOKEN"
done
vercel blob del "pages/$SRC/sheet.w2560.webp" --rw-token "$TOKEN"
```

Re-run the listing from Step 2 and confirm it returns nothing before going on. `.env.local` holds the token for the one shared blob store; production reads and writes it with the bare prefix (`src/lib/storage.ts:78`), which is why these pathnames carry no `env/` segment.

- [ ] **Step 4: Let production regenerate, and check the bytes**

Open `/reading/9a231870-5cd8-496f-b19e-1370bcd6c001` on production and switch to CANVAS. Wait, then re-run the listing from Step 2.

Expected: 19 `w1280` images of **differing** sizes. If they come back at 4,330 bytes, production did not get the fix — stop and go back to Task 3's failure branch.

- [ ] **Step 5: Fill in the page dimensions this reading never got**

Its `source_page.width`/`height` are NULL for all 19 rows (measured 2026-09-06: `distinct_page_sizes: 0`, `a_page_size: null`), which is why `scripts/backfill-page-assets.ts` never covered it and why it had no images to begin with. The viewer uses them to lay out before anything renders.

```bash
npx tsx scripts/backfill-page-assets.ts --help
```

Read the usage first, then run it scoped to this one source. It is documented non-destructive — "page TEXT is never touched, so stored highlight offsets are never at risk" — but confirm the flags before running it against production.

- [ ] **Step 6: Look at the reading**

Open it as a student would, at 1280 and at 1920. Page view, strip, canvas. Confirm text is on the page and stays there.

---

### Task 5: Let the pdf.js render paint over the image

**Files:**
- Modify: `src/components/pdf/PdfViewer.tsx:3105` (`.pdf-raster` rule) and `:3099-3103` (the comment above it)
- Modify: `src/components/pdf/PageSlot.tsx:229-232` (the wrong comment) and `:258` (the text layer's inline style)
- Test: `tests/page-slot-stacking.spec.ts` (create)

**Interfaces:**
- Consumes: nothing. Independent of Tasks 1-4 and may be done before or after them.

**What is wrong:** `PageSlot.tsx:229-232` says the image is *"Absolute under everything: the native raster blits over it."* It is not. `.pdf-slot-img` is `position:absolute` with no z-index and `.pdf-raster` is in-flow with neither, so the image paints **above** the canvas. Verified in Chromium on the same DOM: hit-test order `text > img > raster`, composited centre pixel = the image's colour.

Two consequences. The `native` tier is inert — any page with a stored image never shows its pdf.js render, so page-mode deep zoom has always been served by the 1280px WebP. And the documented fallback ("a missing image falls back to drawing from the PDF — slower, never wrong") only fires on a 404: a *blank* image is a successful load, so on 2026-09-06 the correct render was sitting underneath the white one the whole time.

**Why `position: relative; z-index` and not `absolute`:** the canvas is in flow and the raster's own box is what `PageRaster` sizes with `width`/`height` attributes. Making it absolute changes layout as well as paint order; `position: relative` with a z-index changes only paint order, which is the whole defect.

- [ ] **Step 1: Write the failing test**

Create `tests/page-slot-stacking.spec.ts`:

```ts
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
 * Until 2026-09-06 the image painted OVER the raster — an absolutely
 * positioned sibling outpaints an in-flow one whatever the DOM order — so the
 * native render was never visible and a BLANK image could hide a correct one.
 * Measured then in Chromium on the same DOM: the hit-test read
 * `text > img > raster`.
 */
test('the pdf.js raster paints above the pre-rendered image', async ({ page }) => {
  await openReading(page, 'Object Worlds');

  // Page mode mounts all three. Both under-layers must actually be there, or
  // the assertion below would pass on a slot that simply has no image.
  const slot = page.locator('.pdf-slot-inner').first();
  await expect(slot.locator('.pdf-slot-img')).toBeVisible({ timeout: 10000 });
  await expect(slot.locator('canvas.pdf-raster')).toBeVisible({ timeout: 10000 });
  await expect(slot.locator('.react-pdf__Page__textContent')).toBeAttached({ timeout: 10000 });

  const order = await slot.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return document
      .elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      .map((element) => element.className?.toString?.() ?? '')
      .filter((name) => /pdf-slot-text|pdf-slot-img|pdf-raster/.test(name))
      .map((name) => (/pdf-slot-text/.test(name) ? 'text' : /pdf-slot-img/.test(name) ? 'img' : 'raster'));
  });

  // Text on top so selection and highlights stay reachable; the raster next,
  // so a bad image can never hide a good render; the image underneath.
  expect(order).toEqual(['text', 'raster', 'img']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$env:PORT='3100'; npx playwright test tests/page-slot-stacking.spec.ts --config playwright.3100.config.ts`

(Port 3000 is inside a Hyper-V excluded range on this machine and fails with EACCES; the suite runs on 3100.)

Expected: FAIL — received `["text", "img", "raster"]`.

- [ ] **Step 3: Give the layers an explicit order**

In `src/components/pdf/PdfViewer.tsx`, replace the `.pdf-raster` rule at line 3105:

```css
        /* z-index, because paint order here is not what it looks like: an
           absolutely-positioned sibling beats an in-flow one whatever the DOM
           order, so before this the pre-rendered <img> painted OVER the
           canvas. Verified in Chromium on this exact DOM, 2026-09-06 — the
           hit-test read `text > img > raster` and the composited pixel was the
           image's. That is why a blank image could hide a correct render, and
           why the native tier had never been visible.
           relative, not absolute: PageRaster sizes the canvas box itself, and
           taking it out of flow would change layout as well as painting. */
        .pdf-raster { display: block; height: auto; position: relative; z-index: 1; }
```

Fix the comment above it at 3099-3103, which describes the arrangement as it was believed to be:

```css
        /* The matrix raster path: the pre-rendered image at the bottom, our
           canvas over it once pdf.js has drawn, react-pdf's text layer over
           both — ordered by z-index below, not by DOM order. The Page div
           itself paints nothing. The scale wrapper clips to the slot's zoomed
           footprint so the transform never bleeds into a neighbouring cell. */
```

In `src/components/pdf/PageSlot.tsx`, the text layer must stay on top of a raster that now has a z-index — line 258:

```tsx
                <div className="pdf-slot-text" style={{ position: "absolute", inset: 0, zIndex: 2 }}>
```

And correct the claim at 229-232:

```tsx
                // The pre-rendered page, at the BOTTOM of the slot: the native
                // raster paints over it (.pdf-raster carries z-index 1) and
                // the text layer over both. It used to be the other way round
                // — an absolute sibling outpaints an in-flow one — which is
                // what let a blank image hide a good render on 2026-09-06.
                // Until the raster lands, or where there is no raster at all,
                // this IS the page. Sized by the box, not the image: the
                // manifest's aspect and the render's agree, both being the
                // page's own.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `$env:PORT='3100'; npx playwright test tests/page-slot-stacking.spec.ts --config playwright.3100.config.ts`
Expected: PASS — `["text", "raster", "img"]`.

- [ ] **Step 5: Look at it, at the widths that matter**

Open a reading and check page, strip and canvas views at **1280 · 1536 · 1728 · 1920** CSS px. Confirm: no page turns white or flickers, highlights and heat still land on the words, and zooming past fit in page mode now sharpens rather than softening. Take a screenshot at 1536 — a passing spec is not a picture, and a picture is what gets reviewed.

- [ ] **Step 6: Commit**

```bash
git add src/components/pdf/PdfViewer.tsx src/components/pdf/PageSlot.tsx tests/page-slot-stacking.spec.ts
git commit -m "$(cat <<'EOF'
fix: the pdf.js raster paints over the page image, as its comment always claimed

PageSlot said of the pre-rendered image: "Absolute under everything: the
native raster blits over it." It never was. An absolutely-positioned sibling
outpaints an in-flow one whatever the DOM order, so the image painted OVER
the canvas. Verified in Chromium on the same DOM before changing anything:
hit-test order `text > img > raster`, composited centre pixel the image's.

Two things follow. The native tier has been inert — any page with a stored
image never showed its pdf.js render, so deep zoom in page mode has always
been the 1280px WebP. And the fallback the slot documents ("a missing image
falls back to drawing from the PDF - slower, never wrong") only fires on a
404, so when a reading's images came back BLANK on 2026-09-06 the correct
render was underneath them the whole time, hidden.

z-index rather than position: PageRaster sizes the canvas box itself, so
taking it out of flow would change layout as well as paint order. The text
layer takes z-index 2 to stay above a raster that now has one - selection
and highlights must not move.

Measured at 1280, 1536, 1728 and 1920: no white pages, no flicker, marks
still on the words, page-mode zoom sharpens past fit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Deliberately not in this plan

- **`cMapUrl` / `cMapPacked`.** The deleted `golden-page.ts` set them beside `standardFontDataUrl`, and they are the same class of host dependency for encoded and CJK text. Untested here, and adding an untested second asset directory to the same commit would blur what Task 3 proves. Worth its own pass afterwards.
- **`standardFontDataUrl` on the client.** The browser has fonts, so the viewer renders. But by this plan's own argument that is luck, and the 2026-09-06 measurement raises it from theoretical: a name the host cannot match produces mangled spacing rather than a near-miss. Every student's browser is currently choosing its own substitute for this reading, so they are not necessarily looking at the same page as each other. Same one-line fix (`documentOptions` at `PdfViewer.tsx:55` already carries `wasmUrl`), pointed at a `public/` copy the build would have to start making. Worth doing soon; separate decision, separate commit.

- **Bundling real font files.** `@napi-rs/canvas` exposes `GlobalFonts.registerFromPath(path, alias)`, so the app could ship Liberation Serif/Sans/Mono — metric-compatible with Times/Arial/Courier, OFL-licensed, roughly 1.5MB — and alias the names PDFs actually use (`TimesNewRoman`, `Times-Roman`, …) onto them. That is deterministic *and* uses real typefaces, and the alias table closes the name-matching failure measured above. It costs a mapping table that drifts as new PDFs arrive. The upgrade path if a reading turns up that the Foxit faces render badly — not worth its complexity until one does.

- **Embedding fonts into the PDF at ingest** (a Ghostscript `-dEmbedAllFonts` pass). The only option that makes the file self-contained, which fixes the server and the client at once. It needs a binary Vercel does not have, so it would be an admin-side script; and it rewrites the file, minting a new `storageKey` and re-running every downstream render. Right answer to a different, larger question.
- **`pdfText.ts` and `pdfStructure.ts`.** See Global Constraints. Changing extraction moves stored highlight offsets, and those are students' work in production.
- **What renders the August images.** The evidence says a local batch run (22 readings in ten minutes; `backfill-page-assets.ts` fills the NULL widths this reading still has). Not proven, and nothing here depends on it.
- **Fidelity of substituted fonts.** `standardFontDataUrl` supplies the standard-14 substitutes; pdf.js maps unknown non-embedded fonts onto them. The guarantee is "never renders nothing", not "renders in the original typeface".
