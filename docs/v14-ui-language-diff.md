# v14 UI & language differences — for evaluation

**Date:** 2026-07-30 · **Method:** four independent read-only audits (01–02, 03–04, global chrome, and a whole-app voice pass) comparing the app against `loom-v14-example.html`, merged and deduped. **123 differences.**

> **Status — 2026-07-30: Section A is closed.** All 66 divergences below have
> been resolved, worked in batches of three. A handful turned out to be the same
> finding reported by two lenses in different words and were closed with their
> twin. Sections **B** (40 deliberate app changes) and **C** (15 production-only
> surfaces) are untouched and need no code — B is there so each departure from
> v14 is a decision on the record rather than drift.
>
> Two items were adapted rather than restored verbatim, both noted in place:
> `.scrim`'s `z-index` (v14's 40 was top-of-stack there; this app has overlays up
> to 10000) and the reset tooltip (v14 says "this browser's cloth"; here reset is
> server-side and course-scoped).

Nothing here had been changed when this was written. It is a worksheet: decide per item, and I'll apply the ones you pick.

Excluded by design: straight-vs-typographic quotes, JSX escaping, whitespace, and anything that follows inevitably from React rather than vanilla DOM.

## How to read this

- **A — Divergences from v14** (66): the app says or does something different. Most are small copy losses; a handful are real bugs.
- **B — Deliberate app changes** (40): departures made on purpose. Confirm each is still what you want.
- **C — Production-only** (15): no v14 equivalent exists. Nothing to reconcile.

## The nine I would fix first

These are the ones where something is actually broken or where the meaning shifts, rather than the wording merely differing.

| # | What | Why it matters |
| --- | --- | --- |
| 1 | The **help "?" button is dead** unless signed in — it dispatches `loom:walkthrough`, but the only listener is inside the signed-in branch of `page.tsx`. | A visible control that does nothing. |
| 2 | The **`[data-tip]` tooltip system was never ported**, yet `MapTab.tsx:353` still sets `data-tip`. | Every v14 hover tip is silently gone; some markup pretends otherwise. |
| 3 | The **About dialog says Loom will "generate an axial read"**. | Loom never writes the read — this contradicts red line #1 in the one place a newcomer reads first. |
| 4 | Browser tab title is still **"Loom v8"**. | Wrong version in the most visible label. |
| 5 | Walkthrough card 1 still says **"Three tabs = three moves"**; there are now six tabs. | First thing a new student reads is wrong. |
| 6 | **Validation went silent** on Open and Throw — v14 alerts ("Paste or type a passage.", "Say how they hang together…"); the app just greys the button out. | The student is blocked with no reason given. |
| 7 | **Tracing and the definitions toggle reset on tab switch** — v14 keeps panels in the DOM, the app unmounts them. | Trace the spine, glance at Map, come back: your trace is gone. |
| 8 | **The cloth does not re-measure on window resize** (measured once on mount). | The arc map is wrong-width after any resize. |
| 9 | The **walkthrough "seen" flag is device-wide**, not per account. | On a shared machine the second student never sees the walkthrough. |

Items 1–5 are one-line fixes. 6–9 are small but touch behavior, so they deserve your call on the tradeoff (e.g. keeping panels mounted costs a little memory but restores v14's persistence).

---

## A. Divergences from v14 (candidates to restore)

Each is a place a student reads different words or gets different behavior than v14. Ordered by tab. Tick the ones you want restored.

### 01 · Open

**Add byte — validation messages** · _missing_

- v14: loom-v14-example.html:1240-1241 — `if(!text){alert('Paste or type a passage.');return;}` and `if(!cname){alert('Name the concept this byte evidences — a short noun phrase (the author’s own term is often best).');return;}`
- app: src/components/tabs/OpenTab.tsx:324 — `disabled={!content || !conceptLabel}` (button is simply greyed; OpenTab.tsx:35 `if (!content || !conceptLabel) return` says nothing)
- REGRESSION on copy — disabling the button is a defensible UX choice, but the coaching sentence 'a short noun phrase (the author's own term is often best)' appeared nowhere else at the moment the student is stuck, and a greyed button never explains which of the two fields is the problem.

**Add byte — trimming** · _behavior_

- v14: loom-v14-example.html:1239 — `const text=bText.value.trim(),cname=document.getElementById('bConcept').value.trim()`; :668 `function getOrCreateConcept(label){label=(label||'').trim(); … x.label.toLowerCase()===label.toLowerCase()`
- app: src/components/tabs/OpenTab.tsx:34-46 — `if (!content || !conceptLabel) return` … `concept = await addConcept(conceptLabel, …)` … `addByte(concept.id, source, location, content)` (raw, untrimmed); same at OpenTab.tsx:103-106 for the add-concept-only row
- REGRESSION — a whitespace-only passage passes the guard and is stored, and ' boundary objects ' fails to match the existing 'boundary objects' so the student silently gets a duplicate concept.

**Add byte — new row does not open** · _behavior_

