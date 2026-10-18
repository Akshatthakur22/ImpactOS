CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'excused');
--> statement-breakpoint
CREATE TYPE "public"."coach_status" AS ENUM('active', 'inactive');
--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'completed', 'cancelled');
--> statement-breakpoint
CREATE TABLE "attendance_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"previous_status" "attendance_status" NOT NULL,
	"next_status" "attendance_status" NOT NULL,
	"corrected_by" uuid NOT NULL,
	"reason" varchar(500) NOT NULL,
	"corrected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_coaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"venue" varchar(160),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_schedules_day_chk" CHECK ("batch_schedules"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "batch_schedules_time_order_chk" CHECK ("batch_schedules"."start_time" < "batch_schedules"."end_time")
);
--> statement-breakpoint
CREATE TABLE "coach_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" varchar(30),
	"specializations" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "coach_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"schedule_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"venue" varchar(160),
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_sessions_time_order_chk" CHECK ("training_sessions"."starts_at" < "training_sessions"."ends_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_id_academy_uq" ON "attendance_records" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_student_uq" ON "attendance_records" USING btree ("session_id","student_id");
--> statement-breakpoint
CREATE INDEX "attendance_records_academy_student_idx" ON "attendance_records" USING btree ("academy_id","student_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "batch_coaches_id_academy_uq" ON "batch_coaches" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "batch_coaches_batch_coach_uq" ON "batch_coaches" USING btree ("batch_id","coach_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "batch_schedules_id_academy_uq" ON "batch_schedules" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE INDEX "batch_schedules_batch_active_idx" ON "batch_schedules" USING btree ("batch_id","is_active");
--> statement-breakpoint
CREATE UNIQUE INDEX "coach_profiles_id_academy_uq" ON "coach_profiles" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "coach_profiles_user_academy_uq" ON "coach_profiles" USING btree ("user_id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "training_sessions_id_academy_uq" ON "training_sessions" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "training_sessions_batch_start_uq" ON "training_sessions" USING btree ("batch_id","starts_at");
--> statement-breakpoint
CREATE INDEX "training_sessions_academy_start_idx" ON "training_sessions" USING btree ("academy_id","starts_at");
--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_attendance_academy_fk" FOREIGN KEY ("attendance_id","academy_id") REFERENCES "public"."attendance_records"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_corrected_by_academy_fk" FOREIGN KEY ("corrected_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_academy_fk" FOREIGN KEY ("session_id","academy_id") REFERENCES "public"."training_sessions"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_academy_fk" FOREIGN KEY ("student_id","academy_id") REFERENCES "public"."students"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_academy_fk" FOREIGN KEY ("recorded_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "batch_coaches" ADD CONSTRAINT "batch_coaches_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "batch_coaches" ADD CONSTRAINT "batch_coaches_batch_academy_fk" FOREIGN KEY ("batch_id","academy_id") REFERENCES "public"."batches"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "batch_coaches" ADD CONSTRAINT "batch_coaches_coach_academy_fk" FOREIGN KEY ("coach_id","academy_id") REFERENCES "public"."coach_profiles"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "batch_coaches" ADD CONSTRAINT "batch_coaches_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "batch_schedules" ADD CONSTRAINT "batch_schedules_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "batch_schedules" ADD CONSTRAINT "batch_schedules_batch_academy_fk" FOREIGN KEY ("batch_id","academy_id") REFERENCES "public"."batches"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "batch_schedules" ADD CONSTRAINT "batch_schedules_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_user_academy_fk" FOREIGN KEY ("user_id","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_batch_academy_fk" FOREIGN KEY ("batch_id","academy_id") REFERENCES "public"."batches"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_schedule_academy_fk" FOREIGN KEY ("schedule_id","academy_id") REFERENCES "public"."batch_schedules"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
