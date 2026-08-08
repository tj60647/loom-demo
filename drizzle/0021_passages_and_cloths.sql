-- P0 of docs/loom-refactor-spec.md — the breaking migration set, landed as one
-- release (§C: byte_concepts join · passage fields · sentence default · cloth
-- table · mirror drop). Idempotent throughout: every step tolerates a re-run
-- and an environment bootstrapped by scripts/apply-db-compat.ts.

-- 1 · byte_concept (P0.1). Concepts attach to bytes 0..n (ruling 37). Backfill
--     from the old 1:1 column, then drop it: a byte with zero join rows is an
--     Unlabeled Passage (ruling 38), and deleting a concept now removes
--     pointers, never passages.
CREATE TABLE IF NOT EXISTS "byte_concept" (
	"byteId" text NOT NULL,
	"conceptId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "byte_concept_byteId_conceptId_pk" PRIMARY KEY("byteId","conceptId")
);--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "byte_concept"
		ADD CONSTRAINT "byte_concept_byteId_byte_id_fk"
		FOREIGN KEY ("byteId") REFERENCES "byte"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "byte_concept"
		ADD CONSTRAINT "byte_concept_conceptId_concept_id_fk"
		FOREIGN KEY ("conceptId") REFERENCES "concept"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "byte_concept_concept_idx" ON "byte_concept" ("conceptId");--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.columns
	           WHERE table_name = 'byte' AND column_name = 'conceptId') THEN
		INSERT INTO "byte_concept" ("byteId", "conceptId", "createdAt")
		SELECT "id", "conceptId", "createdAt" FROM "byte"
		ON CONFLICT DO NOTHING;
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "byte" DROP COLUMN IF EXISTS "conceptId";--> statement-breakpoint

-- 2 · The passage's own margin (P0.2): notes, questions, pull-quote flag, and
--     the Passage Tier ('' unranked · p/s/t) — distinct from per-map Concept
--     Tiers.
ALTER TABLE "byte" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "byte" ADD COLUMN IF NOT EXISTS "question" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "byte" ADD COLUMN IF NOT EXISTS "isPullQuote" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "byte" ADD COLUMN IF NOT EXISTS "tier" text DEFAULT '' NOT NULL;--> statement-breakpoint

-- 3 · A link is creatable before its description (P0.3): the golden path
--     connects first and describes when ready.
ALTER TABLE "edge" ALTER COLUMN "sentence" SET DEFAULT '';--> statement-breakpoint

-- 4 · cloth (P0.4): the per-scope workspace identity (title + description).
--     The whole-weave `read` row becomes the whole-weave cloth's description;
--     ids carry over, so nothing is lost.
CREATE TABLE IF NOT EXISTS "cloth" (
	"id" text PRIMARY KEY NOT NULL,
	"courseId" text,
	"userId" text NOT NULL,
	"scopeKey" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cloth_userId_courseId_scopeKey_unique" UNIQUE NULLS NOT DISTINCT("userId","courseId","scopeKey")
);--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cloth"
		ADD CONSTRAINT "cloth_courseId_course_id_fk"
		FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cloth"
		ADD CONSTRAINT "cloth_userId_user_id_fk"
		FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'read') THEN
		INSERT INTO "cloth" ("id", "courseId", "userId", "scopeKey", "description", "createdAt", "updatedAt")
		SELECT "id", "courseId", "userId", '', "text", "updatedAt", "updatedAt" FROM "read"
		ON CONFLICT DO NOTHING;
	END IF;
END $$;--> statement-breakpoint

-- 5 · The mirror drop (P0.5). Tiers live per-map only; the read table's data
--     now lives on the cloth. The dual-write code goes in the same release.
ALTER TABLE "concept" DROP COLUMN IF EXISTS "tier";--> statement-breakpoint
DROP TABLE IF EXISTS "read";
