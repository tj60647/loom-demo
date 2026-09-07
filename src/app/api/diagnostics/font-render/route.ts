/**
 * TEMPORARY — REMOVE BEFORE MERGE.
 *
 * The one question that cannot be answered from a developer's machine: does a
 * PDF that embeds no font render on the Vercel runtime, now that we ship
 * pdf.js's own substitute faces?
 *
 * It cannot be answered locally because Windows and macOS both own Times New
 * Roman, so @napi-rs/canvas draws the page whatever the options say. That
 * asymmetry IS the bug — on 2026-09-06 it left 19 pure-white page images in
 * blob for "As We May Think" while the same file rendered perfectly here.
 *
 * And it cannot be answered by simply opening the reading on a preview:
 * readingStorage.getStream reads THROUGH to production's copy when this
 * environment has not made its own (src/lib/storage.ts), so every page-image
 * request on the preview returns production's blank blob with a 200 and the
 * render path never runs. Measured: 8 requests, 8 × 200, zero 404s.
 *
 * So this route runs the render directly and reports numbers, never content.
 *
 * Branch previews only. `isBranchPreview()` is a positive test on Vercel's own
 * VERCEL_ENV, so an unset or misspelt value denies — this returns 404 on
 * production and on the tester site, and there is no key that opens it.
 */
import { NextResponse } from "next/server"
import { existsSync } from "fs"
import path from "path"
import { createCanvas } from "@napi-rs/canvas"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { sources } from "@/db/schema"
import { isCanvasVisuallyBlank } from "@/lib/canvasInk"
import { destroyPdf, loadPdfjs, pdfjsStandardFontsUrl, pdfjsWasmUrl, renderFontOptions } from "@/lib/pdfjs"
import { isBranchPreview } from "@/lib/previewLogin"
import { readingStorage } from "@/lib/storage"

export const dynamic = "force-dynamic"

/** "As We May Think" — the reading whose 19 stored images are pure white. */
const DEFAULT_SOURCE = "9a231870-5cd8-496f-b19e-1370bcd6c001"

export async function GET(request: Request) {
  if (!isBranchPreview()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const sourceId = new URL(request.url).searchParams.get("source") ?? DEFAULT_SOURCE
  const fontsDir = pdfjsStandardFontsUrl()

  // Half the answer, and it needs no PDF: did next.config's tracing actually
  // put the font files in the Lambda? Without them the parameter names a
  // directory that is not there, and the render falls back to nothing.
  const fontsShipped = existsSync(path.join(fontsDir, "FoxitSerif.pfb"))

  try {
    const [source] = await db
      .select({ storageKey: sources.storageKey, title: sources.title })
      .from(sources)
      .where(eq(sources.id, sourceId))
    if (!source?.storageKey) {
      return NextResponse.json({ fontsDir, fontsShipped, error: "no such reading, or it has no file" }, { status: 404 })
    }

    const data = await readingStorage.get(source.storageKey)
    const pdfjsLib = await loadPdfjs()
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "))
    }

    let page1
    try {
      // The same call renderSourcePageImages makes, with the same options and
      // the same white ground, so a difference here would be a difference there.
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(data),
        useWorkerFetch: false,
        isEvalSupported: false,
        wasmUrl: pdfjsWasmUrl(),
        useWasm: false,
        ...renderFontOptions(),
      })
      const doc = await loadingTask.promise
      const page = await doc.getPage(1)
      const unscaled = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: 1280 / unscaled.width })
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const context = canvas.getContext("2d")
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport }).promise

      const blank = isCanvasVisuallyBlank(context, canvas.width, canvas.height)
      const encodedBytes = (await canvas.encode("webp", 80)).length
      page1 = {
        size: `${canvas.width}x${canvas.height}`,
        blank,
        encodedBytes,
        // What production stored for every one of the 19 pages, for comparison.
        storedWhenBroken: 4330,
      }
      await destroyPdf(doc, loadingTask)
    } finally {
      console.warn = originalWarn
    }

    return NextResponse.json({
      title: source.title,
      fontsDir,
      fontsShipped,
      page1,
      fontWarnings: warnings.filter((w) => /font data|standardFontDataUrl/i.test(w)),
      verdict: fontsShipped && !page1.blank ? "FIXED" : "STILL BROKEN",
    })
  } catch (error) {
    return NextResponse.json(
      { fontsDir, fontsShipped, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
