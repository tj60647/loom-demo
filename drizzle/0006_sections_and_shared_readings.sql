-- Sections, and readings decoupled from courses.
--
-- Hand-written: the meta snapshots for 0004/0005 were never committed, so
-- `drizzle-kit generate` diffed against 0003 and re-emitted CREATE TABLE for
-- course/course_membership/course_allowed_email plus the courseId columns those
-- migrations already added. This file is the real delta from 0005, and adds the
-- data migration drizzle-kit cannot infer (step 6).

-- 1. Sections. A course runs as several sections; quilting scopes to one.
CREATE TABLE "section" (
	"id" text PRIMARY KEY NOT NULL,
	"courseId" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"lead" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "section_courseId_slug_unique" UNIQUE("courseId","slug")
);
--> statement-breakpoint
ALTER TABLE "section" ADD CONSTRAINT "section_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 2. Inclusion of a shared-library reading in one course, with the facts that
--    are true only in that course's context.
CREATE TABLE "course_source" (
	"courseId" text NOT NULL,
	"sourceId" text NOT NULL,
	"isVisible" boolean DEFAULT true NOT NULL,
	"week" integer,
	"isCore" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_source_courseId_sourceId_pk" PRIMARY KEY("courseId","sourceId")
);
--> statement-breakpoint
ALTER TABLE "course_source" ADD CONSTRAINT "course_source_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_source" ADD CONSTRAINT "course_source_sourceId_source_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 3. Courses gain a run label, a description, and an archive flag. Existing
--    slugs were generated from the course id, so they are already unique.
ALTER TABLE "course" ADD COLUMN "term" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "isArchived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_slug_unique" UNIQUE("slug");--> statement-breakpoint

-- 4. Learners are placed in a section; null until an instructor assigns one.
ALTER TABLE "course_membership" ADD COLUMN "sectionId" text;--> statement-breakpoint
ALTER TABLE "course_membership" ADD CONSTRAINT "course_membership_sectionId_section_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."section"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- 5. Allowlist entries can pre-assign a section, applied on first sign-in.
ALTER TABLE "course_allowed_email" ADD COLUMN "sectionId" text;--> statement-breakpoint
ALTER TABLE "course_allowed_email" ADD CONSTRAINT "course_allowed_email_sectionId_section_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."section"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- 6. Data migration: every reading currently pinned to a course becomes an
--    inclusion of that (now shared) reading, carrying its visibility over.
--    Without this the library would still hold the files but every course
--    would render an empty reading list.
INSERT INTO "course_source" ("courseId", "sourceId", "isVisible", "isCore", "position")
SELECT "courseId", "id", "isVisible", true, 0
FROM "source"
WHERE "courseId" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 7. The reading itself is now course-agnostic. Visibility moved to the join in
--    step 6, so both columns come off `source`.
ALTER TABLE "source" DROP CONSTRAINT IF EXISTS "source_courseId_course_id_fk";--> statement-breakpoint
ALTER TABLE "source" DROP COLUMN "courseId";--> statement-breakpoint
ALTER TABLE "source" DROP COLUMN "isVisible";
