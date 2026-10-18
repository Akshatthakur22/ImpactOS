CREATE TABLE "progress_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"assessment_name" varchar(100) NOT NULL,
	"value" varchar(120),
	"coach_note" varchar(1000),
	"parent_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_student_academy_fk" FOREIGN KEY ("student_id","academy_id") REFERENCES "public"."students"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_session_academy_fk" FOREIGN KEY ("session_id","academy_id") REFERENCES "public"."training_sessions"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_coach_academy_fk" FOREIGN KEY ("coach_id","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "progress_entries_student_created_idx" ON "progress_entries" USING btree ("academy_id","student_id","created_at");--> statement-breakpoint
CREATE INDEX "progress_entries_session_idx" ON "progress_entries" USING btree ("academy_id","session_id");