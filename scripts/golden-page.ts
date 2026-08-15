/**
 * A one-page bench for judging a PDF's text layer by hand.
 *
 * The three things that make a text layer good — TJ, 2026-08-15 — are that
 * selection lands on the words, that the characters are correct, and that the
 * text is grouped accurately. None of them can be seen in an extracted string,
 * which is why every automated measure in this repo called a regression an
 * improvement. They can all be seen in a browser, in about four seconds, by
 * dragging across a word.
 *
 * So this serves ONE page with a real pdf.js text layer over it, from
 * REACT-PDF'S OWN pdfjs build — the same one the reading station uses, because
 * a bench that renders with a different build is judging a different thing.
 * Select on the page and it reports what came out. Press Record and the
 * selection is saved as a golden: a rectangle, and the text that rectangle is
 * supposed to yield.
 *
 * Those goldens are the point. A recorded selection is TJ's judgement in a
 * form a machine can replay — `scripts/check-golden-pages.ts` re-runs every
 * one against a PDF and fails when the text under a rectangle changes. It is
 * the only gate here that measures the artifact rather than a string about it.
 *
 *   npx tsx scripts/golden-page.ts                       # the Traveler's cover
 *   npx tsx scripts/golden-page.ts <sourceId> <page>
 *   npx tsx scripts/golden-page.ts <sourceId> <page> --compare <storageKey>
 */
import { createServer } from "node:http"
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { db } from "../src/db"
import { sources } from "../src/db/schema"
import { readingStorage } from "../src/lib/storage"

const PORT = Number(process.env.GOLDEN_PORT || 4317)
/** The Universal Traveler's cover — the page that started this. */
const DEFAULT_SOURCE = "1adbff88-5340-411b-9d27-fd1ba2e0a956"
const args = process.argv.slice(2)
const sourceId = args.find((a) => !a.startsWith("--")) ?? DEFAULT_SOURCE
const pageNumber = Number(args.filter((a) => !a.startsWith("--"))[1] ?? 1)
const compareIndex = args.indexOf("--compare")
const compareKey = compareIndex !== -1 ? args[compareIndex + 1] : null

const PDFJS_DIR = join(process.cwd(), "node_modules", "react-pdf", "node_modules", "pdfjs-dist")
const GOLDEN_DIR = join(process.cwd(), "golden")

