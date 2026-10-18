ALTER TABLE "batches" DROP CONSTRAINT "batches_program_id_programs_id_fk";
--> statement-breakpoint
ALTER TABLE "batches" DROP CONSTRAINT "batches_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "disciplines" DROP CONSTRAINT "disciplines_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_student_id_students_id_fk";
--> statement-breakpoint
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_batch_id_batches_id_fk";
--> statement-breakpoint
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "guardians" DROP CONSTRAINT "guardians_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "guardians" DROP CONSTRAINT "guardians_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "programs" DROP CONSTRAINT "programs_discipline_id_disciplines_id_fk";
--> statement-breakpoint
ALTER TABLE "programs" DROP CONSTRAINT "programs_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "student_guardians" DROP CONSTRAINT "student_guardians_student_id_students_id_fk";
--> statement-breakpoint
ALTER TABLE "student_guardians" DROP CONSTRAINT "student_guardians_guardian_id_guardians_id_fk";
--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_created_by_users_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "batches_id_academy_uq" ON "batches" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "disciplines_id_academy_uq" ON "disciplines" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_id_academy_uq" ON "guardians" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "programs_id_academy_uq" ON "programs" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "students_id_academy_uq" ON "students" USING btree ("id","academy_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_id_academy_uq" ON "users" USING btree ("id","academy_id");
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_program_academy_fk" FOREIGN KEY ("program_id","academy_id") REFERENCES "public"."programs"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_academy_fk" FOREIGN KEY ("student_id","academy_id") REFERENCES "public"."students"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_batch_academy_fk" FOREIGN KEY ("batch_id","academy_id") REFERENCES "public"."batches"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_academy_fk" FOREIGN KEY ("user_id","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_discipline_academy_fk" FOREIGN KEY ("discipline_id","academy_id") REFERENCES "public"."disciplines"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_academy_fk" FOREIGN KEY ("student_id","academy_id") REFERENCES "public"."students"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_academy_fk" FOREIGN KEY ("guardian_id","academy_id") REFERENCES "public"."guardians"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_capacity_positive_chk" CHECK ("batches"."capacity" IS NULL OR "batches"."capacity" > 0);
