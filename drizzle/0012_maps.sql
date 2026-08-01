CREATE TABLE "map" (
	"id" text PRIMARY KEY NOT NULL,
	"courseId" text,
	"userId" text NOT NULL,
	"scopeKey" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"read" text DEFAULT '' NOT NULL,
	"essence" text DEFAULT '' NOT NULL,
	"tiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map" ADD CONSTRAINT "map_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map" ADD CONSTRAINT "map_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_user_course_scope_idx" ON "map" USING btree ("userId","courseId","scopeKey");--> statement-breakpoint
INSERT INTO "map" ("id", "courseId", "userId", "scopeKey", "name", "read", "essence", "tiers", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  g."courseId",
  g."userId",
  '',
  'Map 1',
  COALESCE(r."text", ''),
  '',
  COALESCE(t."tiers", '{}'::jsonb),
  now(),
  now()
FROM (
  SELECT DISTINCT "userId", "courseId" FROM "concept"
  UNION
  SELECT DISTINCT "userId", "courseId" FROM "read"
) AS g
LEFT JOIN "read" r
  ON r."userId" = g."userId" AND r."courseId" IS NOT DISTINCT FROM g."courseId"
LEFT JOIN (
  SELECT "userId", "courseId", jsonb_object_agg("id", "tier") AS "tiers"
  FROM "concept"
  WHERE "tier" <> ''
  GROUP BY "userId", "courseId"
) AS t
  ON t."userId" = g."userId" AND t."courseId" IS NOT DISTINCT FROM g."courseId"
WHERE NOT EXISTS (
  SELECT 1 FROM "map" m0
  WHERE m0."userId" = g."userId" AND m0."courseId" IS NOT DISTINCT FROM g."courseId" AND m0."scopeKey" = ''
);--> statement-breakpoint
INSERT INTO "view" ("id", "courseId", "userId", "key", "data", "updatedAt")
SELECT gen_random_uuid(), m."courseId", m."userId", 'map:' || m."id", v."data", now()
FROM "map" m
JOIN "view" v
  ON v."userId" = m."userId" AND v."courseId" IS NOT DISTINCT FROM m."courseId" AND v."key" = 'cardTable'
WHERE m."scopeKey" = '' AND m."name" = 'Map 1'
  AND NOT EXISTS (
    SELECT 1 FROM "view" v2
    WHERE v2."userId" = m."userId" AND v2."courseId" IS NOT DISTINCT FROM m."courseId" AND v2."key" = 'map:' || m."id"
  );