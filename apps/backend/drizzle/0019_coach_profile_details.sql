ALTER TABLE "coach_profiles" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD COLUMN "address" varchar(500);--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD COLUMN "emergency_contact_name" varchar(120);--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD COLUMN "emergency_contact_phone" varchar(30);--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD COLUMN "qualifications" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD COLUMN "years_experience" integer;--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD COLUMN "joined_on" date;