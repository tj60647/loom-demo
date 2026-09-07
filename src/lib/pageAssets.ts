/**
 * The cache validator for a stored page asset — the thing that decides whether
 * a reader keeps seeing an image we have already replaced.
 *
 * Deliberately its own module rather than living in pdfPages.ts beside the
 * renderer: that file reaches the database, and this has to stay importable by
 * a check that runs with no environment at all.
 */
import { hashText } from "@/lib/hash"

/**
 * What the stored images were rendered BY.
 *
 * Bump this whenever a change alters the pixels renderSourcePageImages
 * produces. It is the only part of the validator below that can notice such a
 * change, and the validator is the whole of what tells a browser its cached
 * copy is stale.
 *
 * Why it exists: on 2026-09-06 the font fix replaced 19 blank page images with
 * correct ones, but the reading's `storageKey` was untouched — the PDF had not
 * changed, only the renderer had. The ETag was therefore identical before and
 * after, so a browser holding the blank version revalidated, was told 304 Not
 * Modified, kept the white pages and reset its hour. A reader reported still
 * seeing blank pages in Chrome the following day while Safari, which had never
 * cached the broken copy, was fine.
 *
 *   1 — the original pipeline
 *   2 — pdf.js given its own standard_fonts, so a PDF that embeds no font
 *       stops rendering blank on a host with no fonts installed
 */
export const PAGE_RENDER_VERSION = 2

/**
 * The validator for one stored page asset, in one place so the page route and
 * the sheet route cannot drift apart.
 *
 * Two things can change these bytes and both belong in the key. A repair mints
 * a new `storageKey`, which is what the original design covered. A change to
 * the renderer does not touch the key at all, which is what
 * PAGE_RENDER_VERSION is for.
 */
export function pageAssetETag(storageKey: string | null, part: string, width: number) {
  return `W/"${hashText(`${storageKey}:${part}:${width}:v${PAGE_RENDER_VERSION}`)}"`
}
