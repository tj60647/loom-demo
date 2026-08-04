-- Damaged regions of a reading, and the proposals for repairing them.
--
-- Both tables are a record of a decision rather than a cache of a computation.
-- Detection and location are reproducible; the transcription in
-- source_repair_reading is not — reading the same crop again gives a different
-- reading — so what makes the process accountable is that the readings, the
-- accepted text and the person who accepted it are all kept, not that any of it
-- could be re-derived.
--
-- Nothing here touches a reading. `appliedAt` is the only column that says a
-- repair reached a student, and it is written by a separate act.

CREATE TABLE IF NOT EXISTS "source_repair" (
  "id" text PRIMARY KEY NOT NULL,
  "sourceId" text NOT NULL,
  "pageNumber" integer NOT NULL,
  -- A decision is only valid for the file it was made about.
  "measuredAgainstKey" text NOT NULL,
  "region" jsonb NOT NULL,
  "cropKey" text NOT NULL,
  "currentText" text DEFAULT '' NOT NULL,
  "garbledWords" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "garbleRate" real,
  "status" text DEFAULT 'proposed' NOT NULL,
  "agreedText" text DEFAULT '' NOT NULL,
  "disagreements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "acceptedText" text,
  "acceptedByUserId" text,
  "acceptedAt" timestamp,
  "reviewNote" text DEFAULT '' NOT NULL,
  "appliedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "source_repair_reading" (
  "id" text PRIMARY KEY NOT NULL,
  "repairId" text NOT NULL,
  "model" text NOT NULL,
  "reader" integer NOT NULL,
  "text" text DEFAULT '' NOT NULL,
  "uncertain" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "illegibleShare" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

-- Declared with the tables rather than left implicit: 0016 exists because a
-- foreign key this schema had declared since 0000 was never in any database.
DO $$ BEGIN
  ALTER TABLE "source_repair"
    ADD CONSTRAINT "source_repair_sourceId_source_id_fk"
    FOREIGN KEY ("sourceId") REFERENCES "source"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "source_repair"
    ADD CONSTRAINT "source_repair_acceptedByUserId_user_id_fk"
    FOREIGN KEY ("acceptedByUserId") REFERENCES "user"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "source_repair_reading"
    ADD CONSTRAINT "source_repair_reading_repairId_source_repair_id_fk"
    FOREIGN KEY ("repairId") REFERENCES "source_repair"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "source_repair_sourceId_idx" ON "source_repair" ("sourceId");
CREATE INDEX IF NOT EXISTS "source_repair_status_idx" ON "source_repair" ("status");
CREATE INDEX IF NOT EXISTS "source_repair_reading_repairId_idx" ON "source_repair_reading" ("repairId");
