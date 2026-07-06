CREATE TABLE "allowed_email" (
	"email" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

INSERT INTO "allowed_email" ("email") VALUES
	('john@zerowidth.ai'),
	('caseysimone@berkeley.edu'),
	('hugh@dubberly.com'),
	('kevinma1515@berkeley.edu'),
	('kosa@berkeley.edu'),
	('maxkreminski@gmail.com'),
	('mkremins@berkeley.edu'),
	('shm.almeda@berkeley.edu'),
	('sophiawliu@berkeley.edu'),
	('tjm@tjmcleish.com'),
	('tjmcleish@berkeley.edu'),
	('lingxiu@hey.com'),
	('lingxiuc@berkeley.edu')
ON CONFLICT ("email") DO NOTHING;
