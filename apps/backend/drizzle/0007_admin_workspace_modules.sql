CREATE TYPE "public"."announcement_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "academy_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"batch_id" uuid,
	"status" "announcement_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_announcements_title_nonempty_chk" CHECK (length(btrim("academy_announcements"."title")) > 0),
	CONSTRAINT "academy_announcements_body_length_chk" CHECK (length(btrim("academy_announcements"."body")) BETWEEN 1 AND 4000),
	CONSTRAINT "academy_announcements_published_at_chk" CHECK ("academy_announcements"."status" <> 'published' OR "academy_announcements"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "academy_announcements_id_academy_uq" ON "academy_announcements" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE TABLE "announcement_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academy_announcements" ADD CONSTRAINT "academy_announcements_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_announcements" ADD CONSTRAINT "academy_announcements_batch_academy_fk" FOREIGN KEY ("batch_id","academy_id") REFERENCES "public"."batches"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_announcements" ADD CONSTRAINT "academy_announcements_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_academy_fk" FOREIGN KEY ("announcement_id","academy_id") REFERENCES "public"."academy_announcements"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_academy_fk" FOREIGN KEY ("user_id","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_announcements_academy_status_idx" ON "academy_announcements" USING btree ("academy_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_reads_announcement_user_uq" ON "announcement_reads" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX "announcement_reads_academy_announcement_idx" ON "announcement_reads" USING btree ("academy_id","announcement_id");
