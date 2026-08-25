CREATE TABLE "auth_event" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"outcome" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"handle" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_event_at_idx" ON "auth_event" USING btree ("at");--> statement-breakpoint
CREATE INDEX "auth_event_email_idx" ON "auth_event" USING btree ("email");