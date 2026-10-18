CREATE TABLE "push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expo_push_token" varchar(255) NOT NULL,
	"platform" varchar(8) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_devices_platform_chk" CHECK ("push_devices"."platform" IN ('ios', 'android'))
);
--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_academy_fk" FOREIGN KEY ("user_id","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_devices_token_uq" ON "push_devices" USING btree ("expo_push_token");--> statement-breakpoint
CREATE INDEX "push_devices_academy_user_idx" ON "push_devices" USING btree ("academy_id","user_id");