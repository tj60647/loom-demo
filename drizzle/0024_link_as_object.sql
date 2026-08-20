-- 5.1 Link as object — docs/link-as-object.md, ruled by TJ 2026-08-10:
-- "links are user-level".
--
-- A Link becomes an object the student owns (Label + its own gloss) instead of
-- a string copied onto every thread. That is what makes three things possible
-- that are not today: a Link that EXISTS BEFORE ANY THREAD USES IT (TJ's case),
-- one gloss shared by every thread that uses the label, and a Link List that
-- is read rather than derived by grouping strings.
--
-- EXPAND ONLY. The design note plans this as one migration ending in
-- `DROP COLUMN edge.handle`; this deliberately stops short of that:
--   · nothing is destroyed, so a bad backfill costs nothing;
--   · `handle` keeps working while the code changes over, and every reader
--     can fall back to it (production is three migrations behind, and a
--     column that vanishes under old code is an outage);
--   · import still reads `handle` and is being deleted anyway (open-work 5.7),
--     so writing compatibility for it now would be work thrown away twice.
-- The drop is its own later migration, once linkId is proven in the field.
--
-- Idempotent throughout, like 0021: every step tolerates a re-run.

-- 1 · The link table. User-level (TJ): a Link belongs to the student, as a
--     Concept does — so they can gloss "leads to" in their own words. NO
--     unique on label: homonyms are warned, never forbidden (ruling 36), the
--     same rule Concepts live under.
CREATE TABLE IF NOT EXISTS "link" (
	"id" text PRIMARY KEY NOT NULL,
	"courseId" text,
	"userId" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "link"
		ADD CONSTRAINT "link_courseId_course_id_fk"
		FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "link"
		ADD CONSTRAINT "link_userId_user_id_fk"
		FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "link_user_course_idx" ON "link" ("userId","courseId");--> statement-breakpoint

-- 2 · The thread points at its link. Nullable for the whole life of the
--     column: a thread may be thrown before it is labelled (P0.3, the golden
--     path connects first and describes later).
DO $$ BEGIN
	ALTER TABLE "edge" ADD COLUMN "linkId" text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "edge"
		ADD CONSTRAINT "edge_linkId_link_id_fk"
		FOREIGN KEY ("linkId") REFERENCES "link"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- (No index on edge.linkId yet: no query reads threads-by-link today, and an
--  index the schema does not declare drifts on the next `drizzle-kit
--  generate`. It arrives with the query that needs it.)

-- 3 · Backfill: one Link per distinct (userId, lower(label)) among the handles
--     already coined. Case-insensitive because that is how the derived Link
--     List has always grouped them — "Leads to" and "leads to" were one row on
--     screen, and the split must not silently mint two objects where the
--     student saw one. The surviving spelling is the earliest thrown, which is
--     the one they coined first.
INSERT INTO "link" ("id", "courseId", "userId", "label", "description", "createdAt")
SELECT
	gen_random_uuid()::text,
	first_value("courseId") OVER w,
	"userId",
	first_value(btrim("handle")) OVER w,
	'',
	min("createdAt") OVER w
FROM (
	SELECT DISTINCT ON ("userId", lower(btrim("handle")))
		"userId", "courseId", "handle", "createdAt"
	FROM "edge"
	WHERE "handle" IS NOT NULL AND btrim("handle") <> ''
	ORDER BY "userId", lower(btrim("handle")), "createdAt"
) AS coined
WINDOW w AS (PARTITION BY "userId", lower(btrim("handle")))
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 4 · Point every labelled thread at its link, matched on the same key.
UPDATE "edge" e
SET "linkId" = l."id"
FROM "link" l
WHERE e."linkId" IS NULL
  AND e."userId" = l."userId"
  AND e."handle" IS NOT NULL
  AND lower(btrim(e."handle")) = lower(btrim(l."label"));--> statement-breakpoint

-- 5 · Search the Link objects. The existing edge_search_idx spans handle +
--     sentence and STAYS until the drop, so nothing that queries it breaks;
--     this adds the object's own index beside it. Label outranks gloss, the
--     same weighting the handle had. Query side must repeat this verbatim.
CREATE INDEX IF NOT EXISTS "link_search_idx" ON "link" USING gin (
	(setweight(to_tsvector('english', coalesce("label", '')), 'A') ||
	 setweight(to_tsvector('english', coalesce("description", '')), 'B'))
);
