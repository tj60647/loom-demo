/**
 * Demonstration accounts, rebuilt from scratch on every run.
 *
 *   test-user-a@loom.local — a worked loom: 10 bytes captured from two readings
 *     (Object Worlds, Communities of Practice), 8 concepts (one evidenced in
 *     both readings, one deliberately evidence-less), 6 threads (two of them
 *     cross-reading bridges, one sentence-only), and THREE MAPS — one of each
 *     reading and one of the whole weave — each with its own tiers, essence,
 *     paragraph and card-table arrangement.
 *   test-user-b@loom.local — enrolled and empty: the fresh-account experience.
 *
 * Passages are pulled verbatim from the `source_page` rows with their canonical
 * offsets and content hashes, so they highlight precisely in the PDF viewer.
 * The whole-weave map is written mirror-consistently (concept.tier, the `read`
 * row, and the cardTable view echo it), matching what updateMap/saveView would
 * have produced — the seeded account is indistinguishable from a worked one.
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
  users, courses, courseMemberships, sources, sourcePages,
  concepts, bytes, edges, reads, maps, views, graphEvents,
} from "../src/db/schema"
import { eq, asc, ilike, isNotNull, and } from "drizzle-orm"
import { textLayerProjection } from "../src/lib/pdfText"

const DEMO_DOMAIN = "@loom.local"
const USER_A = { email: "test-user-a@loom.local", name: "Test User A" }
const USER_B = { email: "test-user-b@loom.local", name: "Test User B" }

// The two readings the demo is built from — matched by title prefix, the same
// loose match the Playwright helper uses, since library titles get edited.
const READING_A = "Object Worlds"           // Bucciarelli — Designing Engineers
const READING_B = "Communities of practice" // Wenger (any edition/paper)

type PageRow = { pageNumber: number; textContent: string; contentHash: string }

/** Find a real sentence on a page: starts with a capital, ends with a stop,
 *  120–420 chars. `skip` picks later sentences so bytes don't collide. */
