CREATE TABLE "academy_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"address" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_branches_name_nonempty_chk" CHECK (length(btrim("academy_branches"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "batch_schedules" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "academy_branches" ADD CONSTRAINT "academy_branches_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_branches" ADD CONSTRAINT "academy_branches_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academy_branches_id_academy_uq" ON "academy_branches" USING btree ("id","academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_branches_academy_name_uq" ON "academy_branches" USING btree ("academy_id",lower("name"));--> statement-breakpoint
CREATE INDEX "academy_branches_academy_active_idx" ON "academy_branches" USING btree ("academy_id","is_active");--> statement-breakpoint
ALTER TABLE "batch_schedules" ADD CONSTRAINT "batch_schedules_branch_academy_fk" FOREIGN KEY ("branch_id","academy_id") REFERENCES "public"."academy_branches"("id","academy_id") ON DELETE restrict ON UPDATE no action;