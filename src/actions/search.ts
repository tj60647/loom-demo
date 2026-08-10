"use server"

// Text search over the readings — the shelf-wide "which reading says this?"
// and the in-document "where does it say it?".
//
// Plain Postgres full-text search, deliberately: websearch_to_tsquery gives
// word matching with stemming, quoted "phrase match", -exclusion and OR from
// ordinary typed input without ever raising a syntax error; ts_rank orders;
// ts_headline excerpts. No model anywhere near it (red line #1) — the same
// query returns the same pages for every student, and a match is a fact about
// the text, not a judgment about the student.
//
// Both actions scope through getSources(), so search can never surface a
// reading its caller could not already open — and the shelf-wide search
// narrows further to published readings: the reading list, not the library.
// The tsvector expressions below repeat src/db/schema.ts's index expressions
// verbatim — an expression index only serves queries that match it exactly.

import { db } from "@/db"
import { sql, type SQL } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getSources } from "@/actions/sources"
import { resolveCourseIdForUser } from "@/lib/courses"
import { SNIPPET_OPEN, SNIPPET_CLOSE } from "@/lib/searchText"

/** ts_headline options; markers documented in src/lib/searchText.ts. */
const HEADLINE_OPTIONS = `StartSel=${SNIPPET_OPEN}, StopSel=${SNIPPET_CLOSE}, MaxWords=16, MinWords=6, ShortWord=2, MaxFragments=2, FragmentDelimiter=" … "`

/** Longest query worth parsing; anything more is pasted prose, truncated. */
const MAX_QUERY_LENGTH = 200
/** Most readings a shelf search returns. */
const MAX_READING_HITS = 30
/** Most pages an in-document search lists. */
const MAX_PAGE_HITS = 50

export type ReadingSearchExcerpt = {
  pageNumber: number
  /** Marked with SNIPPET_OPEN/CLOSE; render via splitSnippet, never as HTML. */
  snippet: string
}

export type ReadingSearchHit = {
  sourceId: string
  title: string
  author: string | null
  week: number | null
  isOwn: boolean
  hasFile: boolean
  /** The reading's card (title/author/citation/blurb) matched. */
  matchedCard: boolean
  /** How many pages of the text match; 0 for a card-only match. */
  pageHits: number
  /** The best-matching page or two, as marked snippets. */
  excerpts: ReadingSearchExcerpt[]
}

export type ReadingPageHit = {
  pageNumber: number
  /** Marked like ReadingSearchExcerpt.snippet. */
  snippet: string
}

export type ReadingPageSearch = {
  hits: ReadingPageHit[]
  /** True when more pages match than the list carries. */
  truncated: boolean
}

function normalizeQuery(raw: string) {
  return raw.trim().slice(0, MAX_QUERY_LENGTH)
}

function idList(ids: string[]): SQL {
  return sql.join(ids.map((id) => sql`${id}`), sql`, `)
}

/**
 * Search every reading on the caller's shelf — course readings and their own
 * cards alike — by card metadata and by the canonical page text.
 *
 * Ordered by rank, not week: a card whose TITLE matches outranks a reading
 * that merely mentions the words, and among texts the best page wins, with a
 * small nudge for matching in many places.
 */