function pickPassage(pages: PageRow[], fromPage: number, skip = 0):
  { content: string; pageNumber: number; startOffset: number; endOffset: number; pageContentHash: string } {
  const re = /[A-Z][^.?!]{120,420}[.?!]/g
  for (const page of pages.filter((p) => p.pageNumber >= fromPage)) {
    // Offsets on a byte index the browser's text layer, not the stored page
    // text — the two differ by the line boundaries extractPdfPageText records.
    // Matching against the stored text would mint offsets that are correct for
    // no string anyone ever reads.
    const found = [...textLayerProjection(page.textContent).matchAll(re)]
    if (found.length > skip) {
      const m = found[skip]
      return {
        content: m[0],
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

  for (const u of [userA, userB]) {
    if (!u.email.endsWith(DEMO_DOMAIN)) throw new Error(`Refusing to touch non-demo account ${u.email}`)
    await db.insert(courseMemberships)
      .values({ courseId: course.id, userId: u.id, role: "LEARNER" })
      .onConflictDoUpdate({
        target: [courseMemberships.courseId, courseMemberships.userId],
        set: { removedAt: null },
      })
    // Demolition: the whole graph, projections and history for this demo user.
    await db.delete(edges).where(eq(edges.userId, u.id))
    await db.delete(bytes).where(eq(bytes.userId, u.id))
    await db.delete(concepts).where(eq(concepts.userId, u.id))
    await db.delete(maps).where(eq(maps.userId, u.id))
    await db.delete(reads).where(eq(reads.userId, u.id))
    await db.delete(views).where(eq(views.userId, u.id))
    await db.delete(graphEvents).where(eq(graphEvents.userId, u.id))
  }
  console.log(`[seed-demo] course "${course.name}" · wiped and re-enrolled A + B`)

  // ---- Test User A's graph -------------------------------------------------
  // Timestamps stagger over a pretend week so "the cloth, over time" replays
  // as a story: concepts appear, evidence accrues, threads follow, maps last.
  const base = Date.now() - 7 * 24 * 60 * 60 * 1000
  let tick = 0
  const at = () => new Date(base + ++tick * 37 * 60 * 1000) // every ~37 minutes

  const C = (label: string, def: string, note = "") => ({
    userId: userA.id, courseId: course.id, label, def, note, tier: "" as const, createdAt: at(),
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
  // The eighth concept ("shared vocabulary") stays byte-less and untiered on
  // purpose — the visible no-evidence state — so it is never referenced again.
  const [oworlds, social, compromise, cop, lpp, reif, negmean] = conceptRows

  const B = (c: { id: string }, src: typeof srcA, srcLabel: string, p: ReturnType<typeof pickPassage>) => ({
    userId: userA.id, courseId: course.id, conceptId: c.id,
    source: srcLabel, sourceId: src.id, location: `p. ${p.pageNumber}`,
    content: p.content, pageNumber: p.pageNumber, startOffset: p.startOffset,
    endOffset: p.endOffset, pageContentHash: p.pageContentHash, createdAt: at(),
  })
  const labelA = "Bucciarelli, Designing Engineers"
  const labelB = "Wenger, Communities of Practice"
  await db.insert(bytes).values([
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
  ])

  const E = (from: { id: string }, to: { id: string }, sentence: string, handle = "") => ({
    userId: userA.id, courseId: course.id, fromId: from.id, toId: to.id, sentence, handle, createdAt: at(),
  })
  await db.insert(edges).values([
    E(oworlds, social, "Different object worlds must be brought into alignment before the design can move.", "constrains"),
    E(social, compromise, "The negotiated process leaves its trace in the artifact itself.", "yields"),
    E(cop, lpp, "A practice admits newcomers from its edges, by degrees of real work.", "admits"),
    E(negmean, reif, "Meaning settles into forms that then push back on the negotiating.", "hardens into"),
    E(oworlds, cop, "Each object world is sustained by its own community of practice.", "is carried by"),
    E(negmean, social, "The design conversation is itself a negotiation of meaning across worlds."), // sentence-only
  ])

  // ---- Three maps: one per reading, one whole-weave (the mirror) ----------
  // Positions: x proportional 0..1, y absolute on the 560px three-band table.
  const pos = (x: number, y: number) => ({ x, y })

  const [mapWeave] = await db.insert(maps).values({
    userId: userA.id, courseId: course.id, scopeKey: "", name: "The whole cloth",
    essence: "Disciplinary worlds hold together only where practice keeps negotiating their meanings.",
    read: "Bucciarelli watches designers fail to share a world and still produce a machine; Wenger explains why that is possible at all. The bridge is negotiation of meaning: the design conversation is not translation between fixed vocabularies but the continuous working-out Wenger describes, and the artifact that results is its reification — a compromise that then constrains the next round. What began as two readings reads as one loop.",
    tiers: {
      [oworlds.id]: "p", [cop.id]: "p",
      [negmean.id]: "s", [social.id]: "s",
      [lpp.id]: "t", [reif.id]: "t",
      [compromise.id]: "x",
      // vocab stays unsorted — the no-evidence concept, visibly unplaced.
    },
    createdAt: at(), updatedAt: at(),
  }).returning()

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

  // Geometry per map. The whole-weave map is the (only) whole-weave map, hence
  // the mirror: its geometry is echoed into cardTable exactly as saveView does.
  const weaveView = {
    positions: {
      [oworlds.id]: pos(0.18, 96), [cop.id]: pos(0.62, 96),
      [negmean.id]: pos(0.40, 268), [social.id]: pos(0.72, 268),
      [lpp.id]: pos(0.22, 432), [reif.id]: pos(0.58, 432),
    },
    bends: {}, order: conceptRows.map((c) => c.id), pins: [oworlds.id],
  }
  const viewA = {
    positions: { [oworlds.id]: pos(0.42, 96), [social.id]: pos(0.42, 268), [compromise.id]: pos(0.42, 432) },
    bends: {}, order: [], pins: [],
  }
  const viewB = {
    positions: { [cop.id]: pos(0.28, 96), [negmean.id]: pos(0.6, 96), [lpp.id]: pos(0.28, 268), [reif.id]: pos(0.6, 268) },
    bends: {}, order: [], pins: [],
  }
  await db.insert(views).values([
    { userId: userA.id, courseId: course.id, key: `map:${mapWeave.id}`, data: weaveView, updatedAt: at() },
    { userId: userA.id, courseId: course.id, key: "cardTable", data: weaveView, updatedAt: at() },
    { userId: userA.id, courseId: course.id, key: `map:${mapA.id}`, data: viewA, updatedAt: at() },
    { userId: userA.id, courseId: course.id, key: `map:${mapB.id}`, data: viewB, updatedAt: at() },
  ])

  // Mirror dual-write, exactly as updateMap would leave it: concept.tier and
  // the read row reflect the oldest whole-weave map.
  for (const [cid, tier] of Object.entries(mapWeave.tiers))
    await db.update(concepts).set({ tier: tier as "p" | "s" | "t" | "x" }).where(eq(concepts.id, cid))
  await db.insert(reads).values({
    userId: userA.id, courseId: course.id, text: mapWeave.read, updatedAt: at(),
  })

  // No graph_event rows are inserted: getGraphEvents synthesizes create events
  // from row timestamps, so the history panel replays the staggered story above.

  const tally = { concepts: conceptRows.length, bytes: 10, edges: 6, maps: 3 }
  console.log(`[seed-demo] ${USER_A.email}: ${tally.concepts} concepts · ${tally.bytes} bytes from 2 readings · ${tally.edges} threads · ${tally.maps} maps`)
  console.log(`[seed-demo] ${USER_B.email}: enrolled, empty`)
  console.log(`[seed-demo] sign in locally via /api/auth/test-login?as=testa`)
}

main().then(
  () => process.exit(0),
  (e) => { console.error("[seed-demo] failed:", e instanceof Error ? e.message : e); process.exit(1) },
)
