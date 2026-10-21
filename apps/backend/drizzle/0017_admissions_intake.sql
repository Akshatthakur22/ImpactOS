CREATE TABLE "inquiry_source_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"source" varchar(40) NOT NULL,
	"external_submission_id" varchar(240) NOT NULL,
	"inquiry_id" uuid,
	"status" varchar(16) DEFAULT 'processed' NOT NULL,
	"error_summary" varchar(500),
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiry_source_submissions" ADD CONSTRAINT "inquiry_source_submissions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inquiry_source_submissions" ADD CONSTRAINT "inquiry_source_submissions_inquiry_academy_fk" FOREIGN KEY ("inquiry_id","academy_id") REFERENCES "public"."inquiries"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "inquiry_source_submissions_identity_uq" ON "inquiry_source_submissions" USING btree ("academy_id","source","external_submission_id");
--> statement-breakpoint
CREATE INDEX "inquiry_source_submissions_status_idx" ON "inquiry_source_submissions" USING btree ("academy_id","source","status");
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;
