# Design Frameworks, Fall 2026 — Course Deployment Notes

Living document. Pedagogy, staging, logistics, and governance for running Loom in DES INV 200. Revved over the semester and carried course-to-course.

**Draft** · rev July 29 (folds in the July 28 Hugh/LX check-in and the July 29 Hugh/LX/TJ call).
**Home:** the repo, beside the code, with a changelog — plus a shared Google Doc for live editing.

## 1. Provenance: the technique and the tool

Loom is not a new idea; it is the current embodiment of a long-running technique. Its lineage is stated here so it stays on the record as the tool passes through many hands.

**The technique.** Open-then-axial coding comes from grounded theory (Glaser & Strauss, 1967): surface candidate codes from primary material (open coding), then relate the codes and name the relations (axial coding). For decades this was done by hand: cards, margins, and walls of paper.

**A short history of the tool.** At E-Lab, the design-research and strategy firm where a computer-supported, cooperative version of this work took shape in the 1990s, the technique was given a dedicated tool: CAVEAT (Coding And Video Analysis Tool). Its contribution was the technique, not the medium: though it cut its teeth on video, the same open-then-axial move — capture a datum (a "byte"), name what it evidences, then relate the codes — was applied across field data of every kind. CAVEAT, together with E-Lab's companion practices (the AEIOU observation frame, and Rosebud, the cross-project library that promoted recurring findings into reusable, named units), is the direct ancestor of what Loom does with a student and a reading.

**Loom.** Loom is that same tool-embodiment of open-then-axial coding, carried from field ethnography into scholarly reading. Its v1 was conceived, named ("Loom"), and designed by John Cain (E-Lab co-founder) out of the lineage above. The byte as a first-class object, the coined-and-promoted relation vocabulary, and the by-hand red line are its originating design.

**Authorship as the tool evolves.** Loom is meant to be built on; colleagues will add functions, views, hosting, and features, and that work is welcome and credited. The tool's originating design, however — how it embodies its technique, its object model, and its name — originates with Cain and E-Lab. New features extend Loom; they do not redefine it. (This is why design changes should route through a single design authority.)

## 2. Loom's place in the course

The course enacts a chain of transformations (HD), each step handing off to the next:

1. **text** — the primary reading: the paper, article, book, chapter, passage, etc.
2. **notes** — marks (bytes) made while reading
3. **concepts** — ideas named as short noun phrases, glossed in your own words
4. **weave** — concepts linked by named relations · *Loom*
5. **concept map** — staged on Loom's Map tab (sort · arrange), then drawn by hand
6. **chalk talk** — the map built live, aloud
7. **questions** — what the map provokes
8. **discussion** — the seminar works it through

Loom is the weave step (and now stages the map step), the structured middle. At each arrow the standing question is: does the tool help here, or must hands do this work? Reading, the final drawn map, and the synthesis stay in human hands.

## 3. Scope of the instrumented activity

**In:** the 26 core readings only. Each student graphs both weekly core readings in Loom, individually, weeks 2–13.

**Out** (happens, not standardized): supplemental / expert territories, self-found readings, the final synthesis.

## 4. Staging

