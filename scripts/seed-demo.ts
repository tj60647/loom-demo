/**
 * Demonstration accounts, rebuilt from scratch on every run.
 *
 *   test-user-a@loom.local — a worked loom: 10 passages captured from two readings
 *     (Object Worlds, Communities of Practice), 8 concepts (one evidenced in
 *     both readings, one deliberately evidence-less), 6 threads (two of them
 *     cross-reading bridges, one sentence-only), six LINKS — the labels those
 *     threads carry, one of them glossed and one coined with no thread using
 *     it (5.1) — a CLOTH per reading, and TWO PROJECTIONS, one per reading,
 *     each with its own tiers, essence, paragraph and board arrangement.
 *   test-user-b@loom.local — enrolled and empty: the fresh-account experience.
 *   test-user-c@loom.local / test-user-d@loom.local — two colleagues in A's
 *     discussion section, so the Overlays (P3.14, ruling 28) have a section
 *     and a cohort to compare against. Each captures the SAME passage A did on
 *     each reading — the depth-2 run a heatmap exists to show — plus one of
 *     their own, and they share two labels between them so the Vocabulary
 *     overlay counts a word at two people rather than only ever at one.
 *
 * Passages are pulled from the `source_page` rows with their canonical offsets
 * and content hashes, so they highlight precisely in the PDF viewer — and
 * their text is the string the browser's selection would have returned, line
 * breaks included, not the offset string those offsets index (`sliceAsSelected`).
 * Concepts attach through `passage_concept` (P0.1, renamed by 0023); tiers
 * live per map only; a cloth per reading carries the student's read paragraph
 * — matching what the actions would have produced, so the seeded account is
 * indistinguishable from a worked one. (The whole-weave cloth this used to
 * seed went with the whole weave, 2026-08-11.)
 *
 * Sign-in: these accounts have no GitHub identity. Locally and in CI they are
 * reached through /api/auth/test-login (?as=testa); on any production build
 * that route 403s, which is the point — demo accounts never exist where real
 * students do unless you run this seed there yourself.
 *
 * Usage: npx tsx scripts/seed-demo.ts   (or: npm run seed:demo)
 * Requires DATABASE_URL (.env.local). Run `npm run seed:sources` first — the
 * readings and their page text must exist.
 *
 * Idempotent by demolition: everything owned by @loom.local users is deleted
 * and re-inserted. The @loom.local guard is load-bearing; the script refuses
 * to touch any other account.
 */
import { db } from "../src/db"
import {
  users, courses, courseMemberships, courseAllowedEmails, courseSources, sections, sources, sourcePages,
  concepts, passages, passageConcepts, edges, links, cloths, maps, views, graphEvents,
} from "../src/db/schema"
import { eq, asc, ilike, isNotNull, and } from "drizzle-orm"
import { textLayerProjection } from "../src/lib/pdfText"

const DEMO_DOMAIN = "@loom.local"
const USER_A = { email: "test-user-a@loom.local", name: "Test User A" }
const USER_B = { email: "test-user-b@loom.local", name: "Test User B" }
const USER_C = { email: "test-user-c@loom.local", name: "Test User C" }
const USER_D = { email: "test-user-d@loom.local", name: "Test User D" }

/**
 * THE COHORT THE THIN SEED COULD NOT MAKE (TJ, 2026-08-23, after a run of
 * production incidents: "should we have more test users in the roster, and
 * more robust sample data … passage selection and linking and projection from
 * all readings for a couple of them? and not just random things but reasonable
 * data").
 *
 * A-D above keep their concepts, passages, threads and projections exactly as
 * they were — every spec in the suite is written against those fixtures, and
 * several pin their concept labels by name. Two things about them DID change
 * on 2026-08-24, and neither is additive: their passage text is now the string
 * a selection would produce rather than the offset string (see
 * `sliceAsSelected`), and C and D gained the cloth every worked reading should
 * have had. Both were defects they shared with everyone else.
 *
 * WHAT THEY EXIST TO MAKE REACHABLE, measured before they were written:
 *
 * - EVERY READING HAD NOBODY'S WORK. A, C and D touch two readings; the dev
 *   library holds 31, so 26 of them had no passage from anyone. The Heatmaps
 *   tab opens on the first reading in syllabus order, which is why six of its
 *   specs failed the first time CI ran them on a seeded database. E and F work
 *   in every reading that has page text, so no reading is a dead target.
 * - THE HEAT RAMP HAD TWO STEPS. A, C and D all mark the SAME span, so the
 *   only run depths were 3 and 1 — steps 2, 3 and 4 of the five-step scale
 *   were unreachable, and the relative-scale work of 2026-08-22/23 could not
 *   be seen at all. G, H and I exist to make a depth LADDER: runs of 2, 4 and
 *   8 people, so the ramp is exercised across its range.
 * - THE MARGIN WAS ALWAYS EMPTY. No seeded passage carried a note, a question,
 *   a pull-quote or a tier; every passage had exactly one concept, so neither
 *   the unlabeled nor the refiled state could occur; no thread was ever bent
 *   and no concept ever set aside. E carries one of each.
 */
const USER_E = { email: "test-user-e@loom.local", name: "Test User E" }
const USER_F = { email: "test-user-f@loom.local", name: "Test User F" }
const USER_G = { email: "test-user-g@loom.local", name: "Test User G" }
const USER_H = { email: "test-user-h@loom.local", name: "Test User H" }
const USER_I = { email: "test-user-i@loom.local", name: "Test User I" }

/**
 * The vocabulary the new students use, kept deliberately disjoint from A, C and
 * D's. `tests/journey-admin.spec.ts` picks the first row carrying a label out
 * of an unordered aggregate, so a second holder of "object worlds" would make
 * which row it lands on a coin toss — the seed already avoided that once for
 * C and D, and the same trap is wider now that five more people are coining.
 */
const DEEP_LABELS = [
  ["reading as apparatus", "The text is a device you operate, not a surface you pass your eyes over."],
  ["margin as workshop", "The place the thinking is actually done, next to the words that provoked it."],
  ["citation as claim", "Pointing at a passage is asserting that it carries weight."],
  ["frame before evidence", "What you are willing to notice is decided before you notice it."],
  ["the unread remainder", "What a reading leaves undone is part of what it says."],
] as const