export async function searchReadings(rawQuery: string, sourceId?: string | null): Promise<ReadingSearchHit[]> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return []

  const query = normalizeQuery(rawQuery)
  if (query.length < 2) return []

  // The reading list, not the library: getSources() hands an admin the
  // staged (hidden) course readings too, but this search speaks for the
  // shelf, and a reading not yet published is on nobody's list. A learner's
  // rows are visible-only already, so this narrows only the admin's view;
  // in-document search (below) keeps the wider gate, since an admin can
  // legitimately open a staged reading and find within it.
  // Contextual scope (TJ, 2026-08-10): the Library searches the loom; a
  // reading searches itself. With a sourceId the shelf narrows to that one
  // reading — same gates, smaller room.
  const shelf = (await getSources())
    .filter((source) => source.isVisible)
    .filter((source) => !sourceId || source.id === sourceId)
  if (shelf.length === 0) return []
  const shelfOrder = new Map(shelf.map((source, index) => [source.id, index]))
  const ids = shelf.map((source) => source.id)

  // Card matches. The weighted vector is schema.ts's source_search_idx.
  const cardResult = await db.execute(sql`
    WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS query)
    SELECT s."id" AS "sourceId",
           ts_rank(
             (setweight(to_tsvector('english', coalesce(s."title", '')), 'A') ||
              setweight(to_tsvector('english', coalesce(s."author", '')), 'B') ||
              setweight(to_tsvector('english', coalesce(s."sourceReference", '')), 'C') ||
              setweight(to_tsvector('english', coalesce(s."description", '')), 'C')),
             q.query
           ) AS rank
    FROM "source" s, q
    WHERE s."id" IN (${idList(ids)})
      AND (setweight(to_tsvector('english', coalesce(s."title", '')), 'A') ||
           setweight(to_tsvector('english', coalesce(s."author", '')), 'B') ||
           setweight(to_tsvector('english', coalesce(s."sourceReference", '')), 'C') ||
           setweight(to_tsvector('english', coalesce(s."description", '')), 'C')) @@ q.query
  `)
  const cardRank = new Map<string, number>()
  for (const row of cardResult.rows as { sourceId: string; rank: unknown }[]) {
    cardRank.set(row.sourceId, Number(row.rank) || 0)
  }

  // Page matches: every matching page ranked, then ts_headline computed only
  // for the page or two per reading the results actually show — headline
  // re-parses the whole document text, so it must never run per candidate row.
  // DISTINCT ON guards against duplicated (sourceId, pageNumber) rows, which
  // the schema does not forbid.
  const pageResult = await db.execute(sql`
    WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS query),
    hits AS (
      SELECT DISTINCT ON (p."sourceId", p."pageNumber")
             p."id", p."sourceId", p."pageNumber",
             ts_rank(to_tsvector('english', p."textContent"), q.query) AS rank
      FROM "source_page" p, q
      WHERE p."sourceId" IN (${idList(ids)})
        AND to_tsvector('english', p."textContent") @@ q.query
      ORDER BY p."sourceId", p."pageNumber", p."createdAt" DESC
    ),
    ranked AS (
      SELECT h.*,
             row_number() OVER (PARTITION BY h."sourceId" ORDER BY h.rank DESC, h."pageNumber") AS rn,
             count(*) OVER (PARTITION BY h."sourceId") AS "pageHits"
      FROM hits h
    )
    SELECT r."sourceId", r."pageNumber", r.rank, r."pageHits",
           ts_headline('english', p."textContent", q.query, ${HEADLINE_OPTIONS}) AS snippet
    FROM ranked r
    JOIN "source_page" p ON p."id" = r."id", q
    WHERE r.rn <= 2
    ORDER BY r."sourceId", r.rank DESC, r."pageNumber"
  `)

  const pagesBySource = new Map<string, { pageHits: number; bestRank: number; excerpts: ReadingSearchExcerpt[] }>()
  for (const row of pageResult.rows as {
    sourceId: string
    pageNumber: number
    rank: unknown
    pageHits: unknown
    snippet: string
  }[]) {
    const entry = pagesBySource.get(row.sourceId) ?? {
      pageHits: Number(row.pageHits) || 0,
      bestRank: 0,
      excerpts: [],
    }
    entry.bestRank = Math.max(entry.bestRank, Number(row.rank) || 0)
    entry.excerpts.push({ pageNumber: row.pageNumber, snippet: row.snippet })
    pagesBySource.set(row.sourceId, entry)
  }

  const scored: { hit: ReadingSearchHit; score: number }[] = []
  for (const source of shelf) {
    const card = cardRank.get(source.id) ?? 0
    const pages = pagesBySource.get(source.id)
    if (card === 0 && !pages) continue
    scored.push({
      hit: {
        sourceId: source.id,
        title: source.title,
        author: source.author,
        week: source.week,
        isOwn: source.isOwn,
        hasFile: !!source.storageKey,
        matchedCard: card > 0,
        pageHits: pages?.pageHits ?? 0,
        excerpts: pages?.excerpts ?? [],
      },
      // A card match dominates (the title IS the reading); among texts the
      // best page wins, nudged by how widely the reading matches.
      score: 8 * card + (pages?.bestRank ?? 0) + Math.min(pages?.pageHits ?? 0, 25) * 0.01,
    })
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (shelfOrder.get(a.hit.sourceId) ?? 0) - (shelfOrder.get(b.hit.sourceId) ?? 0)
  )

  return scored.slice(0, MAX_READING_HITS).map((entry) => entry.hit)
}

