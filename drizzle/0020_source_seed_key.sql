-- Stable identity for the rows `scripts/seed-sources.ts` owns.
--
-- Seeding used to find its readings by `title`, which an admin edits freely —
-- two of the three seed titles had already drifted to full bibliographic form.
-- Nothing constrains `title` to be unique, so the next run would not have
-- failed; it would have inserted a duplicate reading. Null everywhere except
-- the seeded rows, and unique so a second row can never claim the same key.
ALTER TABLE "source" ADD COLUMN "seedKey" text;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_seedKey_unique" UNIQUE("seedKey");
