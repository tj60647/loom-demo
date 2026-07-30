CREATE TABLE "graph_event" (
	"id" text PRIMARY KEY NOT NULL,
	"courseId" text,
	"userId" text NOT NULL,
	"kind" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text,
	"payload" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "read" (
	"id" text PRIMARY KEY NOT NULL,
	"courseId" text,
	"userId" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view" (
	"id" text PRIMARY KEY NOT NULL,
	"courseId" text,
	"userId" text NOT NULL,
	"key" text NOT NULL,
	"data" jsonb NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "view_userId_courseId_key_unique" UNIQUE("userId","courseId","key")
);
--> statement-breakpoint
ALTER TABLE "concept" ADD COLUMN "tier" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "graph_event" ADD CONSTRAINT "graph_event_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_event" ADD CONSTRAINT "graph_event_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read" ADD CONSTRAINT "read_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read" ADD CONSTRAINT "read_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view" ADD CONSTRAINT "view_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view" ADD CONSTRAINT "view_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;