// --- UNIFIED SEARCH, scopes 3–4 (ruling 34) ---
// The student's own holdings: concepts (label/gloss/note), links
// (term/sentence), and passages (text/margin). Same contract as above: plain
// FTS, no model, the caller sees only their own rows. Grouped by kind — a
// match in a reading is not the same act as a match in your own vocabulary.

const MAX_LOOM_HITS = 12

export type LoomSearchResult = {
  concepts: { id: string; label: string; snippet: string }[]
  links: { id: string; handle: string; fromLabel: string; toLabel: string; snippet: string }[]
  passages: { id: string; sourceId: string | null; source: string; snippet: string }[]
  /** Single-reading cloths only — scopeKey IS the sourceId for those. */
  cloths: { sourceId: string; title: string; snippet: string }[]
  /** Single-reading projections only, for the same reason as cloths. */
  projections: { id: string; sourceId: string; name: string; snippet: string }[]
}

/**
 * Search the student's own holdings. Contextual scope (TJ, 2026-08-10):
 * without a sourceId this is the whole loom (the Library's search); with one
 * it is that reading's slice — its passages, its cloth and projections, the
 * concepts evidenced there and the links between them.
 */
export async function searchLoom(rawQuery: string, sourceId?: string | null): Promise<LoomSearchResult> {
  const empty: LoomSearchResult = { concepts: [], links: [], passages: [], cloths: [], projections: [] }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return empty
  const userId = session.user.id

  const query = normalizeQuery(rawQuery)
  if (query.length < 2) return empty

  // "This reading's concepts" is the scope the workbench draws: the concepts
  // a passage of this reading evidences. Links follow ThrowTab's rule —
  // this reading's threads only, both ends evidenced here.
  const conceptsHere = sourceId
    ? sql`(SELECT pc."conceptId" FROM "passage_concept" pc
           JOIN "passage" p ON p."id" = pc."passageId"
           WHERE p."userId" = ${userId} AND p."sourceId" = ${sourceId})`
    : null

  // Same course lens the loom actions resolve — plus the not-yet-adopted
  // null-course rows, which belong to this student all the same. Read-only:
  // search never performs the adoption writes.
  const courseId = await resolveCourseIdForUser(userId, null)
  const conceptScope = courseId
    ? sql`("concept"."courseId" = ${courseId} OR "concept"."courseId" IS NULL)`
    : sql`"concept"."courseId" IS NULL`
  const edgeScope = courseId
    ? sql`("edge"."courseId" = ${courseId} OR "edge"."courseId" IS NULL)`
    : sql`"edge"."courseId" IS NULL`
  const passageScope = courseId
    ? sql`("passage"."courseId" = ${courseId} OR "passage"."courseId" IS NULL)`
    : sql`"passage"."courseId" IS NULL`

  // Each vector repeats its index expression from src/db/schema.ts verbatim.
  const conceptResult = await db.execute(sql`
    WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS query)
    SELECT "concept"."id", "concept"."label",
           ts_headline('english', coalesce(nullif("concept"."def", ''), "concept"."label"), q.query, ${HEADLINE_OPTIONS}) AS snippet,
           ts_rank(
             (setweight(to_tsvector('english', coalesce("concept"."label", '')), 'A') ||
              setweight(to_tsvector('english', coalesce("concept"."def", '')), 'B') ||
              setweight(to_tsvector('english', coalesce("concept"."note", '')), 'C')),
             q.query
           ) AS rank
    FROM "concept", q
    WHERE "concept"."userId" = ${userId} AND ${conceptScope}
      ${conceptsHere ? sql`AND "concept"."id" IN ${conceptsHere}` : sql.raw("")}
      AND (setweight(to_tsvector('english', coalesce("concept"."label", '')), 'A') ||
           setweight(to_tsvector('english', coalesce("concept"."def", '')), 'B') ||
           setweight(to_tsvector('english', coalesce("concept"."note", '')), 'C')) @@ q.query
    ORDER BY rank DESC, "concept"."createdAt"
    LIMIT ${MAX_LOOM_HITS}
  `)

  const edgeResult = await db.execute(sql`
    WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS query)
    SELECT "edge"."id", "edge"."handle",
           f."label" AS "fromLabel", t."label" AS "toLabel",
           ts_headline('english', coalesce(nullif("edge"."sentence", ''), "edge"."handle"), q.query, ${HEADLINE_OPTIONS}) AS snippet,
           ts_rank(
             (setweight(to_tsvector('english', coalesce("edge"."handle", '')), 'A') ||
              setweight(to_tsvector('english', coalesce("edge"."sentence", '')), 'B')),
             q.query
           ) AS rank
    FROM "edge"
    JOIN "concept" f ON f."id" = "edge"."fromId"
    JOIN "concept" t ON t."id" = "edge"."toId", q
    WHERE "edge"."userId" = ${userId} AND ${edgeScope}
      ${conceptsHere ? sql`AND "edge"."fromId" IN ${conceptsHere} AND "edge"."toId" IN ${conceptsHere}` : sql.raw("")}
      AND (setweight(to_tsvector('english', coalesce("edge"."handle", '')), 'A') ||
           setweight(to_tsvector('english', coalesce("edge"."sentence", '')), 'B')) @@ q.query
    ORDER BY rank DESC, "edge"."createdAt"
    LIMIT ${MAX_LOOM_HITS}
  `)

  const passageResult = await db.execute(sql`
    WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS query)
    SELECT "passage"."id", "passage"."sourceId", "passage"."source",
           ts_headline('english', "passage"."content", q.query, ${HEADLINE_OPTIONS}) AS snippet,
           ts_rank(
             (setweight(to_tsvector('english', "passage"."content"), 'B') ||
              setweight(to_tsvector('english', coalesce("passage"."note", '')), 'C') ||
              setweight(to_tsvector('english', coalesce("passage"."question", '')), 'C')),
             q.query
           ) AS rank
    FROM "passage", q
    WHERE "passage"."userId" = ${userId} AND ${passageScope}
      ${sourceId ? sql`AND "passage"."sourceId" = ${sourceId}` : sql.raw("")}
      AND (setweight(to_tsvector('english', "passage"."content"), 'B') ||
           setweight(to_tsvector('english', coalesce("passage"."note", '')), 'C') ||
           setweight(to_tsvector('english', coalesce("passage"."question", '')), 'C')) @@ q.query
    ORDER BY rank DESC, "passage"."createdAt"
    LIMIT ${MAX_LOOM_HITS}
  `)

  // The cloth — the reading's own interpretation — searches by title and
  // description. No GIN index, deliberately: one cloth per reading per user
  // is tens of rows, the expression scan costs nothing, and an index would
  // mean a migration production has not got. Single-reading cloths only
  // (scopeKey = the sourceId, no comma, not ''): the whole-weave cloth has no
  // reachable surface (the Weave ruling), and a search hit must never be a
  // door to a room that does not exist.
  const clothScope = courseId
    ? sql`("cloth"."courseId" = ${courseId} OR "cloth"."courseId" IS NULL)`
    : sql`"cloth"."courseId" IS NULL`
  const clothResult = await db.execute(sql`
    WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS query)
    SELECT "cloth"."scopeKey" AS "sourceId", "cloth"."title",
           ts_headline('english', coalesce(nullif("cloth"."description", ''), "cloth"."title"), q.query, ${HEADLINE_OPTIONS}) AS snippet,
           ts_rank(
             (setweight(to_tsvector('english', coalesce("cloth"."title", '')), 'A') ||
              setweight(to_tsvector('english', coalesce("cloth"."description", '')), 'B')),
             q.query
           ) AS rank
    FROM "cloth", q
    WHERE "cloth"."userId" = ${userId} AND ${clothScope}
      ${sourceId
        ? sql`AND "cloth"."scopeKey" = ${sourceId}`
        : sql`AND "cloth"."scopeKey" <> '' AND position(',' IN "cloth"."scopeKey") = 0`}
      AND (setweight(to_tsvector('english', coalesce("cloth"."title", '')), 'A') ||
           setweight(to_tsvector('english', coalesce("cloth"."description", '')), 'B')) @@ q.query
    ORDER BY rank DESC, "cloth"."updatedAt" DESC
    LIMIT ${MAX_LOOM_HITS}
  `)

  // Projections — Title, One-line, Description — under the same rules as
  // cloths: unindexed on purpose (a handful of rows per user; an index would
  // be a migration), and single-reading scopeKeys only, because a whole-weave
  // projection has no reachable surface until the weave is ruled.
  const mapScope = courseId
    ? sql`("map"."courseId" = ${courseId} OR "map"."courseId" IS NULL)`
    : sql`"map"."courseId" IS NULL`
  const mapResult = await db.execute(sql`
    WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS query)
    SELECT "map"."id", "map"."scopeKey" AS "sourceId", "map"."name",
           ts_headline('english', coalesce(nullif("map"."read", ''), nullif("map"."essence", ''), "map"."name"), q.query, ${HEADLINE_OPTIONS}) AS snippet,
           ts_rank(
             (setweight(to_tsvector('english', coalesce("map"."name", '')), 'A') ||
              setweight(to_tsvector('english', coalesce("map"."essence", '')), 'B') ||
              setweight(to_tsvector('english', coalesce("map"."read", '')), 'C')),
             q.query
           ) AS rank
    FROM "map", q
    WHERE "map"."userId" = ${userId} AND ${mapScope}
      ${sourceId
        ? sql`AND "map"."scopeKey" = ${sourceId}`
        : sql`AND "map"."scopeKey" <> '' AND position(',' IN "map"."scopeKey") = 0`}
      AND (setweight(to_tsvector('english', coalesce("map"."name", '')), 'A') ||
           setweight(to_tsvector('english', coalesce("map"."essence", '')), 'B') ||
           setweight(to_tsvector('english', coalesce("map"."read", '')), 'C')) @@ q.query
    ORDER BY rank DESC, "map"."updatedAt" DESC
    LIMIT ${MAX_LOOM_HITS}
  `)

  return {
    concepts: (conceptResult.rows as { id: string; label: string; snippet: string }[]).map((r) => ({
      id: r.id, label: r.label, snippet: r.snippet,
    })),
    links: (edgeResult.rows as { id: string; handle: string | null; fromLabel: string; toLabel: string; snippet: string }[]).map((r) => ({
      id: r.id, handle: r.handle ?? "", fromLabel: r.fromLabel, toLabel: r.toLabel, snippet: r.snippet,
    })),
    passages: (passageResult.rows as { id: string; sourceId: string | null; source: string | null; snippet: string }[]).map((r) => ({
      id: r.id, sourceId: r.sourceId, source: r.source ?? "", snippet: r.snippet,
    })),
    cloths: (clothResult.rows as { sourceId: string; title: string; snippet: string }[]).map((r) => ({
      sourceId: r.sourceId, title: r.title, snippet: r.snippet,
    })),
    projections: (mapResult.rows as { id: string; sourceId: string; name: string; snippet: string }[]).map((r) => ({
      id: r.id, sourceId: r.sourceId, name: r.name, snippet: r.snippet,
    })),
  }
}

