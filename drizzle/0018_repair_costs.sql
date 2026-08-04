-- What each reading of a damaged region cost, and how long it took.
--
-- Recorded from what OpenRouter reports rather than derived from a price table
-- in the repo: prices move and models get re-tiered, and a stale table would
-- report yesterday's number as today's fact. NULL means the API did not say —
-- which is not the same as free, and the admin view says so rather than
-- totalling it as zero.

ALTER TABLE "source_repair_reading" ADD COLUMN IF NOT EXISTS "promptTokens" integer;
ALTER TABLE "source_repair_reading" ADD COLUMN IF NOT EXISTS "completionTokens" integer;
ALTER TABLE "source_repair_reading" ADD COLUMN IF NOT EXISTS "costUsd" real;
ALTER TABLE "source_repair_reading" ADD COLUMN IF NOT EXISTS "durationMs" integer;
ALTER TABLE "source_repair_reading" ADD COLUMN IF NOT EXISTS "truncated" boolean DEFAULT false NOT NULL;
