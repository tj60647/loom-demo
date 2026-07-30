-- Extraction-quality scores for library readings. One row per source; absent
-- until the reading is scored, and dimensions stay null when a pass could not
-- produce them (no judge configured, judge error, unparseable output) so an
-- unscored dimension abstains from `overall` instead of counting as a zero.
CREATE TABLE "source_score" (
	"sourceId" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'heuristic' NOT NULL,
	"coverage" integer,
	"legibility" integer,
	"anchorability" integer,
	"structure" integer,
	"overall" real,
	"pass" boolean,
	"notes" text DEFAULT '' NOT NULL,
	"judgeNotes" text DEFAULT '' NOT NULL,
	"judgeModel" text,
	"metrics" jsonb,
	"scoredAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_score" ADD CONSTRAINT "source_score_sourceId_source_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;