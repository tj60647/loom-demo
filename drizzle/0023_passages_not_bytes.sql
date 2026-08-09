-- 0023 · the database says Passage too.
--
-- The code stopped calling them bytes on 2026-08-09; this is the other half.
-- TJ: "cant we fix the db names in a migration and rename? we dont have real
-- students yet." Right — the only reason to keep `byte` was the cost of moving
-- rows nobody has yet written, and that cost is currently zero.
--
-- HAND-WRITTEN, deliberately. `drizzle-kit generate` cannot see a rename: it
-- diffs the schema and emits DROP TABLE + CREATE TABLE, which is a rename in
-- the sense that a fire is a house move. Every statement below is an
-- ALTER ... RENAME, so no row is copied and no row is lost.
--
-- Renames are all-or-nothing here on purpose. Postgres does NOT rename a
-- table's constraints or indexes when the table moves, so leaving them would
-- have left `byte_pkey` and `byte_search_idx` sitting under a table called
-- `passage` — exactly the confusion the rename exists to end.

ALTER TABLE "byte" RENAME TO "passage";
ALTER TABLE "byte_concept" RENAME TO "passage_concept";
ALTER TABLE "passage_concept" RENAME COLUMN "byteId" TO "passageId";

--> statement-breakpoint
-- Indexes. `byte_pkey` and `byte_concept_byteId_conceptId_pk` are constraint-
-- backed, so they are renamed through their constraints below, not here.
ALTER INDEX "byte_search_idx" RENAME TO "passage_search_idx";--> statement-breakpoint
ALTER INDEX "byte_sourceId_idx" RENAME TO "passage_sourceId_idx";--> statement-breakpoint
ALTER INDEX "byte_concept_concept_idx" RENAME TO "passage_concept_concept_idx";--> statement-breakpoint

ALTER TABLE "passage" RENAME CONSTRAINT "byte_pkey" TO "passage_pkey";--> statement-breakpoint
ALTER TABLE "passage" RENAME CONSTRAINT "byte_userId_user_id_fk" TO "passage_userId_user_id_fk";--> statement-breakpoint
ALTER TABLE "passage" RENAME CONSTRAINT "byte_courseId_course_id_fk" TO "passage_courseId_course_id_fk";--> statement-breakpoint
ALTER TABLE "passage" RENAME CONSTRAINT "byte_sourceId_source_id_fk" TO "passage_sourceId_source_id_fk";--> statement-breakpoint

ALTER TABLE "passage_concept" RENAME CONSTRAINT "byte_concept_byteId_conceptId_pk" TO "passage_concept_passageId_conceptId_pk";--> statement-breakpoint
ALTER TABLE "passage_concept" RENAME CONSTRAINT "byte_concept_byteId_byte_id_fk" TO "passage_concept_passageId_passage_id_fk";--> statement-breakpoint
ALTER TABLE "passage_concept" RENAME CONSTRAINT "byte_concept_conceptId_concept_id_fk" TO "passage_concept_conceptId_concept_id_fk";--> statement-breakpoint

-- The Capture Log's own words. `graph_event.kind` and `entityType` are strings
-- already written to rows — 95 of them on this database — and HistoryPanel
-- replays by matching `kind`, so these two statements are the difference
-- between a student's history surviving the rename and silently emptying.
--
-- Done as data, not as compatibility code: the table rename above already makes
-- an unmigrated database fail loudly, so there is no half-migrated state for a
-- dual-reading HistoryPanel to protect against. One truth, not two spellings.
UPDATE "graph_event" SET "kind" = 'passage' || substring("kind" from 5) WHERE "kind" LIKE 'byte.%';--> statement-breakpoint
UPDATE "graph_event" SET "entityType" = 'passage' WHERE "entityType" = 'byte';
