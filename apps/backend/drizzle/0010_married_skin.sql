CREATE TYPE "public"."inquiry_activity_type" AS ENUM('note', 'call', 'message', 'visit', 'trial', 'status_change', 'conversion');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('new', 'contacted', 'follow_up', 'trial_scheduled', 'converted', 'lost');--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"student_first_name" varchar(80) NOT NULL,
	"student_last_name" varchar(80) NOT NULL,
	"contact_name" varchar(120) NOT NULL,
	"contact_email" varchar(254),
	"contact_phone" varchar(30),
	"relationship" varchar(40) DEFAULT 'Parent' NOT NULL,
	"source" varchar(120) NOT NULL,
	"source_detail" varchar(240),
	"program_id" uuid,
	"status" "inquiry_status" DEFAULT 'new' NOT NULL,
	"notes" text,
	"next_follow_up_at" timestamp with time zone,
	"converted_student_id" uuid,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiry_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"type" "inquiry_activity_type" NOT NULL,
	"note" text NOT NULL,
	"status_before" "inquiry_status",
	"status_after" "inquiry_status",
	"next_follow_up_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_program_academy_fk" FOREIGN KEY ("program_id","academy_id") REFERENCES "public"."programs"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_converted_student_academy_fk" FOREIGN KEY ("converted_student_id","academy_id") REFERENCES "public"."students"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_updated_by_academy_fk" FOREIGN KEY ("updated_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_id_academy_uq" ON "inquiries" USING btree ("id","academy_id");--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_inquiry_academy_fk" FOREIGN KEY ("inquiry_id","academy_id") REFERENCES "public"."inquiries"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_converted_student_uq" ON "inquiries" USING btree ("converted_student_id");--> statement-breakpoint
CREATE INDEX "inquiries_academy_status_created_idx" ON "inquiries" USING btree ("academy_id","status","created_at");--> statement-breakpoint
CREATE INDEX "inquiries_academy_follow_up_idx" ON "inquiries" USING btree ("academy_id","next_follow_up_at");--> statement-breakpoint
CREATE INDEX "inquiry_activities_academy_inquiry_created_idx" ON "inquiry_activities" USING btree ("academy_id","inquiry_id","created_at");