/** The address on the roster that has been invited and has never signed in. */
const INVITED_EMAIL = "test-invited@loom.local"

/** The discussion section A and the two colleagues share (model §2: every
 *  account belongs to a Section). B stays unplaced on purpose — "not placed in
 *  a section yet" is a state the section overlay has to answer for. */
const DEMO_SECTION = { slug: "section-1", name: "Section 1" }

// The two readings the demo is built from — matched by title prefix, the same
// loose match the Playwright helper uses, since library titles get edited.
const READING_A = "Object Worlds"           // Bucciarelli — Designing Engineers
const READING_B = "Communities of practice" // Wenger (any edition/paper)

type PageRow = { pageNumber: number; textContent: string; contentHash: string }

/**
 * THE STRING A SELECTION WOULD HAVE PRODUCED.
 *
 * Two different strings are in play and the seed used the wrong one. Offsets
 * index the TEXT-LAYER string — pdf.js items concatenated with nothing between
 * them (heatRects.textLayerString) — while `passage.content` is what the
 * browser hands back from a selection, which carries a newline at every line
 * break because each item is its own span.
 *
 * Stored page text keeps those breaks as LINE_SEPARATOR (a newline) and
 * `textLayerProjection` strips them to recover the offset string. Slicing THAT
 * welds words across every line break: the seed was storing "conferenceon
 * technological literacy" and "the apocalypse ofreturning to nuclear dust"
 * where a reader would have selected "conference" + newline + "on
 * technological literacy"
 * (TJ, 2026-08-24: "are they really selections or are they generated some
 * other way, they have no spaces like a text i select would do").
 *
 * So this walks the stored text, counting only the characters the projection
 * keeps, and returns the stored slice — separators included, which is exactly
 * what the browser would have given. Verified against three passages captured
 * through the UI on the dev database: the stored slice reproduces the content
 * the app saved, character for character.
 */
function sliceAsSelected(stored: string, start: number, end: number): string {
  let projected = 0
  let from = -1
  let to = -1
  for (let i = 0; i < stored.length; i++) {
    // A separator is not in the projection, so it advances the stored index
    // and not the projected one. That difference IS the mapping.
    if (stored[i] === "\n") continue
    if (projected === start && from < 0) from = i
    if (projected === end) { to = i; break }
    projected++
  }
  if (from < 0) return ""
  // A trailing separator would be a line break with nothing after it — the
  // selection ends at the last character, not at the break past it.
  return stored.slice(from, to < 0 ? stored.length : to).replace(/\n+$/, "")
}

/**
 * IS THIS A SENTENCE SOMEBODY WOULD MARK, or the front of the book?
 *
 * The 120–420-character rule below is happy to match a title page: the seed
 * was handing out "BOB GOWIN Department of Education New York State College of
 * Agriculture" and a run of ISBNs off a copyright page — 14 of 124 passages,
 * measured 2026-08-24. They are legal captures and nobody would ever make one,
 * which is the whole difference TJ asked for ("not just random things but
 * reasonable data").
 *
 * Front matter is a pile of names and titles: mostly capitalised tokens, with
 * few of the lowercase function words that hold a sentence together. Prose on
 * these scans runs well under a third capitalised, and a masthead well over
 * half, so the line sits at 45% with room either side of it.
 */
function readsAsProse(text: string) {
  const words = text.split(/[\s\n]+/).filter((w) => /[A-Za-z]/.test(w))
  if (words.length < 8) return false
  const capitalised = words.filter((w) => /^[A-Z]/.test(w)).length
  if (capitalised / words.length > 0.45) return false
  // A copyright page can slip under that on ISBNs alone, which carry no
  // capitals at all — so a run that is mostly digits is out too.
  const digits = text.replace(/[^0-9]/g, "").length
  return digits / text.length < 0.15
}

/** Find a real sentence on a page: starts with a capital, ends with a stop,
 *  120–420 chars, and reads as prose. `skip` picks later sentences so passages
 *  don't collide. */
function pickPassage(pages: PageRow[], fromPage: number, skip = 0):
  { content: string; pageNumber: number; startOffset: number; endOffset: number; pageContentHash: string } {
  const re = /[A-Z][^.?!]{120,420}[.?!]/g
  for (const page of pages.filter((p) => p.pageNumber >= fromPage)) {
    // Offsets on a passage index the browser's text layer, not the stored page
    // text — the two differ by the line boundaries extractPdfPageText records.
    // Matching against the stored text would mint offsets that are correct for
    // no string anyone ever reads.
    const found = [...textLayerProjection(page.textContent).matchAll(re)].filter((m) =>
      readsAsProse(m[0])
    )
    if (found.length > skip) {
      const m = found[skip]
      return {
        // The offsets are the projection's; the CONTENT is the selection's.
        content: sliceAsSelected(page.textContent, m.index, m.index + m[0].length),
        pageNumber: page.pageNumber,
        startOffset: m.index,
        endOffset: m.index + m[0].length,
        pageContentHash: page.contentHash,
      }
    }
  }
  throw new Error(`No usable passage found from page ${fromPage} on — is the page text seeded?`)
}

async function findSource(titlePrefix: string) {
  const rows = await db.select().from(sources)
    .where(and(ilike(sources.title, `${titlePrefix}%`), isNotNull(sources.storageKey)))
    .limit(1)
  if (!rows.length) throw new Error(`Reading "${titlePrefix}…" not found — run \`npm run seed:sources\` first.`)
  return rows[0]
}

/**
 * Coin the Links the seeded threads carry, and point the threads at them.
 *
 * A label is an object the student owns (5.1), so a thread references a Link
 * rather than only carrying the string in `handle`. Every action does this on
 * write and migration 0024 did it for existing rows — but the seed writes rows
 * straight to the table, so it has to coin them here. Without this the demo
 * account shows an EMPTY Link List while its threads plainly wear labels.
 *
 * Deduped case-insensitively, like `resolveLink` in src/actions/loom.ts.
 */
