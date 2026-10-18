CREATE TABLE "guardian_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_guardian_academy_fk" FOREIGN KEY ("guardian_id","academy_id") REFERENCES "public"."guardians"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD CONSTRAINT "guardian_invites_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_invites_token_hash_uq" ON "guardian_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "guardian_invites_guardian_expiry_idx" ON "guardian_invites" USING btree ("guardian_id","expires_at");