const PAGE_HTML = `<!doctype html>
<meta charset="utf-8">
<title>Golden page — judge the text layer</title>
<style>
  :root { color-scheme: light }
  body { margin: 0; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; background: #f4f2ec; color: #221f1a }
  header { padding: 12px 18px; border-bottom: 1px solid #d9d3c6; background: #efece3; position: sticky; top: 0; z-index: 5 }
  h1 { font: 600 15px/1.3 ui-sans-serif, system-ui; margin: 0 0 2px }
  .hint { color: #6b6355; font-size: 12px }
  main { display: flex; gap: 20px; padding: 18px; align-items: flex-start; flex-wrap: wrap }
  .pane { background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.14); position: relative }
  .pane > .wrap { position: relative; line-height: 0 }
  canvas { display: block }
  /* pdf.js's own text-layer contract: transparent glyphs, real selection. */
  .textLayer { position: absolute; inset: 0; overflow: hidden; opacity: 1; line-height: 1;
    text-size-adjust: none; forced-color-adjust: none; transform-origin: 0 0; caret-color: transparent }
  .textLayer span, .textLayer br { color: transparent; position: absolute; white-space: pre;
    cursor: text; transform-origin: 0% 0%; margin: 0 }
  .textLayer ::selection { background: rgba(0,90,255,.35) }
  .textLayer.show span { color: rgba(200,0,0,.75); background: rgba(255,235,0,.18); outline: 1px solid rgba(255,0,0,.25) }
  .label { font: 600 12px ui-sans-serif; padding: 8px 10px; border-bottom: 1px solid #e5e0d4; background: #faf8f3 }
  #out { position: sticky; bottom: 0; background: #fffdf7; border-top: 1px solid #d9d3c6; padding: 12px 18px }
  #sel { white-space: pre-wrap; font: 13px/1.45 ui-monospace, monospace; background: #f7f4ea;
    border: 1px solid #e2dccd; padding: 10px; border-radius: 4px; min-height: 42px; max-height: 190px; overflow: auto }
  button { font: 600 12px ui-sans-serif; padding: 7px 12px; border: 1px solid #b9b1a0; background: #fff;
    border-radius: 4px; cursor: pointer }
  button:hover { background: #f3efe4 }
  .row { display: flex; gap: 10px; align-items: center; margin-top: 9px; flex-wrap: wrap }
  .tag { font: 600 11px ui-sans-serif; padding: 2px 7px; border-radius: 9px; background: #e8e3d5 }
  .ok { background: #d8ecd6 } .bad { background: #f3d6d2 }
</style>
<header>
  <h1 id="title">…</h1>
  <div class="hint">
    Drag across a word. Judge three things: does the highlight <b>cover the word</b>,
    are the <b>characters right</b>, and is the text <b>grouped</b> as it should be.
    Then press Record so a machine can re-check it forever.
  </div>
</header>
<main id="panes"></main>
<div id="out">
  <div id="sel">(nothing selected yet)</div>
  <div class="row">
    <button id="record">Record this selection as golden</button>
    <button id="boxes">Show/hide the text boxes</button>
    <span id="status" class="hint"></span>
  </div>
</div>
<script type="module">
import * as pdfjs from "/pdfjs/build/pdf.mjs"
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/build/pdf.worker.mjs"

const cfg = await (await fetch("/config")).json()
document.getElementById("title").textContent =
  cfg.title + " — page " + cfg.page + (cfg.compare ? "  (left: current · right: comparison)" : "")

const panes = document.getElementById("panes")
const rendered = []
for (const src of cfg.files) {
  const wrapEl = document.createElement("div")
  wrapEl.className = "pane"
  wrapEl.innerHTML = '<div class="label">' + src.label + "</div>"
  const wrap = document.createElement("div")
  wrap.className = "wrap"
  wrapEl.appendChild(wrap)
  panes.appendChild(wrapEl)

  // wasmUrl and cMapUrl are not optional on this library: the readings are
  // scanned, their page images decode through those codecs, and without them
  // pdf.js warns and abandons the image — a blank canvas under a working text
  // layer, which is the most misleading thing this bench could show.
  const doc = await pdfjs.getDocument({
    url: src.url,
    wasmUrl: "/pdf-wasm/",
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
  }).promise
  const page = await doc.getPage(cfg.page)
  // Big enough that display type is judged at something like reading size.
  const viewport = page.getViewport({ scale: Math.min(1.6, 900 / page.getViewport({ scale: 1 }).width) })
  const canvas = document.createElement("canvas")
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
  wrap.appendChild(canvas)
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise

  const layer = document.createElement("div")
  layer.className = "textLayer"
  layer.style.width = canvas.width + "px"; layer.style.height = canvas.height + "px"
  wrap.appendChild(layer)
  const tl = new pdfjs.TextLayer({ textContentSource: await page.getTextContent(), container: layer, viewport })
  await tl.render()
  rendered.push({ layer, viewport, canvas, label: src.label })
}

const selBox = document.getElementById("sel")
const status = document.getElementById("status")
let last = null

document.addEventListener("selectionchange", () => {
  const s = document.getSelection()
  const text = s ? s.toString() : ""
  if (!text.trim()) { selBox.textContent = "(nothing selected yet)"; last = null; return }
  const range = s.getRangeAt(0)
  const r = range.getBoundingClientRect()
  // Which pane, and where on that page in PDF points?
  const pane = rendered.find((p) => { const b = p.canvas.getBoundingClientRect(); return r.left >= b.left - 4 && r.right <= b.right + 4 && r.top >= b.top - 4 && r.bottom <= b.bottom + 4 })
  let rect = null
  if (pane) {
    const b = pane.canvas.getBoundingClientRect()
    const k = pane.viewport.scale
    rect = { x: +( (r.left - b.left) / k ).toFixed(2), yTop: +( (r.top - b.top) / k ).toFixed(2),
             width: +( r.width / k ).toFixed(2), height: +( r.height / k ).toFixed(2) }
  }
  last = { text, rect, pane: pane?.label ?? "?" }
  selBox.textContent = JSON.stringify({ chars: text.length, from: last.pane, rectInPoints: rect, text }, null, 1)
})

document.getElementById("record").onclick = async () => {
  if (!last?.rect) { status.textContent = "select something on a page first"; return }
  const res = await fetch("/record", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...last, page: cfg.page, sourceId: cfg.sourceId }) })
  const j = await res.json()
  status.innerHTML = '<span class="tag ok">recorded</span> ' + j.count + " golden selection(s) → " + j.file
}
document.getElementById("boxes").onclick = () => rendered.forEach((p) => p.layer.classList.toggle("show"))
</script>`

