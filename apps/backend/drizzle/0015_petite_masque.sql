CREATE TABLE "coach_student_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"week_of" date NOT NULL,
	"performance" varchar(1200) NOT NULL,
	"guidance" varchar(1200) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_session_presence" DROP CONSTRAINT "coach_session_presence_checkout_order_chk";--> statement-breakpoint
ALTER TABLE "coach_student_feedback" ADD CONSTRAINT "coach_student_feedback_student_academy_fk" FOREIGN KEY ("student_id","academy_id") REFERENCES "public"."students"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_student_feedback" ADD CONSTRAINT "coach_student_feedback_coach_academy_fk" FOREIGN KEY ("coach_id","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_student_feedback_week_uq" ON "coach_student_feedback" USING btree ("academy_id","student_id","coach_id","week_of");--> statement-breakpoint
CREATE INDEX "coach_student_feedback_history_idx" ON "coach_student_feedback" USING btree ("academy_id","student_id","week_of");--> statement-breakpoint
ALTER TABLE "coach_session_presence" ADD CONSTRAINT "coach_session_presence_checkout_order_chk" CHECK ("coach_session_presence"."checked_out_at" is null or "coach_session_presence"."checked_out_at" >= "coach_session_presence"."checked_in_at");