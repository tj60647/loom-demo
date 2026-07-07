CREATE TABLE "course" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_membership" (
	"courseId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text DEFAULT 'LEARNER' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_membership_courseId_userId_pk" PRIMARY KEY("courseId","userId")
);
--> statement-breakpoint
CREATE TABLE "course_allowed_email" (
	"courseId" text NOT NULL,
	"email" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_allowed_email_courseId_email_pk" PRIMARY KEY("courseId","email")
);
--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "courseId" text;
--> statement-breakpoint
ALTER TABLE "course_membership" ADD CONSTRAINT "course_membership_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_membership" ADD CONSTRAINT "course_membership_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_allowed_email" ADD CONSTRAINT "course_allowed_email_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;