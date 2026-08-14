ALTER TABLE "source_repair_reading" ADD COLUMN "blocks" jsonb;--> statement-breakpoint
ALTER TABLE "source_repair_reading" ADD COLUMN "orientation" text;--> statement-breakpoint
ALTER TABLE "source_repair" ADD COLUMN "blockMode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "source_repair" ADD COLUMN "agreedBlocks" jsonb;--> statement-breakpoint
ALTER TABLE "source_repair" ADD COLUMN "acceptedBlocks" jsonb;