/**
 * Search one reading's pages, in page order — this is "find in the text",
 * so the results read like the text does, not like a rank.
 */
export async function searchReading(sourceId: string, rawQuery: string): Promise<ReadingPageSearch> {
  const empty: ReadingPageSearch = { hits: [], truncated: false }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return empty

  const query = normalizeQuery(rawQuery)
  if (query.length < 2) return empty

  // The same gate the workbench route uses to open a reading at all.
  const shelf = await getSources()
  if (!shelf.some((source) => source.id === sourceId)) return empty

  const result = await db.execute(sql`
    WITH q AS (SELECT websearch_to_tsquery('english', ${query}) AS query),
    hits AS (
      SELECT DISTINCT ON (p."pageNumber") p."id", p."pageNumber"
      FROM "source_page" p, q
      WHERE p."sourceId" = ${sourceId}
        AND to_tsvector('english', p."textContent") @@ q.query
      ORDER BY p."pageNumber", p."createdAt" DESC
    )
    SELECT h."pageNumber",
           ts_headline('english', p."textContent", q.query, ${HEADLINE_OPTIONS}) AS snippet
    FROM hits h
    JOIN "source_page" p ON p."id" = h."id", q
    ORDER BY h."pageNumber"
    LIMIT ${MAX_PAGE_HITS + 1}
  `)

  const rows = result.rows as { pageNumber: number; snippet: string }[]
  return {
    hits: rows.slice(0, MAX_PAGE_HITS).map((row) => ({
      pageNumber: row.pageNumber,
      snippet: row.snippet,
    })),
    truncated: rows.length > MAX_PAGE_HITS,
  }
}
