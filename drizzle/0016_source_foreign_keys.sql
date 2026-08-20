-- The foreign keys on sourceId were declared in src/db/schema.ts from the very
-- first migration but never made it into the database. `scripts/apply-db-compat.ts`
-- creates source_page without them, so every environment that was bootstrapped
-- through that path has the columns and none of the constraints.
--
-- The consequence is not theoretical. `deleteSource` (src/actions/sources.ts)
-- deletes the source row and relies on ON DELETE CASCADE to take its pages with
-- it; without the constraint the pages simply stay, belonging to nothing. A
-- census found 15 of 1,252 page rows already stranded across 6 deleted sources.
--
-- Orphans have to go first: the constraint cannot be added while rows violate it.
-- They are unreachable by definition — no source row names them — so deleting
-- them loses nothing that any query could still find.

DELETE FROM "source_page"
WHERE "sourceId" NOT IN (SELECT "id" FROM "source");

-- byte.sourceId is nullable and ON DELETE SET NULL: a student's captured passage
-- outlives the reading it came from, and only the student may re-attribute it
-- (see attributeBytes). Null it where the reading is already gone, for the same
-- reason as above.
UPDATE "byte"
SET "sourceId" = NULL
WHERE "sourceId" IS NOT NULL
  AND "sourceId" NOT IN (SELECT "id" FROM "source");

DO $$ BEGIN
  ALTER TABLE "source_page"
    ADD CONSTRAINT "source_page_sourceId_source_id_fk"
    FOREIGN KEY ("sourceId") REFERENCES "source"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "byte"
    ADD CONSTRAINT "byte_sourceId_source_id_fk"
    FOREIGN KEY ("sourceId") REFERENCES "source"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Every lens that opens a reading filters bytes by sourceId, and there was no
-- index on it at all.
CREATE INDEX IF NOT EXISTS "byte_sourceId_idx" ON "byte" ("sourceId");

-- Page lookups are always (source, page) — createByte's anchor reconciliation
-- does one per capture.
CREATE INDEX IF NOT EXISTS "source_page_source_page_idx"
  ON "source_page" ("sourceId", "pageNumber");
