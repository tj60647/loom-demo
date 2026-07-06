ALTER TABLE "source" ADD COLUMN "sourceReference" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "isDescriptionVisible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "metadataProvenance" text DEFAULT '';