async function withLinks<T extends { userId: string; courseId: string; handle: string; createdAt: Date }>(
  rows: T[]
): Promise<(T & { linkId: string | null })[]> {
  const key = (h: string) => h.trim().toLowerCase()
  const first = new Map<string, T>()
  for (const r of rows) if (key(r.handle) && !first.has(key(r.handle))) first.set(key(r.handle), r)
  if (!first.size) return rows.map((r) => ({ ...r, linkId: null }))

  const made = await db.insert(links).values(
    [...first.values()].map((r) => ({
      userId: r.userId, courseId: r.courseId, label: r.handle.trim(), description: "", createdAt: r.createdAt,
    }))
  ).returning({ id: links.id, label: links.label })

  const byKey = new Map(made.map((l) => [key(l.label), l.id]))
  return rows.map((r) => ({ ...r, linkId: byKey.get(key(r.handle)) ?? null }))
}

async function findOrCreateUser(u: { email: string; name: string }) {
  const existing = await db.select().from(users).where(eq(users.email, u.email)).limit(1)
  if (existing.length) {
    // Force the expected identity, don't inherit drift: a demo user left with
    // role ADMIN by a prior run or a hand edit would silently invalidate the
    // journey suite's authorization-boundary test.
    const [updated] = await db
      .update(users)
      .set({ name: u.name, role: "USER" })
      .where(eq(users.id, existing[0].id))
      .returning()
    return updated
  }
  const [row] = await db.insert(users).values({ email: u.email, name: u.name, role: "USER" }).returning()
  return row
}