- v14: loom-v14-example.html:1245 — `state.bytes.push(b);openByte=b.id;` (the just-added byte's log row is expanded automatically)
- app: src/components/tabs/OpenTab.tsx:47-53 — form reset then `flash("byte added — in its log row you can also file it under a second concept")`, with no `setOpenLogRows` call
- REGRESSION — the flash message points the student at 'its log row', but unlike v14 that row stays collapsed, so the affordance it advertises is not on screen.

**log row — remove concept control** · _copy_

- v14: loom-v14-example.html:726 — `<span class="rm" data-del-concept="${c.id}" style="margin-left:14px">remove concept</span>` (labelled text link, inside the opened row, next to 'remove byte')
- app: src/components/tabs/OpenTab.tsx:359-374 — icon-only `<button className="btn ghost mini" … title="Delete concept">` with a trash `<svg>`, sitting in the always-visible `lhead`
- REGRESSION — the words 'remove concept' are gone (only a hover title remains), and the destructive control moved out of the opened row into the collapsed header where it sits one mis-click from every row toggle; the confirm/alert copy behind it is unchanged and correct.

**Passage field label** · _copy_

- v14: loom-v14-example.html:453 — `<span class="label">Passage — the author's words, verbatim</span>`
- app: src/components/tabs/OpenTab.tsx:241 — `<span className="label">Passage</span>`
- REGRESSION — 'the author's words, verbatim' is the one place the verbatim-quotation norm is stated at the point of entry, and it is dropped.

**capture form — input tooltips** · _missing_

- v14: loom-v14-example.html:451-459 — `title="who wrote it, and what work it's from"`, `title="page, chapter, or timestamp — so you (and readers) can get back to the source"`, `title="verbatim, with citation — this is your evidence"`, `title="a noun phrase, not a sentence — if the author names it, use her…
- app: src/components/tabs/OpenTab.tsx:222-227, 232-237, 242-250, 300-305, 321-327 — Source, Location, Passage, Concept and the Add byte button carry no `title` at all (only Working definition, OpenTab.tsx:315, keeps v14's)
- REGRESSION — five pieces of just-in-time coaching are gone; at least the Concept one ('a noun phrase, not a sentence') has no equivalent anywhere else in the capture column.

**Concept placeholder** · _copy_

- v14: loom-v14-example.html:455 — `placeholder="e.g. boundary objects · satisficing · valence"`
- app: src/components/tabs/OpenTab.tsx:302 — `placeholder="e.g. boundary objects · the central tension"`
- REGRESSION, mild — v14's three examples spanned three different sources/registers to show breadth; the app's two are both from the same Star & Griesemer example, which reads as narrower guidance.

**coding log hint** · _copy_

- v14: loom-v14-example.html:464 — `Click a row to open it — edit the working definition, or file the same passage under another concept. When you have a handful, go to <b>02 — Throw</b> and start connecting them.`
- app: src/components/tabs/OpenTab.tsx:333 — `The warp being laid, thread by thread. Click a row to open it; next, take these to <b>02 — Throw</b>.`
- REGRESSION — the app trades the two concrete things a row lets you do (edit the definition, re-file the passage) and the readiness cue ('when you have a handful') for a metaphor, so the re-filing feature at OpenTab.tsx:439-445 is now undiscoverable from the hint.

**byte citation line** · _copy_

- v14: loom-v14-example.html:715 — `<span class="src">${esc(b.source||'—')}${b.location?' · '+esc(b.location):''}</span>` (em-dash placeholder when there is no source, middot separator)
- app: src/components/tabs/OpenTab.tsx:416 — `{b.source} {b.location}` (no placeholder, plain space separator)
- REGRESSION, minor — a byte captured with no source now renders a blank line instead of v14's '—', so the student gets no visual cue that the citation is missing, and source and page run together without the middot.

**capture hint — "whose judgment"** · _copy_

- v14: line 450: "A “byte” = one passage + its citation. Choosing the passage is <i>your</i> judgment — that's the point."
- app: src/components/tabs/OpenTab.tsx:218 "A byte is a passage worth keeping plus your concept for it. Loom can carry over source details and offer passage words to tap; it does not summarize or choose the concept for you."
- REGRESSION — v14's one line that names the student's selection as the pedagogical act ("that's the point") is replaced by a description of what the tool does and doesn't do, so the stance shifts from "your judgment is the work" to "here is what the software will and won't do for you."

**what a byte IS (citation)** · _copy_

- v14: line 450: "A “byte” = one passage + its citation."
- app: src/components/tabs/OpenTab.tsx:218 "A byte is a passage worth keeping plus your concept for it."
- REGRESSION — the citation drops out of the definition of a byte, weakening v14's traceability rule (every concept traces to a cited passage) that the app still enforces elsewhere ("no evidence" tags, ReadTab:404).

**Location field** · _missing_

- v14: line 452: input title "page, chapter, or timestamp — so you (and readers) can get back to the source"
- app: src/components/tabs/OpenTab.tsx:231-234 — label "Location", placeholder "ch. 3, p. 49", no explanatory title
- REGRESSION (minor) — the reason for the field (getting back to the source, for you and for readers) is gone, leaving Location looking like bookkeeping rather than the traceability guarantee.

**Concept field — noun phrase, not a sentence** · _missing_

- v14: line 455: input title "a noun phrase, not a sentence — if the author names it, use her name for it"
- app: src/components/tabs/OpenTab.tsx:300-305 — input with placeholder "e.g. boundary objects · the central tension" and no title
- REGRESSION — the explicit "not a sentence" contrast is lost at the point of entry; the scaffold still says "a short noun phrase" (OpenTab.tsx:253) but never rules the sentence out, which is exactly the distinction v11 was built around.

**"a few ways in" example concepts** · _extra_

- v14: no equivalent — v14's scaffold (renderCodeScaffold, lines 696-702) offers only the noun-phrase rule and the multi-concept note; it gives no worked examples of a concept
- app: src/components/tabs/OpenTab.tsx:288 "Just to show the shape — concepts in plain words:  \"boundary objects\" · \"tools go invisible until they break\"" (and CaptureModal.tsx:113 "\"tools go invisible until they break\" · \"people just know how to go on\"")
- REGRESSION — the modelled examples are full sentences/clauses, directly contradicting the "short noun phrase, not a sentence" coaching two lines above them; the scaffold itself is a reasonable addition, but these exemplars teach the wrong shape.

**Add byte validation** · _behavior_

- v14: line 1241: alert('Name the concept this byte evidences — a short noun phrase (the author’s own term is often best).') and line 1240: alert('Paste or type a passage.')
- app: src/components/tabs/OpenTab.tsx:324 disabled={!content || !conceptLabel} — the button simply greys out, with no message
- REGRESSION — v14 used the failed attempt as its strongest coaching moment (re-stating the noun-phrase rule and the in-vivo preference at exactly the point of confusion); the app silently disables and says nothing.

**after Add byte — the flash points at a row that isn't open** · _behavior_

- v14: line 1245: "state.bytes.push(b);openByte=b.id;" — the new byte's log row is expanded automatically, then line 1247 flashes "byte added — in its log row you can also file it under a second concept"
- app: src/components/tabs/OpenTab.tsx:52 flash("byte added — in its log row you can also file it under a second concept") — handleAddByte (lines 34-53) never sets openLogRows
- REGRESSION — the same sentence now points at something the student can't see, so the multi-concept affordance that v11 deliberately surfaced at capture time is announced but not shown.

### 02 · Throw

**empty slot placeholder** · _copy_

- v14: loom-v14-example.html:745 — `<span class="ph">tap a concept on the left</span>`
- app: src/components/tabs/ThrowTab.tsx:244,259 — `<span className="ph">pick on left</span>`
- REGRESSION — the shortened phrase drops the verb-object instruction ('tap a concept') that tells a first-time student what the empty box is waiting for; the surrounding copy still says 'Tap one, then a second' (ThrowTab.tsx:200), so the two no longer agree on the gesture word.

**bench sleeper** · _layout_

- v14: loom-v14-example.html:496-503 — the sleeper always renders the sentence label, opener chips, textarea, `Throw it` button and ghostnote; `updateThrow` only toggles `sl.classList.toggle('asleep',!both)` (:760), and `.sleeper.asleep{opacity:.42}` (:357) dims them in place
- app: src/components/tabs/ThrowTab.tsx:265-298 — `{!both ? (<div className="sleeper asleep"><div className="sleepmsg">…</div></div>) : (<div className="sleeper">…` — when no pair is loaded the openers, textarea, Throw button and ghostnote are not rendered at all
- REGRESSION — v14 deliberately showed the whole bench greyed out so the student could see what was coming ('the bench wakes when the pair is loaded' presumes something visible to wake); the app makes the right-hand card collapse and re-expand instead, and the ghostnote about coining terms never appears until after a pair is picked.

**Throw it validation messages** · _missing_

- v14: loom-v14-example.html:1254-1256 — `if(!pairA||!pairB){alert('Load both slots — tap two concepts on the left.');return;} if(pairA===pairB){alert('Pick two different concepts.');return;} if(!s){alert('Say how they hang together — however awkwardly. The sentence is the thread.');return;}`
- app: src/components/tabs/ThrowTab.tsx:133-134 — `if (!pairA || !pairB || !sentence.trim()) return` (silent), with the button merely `disabled={!sent}` (:295)
- REGRESSION on copy — all three messages are unreachable in the app, and the third ('however awkwardly. The sentence is the thread.') was the pedagogical unblocking line for a student staring at an empty box.

**thread whose concept is missing** · _behavior_

- v14: loom-v14-example.html:808 — `<b>${esc(short(f?f.label:'?',30))}</b> … <b>${esc(short(t?t.label:'?',30))}</b>` — the thread still renders with '?' and keeps its `remove` control
- app: src/components/tabs/ThrowTab.tsx:310 — `if (!fromC || !toC) return null` — the whole thread row is dropped from the list
- REGRESSION, low-likelihood — an edge with a dangling endpoint (imported/legacy data, or a race between concept delete and edge delete) becomes invisible and therefore unremovable, and it still counts in the `Threads thrown` tally at ThrowTab.tsx:301, so the count won't match the visible rows.

**term-namer verb chips** · _behavior_

- v14: loom-v14-example.html:1305-1306 — `if(e.target.dataset.nameword!==undefined){const i=document.getElementById('nameInput'); if(i){i.value=e.target.dataset.nameword;i.focus();}return;}` (fills the field and focuses it so the student can edit the suggestion)
- app: src/components/tabs/ThrowTab.tsx:355,370 — `onClick={() => setNameDraft(v)}` (fills the field, no focus)
- REGRESSION, minor — v14 dropped the student straight into the input so a suggested verb was a starting point to edit; the app leaves focus on the chip, which nudges the tapped word toward being accepted as-is.

**the sleeping bench** · _behavior_

- v14: lines 496-503 + CSS 356-361: the whole bench (label, opener chips, textarea, "Throw it", ghostnote) is rendered but dimmed to opacity .42 and inert, with "pick two concepts on the left — the bench wakes when the pair is loaded"; design note at lines 98-101: "The workbench stays visibly ASLEEP (dimme…
- app: src/components/tabs/ThrowTab.tsx:265-268 — when a pair isn't loaded the app renders ONLY <div className="sleepmsg">pick two concepts on the left — the bench wakes when the pair is loaded</div>; the openers, textarea, button and ghostnote are removed from the DOM
- REGRESSION — the message still promises a bench that "wakes", but there is nothing visible to wake; v14's point was that the student can SEE the coming step (say → throw) without being invited to act on it, and that preview is lost.

**empty pair slots** · _copy_

- v14: line 745: "<span class=\"ph\">tap a concept on the left</span>"
- app: src/components/tabs/ThrowTab.tsx:244 and 259: "<span className=\"ph\">pick on left</span>"
- REGRESSION (minor) — the instruction is compressed into a label fragment; "tap a concept on the left" tells a first-timer what to do, "pick on left" reads as a status.

**throw validation** · _behavior_

- v14: line 1256: alert('Say how they hang together — however awkwardly. The sentence is the thread.')
- app: src/components/tabs/ThrowTab.tsx:133-134 handleThrow returns silently; line 295 <button ... disabled={!sent}>Throw it</button>
- REGRESSION (minor) — same pattern as Add byte: the strongest restatement of "the sentence IS the thread, awkward is fine" fired exactly when a student stalled, and it is now silence.

### 03 · Read

**task subtitle** · _copy_

- v14: "What argument runs through it? What does it keep returning to? What's missing? The cloth shows you where to look — the reading is yours to write. From here, your weave feeds the work <i>outside</i> Loom: the concept map you draw by hand, and the chalk talk you build from it." (loom-v14-example.html…
- app: "What argument runs through it? What does it keep returning to? What's missing? The cloth shows you where to look — the reading is yours to write." (src/components/tabs/ReadTab.tsx:296)
- REGRESSION — the app drops v14's closing sentence that tells the student the weave feeds work outside Loom (hand-drawn map + chalk talk), which is the hand-off the whole 03/04 sequence is aiming at.

**legend, second swatch** · _copy_

- v14: "<span class=\"sw\" style=\"border-top:2px solid var(--sage)\"></span>coined term" (loom-v14-example.html:521)
- app: "<span className=\"sw\" style={{borderTop: \"2px solid var(--sage)\"}}></span>named relation" (src/components/tabs/ReadTab.tsx:320)
- REGRESSION — "named relation" abandons the coinage vocabulary the app itself still uses two panels away ("a coinage forming", ReadTab.tsx:109; "coin one on 02 so a word can recur", ReadTab.tsx:401), so the legend no longer names the thing the student was told to make.

**"What the cloth shows you" hint** · _copy_

- v14: "Click a prompt to light it up on the cloth and lay those threads out below. <b>You don't write anything here</b> — your one short read goes on the right." (loom-v14-example.html:528)
- app: "Each is a question with a move — click to trace it on the cloth and lay your threads out as material below. You weave them into your read. You make the call." (src/components/tabs/ReadTab.tsx:384)
- REGRESSION — the rewrite drops v14's explicit division-of-labour guardrail ("You don't write anything here — your one short read goes on the right"), which is the sentence that stops a student hunting for a text field in the left card.

**"Your read" hint** · _copy_

- v14: "One short paragraph, in your own words: what is this reading about, and what holds it together? The tool never writes it for you." (loom-v14-example.html:534)
- app: "The move: weave the findings into one narrative. The tool never writes it for you." (src/components/tabs/ReadTab.tsx:413)
- REGRESSION — v14 states the length ("one short paragraph") and the two questions to answer; the app's "weave the findings into one narrative" gives neither, and "the findings" reads as if the tool produced findings the student must accept.

**copy-read button label** · _copy_

- v14: "<button class=\"btn ghost mini\" id=\"copyReadBtn\" data-tip=\"copies your paragraph to the clipboard\">Copy your read</button>" (loom-v14-example.html:538)
- app: "<button className=\"btn ghost mini\" onClick={handleCopyRead}>Copy as essay draft</button>" (src/components/tabs/ReadTab.tsx:424)
- REGRESSION — the button copies exactly the student's paragraph with a one-line header (ReadTab.tsx:174, identical to v14:1188), so "Copy as essay draft" promises a drafting service the tool does not perform; v14's "Copy your read" described the act truthfully.

**hover tips on both 03 buttons** · _missing_

- v14: "data-tip=\"copies your paragraph to the clipboard\"" and "data-tip=\"copies your concepts, propositions, and spine — everything you need to draw your concept map by hand\"" (loom-v14-example.html:538-539)
- app: neither button carries data-tip — "<button className=\"btn ghost mini\" onClick={handleCopyRead}>" / "<button className=\"btn ghost mini\" onClick={handleMapKit}>" (src/components/tabs/ReadTab.tsx:424-425)
- REGRESSION — the map-kit tip is the only place that says what the kit contains, and 04's equivalent button kept its tip (MapTab.tsx:514), so the omission is inconsistent as well as lossy.

**reading pane, hub heading** · _copy_

- v14: "${names.map(n=>`<span class=\"red\">${esc(short(n,40))}</span>`).join(' · ')}" (loom-v14-example.html:954)
- app: "{names.map((n, i) => <span key={n!.id}><span style={{ color: \"var(--red)\" }}>{n!.label}</span>{i < names.length - 1 ? \" / \" : \"\"}</span>)}" (src/components/tabs/ReadTab.tsx:193)
- REGRESSION (minor) — the separator changes from the middot used everywhere else in the interface to a slash, and dropping short(...,40) lets a long concept label run the heading onto extra lines.

**reading pane, unnamed-thread pill** · _copy_

- v14: "const v=e.handle?`<span class=\"vpill\">${esc(e.handle)}</span>`:`<span class=\"vpill loosev\">sentence</span>`;" (loom-v14-example.html:946)
- app: "{e.handle ? <span className=\"vpill\">{e.handle}</span> : <span className=\"vpill loosev\">loose</span>}" (src/components/tabs/ReadTab.tsx:207, also 227 and 273)
- REGRESSION — v14 labels the un-coined thread "sentence" in the pill and "sentence only" in the legend so the two agree; the app's "loose" matches neither its own legend ("unnamed — sentence only", ReadTab.tsx:321) nor the pill's meaning.

**reading pane, triple labels** · _layout_

- v14: "return `<b>${esc(short(f?f.label:'?',34))}</b> ${v} <b>${esc(short(t?t.label:'?',34))}</b>`;" (loom-v14-example.html:947)
- app: "<b>{f?.label || \"?\"}</b> ... <b>{t?.label || \"?\"}</b>" (src/components/tabs/ReadTab.tsx:207, 273)
- REGRESSION (minor) — no truncation, so a long concept label wraps the triple across lines where v14 clipped it to 34 chars with an ellipsis.

**reading pane, edge view concept heading** · _layout_

- v14: "<div class=\"label\" style=\"margin-top:8px\">${esc(short(c.label,44))}</div>" (loom-v14-example.html:963)
- app: "<div className=\"label\" style={{ marginTop: \"8px\", fontWeight: \"bold\" }}>{c!.label}</div>" (src/components/tabs/ReadTab.tsx:232)
- REGRESSION (minor) — truncation at 44 is gone and an inline bold is added that v14's .label class did not have.

**reading pane, byte source fallback** · _copy_

- v14: "<span class=\"src\">${esc(b.source||'—')}${b.location?' · '+esc(b.location):''}</span>" (loom-v14-example.html:965)
- app: "<span className=\"src\" style={{ fontSize: \"11px\", color: \"var(--grey)\" }}>{b.source || '-'} {b.location ? `· ${b.location}` : ''}</span>" (src/components/tabs/ReadTab.tsx:236)
- REGRESSION (trivial) — the missing-source placeholder degrades from an em dash to an ASCII hyphen, and the inline 11px/grey overrides .bytequote .src (globals.css:139, 10px, inherited ink-soft).

**reading pane, thread-head typography** · _layout_

- v14: .threadhead{font-family:var(--display);font-size:19px;line-height:1.35;margin-bottom:2px} (loom-v14-example.html:328; identical rule at src/app/globals.css:132)
- app: "<div className=\"threadhead\" style={{ fontSize: \"14px\", fontWeight: 500, marginBottom: \"4px\" }}>" (src/components/tabs/ReadTab.tsx:192, also 226, 252, 259)
- REGRESSION — inline styles override the shared class the app already ships, shrinking the traced concept's heading from 19px display type to 14px and flattening the visual hierarchy of the pane.

**reading pane, thread item typography** · _layout_

- v14: .readitem .trip{font-size:15px;margin-bottom:2px} and .readitem .sent{font-size:14.5px;font-style:italic;color:var(--ink-soft);margin-top:3px} (loom-v14-example.html:324,327; identical at src/app/globals.css:128,131)
- app: "<div className=\"trip\" style={{ fontSize: \"12px\", marginBottom: \"4px\" }}>" and "<div className=\"sent\" style={{ fontStyle: \"italic\", fontSize: \"14px\", color: \"var(--ink)\" }}>" (src/components/tabs/ReadTab.tsx:206, 209; repeated 272, 275)
- REGRESSION — the triple drops from 15px to 12px and the student's own sentence flips from ink-soft to full ink, inverting v14's emphasis (sentence quiet, triple loud) for no stated reason.

**trace persistence across tabs** · _behavior_

- v14: "let readSel=null;   /* {type:'concept'|'edge', id} — red is reserved for this */" — a module-level global; panels are hidden, not destroyed (loom-v14-example.html:827)
- app: "const [readSel, setReadSel] = useState<...>(null)" in a component mounted conditionally: "{activeTab === \"read\" && <ReadTab />}" (src/components/tabs/ReadTab.tsx:14; src/app/page.tsx:138)
- REGRESSION — tracing the spine, stepping to 04 Map, and returning silently clears the trace, the laid-out threads and the drafted note, where v14 kept them; the read rail also drops back from "trace" to "look".

**cloth width on resize** · _behavior_

- v14: "const W=Math.max((svg.getBoundingClientRect().width|0),720)" recomputed inside renderArcNav, which runs on every renderRead() (loom-v14-example.html:908, 839)
- app: "useEffect(() => { if (svgRef.current) { setWidth(...) } }, [])" — measured once on mount, no resize listener (src/components/svg/ClothMap.tsx:21-25)
- REGRESSION — after a window resize the arc map's node spacing stays at the old width forever (v14 self-corrected on the next interaction), and MapTab does add a resize listener (MapTab.tsx:49-56), so 03 and 04 now behave differently.

**cloth legend** · _copy_

- v14: lines 521-522: "coined term" and "sentence only"
- app: src/components/tabs/ReadTab.tsx:320-321: "named relation" and "unnamed — sentence only"
- REGRESSION — v9 explicitly reframed this move from "name it" to "coin a term (for reuse)" on the grounds that the naming already happened when the student wrote the sentence (v14 header note, lines 60-67); "named relation / unnamed" restores the retired framing and implies an unnamed thread is unfinished.

**reading-pane relation pill** · _copy_

- v14: line 946: "<span class=\"vpill loosev\">sentence</span>"
- app: src/components/tabs/ReadTab.tsx:207 (also 227, 273): "<span className=\"vpill loosev\">loose</span>"
- REGRESSION — "loose" is the v4 "loose pick" jargon that v8 plainened away; v14 labels these threads by what they are (a sentence), while "loose" reads as a deficiency the tool is marking.

**task subtitle — where this leads** · _missing_

- v14: line 513: "...The cloth shows you where to look — the reading is yours to write. From here, your weave feeds the work <i>outside</i> Loom: the concept map you draw by hand, and the chalk talk you build from it."
- app: src/components/tabs/ReadTab.tsx:296 "What argument runs through it? What does it keep returning to? What's missing? The cloth shows you where to look — the reading is yours to write."
- REGRESSION — the "where this leads" clause that v11 added to every tab is dropped here, so 03 no longer says that the weave is a middle step feeding hand-drawn map and chalk talk (04 Map and the walkthrough still say it, making 03 the odd one out).

**prompts card hint** · _copy_

- v14: line 528: "Click a prompt to light it up on the cloth and lay those threads out below. <b>You don't write anything here</b> — your one short read goes on the right."
- app: src/components/tabs/ReadTab.tsx:384 "Each is a question with a move — click to trace it on the cloth and lay your threads out as material below. You weave them into your read. You make the call."
- REGRESSION — the app keeps the you-decide stance ("You make the call") but loses v12's explicit one-writing-surface instruction ("You don't write anything here — your one short read goes on the right"), which was the whole point of simplifying the tab.

**"Your read" hint and prompt** · _copy_

- v14: line 534: "One short paragraph, in your own words: what is this reading about, and what holds it together? The tool never writes it for you."
- app: src/components/tabs/ReadTab.tsx:413 "The move: weave the findings into one narrative. The tool never writes it for you." plus line 414 "In a sentence — what is this reading <i>about</i>?"
- REGRESSION — three shifts in one place: "in your own words" disappears; "the findings" reads as the tool's findings rather than the student's own threads; and "In a sentence" contradicts both v14 and the app's own Map tab (MapTab.tsx:503 still asks for "one short paragraph"), so the same artifact is specified two different sizes on two tabs.

**"Your read" placeholder** · _copy_

- v14: line 535: "Write your read here — a paragraph is enough. Trace the prompts on the left first if you want your threads laid out to work from."
- app: src/components/tabs/ReadTab.tsx:417 "Write your read here, in your own words. Trace a prompt on the left to lay your threads out as material to weave from."
- REGRESSION (minor) — "a paragraph is enough" was the anxiety-lowering scale cue; the app keeps "in your own words" here but drops the ceiling, which matters more now that the hint above asks for "a sentence".

**copy button** · _copy_

- v14: line 538: "<button class=\"btn ghost mini\" id=\"copyReadBtn\" data-tip=\"copies your paragraph to the clipboard\">Copy your read</button>"
- app: src/components/tabs/ReadTab.tsx:424 "<button className=\"btn ghost mini\" onClick={handleCopyRead}>Copy as essay draft</button>"
- REGRESSION — v12 recorded the removal of "essay" as a deliberate simplification (v14 header note, lines 29-31: "READ tab simplified to ONE writing surface (\"Copy your read\", no \"essay\")"); re-labelling the button "Copy as essay draft" re-inflates a short read into an assignment deliverable.

### 04 · Map

**"show definitions" toggle persistence** · _behavior_

- v14: "function defsOn(){const t=document.getElementById('defToggle');return !t||t.checked;}" — DOM checkbox state survives tab switches (loom-v14-example.html:1025, 561)
- app: "const [showDefs, setShowDefs] = useState(true)" in a component unmounted on tab change (src/components/tabs/MapTab.tsx:45; src/app/page.tsx:141)
- REGRESSION (minor) — a student who turns definitions off, visits 03, and returns finds them back on; card widths and heights change under them as a result.

### Walkthrough

**no card for the two new tabs, and card 1 still says "three tabs"** · _missing_

- v14: loom-v14-example.html:1141 `loom:'Three tabs = three moves, in order: 01 Open · 02 Throw · 03 Read.'` and 1155 `…and export your graph (JSON) — yours to keep, submit, or explore further.` — accurate for a 4-tab tool with export in the header
- app: src/components/ui/FirstRunWalkthrough.tsx:7 `loom:'Three tabs = three moves, in order: 01 Open · 02 Throw · 03 Read.'` and FirstRunWalkthrough.tsx:21 `…and export your graph (JSON) — yours to keep, submit, or explore further.` — unchanged, while the app now ships six tabs (src/app/page.tsx:77-112) i…
- REGRESSION in effect (introduced by the production features, not by v14): the first-run guide never mentions the Library a student is supposed to read from, and tells them to "export your graph" without saying that export now lives on 05 Keep.

**"Next →" button weight** · _layout_

- v14: loom-v14-example.html:1164 `<button class="btn" id="guideNext">${last?'Start weaving':'Next →'}</button>` — the filled ink-on-paper primary (`.btn` at line 223)
- app: src/components/ui/FirstRunWalkthrough.tsx:97 `className="btn ghost mini"` with the same labels at line 101 `{isLast ? "Start weaving" : "Next →"}`
- REGRESSION — the only forward action in the overlay is demoted to an outlined mini button, so "skip" and "Next" now read at similar weight instead of v14's clear primary.

**"seen" flag is device-wide, not per account** · _behavior_

- v14: loom-v14-example.html:1167 `localStorage.setItem(KEY+'-seen','1')` with `KEY='loom-v14-example'` (line 607) — single-user file, so device scope is account scope
- app: src/components/ui/FirstRunWalkthrough.tsx:30 `localStorage.getItem("loom_has_seen_walkthrough")` / :46 `localStorage.setItem("loom_has_seen_walkthrough", "true")` — no user or course in the key, while the app is multi-user (src/components/providers/LoomProvider.tsx:52)
- REGRESSION in the production context — the second student to sign in on a shared/lab machine never gets the first-run walkthrough; keying it to session.user.id (or storing it server-side) restores v14's intent.

**.scrim and .guide CSS are now dead** · _layout_

- v14: loom-v14-example.html:401-413 `.scrim{…z-index:40;display:none;…}` `.guide{max-width:540px;…}` `.guide .gk{…}` `.guide h2{…display:flex;align-items:center;gap:11px}` etc., all actually used by `<div class="scrim" id="guideScrim"><div class="guide" id="guideBox"></div></div>` (line 575)
- app: src/app/globals.css:226-239 carries the same `.scrim` / `.guide` block, but no component uses those class names — src/components/ui/FirstRunWalkthrough.tsx:58-78 re-states every value as inline styles (`zIndex: 10000` instead of 40, and the `h2` drops v14's `display:flex;gap:11px`).
- REGRESSION of maintainability rather than pixels — the styles a human would naturally edit have no effect on the overlay they name, and the two copies are already drifting; either delete the dead block or have the component use the classes.

**"Three tabs = three moves"** · _missing_

- v14: line 1141: "Three tabs = three moves, in order: 01 Open · 02 Throw · 03 Read." — v14 itself has four tabs, and cards for 04 Map and "after loom" follow
- app: src/components/ui/FirstRunWalkthrough.tsx:7 same string, in an app with six tabs (00 Library · 01 Open · 02 Throw · 03 Read · 04 Map · 05 Keep); no guide card covers 00 Library or 05 Keep
- REGRESSION in effect (the words are v14's, the surroundings are not) — a first-run student is told the tool is three moves and is never introduced to the Library (where assisted capture lives) or to Keep (where their artifact lives, red line #5).

### Header / nav

**help "?" button — dead outside the signed-in state** · _behavior_

- v14: loom-v14-example.html:1327 `on('helpBtn','click',showGuide);` — the guide scrim (line 575 `<div class="scrim" id="guideScrim">`) is a permanent sibling of <main>, so "?" always opens the walkthrough
- app: src/components/ui/Header.tsx:33 `onClick={() => window.dispatchEvent(new Event("loom:walkthrough"))}` — but the only listener lives in src/components/ui/FirstRunWalkthrough.tsx:41, which is rendered at src/app/page.tsx:146 *inside* the `if (!session)` / `if (isLoading)` gate (page.tsx:53-72). Header…
- REGRESSION — on the signed-out screen and during the loading state the "?" is visible but silently does nothing, whereas v14's help button always opened the guide; the fix is to mount the walkthrough above the session gate (or hide the button when it can't work).

**help "?" — tooltip downgraded to a native title** · _copy_

- v14: loom-v14-example.html:431 `<button class="helpbtn" id="helpBtn" data-tip="how Loom works — the walkthrough" aria-label="how Loom works">?</button>`
- app: src/components/ui/Header.tsx:36 `title="how Loom works"` (no data-tip)
- REGRESSION — both the wording ("— the walkthrough", the part that tells a student what will happen) and the instant styled presentation are lost, reverting exactly the change v12 made on purpose.

**help "?" — the circle is gone** · _layout_

- v14: loom-v14-example.html:414-416 `.helpbtn{…background:none;border:1px solid var(--rule);border-radius:50%;width:28px;height:28px;…}` `.helpbtn:hover{border-color:var(--ochre);color:var(--ochre)}`
- app: src/components/ui/Header.tsx:38 `style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}` — the inline `border:"none"` overrides `.helpbtn`'s ring (src/app/globals.css:240), and `fontFamil…
- REGRESSION — the class it opts into is neutralised by its own inline styles, so the "?" reads as a bare floating glyph instead of the bordered button v14 designed; almost certainly unintended, since the CSS was carried over verbatim.

**step numbers lost the em dash** · _copy_

- v14: loom-v14-example.html:437-440 `<button data-mode="open" class="active"><span class="step">01 —</span>Open</button>` (…`02 —`Throw, `03 —`Read, `04 —`Map)
- app: src/app/page.tsx:81,87,93,99,105,111 `<span className="step">00</span> Library` / `<span className="step">01</span> Open` / … `<span className="step">05</span> Keep`
- REGRESSION (minor) — the nav now reads "01 Open" while the footer (page.tsx:17) and the walkthrough keys (FirstRunWalkthrough.tsx:8) still read "01 — OPEN" / "01 — open", so the poster-rule numbering is inconsistent with itself.

**about modal claims Loom generates the read** · _copy_

- v14: loom-v14-example.html:534 `<p class="hint">One short paragraph, in your own words: what is this reading about, and what holds it together? The tool never writes it for you.</p>` (and 528 `<b>You don't write anything here</b> — your one short read goes on the right.`)
- app: src/components/ui/Header.tsx:82 `<b>The Woven Graph:</b> View your interconnected graph ("Read") and generate an "axial read"—a synthesized narrative spanning multiple texts that you can instantly copy as a draft.` — contradicted eleven lines earlier by Header.tsx:75 `Nothing is auto-generated. The …
- REGRESSION worth fixing — it tells a student the tool will synthesize a narrative for them, which is the opposite of the product's central promise and of red line #7 ("render and count, never decide"); the modal even contradicts itself in the same panel.

**about modal backdrop breaks the app's scrim language** · _layout_

- v14: loom-v14-example.html:401 `.scrim{position:fixed;inset:0;background:rgba(26,25,22,.55);…}` — one ink scrim for every overlay
- app: src/components/ui/Header.tsx:48-49 `backgroundColor: "rgba(240, 240, 240, 0.8)", backdropFilter: "blur(4px)"` — a light, blurred backdrop, while the walkthrough (FirstRunWalkthrough.tsx:59) and the tab info dialogs (src/app/globals.css:215 `.info-scrim`) both use `rgba(26,25,22,.55)`
- REGRESSION (small, cosmetic) — three overlays in one app now use two different scrim treatments; matching the ink scrim costs one line.

**save-dot only confirms some saves** · _behavior_

- v14: loom-v14-example.html:647-648 `function flash(m){const d=document.getElementById('saveDot');d.textContent='· '+m+' ·';…setTimeout(()=>d.textContent='—',1300);}` / `function save(){try{localStorage.setItem(KEY,JSON.stringify(state));flash('saved');}catch(e){flash('export to save');}}` — every mutatio…
- app: src/components/ui/Header.tsx:23 `<span id="saveDot">{flashMsg ? `· ${flashMsg} ·` : "—"}</span>` is unchanged, but on the write side only the debounced read flashes success (src/components/providers/LoomProvider.tsx:242 `saveRead(text).then(() => flash("saved"))`); `editConcept` (LoomProvider.tsx:11…
- REGRESSION — a student editing a working definition or re-tiering a concept now gets no evidence it was kept, and the dot sits at "—" through work that v14 always acknowledged; the failure path (LoomProvider.tsx:91 `flash("could not save — reloaded")`) is a genuine improvement worth keeping either way.

**About panel — "generate an axial read"** · _extra_

- v14: no About panel; the governing statement is the design note at line 112: "The machine counts and sorts and poses generic questions; it never names what the reading means." (cf. line 133: "Nothing is generated, only walked.")
- app: src/components/ui/Header.tsx:82 "<b>The Woven Graph:</b> View your interconnected graph (\"Read\") and generate an \"axial read\"—a synthesized narrative spanning multiple texts that you can instantly copy as a draft."
- REGRESSION and a red line #1/#7 voice breach — the app's own About page tells the student the tool generates a synthesized narrative for them, contradicting both v14 and the paragraph three lines below it (Header.tsx:75 "Nothing is auto-generated. The tool only counts your own throws.").

**About panel — "apply different lenses"** · _extra_

- v14: no About panel; v14's register note at lines 582-583 says "REGISTERS — tongues offered as naming suggestions... The machine never picks."
- app: src/components/ui/Header.tsx:81 "Loom lets you apply different lenses (e.g., \"Cause & system\" vs. \"Stance & value\") to the same connections to see how meaning shifts."
- REGRESSION — it describes an interpretive capability the tool does not have (the tongues are inert suggestion chips the student may tap once while coining a term) and casts the tool, not the student, as the thing that shifts meaning.

### Global / CSS

**tooltips — the whole [data-tip] system is missing** · _missing_

- v14: loom-v14-example.html:393-398 `[data-tip]{position:relative}` + `[data-tip]:hover::after{content:attr(data-tip);…background:var(--ink);color:var(--paper);…}` (the v12 note at line 30 calls these "styled instant tooltips (data-tip) replacing hard-to-find native titles on key controls")
- app: src/app/globals.css has no `[data-tip]` rule anywhere (254 lines, checked in full), yet src/components/tabs/MapTab.tsx:353 `data-tip="tiers every concept primary in one gesture — you demote from there"` and MapTab.tsx:514 `data-tip="same map kit — now grouped by your tiers"` still ship the attribute…
- REGRESSION — two coaching tooltips a student can never see, and a deliberate v12 affordance silently deleted; re-adding the ~6 lines of CSS at the end of globals.css restores them.

**tabs unmount instead of hiding** · _behavior_

- v14: loom-v14-example.html:234 `.panel{display:none} .panel.active{display:block}` with all four sections permanently in the DOM (lines 445, 475, 511, 546) and pair state in module scope, so a half-typed bench sentence survives a tab switch
- app: src/app/page.tsx:134-135 `<div className={`panel ${activeTab === "throw" ? "active" : ""}`}>{activeTab === "throw" && <ThrowTab />}</div>` (same pattern for every tab) — ThrowTab holds `pairA`/`pairB`/`sentence` in local state (src/components/tabs/ThrowTab.tsx:37-40)
- REGRESSION — a student who picks two concepts, starts a sentence, hops to 01 to re-read a passage and comes back finds the bench empty and the draft gone, where v14 kept it; it also drops the traced-prompt selection on 03.

**#bText and #yourRead2 minimum heights missing** · _layout_

- v14: loom-v14-example.html:381-382 `#yourRead2{min-height:170px}` and `#bText{min-height:150px}`
- app: src/app/globals.css:207 keeps only `#yourRead{min-height:170px}`; the map-tab read box (src/components/tabs/MapTab.tsx:504-505 `<textarea id="yourRead2" …>`) and the passage box (src/components/tabs/OpenTab.tsx:242-243 `<textarea placeholder="paste or type the passage…"`, which no longer even carrie…
- REGRESSION — the two boxes v14 sized to invite a long paste and a full paragraph now open at ~40% of that height, which reads as "a line or two will do" exactly where the design wanted the opposite.

**Browser tab title still says v8** · _copy_

- v14: loom-v14-example.html:6 `<title>Loom v14 — worked example (Star &amp; Griesemer)</title>`
- app: src/app/layout.tsx:8 `title: "Loom v8",` (description: "Lay the warp, throw the weft" matches the wordmark strapline)
- REGRESSION — every student's browser tab, bookmark and printout is labelled with a version the app left behind several rewrites ago; noted as global chrome even though layout.tsx sits just outside the named file list.

**concept prompt** · _copy_

- v14: line 454-455: label "Concept — a short noun phrase naming the idea", title "a noun phrase, not a sentence — if the author names it, use her name for it"
- app: src/components/pdf/CaptureModal.tsx:74 "Concept — what's this bit about?"
- REGRESSION — the assisted-capture doorway asks a question that invites a summary sentence ("what's this bit about?") and never states the noun-phrase rule at all, so the two capture paths coach differently for the same object; the modal also has no working-definition field, so the v11 swap (concept = noun phrase / gloss = working definition) is unavailable there.

## B. Deliberate app changes (candidates to keep)

Places the app knowingly departs from v14. Listed so the departure is a choice on the record, not drift.

### 01 · Open

**coding log — row unit and ordering** · _behavior_

- v14: loom-v14-example.html:707-712 — `box.innerHTML=[...state.bytes].reverse().map(b=>{ ... <span class="lconcept">${esc(short(c?c.label:'?',46))}</span> <span class="lsrc">${esc(short(b.source||'—',34))}</span>` (one row per BYTE, newest byte on top, header = concept label + source citation)
- app: src/components/tabs/OpenTab.tsx:350,358 — `state.concepts.slice().reverse().map(concept => {` … `<div className="lsrc">{conceptBytes.length} bytes</div>` (one row per CONCEPT, newest concept on top, header = concept label + byte count)
- DELIBERATE app improvement — grouping bytes under their concept matches the card's own 'your growing pile of concepts' copy and surfaces concepts that have no byte yet, but note it silently redefines the card's 'newest on top' promise (a new byte on an old concept no longer rises) and replaces the visible source citation in each row header with a count.

**coding log — empty state trigger** · _behavior_

- v14: loom-v14-example.html:706 — `if(!state.bytes.length){box.innerHTML=emptyHtml('the log fills as you lay warp');return;}` (empty state shows whenever there are no bytes, even if concepts exist)
- app: src/components/tabs/OpenTab.tsx:336 — `{state.concepts.length === 0 && (` … `<span className="cap">the log fills as you lay warp</span>`
- DELIBERATE app improvement — it fixes a real v14 hole where a concept added via 'add a concept with no byte yet' was invisible in the log; caption copy is unchanged.

**Add byte — which fields clear** · _behavior_

- v14: loom-v14-example.html:1246 — `['bText','bLoc','bConcept','bDef'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';})` (Location IS cleared; only Source persists)
- app: src/components/tabs/OpenTab.tsx:48-51 — `// reset form (keep source/location if user wants to enter multiple passages from same place)` then only `setContent("")`, `setConceptLabel("")`, `setWorkingDef("")`
- DELIBERATE app improvement for capturing several passages from one page, at the cost that a stale page number rides along onto the next byte unless the student notices.

**Source placeholder** · _copy_

- v14: loom-v14-example.html:451 — `placeholder="Star &amp; Griesemer, Boundary Objects"`
- app: src/components/tabs/OpenTab.tsx:224 — `placeholder="Suchman, Plans and Situated Actions"`
- DELIBERATE app change — a different exemplar source, harmless in itself, but it no longer rhymes with the worked example (Star & Griesemer) the student can load two columns away at OpenTab.tsx:345.

**Location placeholder** · _copy_

- v14: loom-v14-example.html:452 — `placeholder="p. 393"`
- app: src/components/tabs/OpenTab.tsx:236 — `placeholder="ch. 3, p. 49"`
- DELIBERATE app improvement — the two-part example demonstrates the 'page, chapter, or timestamp' range that v14 only conveyed through the now-missing tooltip.

**scaffold position** · _layout_

- v14: loom-v14-example.html:456-459 — `<div id="codeScaffold"></div>` sits AFTER the Concept row and the Working-definition row, immediately above `<button class="btn" id="addByteBtn">`
- app: src/components/tabs/OpenTab.tsx:251-295 — `<div className="scaffold" …>` is nested INSIDE the Passage `form-row`, i.e. before the Concept and Working-definition fields
- DELIBERATE app improvement — the scaffold now sits between the passage and the concept field it is coaching, which is where the chips (which read from the passage) have to live; the two `snote` paragraphs themselves are verbatim v14 (v14:699-700 vs app:253,256).

**passage word chips + 'still stuck' ladder** · _extra_

- v14: no rendered equivalent — `contentWords` (loom-v14-example.html:678) and the `data-codeword` handler (:1264) exist but `renderCodeScaffold` (:696-702) never emits chips, so no student ever sees them
- app: src/components/tabs/OpenTab.tsx:258-294 — `Stuck naming it? <b>Point at the words in the passage that carry the point</b> and tap to build the concept from the author's own words.`, the chip row at :262-274, the fallback `…paste a passage above and its words appear here to tap.` (:277), and the `<de…
- DELIBERATE app improvement — it ships v14's dead code as a working scaffold and stays inside red line #7 (it offers words from the student's own passage and never picks), though it is a large amount of new instructional copy that has never been reviewed against v14.

**concept rename inside the log row** · _extra_

- v14: loom-v14-example.html:717-718 — `<div class="label" style="letter-spacing:.08em">Concept</div><div style="font-size:15px;margin:2px 0 2px">${esc(c?c.label:'?')}</div>` — the concept label is read-only text
- app: src/components/tabs/OpenTab.tsx:378-398 — an editable `<input defaultValue={concept.label} onBlur=…>` with a duplicate check that flashes `That name is already one of your concepts.` and, on success, `renamed`
- DELIBERATE app improvement — it delivers on the scaffold's own promise 'Rename anything later' (OpenTab.tsx:253, verbatim from v14:699), which v14 itself never actually implemented.

**byte passage quoting** · _layout_

- v14: loom-v14-example.html:716 — `<div class="passage">${esc(b.text)}</div>` (no quotation marks; `.passage` CSS at :267 adds none)
- app: src/components/tabs/OpenTab.tsx:414 — `<div className="passage">"{b.content}"</div>`
- DELIBERATE app change, minor — wrapping the passage in quotes reinforces that it is the author's words and is consistent with the thread sentence rendering, but it is an added glyph pair v14 did not have.

**Coding log is keyed by concept, not by byte** · _behavior_

- v14: line 707: "[...state.bytes].reverse().map(...)" — one row per BYTE, newest byte first, showing concept + source; matching line 463 "Everything you capture lands here, newest on top"
- app: src/components/tabs/OpenTab.tsx:350 "state.concepts.slice().reverse().map(concept => {...}" — one row per CONCEPT with a "{n} bytes" count, under the unchanged line 332 "Everything you capture lands here, newest on top — your growing pile of concepts."
- DELIBERATE app improvement (a concept-keyed log matches "your growing pile of concepts" and enables inline rename), but the retained v14 copy "newest on top" is now false for a passage filed under an existing concept — the copy should be reconciled with the new structure.

### 02 · Throw

**palette picked tag** · _copy_

- v14: loom-v14-example.html:739 — `${picked?`<span class="pickedtag">picked</span>`:…}` (renders as 'PICKED' via the uppercase rule at :278)
- app: src/components/tabs/ThrowTab.tsx:217 — `<div className="pickedtag">PICK {pairA === c.id ? 1 : 2}</div>` (renders as 'PICK 1' / 'PICK 2')
- DELIBERATE app improvement — numbering the picks tells the student which concept landed in From and which in To, which v14 only revealed by looking down at the slots.

**swap control** · _copy_

- v14: loom-v14-example.html:750 — `<span class="arr">⟶</span><button id="swapBtn" title="swap direction">⇄</button>`
- app: src/components/tabs/ThrowTab.tsx:248-249 — `<span className="arr">→</span>` and `<button onClick={handleSwap}>swap</button>`, with no `title`
- DELIBERATE app change, arguably an improvement — the word 'swap' is more legible than the ⇄ glyph, but the `title="swap direction"` tooltip that explained the button actually reverses From/To is gone.

**opener chip insertion** · _behavior_

- v14: loom-v14-example.html:1280-1283 — `ta.value=ta.value.trim()?ta.value.replace(/\s+$/,'')+' '+o+' ':o+' '; ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);` (APPENDS the opener at the caret end and returns focus to the textarea)
- app: src/components/tabs/ThrowTab.tsx:143-151 — `handleOpenerClick` strips any leading opener then `setSentence(opener + ' ' + newSentence)` (PREPENDS/replaces the sentence's opening phrase; no focus restored)
- DELIBERATE app improvement in intent — openers are sentence-shapes, so making them a swappable prefix is truer to the design than v14's mid-sentence append; the loss is that focus/caret no longer return to the textarea, so the student must click back in to keep typing.

**removing a thread** · _behavior_

- v14: loom-v14-example.html:1313-1314 — `if(e.target.dataset.delEdge){const id=e.target.dataset.delEdge; state.edges=state.edges.filter(x=>x.id!==id);…}` — no confirmation
- app: src/components/tabs/ThrowTab.tsx:333 — `if (window.confirm("Are you sure you want to remove this thread?")) {`
- DELIBERATE app improvement — a thread is a written sentence the student can't get back, so a confirm is warranted; the wording is generic boilerplate next to v14's voice, and it is worth noting removing a byte (OpenTab.tsx:432) still has no confirm, so the app is now inconsistent with itself.

**undo-redo for coined terms** · _extra_

- v14: no equivalent — v14 has no keyboard undo anywhere; `ed.handle=h;` (loom-v14-example.html:1312) is final
- app: src/components/tabs/ThrowTab.tsx:45-86 — a window `keydown` listener implementing Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y over `undoStack`/`redoStack`, replaying `editEdge(action.edgeId, { handle: … })`
- DELIBERATE app improvement, but unannounced and narrow — nothing in the UI tells the student it exists, it covers only term-coining (not throws, bytes or concepts), and because the listener is global to the tab a student who expects Ctrl+Z to undo their last throw will instead silently revert a term.

**picked tag on the warp palette** · _copy_

- v14: line 739: "<span class=\"pickedtag\">picked</span>"
- app: src/components/tabs/ThrowTab.tsx:217: "<div className=\"pickedtag\">PICK {pairA === c.id ? 1 : 2}</div>"
- DELIBERATE app improvement — numbering the picks makes the From/To mapping legible, which matters because direction is meaningful in a proposition.

**opener chips** · _behavior_

- v14: line 1282: "ta.value=ta.value.trim()?ta.value.replace(/\\s+$/,'')+' '+o+' ':o+' ';" — the opener is appended at the end of whatever is typed
- app: src/components/tabs/ThrowTab.tsx:143-151 — any leading opener is stripped and the new one is prepended: "setSentence(opener + ' ' + newSentence);"
- DELIBERATE app improvement — these are sentence-openers, so prepending (and swapping one for another) matches what the chips claim to be, where v14's append could strand "this means that" mid-sentence.

### 03 · Read

**rail (look · trace · question · write)** · _extra_

- v14: panel-read contains no rail element at all — markup goes tasktitle → tasksub → mapbar (loom-v14-example.html:511-517); only dead JS references it: "document.querySelectorAll('#readRail .rstep')" (loom-v14-example.html:903)
- app: "<div className=\"rail\" id=\"readRail\">{[\"look\", \"trace\", \"question\", \"write\"].map(...)}" (src/components/tabs/ReadTab.tsx:298-305)
- DELIBERATE app improvement — it ships the rail v14 computed but never rendered (updateReadRail was orphaned), and the step logic matches v14's wrote/gap/sel ladder exactly.

**legend, third swatch** · _copy_

- v14: "<span class=\"sw\" style=\"border-top:2px dashed var(--grey)\"></span>sentence only" (loom-v14-example.html:522)
- app: "<span className=\"sw\" style={{borderTop: \"2px dashed var(--grey)\"}}></span>unnamed — sentence only" (src/components/tabs/ReadTab.tsx:321)
- DELIBERATE app improvement — the added "unnamed —" makes the dashed arc's meaning explicit without changing what it denotes.

**extra prompt line above the textarea** · _extra_

- v14: no equivalent element — v14 goes straight from the hint (loom-v14-example.html:534) to <textarea id="yourRead"> (loom-v14-example.html:535)
- app: "<p className=\"readq\">In a sentence — what is this reading <i>about</i>?</p>" (src/components/tabs/ReadTab.tsx:414)
- DELIBERATE app improvement — it restores half of the question v14 put in the hint, though it asks for "a sentence" where v14 asked for "one short paragraph", so the two app strings now disagree about length.

**"Your read" textarea placeholder** · _copy_

- v14: "Write your read here — a paragraph is enough. Trace the prompts on the left first if you want your threads laid out to work from." (loom-v14-example.html:535)
- app: "Write your read here, in your own words. Trace a prompt on the left to lay your threads out as material to weave from." (src/components/tabs/ReadTab.tsx:417)
- DELIBERATE app rewrite of equivalent content, but it loses v14's sizing cue ("a paragraph is enough") and its "first" ordering hint — worth folding one of those back in.

**"How these prompts are made" info dialog** · _extra_

- v14: no equivalent — the heading is just "<h2>What the cloth shows you <span class=\"n\">counted, not judged</span></h2>" (loom-v14-example.html:527)
- app: info button plus modal: "<h2 id=\"clothInfoTitle\">How these prompts are made</h2>" with the spine/centre/gap definitions and "No agent writes the reading or decides what it means. The tool points; you interpret." (src/components/tabs/ReadTab.tsx:327-383)
- DELIBERATE app improvement — it makes the counting rules behind the prompts inspectable, which is exactly the transparency red line #7 implies, and it writes nothing.

**look·trace·question·write rail** · _extra_

- v14: lines 899-903 define updateReadRail() querying '#readRail .rstep', but the Read panel markup (lines 511-543) contains no rail element — the v7 rhythm rail is missing from the shipped file
- app: src/components/tabs/ReadTab.tsx:298-305 renders the rail ("look" · "trace" · "question" · "write") driven by the same railN logic
- DELIBERATE app improvement — it restores the rhythm rail that v14's own JavaScript expects and that the walkthrough advertises ("Look · trace · question · write"), fixing a v14 omission rather than departing from it.

### 04 · Map

**"make all primary" control** · _extra_

- v14: the Sort card header is only "<h2>Sort <span class=\"n\" id=\"triageCount\"></span></h2>" (loom-v14-example.html:555)
- app: "<button className=\"btn ghost mini\" id=\"makeAllPrimary\" ... data-tip=\"tiers every concept primary in one gesture — you demote from there\">make all primary</button>" with a confirm() guard (src/components/tabs/MapTab.tsx:349-355, 166-172)
- DELIBERATE app improvement — it is one student gesture that does chip-by-chip work in bulk, confirms before overwriting existing tiers, and the flash "all primary — re-sort any that aren't" keeps the judgment with the student.

**sort-list reordering** · _extra_

- v14: rows are plain and always in capture order: "box.innerHTML=state.concepts.map(c=>`<div class=\"trow\"><span class=\"tlabel\">${esc(c.label)}</span>..." (loom-v14-example.html:1036-1037)
- app: a drag handle with keyboard support plus a new hint: "Drag a row by its handle — or focus the handle and press ↑ / ↓ — to re-order this list. That re-sequences the list only; the table, the counts and the map kit are untouched." (src/components/tabs/MapTab.tsx:358, 376-402)
- DELIBERATE app improvement — it adds a student-authored view ordering that is explicitly scoped ("the map itself is unchanged", MapTab.tsx:195/212) and, per the code comment, writes only on a real gesture.

**when the "arrange" rail step lights** · _behavior_

- v14: "const done1=n.p+n.s+n.t>0,done2=done1&&Object.keys(state.positions).some(id=>placed.includes(id))" — state.positions is filled by the renderer itself for every newly tiered card (loom-v14-example.html:1132, 1058-1059)
- app: "const done2 = done1 && Object.keys(stored).some(id => placedIds.includes(id))" where stored = state.views.cardTable.positions, written only on a card drop (src/components/tabs/MapTab.tsx:145, 292)
- DELIBERATE app improvement — in v14 "arrange" lit the instant a card was auto-placed (the student had arranged nothing); the app lights it only after an actual drag, which is what the step claims and what red line #7 requires.

**default card positions** · _behavior_

- v14: "if(!state.positions[c.id]){const[y0,y1]=bandRange(c.tier,cardH(c)); state.positions[c.id]={x:...,y:...};}" — the auto position is written into state and persisted by the next save() (loom-v14-example.html:1058-1060, 1117)
- app: "// Effective positions: stored (student-authored) where present, else v14's 4-column drift grid per band — computed for display, discarded (red line #7)." (src/components/tabs/MapTab.tsx:95-122)
- DELIBERATE app improvement demanded by red line #7 — with one visible side effect worth knowing: because the drift grid is recomputed each render from per-tier index, tiering a new concept can shift the default spot of untouched cards, where v14 froze each card's first auto spot.

**line bend limits** · _behavior_

- v14: "const cx=(a.x+b.x)/2+bend.dx,cy=(a.y+b.y)/2+bend.dy;" — unclamped (loom-v14-example.html:1069)
- app: "const cx = Math.max(10, Math.min(W - 10, (a.x + b.x) / 2 + bend.dx))" / "const cy = Math.max(10, Math.min(TABLE_H - 10, ...))" (src/components/tabs/MapTab.tsx:453-454)
- DELIBERATE app improvement — v14 let a hard drag (the bend moves at 2x pointer delta) fling a proposition's curve and its label off the table with no way back; clamping keeps the student's own bend visible without overriding it.

**multi-pointer and cancelled drags** · _behavior_

- v14: "svg.onpointerdown=e=>{const g=e.target.closest('[data-card]'); if(g){dragCard=g.dataset.card;...}" — no pointer-id tracking, no pointercancel handling (loom-v14-example.html:1095-1102)
- app: "if (dragCard.current || dragEdge.current) return" plus "activePointer.current" gating and "onPointerCancel={abandonDrag} onLostPointerCapture={abandonDrag}" (src/components/tabs/MapTab.tsx:223-224, 252, 431-432)
- DELIBERATE app improvement — a second finger or an interrupted touch drag no longer teleports a card, and an abandoned gesture persists nothing rather than leaving a half-moved card saved.

**sort-list re-ordering** · _extra_

- v14: no equivalent — v14's triage list renders in state.concepts order and cannot be re-ordered (renderTriage, lines 1032-1042)
- app: src/components/tabs/MapTab.tsx:358 "Drag a row by its handle — or focus the handle and press ↑ / ↓ — to re-order this list. That re-sequences the list only; the table, the counts and the map kit are untouched."
- DELIBERATE app improvement — a student gesture that writes only view order, and the copy is explicit that no map meaning changes, which is precisely the red line #7 distinction stated in student-facing words.

### 05 · Keep

**whole tab has no v14 equivalent** · _extra_

- v14: no equivalent — v14's entire export/import/reset story is the three header buttons at loom-v14-example.html:428-430 plus `on('resetBtn','click',()=>{if(confirm('Clear everything and start blank? This wipes the current cloth from this browser (Export first if you want to keep it).')){…location.reload…
- app: src/components/tabs/KeepTab.tsx:75-76 `<p className="tasktitle">Keep your work.</p>` / `<p className="tasksub">The weave is yours — your concepts, your passages, your threads, your read, your arrangement. This page is where you take it out of Loom, bring it back in, or clear the table and start agai…
- DELIBERATE app improvement — it narrates the artifact in the same tasktitle/tasksub idiom v14 uses on 03 and 04 (lines 512-513, 547-548) and makes red line #5 legible instead of implied.

**import is now validated and previewed** · _behavior_

- v14: loom-v14-example.html:1324 `rd.onload=()=>{try{state=migrate(JSON.parse(rd.result));…}catch(err){alert('That file did not parse as JSON.');}}` — replaces the cloth with no confirmation
- app: src/components/tabs/KeepTab.tsx:53-56 `if (!confirm("Importing replaces your current cloth with " + parsed.concepts.length + " concepts, " + parsed.bytes.length + " passages, " + parsed.edges.length + " threads. Your weaving history is kept. Continue?")) return`
- DELIBERATE app improvement — v14 could silently destroy a student's work from a mis-picked file; the app reads, counts, and asks first.

**.md export added alongside .json** · _extra_

- v14: no equivalent — loom-v14-example.html:1322 offers only `a.download=name+'-loom.json'`
- app: src/components/tabs/KeepTab.tsx:85 `<button className="btn ghost" onClick={handleExportMd}>Export .md</button>`, framed at KeepTab.tsx:82 `<b>.md</b> is a readable outline of the same work … It is <b>not</b> re-importable: Loom cannot rebuild a cloth from it.`
- DELIBERATE app improvement — the .json stays the primary, round-tripping artifact (red line #5) and the .md is explicitly labelled lossy, so the addition does not blur which file is the submittable one.

### Walkthrough

**progress dots are clickable** · _behavior_

- v14: loom-v14-example.html:1163 `<div class="dots">${GUIDE.map((_,i)=>`<span class="dot ${i===guideStep?'on':''}"></span>`).join('')}</div>` — inert indicators (`.guide .dot` at line 411 has no cursor/handler)
- app: src/components/ui/FirstRunWalkthrough.tsx:89-93 `<span key={i} style={{…cursor: "pointer"}} onClick={() => setStep(i)} />`
- DELIBERATE app improvement worth keeping — lets a student jump back to the card about the tab they are on, with no downside.

**auto-open on first run** · _behavior_

- v14: loom-v14-example.html:608 `const AUTO_GUIDE=false;   /* worked example — don't pop the walkthrough */` and 1329 `if(AUTO_GUIDE){try{if(!localStorage.getItem(KEY+'-seen'))showGuide();}catch(e){}}` — the reference file never pops it
- app: src/components/ui/FirstRunWalkthrough.tsx:29-34 `const hasSeen = localStorage.getItem("loom_has_seen_walkthrough"); if (!hasSeen) { setTimeout(() => setShow(true), 0); }` — always pops for a new student
- DELIBERATE and correct — v14's flag is off only because that file is the worked example; the v7 design note (loom-v14-example.html:96-97, "A dismissible overlay … Shown once (localStorage)") is what the app implements.

**first-run behavior** · _behavior_

- v14: line 608: "const AUTO_GUIDE=false;   /* worked example — don't pop the walkthrough */" — the shipped file never opens the guide automatically; it is reachable only from the header "?"
- app: src/components/ui/FirstRunWalkthrough.tsx:29-34 — the guide opens automatically when localStorage key "loom_has_seen_walkthrough" is absent
- DELIBERATE app improvement — it restores v7's stated first-run design ("A dismissible overlay... Shown once (localStorage)", v14 lines 92-95) that the worked-example file switched off for demo purposes.

### Header / nav

**new mobile breakpoint changes the footer from pinned to inline** · _layout_

- v14: no equivalent — loom-v14-example.html:339-340 `footer{position:fixed;left:0;right:0;bottom:0;…}` at every width, with `main{padding:24px 26px 86px}` (line 233) reserving room for it
- app: src/app/globals.css:148-161 `@media (max-width: 900px){ … nav{padding:0 10px;flex-wrap:nowrap;overflow-x:auto;…} main{padding:18px 14px 20px} footer{position:static;padding:10px 14px;z-index:1} }`
- DELIBERATE app improvement — six tabs cannot wrap gracefully on a phone and a pinned footer eats scarce height; the trade a human should note is that below 900px the "01 — OPEN / LAY THE WARP" orientation caption is no longer always on screen.

**"about" modal — no v14 equivalent** · _extra_

- v14: no equivalent; v14's only explanatory overlay is the six-card walkthrough (loom-v14-example.html:1138-1165), written in second person to a student
- app: src/components/ui/Header.tsx:26-31 `<span onClick={() => setShowAbout(true)} …>about</span>` opening a modal whose voice is third-person marketing: Header.tsx:64 `Loom is a tool for emergent sense-making and collaborative synthesis. It provides a space where reading, capturing, and connecting ideas …
- DELIBERATE addition, but worth a human's judgement — it introduces a second, differently-voiced explanation of the tool next to the walkthrough, and nothing in v14 or the spec asks for it.

### Global / CSS

**.btn.mini restyled** · _layout_

- v14: loom-v14-example.html:225 `.btn.mini{font-size:10px;padding:5px 9px;letter-spacing:.05em}`
- app: src/app/globals.css:27 `.btn.mini{font-size:11px;padding:7px 10px;letter-spacing:.05em;min-height:36px}`
- DELIBERATE app improvement (36px touch targets for the phone/tablet reading path), at the cost of v14's quieter secondary-button scale — worth keeping, but it is a divergence a human should ratify since mini buttons appear on every tab.

**new component vocabulary with no v14 equivalent** · _extra_

- v14: no equivalent — v14's only overlay CSS is `.scrim`/`.guide` (lines 401-413) and its only circular control is `.helpbtn` (414-416)
- app: src/app/globals.css:210-225 adds `.heading-with-info`, `.iconbtn`, `.cloth-info-btn`, `.info-scrim`, `.info-dialog`, `.info-close` (per-card explainer dialogs) and globals.css:243-254 adds `.thandle`, `.trow.dragging`, `.trow.dropbefore`, `.trow.dropafter` (drag handle for the sort list)
- DELIBERATE app improvement — all of it is built from v14's own tokens (var(--rule), var(--ochre), the same 6px radius and 18px/50px shadow as `.guide`) and it is appended at the end of the file rather than restyling anything inherited, so the page still reads as one system.

## C. Production-only, no v14 equivalent

Auth, courses, the PDF library, persistence, the Keep tab, the history panel. Nothing to reconcile — noted for completeness.

### 01 · Open

**working definition — save timing** · _behavior_

- v14: loom-v14-example.html:1317 — `if(e.target.dataset.conceptDef){const c=conceptById(e.target.dataset.conceptDef);if(c){c.def=e.target.value;save();}}` (persists on every keystroke)
- app: src/components/tabs/OpenTab.tsx:405-409 — `onBlur={(e) => { if (e.target.value !== (concept.def ?? "")) { editConcept(concept.id, { def: e.target.value }) } }}`
- PRODUCTION NECESSITY — per-keystroke server writes aren't viable, so blur-commit is the right adaptation; the residual cost is that a definition typed and then abandoned without blurring is lost.

**'Do this' line** · _copy_

- v14: loom-v14-example.html:449 — `Do this — paste a passage worth keeping, name its concept, then gloss it in your own words.`
- app: src/components/tabs/OpenTab.tsx:217 — `Do this — paste a passage here, or select text in a Library PDF. Then name the concept it evidences, and gloss it in your own words.`
- PRODUCTION NECESSITY — the Library path has no v14 equivalent and has to be named here; the rewrite does drop 'worth keeping', which was the selection criterion.

**'Two ways to capture a byte' info dialog** · _extra_

- v14: no equivalent anywhere in loom-v14-example.html (v14 has only the global `helpBtn` walkthrough at :431)
- app: src/components/tabs/OpenTab.tsx:174-216 — info button on the `Capture a byte` heading opening a modal: `same byte, different doorway` / `Two ways to capture a byte` / `<b>Assisted capture</b> starts in the Library…` / `Nothing is generated. Loom helps you carry the quote; you make the code.`
- PRODUCTION NECESSITY — the manual/Library fork does not exist in v14 and needs explaining somewhere, and the closing line is a correct restatement of red line #7.

**worked-example loader in the empty log** · _extra_

- v14: loom-v14-example.html:644-645 — `function seed(){return Object.assign(blank(),JSON.parse(JSON.stringify(EXAMPLE)));} let state=seed();` — the worked example IS the default state, there is no loader control
- app: src/components/tabs/OpenTab.tsx:342-349 — `<button className="btn ghost mini" onClick={handleLoadExample} …>load the worked example (Star &amp; Griesemer)</button>` with hint `a finished weave to poke at — explore it, then Reset to start your own.`
- PRODUCTION NECESSITY — with per-student persistence you cannot seed everyone's account with the example, so it becomes an opt-in button; the copy is new but accurate.

**byte row 'goto' action** · _extra_

- v14: loom-v14-example.html:725 — the byte row's only action is `<span class="rm" data-del-byte="${b.id}">remove byte</span>`
- app: src/components/tabs/OpenTab.tsx:418-427 — an extra `goto` button, `disabled={!b.sourceId && !b.source}`, `title={b.sourceId || b.source ? "Open this byte in the library PDF" : "No library source linked for this byte"}`
- PRODUCTION NECESSITY — jumping back to the highlighted passage in the PDF library has no v14 counterpart; the disabled-state title correctly explains why it is greyed.

### 03 · Read

**"The cloth, over time" history panel** · _extra_

- v14: no equivalent anywhere in the file — panel-read ends at the two-card row (loom-v14-example.html:542-543)
- app: "<div style={{ marginTop: \"22px\" }}><HistoryPanel /></div>" rendering "replay how your weave grew — counted from your own acts, never judged" (src/components/tabs/ReadTab.tsx:430-432; src/components/ui/HistoryPanel.tsx:265-268)
- PRODUCTION NECESSITY — it replays a server-side graph event log that only exists because the app persists per-user work; v14 had no event record to replay, and the panel is read-only so it cannot violate red line #7.

### 04 · Map

**stored card x units** · _behavior_

- v14: "state.positions[dragCard]={x:Math.max(10,Math.min(W-w-10,pt.x-dragOff.dx)),y:...}" — absolute pixels (loom-v14-example.html:1107)
- app: "positions: { ...stored, [id]: { x: pos.x / usableW, y: pos.y } }" with legacy px detected by "p.x > 1.5" on read (src/components/tabs/MapTab.tsx:292, 106-111)
- PRODUCTION NECESSITY — a persisted, multi-device artifact cannot store viewport pixels the way a single-session localStorage demo could; the fraction keeps a saved layout meaningful at another window width.

### 05 · Keep

**reset confirm copy** · _copy_

- v14: loom-v14-example.html:1321 `confirm('Clear everything and start blank? This wipes the current cloth from this browser (Export first if you want to keep it).')` — then `localStorage.removeItem(KEY)` and `location.reload()`
- app: src/components/tabs/KeepTab.tsx:68 `confirm("Clear everything and start blank? This wipes your cloth for this course (Export first if you want to keep it). Your weaving history is kept.")` — then `resetAll()` in place, no reload (LoomProvider.tsx:319-324)
- PRODUCTION NECESSITY — "this browser" is false once the cloth lives on a server under a course, and the added history sentence is required because the app keeps a development record v14 never had; the v14 phrasing is otherwise preserved verbatim.

**export, import, reset** · _extra_

- v14: header buttons only, with tooltips — line 429: "download your weave as a .json file — your submittable, portable artifact"; line 1321 reset confirm "Clear everything and start blank? This wipes the current cloth from this browser (Export first if you want to keep it)."
- app: src/components/tabs/KeepTab.tsx:76 "The weave is yours — your concepts, your passages, your threads, your read, your arrangement. This page is where you take it out of Loom, bring it back in, or clear the table and start again. Nothing here happens without asking you first."
- PRODUCTION NECESSITY (persistence, two export formats, course-scoped reset) executed as a DELIBERATE improvement — it satisfies red line #5 more legibly than v14's tooltips by explaining what each file is and what reset does and does not touch.

### 00 · Library

**no task framing** · _missing_

- v14: every tab leads with a plain task line — e.g. line 512 "Read the whole cloth." + 513 subtitle, line 548 "Lay out your map." + subtitle, line 449 "Do this — paste a passage worth keeping..." (v11 note, lines 42-43: "COACHING EVERYWHERE: per-tab gist + where-this-leads lines")
- app: src/components/tabs/LibraryTab.tsx:96-107 — the tab opens straight into a list of cards; the only student-facing copy is "Loading library…", "No readings in the library yet.", "Read in Loom" and "Download PDF"
- PRODUCTION NECESSITY (the PDF library has no v14 counterpart) but with a coaching gap worth closing — it is the only tab with no task line, no "do this", and no statement of where reading in Loom leads (select text → capture a byte → 01 Open).

### Header / nav

**two new tabs** · _extra_

- v14: loom-v14-example.html:436-441 four buttons only (Open/Throw/Read/Map); loom-v14-example.html:1170 `const FOOT={open:['01 — OPEN','LAY THE WARP'],throw:['02 — THROW','ONE THREAD AT A TIME'],read:['03 — READ','PULL A THREAD'],map:['04 — MAP','THE CARD TABLE']};`
- app: src/app/page.tsx:15-22 adds `library: ["00 — LIBRARY", "CHOOSE A READING"]` and `keep: ["05 — KEEP", "YOURS TO TAKE"]`; nav buttons at page.tsx:77-112. The four inherited pairs match v14 word for word.
- PRODUCTION NECESSITY — the PDF library and the export/import/reset surface have no v14 equivalent, and the added caption pairs follow v14's own "NN — NAME / VERB PHRASE" grammar exactly.

**student name, Import, Export, Reset all removed from the header** · _missing_

- v14: loom-v14-example.html:427-430 `<div class="field"><span class="label">Student</span><input id="student" placeholder="your name" …>` · `<button class="btn ghost" id="importBtn" data-tip="load a previously exported .json weave">Import</button>` · `<button class="btn" id="exportBtn" data-tip="download …
- app: src/components/ui/Header.tsx:14-42 has none of them — the name comes from the session (src/components/ui/AuthButton.tsx:17 `<span className="label">{session.user?.name || session.user?.email}</span>`, provider field src/components/providers/LoomProvider.tsx:336 `studentName: session?.user?.name || "…
- PRODUCTION NECESSITY for the student field (auth supplies the name) and a DELIBERATE improvement for the move to 05 Keep (KeepTab.tsx:3-5 states the reason), with one thing for a human to weigh: export is now two clicks from any tab instead of one click always on screen — still accessible, so red line #5 holds, but less immediate than v14.

**save-dot hidden when signed out** · _behavior_

- v14: loom-v14-example.html:432 `<span id="saveDot">—</span>` — always present
- app: src/components/ui/Header.tsx:22-24 `{session && (<span id="saveDot">…</span>)}`
- PRODUCTION NECESSITY — with nothing loaded there is nothing to have saved, and the em dash would be a false persistence signal on the sign-in screen.

**Nav + footer absent on the sign-in and loading screens** · _missing_

- v14: loom-v14-example.html:436-441 and 577 `<footer><span class="fl" id="footLeft">01 — OPEN</span><span class="fr" id="footRight">LAY THE WARP</span></footer>` — chrome is always on screen
- app: src/app/page.tsx:53-72 both early returns render only `<main><div className="empty" style={{ marginTop: "100px" }}><h2>Welcome to Loom.</h2><span className="cap">Please sign in to continue</span></div></main>` — no <nav>, no <footer>
- PRODUCTION NECESSITY — tabs that cannot be entered should not be offered, and v14 has no signed-out state to compare; the copy reuses v14's `.empty` / `.cap` idiom (loom-v14-example.html:245-246) so it still reads as the same product.

**student identity** · _behavior_

- v14: line 427: "<div class=\"field\"><span class=\"label\">Student</span><input id=\"student\" placeholder=\"your name\"></div>" — the student types the name that lands in exports and the map kit
- app: src/components/ui/Header.tsx:25 <AuthButton /> — identity comes from the session; there is no editable student field
- PRODUCTION NECESSITY (auth) — no pedagogical content is lost, since buildMapKit/buildExport still stamp the name (mapKit.ts:24, graphExport.ts:16).

## D. Unclassified

The audit could not confidently sort these.

### 01 · Open

**capture hint** · _copy_

- v14: loom-v14-example.html:450 — `A “byte” = one passage + its citation. Choosing the passage is <i>your</i> judgment — that's the point.`
- app: src/components/tabs/OpenTab.tsx:218 — `A byte is a passage worth keeping plus your concept for it. Loom can carry over source details and offer passage words to tap; it does not summarize or choose the concept for you.`
- Mixed, net REGRESSION — the new red-line disclaimer about the Library/chips is a production necessity, but it costs both the definition's citation half ('one passage + its citation') and the sharpest line on the tab, 'Choosing the passage is your judgment — that's the point.'

### 04 · Map

**"make all primary"** · _extra_

- v14: line 548: "The tool draws the lines you already threw and counts what it sees — it never sorts, places, or links for you." and line 556: "Give each concept a tier: <b>P</b>rimary (the map hangs on it) · <b>S</b>econdary · <b>T</b>ertiary (example / detail) · <b>–</b> leave off." — every tier is one …
- app: src/components/tabs/MapTab.tsx:355 <button ... data-tip="tiers every concept primary in one gesture — you demote from there">make all primary</button>, handler at 166-172 writing tier "p" to every concept
- Borderline against red line #1 and against v14's own promise that the tool "never sorts" — worth a human call: it is student-initiated and heavily hedged (confirm dialog, hint at MapTab.tsx:358 "a starting point, not a recommendation", flash "all primary — re-sort any that aren't"), but it does write a tier onto concepts the student never judged, and the mirror then counts them as sorted.
