-- Name-ahead concepts stand in the reading they were named in, not in every
-- warp. `mintedInSourceId` is that stamp: consulted only while the concept has
-- no passages. Null remains meaningful — the act carried no reading, and those
-- rows still appear in every warp (the previous empty-evidence rule).
--
-- The column is not "the concept's reading". A Concept still belongs to the
-- User; once a passage exists, membership is the evidence trail as before.

ALTER TABLE "concept" ADD COLUMN "mintedInSourceId" text;--> statement-breakpoint
ALTER TABLE "concept" ADD CONSTRAINT "concept_mintedInSourceId_source_id_fk" FOREIGN KEY ("mintedInSourceId") REFERENCES "public"."source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Retrofit from the Capture Log. `createConcept` has stamped payload.sourceId
-- since 2026-08-10 as where the act happened. Measured on Loom-Frameworks
-- production 2026-09-11: 561 of 563 concepts with no passages had a create
-- event whose sourceId still exists; the other two stay null.
UPDATE "concept" AS c
SET "mintedInSourceId" = s.source_id
FROM (
	SELECT DISTINCT ON ("entityId")
		"entityId",
		payload->>'sourceId' AS source_id
	FROM "graph_event"
	WHERE kind = 'concept.create'
		AND payload->>'sourceId' IS NOT NULL
		AND payload->>'sourceId' <> ''
	ORDER BY "entityId", at ASC
) AS s
WHERE c.id = s."entityId"
	AND c."mintedInSourceId" IS NULL
	AND EXISTS (SELECT 1 FROM "source" WHERE "source"."id" = s.source_id);