async function main() {
  // The same course rule the test-login backdoor uses: the oldest course.
  const [course] = await db.select().from(courses).orderBy(asc(courses.createdAt)).limit(1)
  if (!course) throw new Error("No course exists — create one on /admin/courses first.")

  const [srcA, srcB] = await Promise.all([findSource(READING_A), findSource(READING_B)])
  const [pagesA, pagesB] = await Promise.all([
    db.select({ pageNumber: sourcePages.pageNumber, textContent: sourcePages.textContent, contentHash: sourcePages.contentHash })
      .from(sourcePages).where(eq(sourcePages.sourceId, srcA.id)).orderBy(asc(sourcePages.pageNumber)),
    db.select({ pageNumber: sourcePages.pageNumber, textContent: sourcePages.textContent, contentHash: sourcePages.contentHash })
      .from(sourcePages).where(eq(sourcePages.sourceId, srcB.id)).orderBy(asc(sourcePages.pageNumber)),
  ])
  if (!pagesA.length || !pagesB.length)
    throw new Error("Page text missing for a demo reading — run `npm run seed:sources` first.")

  const userA = await findOrCreateUser(USER_A)
  const userB = await findOrCreateUser(USER_B)
  const userC = await findOrCreateUser(USER_C)
  const userD = await findOrCreateUser(USER_D)
  const [userE, userF, userG, userH, userI] = await Promise.all(
    [USER_E, USER_F, USER_G, USER_H, USER_I].map(findOrCreateUser)
  )

  const [demoSection] = await db.insert(sections)
    .values({ courseId: course.id, slug: DEMO_SECTION.slug, name: DEMO_SECTION.name })
    .onConflictDoUpdate({
      target: [sections.courseId, sections.slug],
      set: { name: DEMO_SECTION.name },
    })
    .returning()

  const placements = [
    { user: userA, sectionId: demoSection.id },
    { user: userB, sectionId: null },
    { user: userC, sectionId: demoSection.id },
    { user: userD, sectionId: demoSection.id },
    // All five in Section 1, so the section band and the cohort band still
    // differ (B and the two-course learner sit outside it) while the section
    // itself is finally big enough for a depth ladder.
    { user: userE, sectionId: demoSection.id },
    { user: userF, sectionId: demoSection.id },
    { user: userG, sectionId: demoSection.id },
    { user: userH, sectionId: demoSection.id },
    { user: userI, sectionId: demoSection.id },
  ]

  for (const { user: u, sectionId } of placements) {
    if (!u.email.endsWith(DEMO_DOMAIN)) throw new Error(`Refusing to touch non-demo account ${u.email}`)
    // role is re-set, not just left alone: a demo account promoted to FACULTY
    // by a prior run would drop out of every overlay's peer set, which reads
    // as "nobody marked this" rather than as the drift it is.
    await db.insert(courseMemberships)
      .values({ courseId: course.id, userId: u.id, sectionId, role: "LEARNER" })
      .onConflictDoUpdate({
        target: [courseMemberships.courseId, courseMemberships.userId],
        set: { removedAt: null, sectionId, role: "LEARNER" },
      })
    // Demolition: the whole graph, projections and history for this demo user.
    await db.delete(edges).where(eq(edges.userId, u.id))
    // Links outlive their threads by design (5.1) — a word coined ahead of
    // use is a row on its own. So the wipe has to name them, or every crashed
    // suite run leaves a coinage behind and the Link List grows forever.
    await db.delete(links).where(eq(links.userId, u.id))
    await db.delete(passages).where(eq(passages.userId, u.id))
    await db.delete(concepts).where(eq(concepts.userId, u.id))
    await db.delete(maps).where(eq(maps.userId, u.id))
    await db.delete(cloths).where(eq(cloths.userId, u.id))
    await db.delete(views).where(eq(views.userId, u.id))
    await db.delete(graphEvents).where(eq(graphEvents.userId, u.id))
  }
  console.log(`[seed-demo] course "${course.name}" · wiped and re-enrolled A–D (A, C, D in ${DEMO_SECTION.name})`)

  // ---- Test User A's graph -------------------------------------------------
  // Timestamps stagger over a pretend week so "the cloth, over time" replays
  // as a story: concepts appear, evidence accrues, threads follow, maps last.
  const base = Date.now() - 7 * 24 * 60 * 60 * 1000
  let tick = 0
  const at = () => new Date(base + ++tick * 37 * 60 * 1000) // every ~37 minutes

  const C = (label: string, def: string, note = "") => ({
    userId: userA.id, courseId: course.id, label, def, note, createdAt: at(),
  })
  const conceptRows = await db.insert(concepts).values([
    C("object worlds", "The discipline-specific world of instruments, language and know-how a designer thinks within."),
    C("design as social process", "The object takes shape between participants — in meetings, memos and negotiation — not in any single mind."),
    C("artifact as compromise", "What ships is the residue of reconciled interests, not one intention realized."),
    C("community of practice", "A group bound by doing the same work together, whose shared history makes meaning possible."),
    C("legitimate peripheral participation", "Newcomers belong from the edge: real work, low stakes, growing inward."),
    C("reification", "Meaning settled into a thing — a document, a tool, a term — that then acts back on the practice."),
    C("negotiation of meaning", "Meaning is not transmitted but worked out, continuously, between people and their reifications."),
    C("shared vocabulary", "The words a group coins for its own relations — the tongue a practice speaks.", "No passage captured for this yet."),
  ]).returning()
  // The eighth concept ("shared vocabulary") stays passage-less and untiered on
  // purpose — the visible no-evidence state — so it is never referenced again.
  const [oworlds, social, compromise, cop, lpp, reif, negmean] = conceptRows

  // Concepts attach through passage_concept rows (P0.1): the passage row carries the
  // passage, the join row carries the filing.
  const B = (c: { id: string }, src: typeof srcA, srcLabel: string, p: ReturnType<typeof pickPassage>) => ({
    id: crypto.randomUUID(), conceptId: c.id,
    userId: userA.id, courseId: course.id,
    source: srcLabel, sourceId: src.id, location: `p. ${p.pageNumber}`,
    content: p.content, pageNumber: p.pageNumber, startOffset: p.startOffset,
    endOffset: p.endOffset, pageContentHash: p.pageContentHash, createdAt: at(),
  })
  const labelA = "Bucciarelli, Designing Engineers"
  const labelB = "Wenger, Communities of Practice"
  const passageSeeds = [
    B(oworlds, srcA, labelA, pickPassage(pagesA, 2, 0)),
    B(oworlds, srcA, labelA, pickPassage(pagesA, 4, 1)),
    B(social, srcA, labelA, pickPassage(pagesA, 3, 0)),
    B(compromise, srcA, labelA, pickPassage(pagesA, 5, 0)),
    B(negmean, srcA, labelA, pickPassage(pagesA, 6, 0)),
    B(cop, srcB, labelB, pickPassage(pagesB, 2, 0)),
    B(cop, srcB, labelB, pickPassage(pagesB, 4, 1)),
    B(lpp, srcB, labelB, pickPassage(pagesB, 3, 0)),
    B(reif, srcB, labelB, pickPassage(pagesB, 5, 0)),
    B(negmean, srcB, labelB, pickPassage(pagesB, 6, 1)),
  ]
  await db.insert(passages).values(passageSeeds.map(({ conceptId: _conceptId, ...row }) => row))
  await db.insert(passageConcepts).values(
    passageSeeds.map((b) => ({ passageId: b.id, conceptId: b.conceptId, createdAt: b.createdAt }))
  )

  const E = (from: { id: string }, to: { id: string }, sentence: string, handle = "") => ({
    userId: userA.id, courseId: course.id, fromId: from.id, toId: to.id, sentence, handle, createdAt: at(),
  })
  await db.insert(edges).values(await withLinks([
    E(oworlds, social, "Different object worlds must be brought into alignment before the design can move.", "constrains"),
    E(social, compromise, "The negotiated process leaves its trace in the artifact itself.", "yields"),
    E(cop, lpp, "A practice admits newcomers from its edges, by degrees of real work.", "admits"),
    E(negmean, reif, "Meaning settles into forms that then push back on the negotiating.", "hardens into"),
    E(oworlds, cop, "Each object world is sustained by its own community of practice.", "is carried by"),
    E(negmean, social, "The design conversation is itself a negotiation of meaning across worlds."), // sentence-only
  ]))

  // One Link glossed, and one coined with NOTHING using it — the two states
  // 5.1 exists for, so the demo account shows them rather than describing
  // them. A word coined ahead of its first use is a row on its own.
  await db.update(links)
    .set({ description: "the first sets the terms the second has to work inside" })
    .where(and(eq(links.userId, userA.id), eq(links.label, "constrains")))
  await db.insert(links).values({
    userId: userA.id, courseId: course.id, label: "sets the terms for",
    description: "a word I want, before I have found the pair it belongs to",
    createdAt: at(),
  })

  // ---- Two projections, one per reading ----------------------------------
  // Positions: x proportional 0..1, y absolute on the 560px three-band table.
  //
  // There was a third here — "The whole cloth", at scopeKey "" — and it went
  // with the whole weave on 2026-08-11 (TJ: "poorly defined and not supported
  // in the course… it should not be in the app as an idea"). A seed that keeps
  // shipping one models a student holding work in a scope they can no longer
  // reach, which is how the idea would creep back in.
  const pos = (x: number, y: number) => ({ x, y })

  const [mapA] = await db.insert(maps).values({
    userId: userA.id, courseId: course.id, scopeKey: srcA.id, name: "Object worlds, sorted",
    essence: "The design lives between worlds, not in any one of them.",
    read: "Read on its own, Bucciarelli's argument hangs on the object world: each participant designs inside a different one, so the social process is not a nicety but the only place the object exists whole. The compromise in the artifact is what that process leaves behind.",
    tiers: { [oworlds.id]: "p", [social.id]: "s", [compromise.id]: "t" },
    createdAt: at(), updatedAt: at(),
  }).returning()

  const [mapB] = await db.insert(maps).values({
    userId: userA.id, courseId: course.id, scopeKey: srcB.id, name: "A practice lens",
    essence: "Belonging is doing: practice makes meaning, and meaning makes the group.",
    read: "For Wenger the community is not a container but an ongoing achievement — participation and reification trading places. Negotiation of meaning ranks primary here in a way it doesn't at the whole weave, which is exactly why this reading keeps its own map.",
    tiers: { [cop.id]: "p", [negmean.id]: "p", [lpp.id]: "s", [reif.id]: "s" },
    createdAt: at(), updatedAt: at(),
  }).returning()

  // Geometry per projection.
  const viewA = {
    positions: { [oworlds.id]: pos(0.42, 96), [social.id]: pos(0.42, 268), [compromise.id]: pos(0.42, 432) },
    bends: {}, order: [], pins: [],
  }
  const viewB = {
    positions: { [cop.id]: pos(0.28, 96), [negmean.id]: pos(0.6, 96), [lpp.id]: pos(0.28, 268), [reif.id]: pos(0.6, 268) },
    bends: {}, order: [], pins: [],
  }
  await db.insert(views).values([
    { userId: userA.id, courseId: course.id, key: `map:${mapA.id}`, data: viewA, updatedAt: at() },
    { userId: userA.id, courseId: course.id, key: `map:${mapB.id}`, data: viewB, updatedAt: at() },
  ])

  // A cloth per reading — the student's own name for their work on each text,
  // exactly as saveCloth would leave it. (The whole-weave cloth that used to
  // sit here went with the whole weave; see the note above the projections.)
  await db.insert(cloths).values([
    {
      userId: userA.id, courseId: course.id, scopeKey: srcA.id,
      title: "Designing between worlds",
      description: "Bucciarelli watches designers fail to share a world and still produce a machine. The object world is the unit: each participant designs inside a different one, so the social process is not a nicety but the only place the object exists whole, and the compromise in the artifact is what that process leaves behind.",
      createdAt: at(), updatedAt: at(),
    },
    {
      userId: userA.id, courseId: course.id, scopeKey: srcB.id,
      title: "Belonging is doing",
      description: "Wenger explains why a machine can come out of worlds that never merged. The community is not a container but an ongoing achievement — participation and reification trading places — and negotiation of meaning is the continuous working-out that keeps it going.",
      createdAt: at(), updatedAt: at(),
    },
  ])

  // No graph_event rows are inserted: getGraphEvents synthesizes create events
  // from row timestamps, so the history panel replays the staggered story above.

  // ---- Two colleagues, so the Overlays have something to compare ----------
  //
  // An overlay is empty on a course of one, which makes it impossible to tell
  // a working comparison from a broken one. C and D are the smallest fixture
  // that isn't: they share a section with A, they both capture the SAME
  // passage A did on each reading (a depth-2 run — A is the viewer and never
  // counts himself), each adds one of their own (depth 1), and two of their
  // labels are shared between them so the Vocabulary overlay can show a word
  // at two people.
  //
  // Deliberately NOT "object worlds": tests/journey-admin.spec.ts picks the
  // first .crow carrying that label out of an unordered aggregate, and a
  // second student holding it would make which row it lands on a coin toss.
  const peer = async (
    user: { id: string },
    conceptSpecs: [label: string, def: string][],
    passageSpecs: [conceptIndex: number, src: typeof srcA, srcLabel: string, pick: ReturnType<typeof pickPassage>][],
    edgeSpecs: [from: number, to: number, sentence: string, handle: string][]
  ) => {
    const rows = await db.insert(concepts).values(
      conceptSpecs.map(([label, def]) => ({
        userId: user.id, courseId: course.id, label, def, note: "", createdAt: at(),
      }))
    ).returning()

    const seeds = passageSpecs.map(([conceptIndex, src, srcLabel, p]) => ({
      conceptId: rows[conceptIndex].id,
      row: {
        id: crypto.randomUUID(),
        userId: user.id, courseId: course.id,
        source: srcLabel, sourceId: src.id, location: `p. ${p.pageNumber}`,
        content: p.content, pageNumber: p.pageNumber, startOffset: p.startOffset,
        endOffset: p.endOffset, pageContentHash: p.pageContentHash, createdAt: at(),
      },
    }))
    await db.insert(passages).values(seeds.map((s) => s.row))
    await db.insert(passageConcepts).values(
      seeds.map((s) => ({ passageId: s.row.id, conceptId: s.conceptId, createdAt: s.row.createdAt }))
    )

    if (edgeSpecs.length) {
      await db.insert(edges).values(await withLinks(edgeSpecs.map(([from, to, sentence, handle]) => ({
        userId: user.id, courseId: course.id,
        fromId: rows[from].id, toId: rows[to].id, sentence, handle, createdAt: at(),
      }))))
    }
    return rows
  }

  // The shared spans: exactly the passages A captured first in each reading.
  const sharedA = pickPassage(pagesA, 2, 0)
  const sharedB = pickPassage(pagesB, 2, 0)

  await peer(
    userC,
    [
      ["object world talk", "The shop-floor language each discipline argues in."],
      ["shared understanding", "The thing the meeting is actually for."],
      ["community of practice", "People who learn by doing the same work near each other."],
    ],
    [
      [0, srcA, labelA, sharedA],
      [1, srcA, labelA, pickPassage(pagesA, 2, 2)],
      [2, srcB, labelB, sharedB],
    ],
    [[0, 1, "Arguing in one world is how the other world's terms get learned.", "makes possible"]]
  )

  await peer(
    userD,
    [
      ["object world talk", "Everyone speaks their own trade and calls it plain English."],
      ["the artifact as record", "The finished thing remembers the arguments that made it."],
      ["community of practice", "Belonging is a by-product of working alongside."],
      ["apprenticeship", "Learning by standing close to someone doing it."],
    ],
    [
      [0, srcA, labelA, sharedA],
      [1, srcA, labelA, pickPassage(pagesA, 2, 3)],
      [2, srcB, labelB, sharedB],
      [3, srcB, labelB, pickPassage(pagesB, 2, 2)],
    ],
    [
      [0, 1, "What the trades could not say to each other ends up settled in the object.", "makes possible"],
      // Described but not yet coined — the visible unlabeled-link state.
      [2, 3, "You join by doing the work badly next to someone doing it well.", ""],
      /**
       * DRAWN AND NEVER SPOKEN — no Link, no description. The third of the
       * three states a thread can be in, and the only one no seeded account
       * had: measured 2026-08-24, every bare thread on the dev database
       * belonged to a REAL person, which is why the read-out's arrow passed
       * locally and failed on CI's fresh seed.
       *
       * Legal by P0.3 ("you can throw now and write it later"), and it is
       * what ThreadCard's "not described" pill and the cloth's dashed arc are
       * drawn for. A fixture that cannot reach a state the UI renders is a
       * fixture that lets that state rot.
       */
      [0, 3, "", ""],
    ]
  )

  // ---- The wider cohort: E-I ---------------------------------------------
  //
  // Everything above this line is the original four and is unchanged. What
  // follows is additive, for the reasons set out beside USER_E.

  /**
   * EVERY READING ON THE COURSE THAT HAS PAGE TEXT.
   *
   * Page text is the gate, not the shelf: a passage without real offsets and
   * the page's own content hash cannot anchor, and an overlay counts it as
   * "not placed" rather than shading it (src/actions/overlays.ts). A reading
   * with no `source_page` rows can hold a concept but never a highlight, so
   * seeding one would move a roster tally without anything appearing on a page.
   */
  const shelf = await db
    .select({ id: sources.id, title: sources.title })
    .from(courseSources)
    .innerJoin(sources, eq(sources.id, courseSources.sourceId))
    .where(and(eq(courseSources.courseId, course.id), eq(sources.isArchived, false)))
    .orderBy(asc(courseSources.week), asc(courseSources.position), asc(sources.title))

  const readable: { id: string; title: string; pages: PageRow[] }[] = []
  const unusable: string[] = []
  for (const r of shelf) {
    const pages = await db
      .select({ pageNumber: sourcePages.pageNumber, textContent: sourcePages.textContent, contentHash: sourcePages.contentHash })
      .from(sourcePages).where(eq(sourcePages.sourceId, r.id)).orderBy(asc(sourcePages.pageNumber))
    // Three pages is the floor: pickPassage starts from a page, and the ladder
    // below wants a second and third span that are not the first.
    if (pages.length < 3) continue
    /**
     * AND THE TEXT HAS TO YIELD A SENTENCE. `pickPassage` wants a capitalised
     * run of 120-420 characters ending in a stop, and a badly OCR'd scan
     * simply has none — it throws rather than returning something that would
     * anchor nowhere. That is the right behaviour and the wrong place to die:
     * one unusable reading in a library of thirty should cost that reading,
     * not the whole seed. Skipped readings are named at the end.
     */
    try {
      pickPassage(pages, 2, 0)
      pickPassage(pages, 3, 0)
    } catch {
      unusable.push(r.title)
      continue
    }
    readable.push({ id: r.id, title: r.title, pages })
  }

  /**
   * WHAT EACH STUDENT HAS ALREADY COINED.
   *
   * A Concept belongs to the USER, not to a reading, and it gathers evidence
   * as the student meets the same idea again — the journey's own words are
   * "name the concept it evidences" and then, three steps later, "see what
   * recurs" (src/lib/workflows.ts). The seed did the opposite: it minted two
   * NEW concept rows on every call, once per reading, so Test User F ended up
   * with 62 concepts across 7 labels and twelve separate concepts all called
   * "citation as claim" (TJ, 2026-08-24: "test user f seems to have multiple
   * copies of the same concept. how is this possible?").
   *
   * Nothing in the app forbids it — `createConcept` does not dedupe by label,
   * and two concepts may honestly share a name. But a student reuses one: the
   * add-concept card offers what they already hold, and picking it is the
   * ordinary gesture. Twelve copies is not a student, it is a loop.
   *
   * So each of these ledgers is one person's vocabulary. A label is coined the
   * first time it is needed and reused every time after, which is also what
   * gives the fixture a concept with evidence from a dozen readings — the
   * thing the weave is for, and which no seeded account had.
   */
  const ledgers = new Map<string, {
    concepts: Map<string, string>
    links: Map<string, string>
    threads: Set<string>
  }>()
  const ledgerFor = (userId: string) => {
    let led = ledgers.get(userId)
    if (!led) {
      led = { concepts: new Map(), links: new Map(), threads: new Set() }
      ledgers.set(userId, led)
    }
    return led
  }

  /** Coin a concept once; hand back the same one every time after. */
  const conceptFor = async (user: { id: string }, label: string, def: string) => {
    const led = ledgerFor(user.id)
    const held = led.concepts.get(label)
    if (held) return held
    const [made] = await db.insert(concepts).values({
      userId: user.id, courseId: course.id, label, def, note: "", createdAt: at(),
    }).returning()
    led.concepts.set(label, made.id)
    return made.id
  }

  /**
   * One thread between one pair, coined once.
   *
   * The same bug one level up: with the concepts reused, a thread minted per
   * reading would put thirty-one identical edges between the same two cards —
   * a board with one connector drawn thirty-one times. A thread is a claim
   * about two concepts, and it is made once.
   *
   * Links dedupe case-insensitively per person, the way `resolveLink` does in
   * src/actions/loom.ts.
   */
  const threadFor = async (
    user: { id: string }, fromId: string, toId: string, sentence: string, handle: string
  ) => {
    const led = ledgerFor(user.id)
    const pair = `${fromId}>${toId}`
    if (led.threads.has(pair)) return
    led.threads.add(pair)

    const key = handle.trim().toLowerCase()
    let linkId = led.links.get(key)
    if (!linkId) {
      const [link] = await db.insert(links).values({
        userId: user.id, courseId: course.id, label: handle.trim(), description: "", createdAt: at(),
      }).returning()
      linkId = link.id
      led.links.set(key, linkId)
    }
    await db.insert(edges).values({
      userId: user.id, courseId: course.id, fromId, toId,
      sentence, handle: handle.trim(), linkId, createdAt: at(),
    })
  }

  /**
   * THE WORKSPACE THE WORK WAS DONE IN.
   *
   * A `cloth` row is the per-scope identity — the title and the read paragraph
   * a student writes on 03 — and only `saveCloth` ever writes one. The seed
   * called that path for Test User A alone, so every other seeded account had
   * concepts, passages, threads and projections and no cloth at all (TJ,
   * 2026-08-24: "how can a user have concepts but no cloths?").
   *
   * Legal, since a cloth exists only once you name one. But it is not a
   * picture of anybody who did the work, and it is the reading's own heading
   * on 03, so those accounts opened the station with nothing at the top of it.
   *
   * One per reading the student worked, which is the shape A already has.
   */
  const clothFor = async (user: { id: string }, scopeKey: string, title: string, description: string) => {
    await db.insert(cloths).values({
      userId: user.id, courseId: course.id, scopeKey, title, description,
      createdAt: at(), updatedAt: at(),
    }).onConflictDoNothing()
  }

  /**
   * The two colleagues get theirs too. They were seeded long before E-I and
   * had the same gap for the same reason — nothing in the seed had ever
   * called the cloth path except Test User A's own block.
   */
  await clothFor(userC, srcA.id, labelA.slice(0, 60),
    "Two trades talking past each other, and the meeting is where that gets fixed.")
  await clothFor(userC, srcB.id, labelB.slice(0, 60),
    "Belonging first, competence after — that order is the argument.")
  await clothFor(userD, srcA.id, labelA.slice(0, 60),
    "What nobody could say out loud is sitting in the finished object.")
  await clothFor(userD, srcB.id, labelB.slice(0, 60),
    "You learn this by standing next to it, not by being told it.")

  /**
   * One student's work in one reading: two passages, each filed under a concept
   * of their own, and a thread between those two concepts.
   *
   * Deliberately the same SHAPE in every reading rather than a different
   * pretend story each time. TJ asked for reasonable data rather than random,
   * and reasonable here means legible: a reader opening any reading meets the
   * same kind of work, so what differs between readings is the cohort's
   * overlap rather than the fixture's mood.
   */
  const workReading = async (
    user: { id: string },
    reading: { id: string; title: string; pages: PageRow[] },
    labelIndex: number,
    extras?: {
      note?: string
      question?: string
      pullQuote?: boolean
      tier?: "p" | "s" | "t"
      /** A passage filed under NOTHING — the unlabeled state. */
      unlabeled?: boolean
      /** A passage filed under BOTH concepts — the refiled state. */
      refiled?: boolean
    }
  ) => {
    const first = DEEP_LABELS[labelIndex % DEEP_LABELS.length]
    const second = DEEP_LABELS[(labelIndex + 1) % DEEP_LABELS.length]
    // Coined on first meeting, reused on every one after — so by the end of
    // the syllabus these five labels each carry evidence from a dozen
    // readings, which is what a concept is for and what no seeded account had.
    const made = [
      { id: await conceptFor(user, first[0], first[1]) },
      { id: await conceptFor(user, second[0], second[1]) },
    ]

    const picks = [pickPassage(reading.pages, 2, 0), pickPassage(reading.pages, 3, 0)]
    const rows = picks.map((pick, i) => ({
      id: crypto.randomUUID(),
      userId: user.id, courseId: course.id,
      source: reading.title, sourceId: reading.id, location: `p. ${pick.pageNumber}`,
      content: pick.content, pageNumber: pick.pageNumber, startOffset: pick.startOffset,
      endOffset: pick.endOffset, pageContentHash: pick.pageContentHash,
      note: i === 0 ? extras?.note ?? "" : "",
      question: i === 0 ? extras?.question ?? "" : "",
      isPullQuote: i === 1 ? extras?.pullQuote ?? false : false,
      // The union the column carries, not a widened string.
      tier: (i === 0 ? extras?.tier ?? "" : "") as "" | "p" | "s" | "t",
      createdAt: at(),
    }))
    await db.insert(passages).values(rows)

    const filings: { passageId: string; conceptId: string; createdAt: Date }[] = []
    // Filed once, or twice, or — for the unlabeled state — not at all. A
    // passage with no pointer is legal and has its own empty state on screen;
    // nothing in the seed produced one before.
    if (!extras?.unlabeled) {
      filings.push({ passageId: rows[0].id, conceptId: made[0].id, createdAt: rows[0].createdAt })
      if (extras?.refiled) {
        filings.push({ passageId: rows[0].id, conceptId: made[1].id, createdAt: rows[0].createdAt })
      }
    }
    filings.push({ passageId: rows[1].id, conceptId: made[1].id, createdAt: rows[1].createdAt })
    await db.insert(passageConcepts).values(filings)

    await threadFor(
      user, made[0].id, made[1].id,
      "The first is the instrument the second gets read with.",
      "is read through"
    )

    return { concepts: made, passages: rows }
  }

  /**
   * A PROJECTION PER READING, for the two who work everywhere.
   *
   * A projection is the artifact a student submits, and until now exactly one
   * account had any — two, both on the same two readings — so no faculty
   * surface could be looked at with a full syllabus of them behind it.
   */
  const projectReading = async (
    user: { id: string },
    reading: { id: string; title: string },
    made: { id: string }[],
    /** One reading gets a set-aside concept and a bent thread; see below. */
    ornate = false
  ) => {
    const [m] = await db.insert(maps).values({
      userId: user.id, courseId: course.id, scopeKey: reading.id,
      name: `A reading of ${reading.title.slice(0, 40)}`,
      essence: "What this text gives me is a way of reading the next one.",
      read: "Taken on its own terms this is less an argument to agree with than an apparatus to pick up: it says where to stand and what to count as evidence, and the rest follows from that.",
      // "x" is SET ASIDE, and it had never been written — only p/s/t were, so
      // the set-aside chip and the board's own count of them were dark.
      tiers: ornate
        ? { [made[0].id]: "p", [made[1].id]: "x" }
        : { [made[0].id]: "p", [made[1].id]: "s" },
      createdAt: at(), updatedAt: at(),
    }).returning()

    await db.insert(views).values({
      userId: user.id, courseId: course.id, key: `map:${m.id}`,
      data: {
        positions: { [made[0].id]: { x: 0.32, y: 90 }, [made[1].id]: { x: 0.62, y: 300 } },
        // A BENT thread, which nothing seeded before: the bend handle and every
        // curved connector on the board were unreachable on a seeded database.
        bends: ornate ? { [`${made[0].id}:${made[1].id}`]: 46 } : {},
      },
      // The view row has no createdAt of its own — the geometry is a current
      // state, not an act; the act is in the map's timestamps.
      updatedAt: at(),
    })
    return m
  }

  // E and F work the whole syllabus. E's first two readings also carry the
  // states the margin never had.
  let deepPassages = 0
  let deepMaps = 0
  for (const [i, reading] of readable.entries()) {
    const e = await workReading(userE, reading, i, i === 0
      ? {
          note: "This is the sentence the chapter turns on — come back to it.",
          question: "Does this hold when the object is software rather than a machine?",
          pullQuote: true,
          tier: "p",
          refiled: true,
        }
      : i === 1
        ? { unlabeled: true }
        : undefined)
    await projectReading(userE, reading, e.concepts, i === 0)
    const f = await workReading(userF, reading, i + 2)
    await projectReading(userF, reading, f.concepts)
    // The station's own heading, written by anyone who worked here.
    await clothFor(userE, reading.id, reading.title.slice(0, 60),
      "Read for what it hands me to read the next one with: the apparatus first, the argument second.")
    await clothFor(userF, reading.id, reading.title.slice(0, 60),
      "I keep coming back to the same few ideas here, which is either the reading or me.")
    deepPassages += e.passages.length + f.passages.length
    deepMaps += 2
  }

  /**
   * THE DEPTH LADDER.
   *
   * Heat is graded on a five-step ramp against the densest run in the reading,
   * and the seed produced runs of exactly 1 and 3 — so three of the five steps
   * could not be painted, and no question about the ramp could be answered
   * from seeded data at all.
   *
   * `sharedA` is the span A, C and D already mark. Adding these five takes it
   * to 8, and two shallower runs sit beside it, so one reading now carries
   * depths 8, 4, 2 and 1 and the ramp is exercised end to end.
   */
  const ladder = readable.find((r) => r.id === srcA.id)
  if (ladder) {
    const depth = async (people: { id: string }[], pick: ReturnType<typeof pickPassage>, label: string) => {
      for (const u of people) {
        // Through the ledger like everything else: E and F meet these labels
        // once each, and a second visit would otherwise mint a second copy —
        // the same duplication this seed was full of.
        const conceptId = await conceptFor(u, label, "A run the cohort converged on.")
        const row = {
          id: crypto.randomUUID(), userId: u.id, courseId: course.id,
          source: labelA, sourceId: srcA.id, location: `p. ${pick.pageNumber}`,
          content: pick.content, pageNumber: pick.pageNumber, startOffset: pick.startOffset,
          endOffset: pick.endOffset, pageContentHash: pick.pageContentHash, createdAt: at(),
        }
        await db.insert(passages).values(row)
        await db.insert(passageConcepts).values({ passageId: row.id, conceptId, createdAt: row.createdAt })
      }
    }
    /**
     * WHO ALREADY HOLDS WHAT, counted rather than assumed.
     *
     * `sharedA` is `pickPassage(pagesA, 2, 0)` — and that is the SAME span
     * `workReading` takes as its first pick, so E and F are already on it. The
     * first attempt added all five here and measured a run of TEN rather than
     * eight: `heatSpans` counts overlapping intervals, not distinct people, so
     * a student who marks one span twice counts twice. Only G, H and I are
     * missing from it.
     *
     * The two shallower runs use skips nothing else touches: A takes skip 0 on
     * this page, C skip 2 and D skip 3, so 4 and 5 are free.
     */
    await depth([userG, userH, userI], sharedA, "the converged sentence") // → 8
    await depth([userE, userF, userG, userH], pickPassage(pagesA, 2, 4), "the middle run") // → 4
    await depth([userE, userF], pickPassage(pagesA, 2, 5), "the quiet run") // → 2

    // G, H and I work in this one reading and nowhere else, so this is the
    // only station they have — and without a cloth it opened unnamed.
    for (const u of [userG, userH, userI]) {
      await clothFor(u, srcA.id, labelA.slice(0, 60),
        "One sentence in here is doing the work of the whole chapter.")
    }
  }

  /**
   * A PENDING INVITE. `course_allowed_email` was never seeded, so the roster's
   * invited pill, its pending-first sort and the whole not-yet-signed-in state
   * could not be seen (src/actions/admin.ts).
   */
  await db.delete(courseAllowedEmails)
    .where(and(eq(courseAllowedEmails.courseId, course.id), eq(courseAllowedEmails.email, INVITED_EMAIL)))
  await db.insert(courseAllowedEmails).values({
    courseId: course.id, email: INVITED_EMAIL, sectionId: demoSection.id,
  })

  const tally = { concepts: conceptRows.length, passages: 10, edges: 6, links: 6, maps: 2 }
  console.log(`[seed-demo] ${USER_A.email}: ${tally.concepts} concepts · ${tally.passages} passages from 2 readings · ${tally.edges} threads · ${tally.links} links (1 glossed, 1 with no thread) · ${tally.maps} maps`)
  console.log(`[seed-demo] ${USER_B.email}: enrolled, empty`)
  console.log(`[seed-demo] ${USER_C.email}: 3 concepts · 3 passages · 1 thread — a colleague in ${DEMO_SECTION.name}`)
  console.log(`[seed-demo] ${USER_D.email}: 4 concepts · 4 passages · 3 threads (1 unlabeled, 1 never spoken) — a colleague in ${DEMO_SECTION.name}`)
  console.log(`[seed-demo] E-I: ${deepPassages} passages and ${deepMaps} projections across ${readable.length} readings, plus a depth ladder on ${READING_A} (runs of 8, 4, 2 and 1)`)
  console.log(`[seed-demo] ${INVITED_EMAIL}: invited, never signed in`)
  if (unusable.length) {
    console.log(`[seed-demo] ${unusable.length} reading(s) skipped — their page text yields no usable sentence:`)
    for (const t of unusable) console.log(`[seed-demo]   ${t.slice(0, 64)}`)
  }
  console.log(`[seed-demo] sign in locally via /api/auth/test-login?as=testa`)
}

main().then(
  () => process.exit(0),
  (e) => { console.error("[seed-demo] failed:", e instanceof Error ? e.message : e); process.exit(1) },
)
