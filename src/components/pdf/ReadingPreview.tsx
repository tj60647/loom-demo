"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import CaptureModal from "./CaptureModal"

type ReadingPreviewProps = { sourceId: string; sourceName: string; author: string; onClose: () => void }
type Mode = "page" | "strip" | "matrix"

const pageCopy = [
  ["Reading together across different worlds", "This is placeholder prose for trying the reading workspace without loading a PDF. It gives the text an honest page-shaped surface while keeping the front-end completely self-contained.", "Read slowly enough to notice an idea worth keeping. When a passage changes how you see the question, select it and capture the concept it evidences."],
  ["A shared thing can hold difference", "A shared thing can coordinate people without forcing them to agree on what it means. That tension is where a useful reading often begins.", "A passage is evidence, not a conclusion. Give it a short name that you can recognize later, then see whether that idea reappears somewhere else."],
  ["The work of translation", "Ideas travel when someone does the work of making them intelligible in another setting. The movement is not the same as consensus.", "Use this page to test whether it feels natural to move from reading to Capture, then return to make a connection."],
  ["What disappears into practice", "The arrangements that sustain a practice often fade into the background. They become noticeable when they fail or when someone new has to learn them.", "A good workspace leaves room for that return: the source remains nearby while concepts and threads accumulate."],
  ["A passage becomes a byte", "Keeping a passage is a small act of attention. The text remains the evidence; the concept name is a temporary handle for finding it again.", "Select any sentence on these placeholder pages to test the same capture modal used by the PDF reader."],
  ["Returning to the whole", "Reading, capturing, connecting, and reflecting are different doors into the same work. None of them should make the source disappear.", "This last page is still only placeholder text, but the reader controls behave like the file-backed view for interface iteration."],
] as const

function markText(text: string, query: string) {
  const term = query.trim()
  if (term.length < 2) return text
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"))
  return parts.map((part, index) => part.toLowerCase() === term.toLowerCase() ? <mark className="preview-search-hit" key={index}>{part}</mark> : part)
}

