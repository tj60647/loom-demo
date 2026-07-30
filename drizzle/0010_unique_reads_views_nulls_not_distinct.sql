ALTER TABLE "view" DROP CONSTRAINT "view_userId_courseId_key_unique";--> statement-breakpoint
-- Dedup before constraining: keep the newest row per key (ties broken by id) so
-- a shared environment that already accumulated duplicates can still migrate.
DELETE FROM "read" a USING "read" b
  WHERE a."userId" = b."userId"
    AND a."courseId" IS NOT DISTINCT FROM b."courseId"
    AND (a."updatedAt" < b."updatedAt" OR (a."updatedAt" = b."updatedAt" AND a."id" < b."id"));--> statement-breakpoint
DELETE FROM "view" a USING "view" b
  WHERE a."userId" = b."userId"
    AND a."courseId" IS NOT DISTINCT FROM b."courseId"
    AND a."key" = b."key"
    AND (a."updatedAt" < b."updatedAt" OR (a."updatedAt" = b."updatedAt" AND a."id" < b."id"));--> statement-breakpoint
ALTER TABLE "read" ADD CONSTRAINT "read_userId_courseId_unique" UNIQUE NULLS NOT DISTINCT("userId","courseId");--> statement-breakpoint
ALTER TABLE "view" ADD CONSTRAINT "view_userId_courseId_key_unique" UNIQUE NULLS NOT DISTINCT("userId","courseId","key");