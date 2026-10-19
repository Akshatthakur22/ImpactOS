CREATE TABLE "coach_session_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"checked_out_at" timestamp with time zone,
	CONSTRAINT "coach_session_presence_checkout_order_chk" CHECK ("coach_session_presence"."checked_out_at" IS NULL OR "coach_session_presence"."checked_out_at" >= "coach_session_presence"."checked_in_at")
);
--> statement-breakpoint
ALTER TABLE "coach_session_presence" ADD CONSTRAINT "coach_session_presence_session_academy_fk" FOREIGN KEY ("session_id","academy_id") REFERENCES "public"."training_sessions"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_session_presence" ADD CONSTRAINT "coach_session_presence_coach_academy_fk" FOREIGN KEY ("coach_id","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_session_presence_session_coach_uq" ON "coach_session_presence" USING btree ("session_id","coach_id");--> statement-breakpoint
CREATE INDEX "coach_session_presence_academy_session_idx" ON "coach_session_presence" USING btree ("academy_id","session_id");