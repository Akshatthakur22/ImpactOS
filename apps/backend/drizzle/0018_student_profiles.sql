ALTER TABLE "students" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "gender" varchar(40);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "address" varchar(500);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "medical_notes" varchar(2000);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "emergency_contact_name" varchar(120);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "emergency_contact_relationship" varchar(40);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "emergency_contact_phone" varchar(30);