**Weeks 2–6 — individual.** Two graphs per week. Week 2 is Loom onboarding (John's visit 1) — students will have read Novak & Gowin first; week 1 concept maps are hand-drawn, then Loom arrives as "what you did by hand, now computer-supported and cooperative."

**Weekly section ritual — the chalk talk.** The designated student opens discussion by building a small map at the board, one idea at a time (~7 concepts, max 9). It is a derivative of their Loom graph, not a redraw — Loom's Map tab (sort · arrange · check) is the staging ground, and its mirror echoes the rubric: list = 1 point; sub-points = 2; connections across branches = 3. Explicitly discourage re-drawing the whole map.

**Weeks 6–11 — individual + pair critique.** Partners swap graphs before class, red-line each other's, and turn in the red-lined version. The critique is on paper or in conversation. Week 11: mine your graph for final-project themes.

**Weeks 12–14 — group quilts.** Each section (not the whole class) weaves a shared graph from its members' individual graphs. Identity reconciliation (same concept under three names) is negotiated by the students; a steward per section owns the merge — the negotiation is the pedagogy. The quilt is the final.

## 5. Assignments

- Read 2 core readings/week for 13 weeks; graph both in Loom.
- **LLM policy:** students may export their weave and experiment with an LLM on it — but turn in the full conversation with the resulting map (continues the 2025 disclosure policy). No AI inside the tool; AI outside it, disclosed.
- **Commonplace books:** paper notebooks provided; journaling on paper runs alongside Loom as a complementary layer.
- **Final = the quilt.** No standard exam. No open-topic poster (dropped — the old failure mode was topic drift). The Showcase can hang the weekly maps and/or printed quilt views.
- Chalk talk replaces the old history/theory slide presentations.

## 6. Section logistics

- ~65 students, 5 sections (~14 each). Section leads: John + Kevin, Eric R, Ben S, Hugh.
- John is remote except ~3–4 visits (visit 1 = week 2, Loom onboarding). In-room he is paired with Kevin; he sidecars remotely for discussion.
- Lecture is plenary; exercises break out into small groups with a compressed share-back at the end.
- Session recording / transcription (Kevin to arrange) helps note-taking — and raises a consent question (see §7).

## 7. Hosting, data, and governance

**Hosting / auth** (settled 7/29): TJ hosts (Vercel + backend); persistence per signed-in student in the database (Postgres/Neon) — no session-loss; sign-in via GitHub ("like asking them to get a phone number" — the concurrent TDF course already requires GitHub; no student issues historically).

**Data minimization:** student name + graphs, nothing else. Work is exportable (JSON + markdown) so students keep full control of their own data.

**IRB posture** (settled 7/29, on the record): this is a course deployment, not an experiment — a demo students work with, like any class demo (TJ). No IRB filing is being made; the question was raised, discussed deliberately, and decided — not overlooked. If anyone later wants to publish, that is a separate, prior IRB conversation.

**Storage stance:** keep data off bCourses (HD preference); store with the hosted tool, exportable and minimal. Weekly class export remains available as a fallback if governance ever demands it.

Recording/transcription consent folds into the same conversation.

## 8. Teaching reflection (not research instrumentation)

Light-touch, from artifacts already collected — used to teach, not to publish:

- **Vocabulary growth:** terms a student reuses over time; register spread (does a mech-E acquire "presupposes"?).
- **Island-bridging:** cross-week edges connecting this week's concepts to prior weeks'.
- **Legible-failure states:** evidence-less concepts and sentence-only edges over time (should fall).
- **Pair-critique red-lines:** what colleagues catch.
- Check-in presentations + a mid-term survey (continues HD's 2025 practice).

## 9. Working agreements (July 28–29)

- **Single source of truth:** TJ's GitHub repo holds the code, this document, and the spec, with a changelog; versions travel by check-in, not email. (JC's v10 committed 7/28; v14 to follow.)
- **Ratified into production v1:** the reading library (preloaded, standardized "gold" texts approved by HD/JC; students may add papers, with dedupe-and-redirect), in-tool highlights → bytes, and highlight heat maps (subject to the spec's timing red line). OCR quality must be checked before release — several course PDFs are scans.
- Daily 3 pm PT calls this week to close the spec.
- **Homework (LX):** take the E-Lab field guide's CAVEAT method and make a loom from a reading; read Novak & Gowin and compare/contrast. JC to gather the field guide and a "paper of record" for axial coding (Glaser ch. 1).
- **Examples to produce (TJ):** worked examples that show the journey, not just the product — readings → highlights → bytes → threads — including good and bad practice (Goofus & Gallant).

## 10. Open questions (parking lot)

- Freeze date for [`loom-spec-v1.md`](loom-spec-v1.md) (~1 week per HD/JC); production v1 ~2 weeks (TJ).
- Reviewer fallback if TJ is unavailable mid-semester (Pete? Kevin?).
- Markdown export lives in Lingxiu's fork — reconcile into the production build.
- Formal term "promotion" — needed, or is recurrence-surfacing enough? (Currently v2.)
- Naming of the register menus: "tongues" vs. "paradigms" vs. plain "vocabularies."
- Grading weight: graphs vs. maps-as-before; whether the Figma "Concept Map Obeya" wall continues in parallel.
- Cross-year quilt archive — the "quilt barn" idea. A 2027 question.
- Admin: John's fellowship appointment (William) still not issued.
