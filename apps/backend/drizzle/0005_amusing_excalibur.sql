CREATE TYPE "public"."fee_charge_status" AS ENUM('issued', 'voided');--> statement-breakpoint
CREATE TYPE "public"."fee_payment_method" AS ENUM('cash', 'upi', 'bank_transfer');--> statement-breakpoint
CREATE TABLE "fee_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"invoice_number" varchar(32) NOT NULL,
	"description" varchar(200) NOT NULL,
	"billing_period" varchar(80),
	"due_date" date NOT NULL,
	"amount_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"discount_reason" varchar(240),
	"currency" varchar(3) NOT NULL,
	"status" "fee_charge_status" DEFAULT 'issued' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" varchar(240),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_charges_amount_positive_chk" CHECK ("fee_charges"."amount_paise" > 0),
	CONSTRAINT "fee_charges_discount_valid_chk" CHECK ("fee_charges"."discount_paise" >= 0 AND "fee_charges"."discount_paise" <= "fee_charges"."amount_paise"),
	CONSTRAINT "fee_charges_void_consistent_chk" CHECK (("fee_charges"."status" = 'issued' AND "fee_charges"."voided_at" IS NULL AND "fee_charges"."voided_by" IS NULL AND "fee_charges"."void_reason" IS NULL) OR ("fee_charges"."status" = 'voided' AND "fee_charges"."voided_at" IS NOT NULL AND "fee_charges"."voided_by" IS NOT NULL AND "fee_charges"."void_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "fee_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"receipt_number" varchar(32) NOT NULL,
	"idempotency_key" varchar(100) NOT NULL,
	"amount_paise" integer NOT NULL,
	"method" "fee_payment_method" NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"reference" varchar(120),
	"note" varchar(240),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_payments_amount_positive_chk" CHECK ("fee_payments"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "fee_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"idempotency_key" varchar(100) NOT NULL,
	"amount_paise" integer NOT NULL,
	"reason" varchar(240) NOT NULL,
	"refunded_at" timestamp with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_refunds_amount_positive_chk" CHECK ("fee_refunds"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "finance_counters" (
	"academy_id" uuid PRIMARY KEY NOT NULL,
	"last_invoice_number" integer DEFAULT 0 NOT NULL,
	"last_receipt_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fee_charges_id_academy_uq" ON "fee_charges" USING btree ("id","academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_payments_id_academy_uq" ON "fee_payments" USING btree ("id","academy_id");--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_student_academy_fk" FOREIGN KEY ("student_id","academy_id") REFERENCES "public"."students"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_voided_by_academy_fk" FOREIGN KEY ("voided_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_charge_academy_fk" FOREIGN KEY ("charge_id","academy_id") REFERENCES "public"."fee_charges"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_refunds" ADD CONSTRAINT "fee_refunds_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_refunds" ADD CONSTRAINT "fee_refunds_payment_academy_fk" FOREIGN KEY ("payment_id","academy_id") REFERENCES "public"."fee_payments"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_refunds" ADD CONSTRAINT "fee_refunds_created_by_academy_fk" FOREIGN KEY ("created_by","academy_id") REFERENCES "public"."users"("id","academy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_counters" ADD CONSTRAINT "finance_counters_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_charges_invoice_number_uq" ON "fee_charges" USING btree ("academy_id","invoice_number");--> statement-breakpoint
CREATE INDEX "fee_charges_student_due_idx" ON "fee_charges" USING btree ("academy_id","student_id","due_date");--> statement-breakpoint
CREATE INDEX "fee_charges_academy_status_due_idx" ON "fee_charges" USING btree ("academy_id","status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_payments_receipt_number_uq" ON "fee_payments" USING btree ("academy_id","receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_payments_idempotency_uq" ON "fee_payments" USING btree ("academy_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "fee_payments_charge_received_idx" ON "fee_payments" USING btree ("academy_id","charge_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_refunds_id_academy_uq" ON "fee_refunds" USING btree ("id","academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_refunds_idempotency_uq" ON "fee_refunds" USING btree ("academy_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "fee_refunds_payment_idx" ON "fee_refunds" USING btree ("academy_id","payment_id","refunded_at");
