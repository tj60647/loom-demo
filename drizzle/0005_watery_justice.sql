ALTER TABLE "concept" ADD COLUMN "courseId" text;
--> statement-breakpoint
ALTER TABLE "byte" ADD COLUMN "courseId" text;
--> statement-breakpoint
ALTER TABLE "edge" ADD COLUMN "courseId" text;
--> statement-breakpoint
ALTER TABLE "concept" ADD CONSTRAINT "concept_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "byte" ADD CONSTRAINT "byte_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "edge" ADD CONSTRAINT "edge_courseId_course_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;