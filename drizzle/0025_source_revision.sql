-- 0025 · the file's lineage becomes a table.
--
-- Applying a repair has always rotated `source.storageKey` to a new blob and
-- kept the old one — but kept it as an orphan: present in the store, addressed
-- by nothing, invisible to deleteSource and to anyone asking which file the
-- course read last week. One append-only row per rotation makes the chain
-- walkable. Backfill for the two already-repaired readings happens in the
-- reprocessing script, which knows their predecessor keys from
-- `source_repair.measuredAgainstKey` — not here, where data would be hardcoded.
CREATE TABLE "source_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"sourceId" text NOT NULL,
	"storageKey" text NOT NULL,
	"predecessorKey" text,
	"reason" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_revision" ADD CONSTRAINT "source_revision_sourceId_source_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_revision_source_idx" ON "source_revision" USING btree ("sourceId");