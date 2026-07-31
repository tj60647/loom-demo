ALTER TABLE "source" ALTER COLUMN "storageKey" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "isOwn" boolean DEFAULT false NOT NULL;