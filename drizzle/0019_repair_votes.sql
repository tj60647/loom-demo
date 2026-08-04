-- How the panel voted on each damaged region.
--
-- Kept because it is the only way to tell a panel that is working from one that
-- is merely expensive: a reader consistently outvoted is a reader to replace,
-- and that is invisible in the accepted text. NULL on rows written before the
-- vote was recorded, which is not the same as an unanimous one.

ALTER TABLE "source_repair" ADD COLUMN IF NOT EXISTS "votes" jsonb;