async function main() {
  const source = (await db.select().from(sources).where(eq(sources.id, sourceId)))[0]
  if (!source?.storageKey) throw new Error(`no reading ${sourceId}`)
  const files = [{ label: `current · ${source.storageKey.slice(9, 46)}`, key: source.storageKey }]
  if (compareKey) files.push({ label: `comparison · ${compareKey.slice(9, 46)}`, key: compareKey })

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`)
    try {
      if (url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(PAGE_HTML)
      }
      if (url.pathname === "/config") {
        res.writeHead(200, { "content-type": "application/json" })
        return res.end(JSON.stringify({
          title: source.title, page: pageNumber, sourceId, compare: !!compareKey,
          files: files.map((f, i) => ({ label: f.label, url: `/pdf/${i}` })),
        }))
      }
      if (url.pathname.startsWith("/pdf/")) {
        const file = files[Number(url.pathname.split("/")[2])]
        const bytes = await readingStorage.get(file.key)
        res.writeHead(200, { "content-type": "application/pdf" }); return res.end(bytes)
      }
      if (url.pathname.startsWith("/pdfjs/") || url.pathname.startsWith("/pdf-wasm/")) {
        const path = url.pathname.startsWith("/pdf-wasm/")
          ? join(process.cwd(), "public", "pdf-wasm", url.pathname.replace("/pdf-wasm/", ""))
          : join(PDFJS_DIR, url.pathname.replace("/pdfjs/", ""))
        if (!existsSync(path)) { res.writeHead(404); return res.end("no") }
        const type = path.endsWith(".wasm") ? "application/wasm"
          : path.endsWith(".bcmap") ? "application/octet-stream"
          : path.endsWith(".pfb") ? "application/octet-stream"
          : "text/javascript"
        res.writeHead(200, { "content-type": type }); return res.end(readFileSync(path))
      }
      if (url.pathname === "/record" && req.method === "POST") {
        const body = await new Promise<string>((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => resolve(b)) })
        const entry = JSON.parse(body)
        mkdirSync(GOLDEN_DIR, { recursive: true })
        const file = join(GOLDEN_DIR, `${sourceId}-p${pageNumber}.json`)
        const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { sourceId, title: source.title, page: pageNumber, selections: [] }
        existing.selections.push({ rect: entry.rect, expected: entry.text, from: entry.pane, recordedAt: new Date().toISOString() })
        writeFileSync(file, JSON.stringify(existing, null, 2))
        res.writeHead(200, { "content-type": "application/json" })
        return res.end(JSON.stringify({ count: existing.selections.length, file: `golden/${sourceId}-p${pageNumber}.json` }))
      }
      res.writeHead(404); res.end("no")
    } catch (error) {
      res.writeHead(500); res.end(String(error instanceof Error ? error.message : error))
    }
  })
  server.listen(PORT, () => {
    console.log(`\n  ${source.title}`)
    console.log(`  page ${pageNumber}${compareKey ? " · comparing two versions" : ""}`)
    console.log(`\n  open  http://localhost:${PORT}/\n`)
    console.log(`  drag across a word; Record saves it to golden/${sourceId}-p${pageNumber}.json`)
    console.log(`  ctrl-c to stop\n`)
  })
}
main().catch((error) => { console.error(error); process.exit(1) })
