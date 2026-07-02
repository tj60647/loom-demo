CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "byte" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"conceptId" text NOT NULL,
	"source" text DEFAULT '',
	"sourceId" text,
	"location" text DEFAULT '',
	"content" text NOT NULL,
	"pageNumber" integer,
	"startOffset" integer,
	"endOffset" integer,
	"pageContentHash" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"label" text NOT NULL,
	"def" text DEFAULT '',
	"note" text DEFAULT '',
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"fromId" text NOT NULL,
	"toId" text NOT NULL,
	"handle" text DEFAULT '',
	"sentence" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_page" (
	"id" text PRIMARY KEY NOT NULL,
	"sourceId" text NOT NULL,
	"pageNumber" integer NOT NULL,
	"textContent" text NOT NULL,
	"contentHash" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"author" text DEFAULT '',
	"description" text DEFAULT '',
	"storageKey" text NOT NULL,
	"createdByUserId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"role" text DEFAULT 'USER' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "byte" ADD CONSTRAINT "byte_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "byte" ADD CONSTRAINT "byte_conceptId_concept_id_fk" FOREIGN KEY ("conceptId") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "byte" ADD CONSTRAINT "byte_sourceId_source_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept" ADD CONSTRAINT "concept_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge" ADD CONSTRAINT "edge_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge" ADD CONSTRAINT "edge_fromId_concept_id_fk" FOREIGN KEY ("fromId") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge" ADD CONSTRAINT "edge_toId_concept_id_fk" FOREIGN KEY ("toId") REFERENCES "public"."concept"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_page" ADD CONSTRAINT "source_page_sourceId_source_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_createdByUserId_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;