export default function ReadingPreview({ sourceId, sourceName, author, onClose }: ReadingPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const [mode, setMode] = useState<Mode>("page")
  const [fit, setFit] = useState<"height" | "width">("height")
  const [twoPage, setTwoPage] = useState(true)
  const [narrow, setNarrow] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selection, setSelection] = useState<{ text: string; left: number; top: number } | null>(null)
  const [captureOpen, setCaptureOpen] = useState(false)

  useEffect(() => {
    const update = () => { const next = window.innerWidth < 900; setNarrow(next); if (next) setTwoPage(false) }
    update(); window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (searchOpen) setSearchOpen(false)
        else setFullscreen(false)
      }
      if (event.key === "f" && !event.metaKey && !event.ctrlKey && !event.altKey) setFullscreen((on) => !on)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [searchOpen])
  useEffect(() => {
    const onSelection = () => {
      const active = window.getSelection(), text = active?.toString().trim() ?? "", range = active?.rangeCount ? active.getRangeAt(0) : null
      const node = range?.commonAncestorContainer, element = node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement
      if (!text || !range || !element?.closest(".preview-page") || !rootRef.current?.contains(element)) return setSelection(null)
      const rect = range.getBoundingClientRect(); setSelection({ text, left: rect.left + rect.width / 2, top: rect.top })
    }
    document.addEventListener("selectionchange", onSelection)
    return () => document.removeEventListener("selectionchange", onSelection)
  }, [])

  const advance = twoPage ? 2 : 1
  const canPrev = page > 1
  const canNext = page + (twoPage ? 1 : 0) < pageCopy.length
  const shownPages = mode === "page" ? pageCopy.slice(page - 1, page - 1 + (twoPage ? 2 : 1)) : pageCopy
  const hits = search.trim().length < 2 ? [] : pageCopy.flatMap(([heading, ...paragraphs], index) => `${heading} ${paragraphs.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()) ? [index] : [])
  const next = () => setPage((current) => Math.min(pageCopy.length - (twoPage ? 1 : 0), current + advance))
  const prev = () => setPage((current) => Math.max(1, current - advance))
  const pageStyle = { "--preview-page-width": `${180 * zoom}px` } as CSSProperties

  return <div ref={rootRef} className={`reading-preview${fullscreen ? " fullscreen" : ""}`}>
    <style>{`
      .reading-preview{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background:var(--paper)}.reading-preview.fullscreen{position:fixed;inset:0;z-index:6000}.reading-preview-toolbar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding:10px 20px;border-bottom:1px solid var(--rule);background:var(--paper-2);box-shadow:0 2px 10px rgba(0,0,0,.05);z-index:10;flex:0 0 auto}.reading-preview-controls,.preview-modes{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.preview-modes{gap:0;padding:2px;border:1px solid var(--rule);border-radius:4px;background:var(--paper)}.preview-modes button{margin:0;padding:4px 9px;border:0}.reading-preview-stage{flex:1 1 auto;min-height:0;background:#eef0f2;overscroll-behavior:contain}.reading-preview-stage.mode-page{display:flex;justify-content:safe center;overflow:auto}.reading-preview-stage.mode-strip{overflow-x:auto;overflow-y:hidden}.reading-preview-stage.mode-matrix{overflow:auto}.preview-page-run{display:flex;align-items:center;gap:20px;min-height:100%;padding:24px}.preview-strip-run{display:flex;align-items:center;gap:18px;height:100%;padding:12px 18px;width:max-content}.preview-matrix-grid{display:flex;flex-wrap:wrap;align-content:flex-start;justify-content:safe center;gap:18px;padding:18px}.preview-side-nav{display:flex;align-items:center;justify-content:center;width:64px;height:64px;flex:0 0 auto;border:0;border-radius:50%;color:var(--ink-soft);background:transparent;cursor:pointer;font-size:34px}.preview-side-nav:hover:not(:disabled){background:rgba(0,0,0,.05);color:var(--ink);transform:scale(1.1)}.preview-side-nav:disabled{opacity:.1;cursor:not-allowed}.preview-page{box-sizing:border-box;position:relative;flex:0 0 auto;width:min(42vw,510px);min-height:660px;padding:48px 50px 62px;border:1px solid #d8d5cc;background:#fffef9;box-shadow:0 0 20px rgba(0,0,0,.05);color:var(--ink);font-family:Georgia,serif}.mode-page.fit-height .preview-page{height:min(76vh,760px);min-height:0}.mode-page.fit-width .preview-page{width:min(70vw,680px)}.preview-strip-run .preview-page{width:470px;height:calc(100% - 24px);min-height:520px}.preview-matrix-grid .preview-page{width:var(--preview-page-width);min-height:0;padding:24px;font-size:11px}.preview-matrix-grid .preview-page .cap{margin-bottom:18px;font-size:8px}.preview-matrix-grid .preview-page h1{margin-bottom:14px;font-size:18px}.preview-matrix-grid .preview-page p:not(.cap){margin-bottom:10px;font-size:inherit;line-height:1.45}.preview-page .cap{margin:0 0 38px;color:var(--grey);font-family:var(--mono);font-size:10px;letter-spacing:.08em}.preview-page h1{margin:0 0 28px;font-family:var(--display);font-size:28px;font-weight:500;line-height:1.14}.preview-page p:not(.cap){margin:0 0 18px;font-size:17px;line-height:1.66}.preview-page footer{position:absolute;right:0;bottom:22px;left:0;color:var(--grey);font:11px var(--mono);text-align:center}.preview-search-panel{position:absolute;top:64px;right:12px;z-index:20;width:min(340px,calc(100vw - 24px));max-height:min(56vh,480px);padding:10px 12px;border:1px solid var(--rule);border-radius:4px;background:var(--paper-2);box-shadow:0 10px 26px rgba(0,0,0,.16)}.preview-search-row{display:flex;gap:8px;align-items:center}.preview-search-row .tinput{flex:1}.preview-search-list{max-height:320px;margin:8px 0 0;padding:0;overflow-y:auto;list-style:none}.preview-search-list li+li{border-top:1px dotted var(--rule)}.preview-search-list button{width:100%;padding:8px 4px;border:0;background:transparent;color:var(--ink);text-align:left;cursor:pointer}.preview-search-hit{background:rgba(122,138,110,.4);outline:1px solid rgba(122,138,110,.75);color:inherit}.preview-capture{position:fixed;z-index:9000;transform:translateX(-50%);box-shadow:0 4px 12px rgba(0,0,0,.2);background:var(--ochre);color:#000}.preview-mobile-paging{display:none}@media(max-width:900px){.reading-preview-toolbar{flex-wrap:nowrap;padding:6px 8px;overflow-x:auto;scrollbar-width:none}.reading-preview-toolbar::-webkit-scrollbar{display:none}.reading-preview-toolbar>div{flex:0 0 auto}.reading-preview-toolbar .btn.mini,.preview-modes button{min-height:34px;padding:6px 8px;font-size:10px}.reading-preview-controls{flex-wrap:nowrap;gap:6px}.preview-page-run{padding:12px}.preview-page{width:min(100%,520px);min-height:0;padding:36px 28px 54px}.mode-page.fit-height .preview-page{height:auto}.mode-page.fit-width .preview-page{width:min(100%,520px)}.preview-strip-run{gap:10px;padding:8px 10px}.preview-strip-run .preview-page{width:min(82vw,420px)}.preview-matrix-grid{gap:10px;padding:10px}.preview-mobile-paging{position:fixed;right:0;bottom:0;left:0;z-index:8000;display:flex;align-items:center;justify-content:space-between;padding:10px 12px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--rule);background:rgba(237,235,227,.95);backdrop-filter:blur(4px)}}
    `}</style>
    <div className="reading-preview-toolbar">
      <div><button className="btn ghost mini" onClick={onClose} aria-label={narrow ? "Back to Capture" : undefined}>{narrow ? "←" : "← Back to Capture"}</button></div>
      {!narrow && <span className="label" style={{ minWidth: 120, textAlign: "center" }}>{mode === "page" ? `${twoPage ? `Pages ${page}-${Math.min(page + 1, pageCopy.length)}` : `Page ${page}`} of ${pageCopy.length}` : `${pageCopy.length} pages`}</span>}
      <div className="reading-preview-controls"><div className="preview-modes" role="group" aria-label="Page layout">{(["page", "strip", "matrix"] as const).map((value) => <button key={value} className={`btn mini ${mode === value ? "" : "ghost"}`} onClick={() => setMode(value)} aria-pressed={mode === value}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
        {mode === "page" && <div className="preview-modes" role="group" aria-label="Page size"><button className={`btn mini ${fit === "height" ? "" : "ghost"}`} onClick={() => setFit("height")} aria-pressed={fit === "height"} aria-label="Fit Page">{narrow ? "Page" : "Fit Page"}</button><button className={`btn mini ${fit === "width" ? "" : "ghost"}`} onClick={() => setFit("width")} aria-pressed={fit === "width"} aria-label="Fit Width">{narrow ? "Width" : "Fit Width"}</button></div>}
        {mode === "matrix" && <label className="label">Zoom <input type="range" min={0.5} max={2} step={0.1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Zoom the page matrix" /></label>}
        {mode === "page" && !narrow && <label className="label" style={{ textTransform: "none", letterSpacing: 0 }}><input type="checkbox" checked={twoPage} onChange={(event) => setTwoPage(event.target.checked)} /> 2-Page Spread</label>}
        <button className={`btn mini ${searchOpen ? "" : "ghost"}`} onClick={() => setSearchOpen((open) => !open)} aria-pressed={searchOpen} aria-label="Search this reading">{narrow ? "⌕" : "⌕ Search"}</button><button className="btn ghost mini" onClick={() => setFullscreen((on) => !on)} aria-pressed={fullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>{fullscreen ? (narrow ? "↙" : "↙ Exit full screen") : (narrow ? "⛶" : "⛶ Full screen")}</button>
      </div>
    </div>
    {searchOpen && <div className="preview-search-panel" role="search" aria-label="Search this reading"><div className="preview-search-row"><input className="tinput" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder='a word, or a "phrase"' aria-label="Search this reading for a word or phrase" autoFocus /><button className="btn ghost mini" onClick={() => { setSearchOpen(false); setSearch("") }} aria-label="Close search">✕</button></div>{search.trim().length >= 2 && <ol className="preview-search-list">{hits.length ? hits.map((index) => <li key={index}><button onClick={() => { setPage(index + 1); setMode("page") }}><span className="n">p. {index + 1}</span> {pageCopy[index][0]}</button></li>) : <li><p className="hint">no page says that</p></li>}</ol>}</div>}
    <div className={`reading-preview-stage mode-${mode}${mode === "page" ? ` fit-${fit}` : ""}`}>
      {mode === "page" && <div className="preview-page-run">{!narrow && <button className="preview-side-nav" onClick={prev} disabled={!canPrev} aria-label="Previous Page">‹</button>}{shownPages.map(([heading, ...paragraphs], index) => <Page key={page + index} number={page + index} heading={heading} paragraphs={paragraphs} sourceName={sourceName} author={author} search={search} />)}{!narrow && <button className="preview-side-nav" onClick={next} disabled={!canNext} aria-label="Next Page">›</button>}</div>}
      {mode === "strip" && <div className="preview-strip-run">{pageCopy.map(([heading, ...paragraphs], index) => <Page key={index} number={index + 1} heading={heading} paragraphs={paragraphs} sourceName={sourceName} author={author} search={search} />)}</div>}
      {mode === "matrix" && <div className="preview-matrix-grid" style={pageStyle}>{pageCopy.map(([heading, ...paragraphs], index) => <Page key={index} number={index + 1} heading={heading} paragraphs={paragraphs} sourceName={sourceName} author={author} search={search} />)}</div>}
    </div>
    {narrow && mode === "page" && <div className="preview-mobile-paging"><button className="btn ghost mini" onClick={prev} disabled={!canPrev}>Prev</button><span className="label">Page {page} of {pageCopy.length}</span><button className="btn ghost mini" onClick={next} disabled={!canNext}>Next</button></div>}
    {selection && <button className="btn mini preview-capture" style={{ top: selection.top - 45, left: selection.left }} onClick={() => setCaptureOpen(true)}>Capture as Byte</button>}
    {captureOpen && selection && <CaptureModal passage={selection.text} source={sourceName} sourceId={sourceId} location={`p. ${page}`} pageNumber={page} onClose={() => { setCaptureOpen(false); setSelection(null); document.getSelection()?.removeAllRanges() }} />}
  </div>
}

function Page({ number, heading, paragraphs, sourceName, author, search }: { number: number; heading: string; paragraphs: readonly string[]; sourceName: string; author: string; search: string }) {
  return <article className="preview-page" aria-label={`Preview page ${number}`}><p className="cap">{author} · {sourceName}</p><h1>{markText(heading, search)}</h1>{paragraphs.map((paragraph) => <p key={paragraph}>{markText(paragraph, search)}</p>)}<footer>{number}</footer></article>
}
