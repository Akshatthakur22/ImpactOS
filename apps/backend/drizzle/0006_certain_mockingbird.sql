CREATE TYPE "public"."expense_status" AS ENUM('recorded', 'voided');--> statement-breakpoint
CREATE TABLE "academy_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"category" varchar(80) NOT NULL,
	"description" varchar(200) NOT NULL,
	"payee_name" varchar(160),
	"amount_paise" integer NOT NULL,
	"method" "fee_payment_method" NOT NULL,
	"spent_at" timestamp with time zone NOT NULL,
	"reference" varchar(120),
	"note" varchar(240),
	"status" "expense_status" DEFAULT 'recorded' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" varchar(240),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_expenses_amount_positive_chk" CHECK ("academy_expenses"."amount_paise" > 0),
	CONSTRAINT "academy_expenses_void_consistent_chk" CHECK (("academy_expenses"."status" = 'recorded' AND "academy_expenses"."voided_at" IS NULL AND "academy_expenses"."voided_by" IS NULL AND "academy_expenses"."void_reason" IS NULL) OR ("academy_expenses"."status" = 'voided' AND "academy_expenses"."voided_at" IS NOT NULL AND "academy_expenses"."voided_by" IS NOT NULL AND "academy_expenses"."void_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "academy_expenses" ADD CONSTRAINT "academy_expenses_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_expenses" ADD CONSTRAINT "academy_expenses_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_expenses" ADD CONSTRAINT "academy_expenses_voided_by_academy_fk" FOREIGN KEY ("voided_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academy_expenses_id_academy_uq" ON "academy_expenses" USING btree ("id","academy_id");--> statement-breakpoint
CREATE INDEX "academy_expenses_academy_spent_idx" ON "academy_expenses" USING btree ("academy_id","spent_at");--> statement-breakpoint
CREATE INDEX "academy_expenses_academy_category_idx" ON "academy_expenses" USING btree ("academy_id","category");--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_discount_reason_chk" CHECK ("fee_charges"."discount_paise" = 0 OR ("fee_charges"."discount_reason" IS NOT NULL AND length(btrim("fee_charges"."discount_reason")) > 0));