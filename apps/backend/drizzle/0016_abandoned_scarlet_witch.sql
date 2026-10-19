ALTER TABLE "academy_branches" ADD COLUMN "geofence_latitude" double precision;--> statement-breakpoint
ALTER TABLE "academy_branches" ADD COLUMN "geofence_longitude" double precision;--> statement-breakpoint
ALTER TABLE "academy_branches" ADD COLUMN "geofence_radius_meters" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_session_presence" ADD COLUMN "checked_in_latitude" double precision;--> statement-breakpoint
ALTER TABLE "coach_session_presence" ADD COLUMN "checked_in_longitude" double precision;--> statement-breakpoint
ALTER TABLE "coach_session_presence" ADD COLUMN "checked_in_accuracy_meters" double precision;--> statement-breakpoint
ALTER TABLE "coach_session_presence" ADD COLUMN "checked_in_distance_meters" double precision;--> statement-breakpoint
ALTER TABLE "academy_branches" ADD CONSTRAINT "academy_branches_geofence_pair_chk" CHECK (("academy_branches"."geofence_latitude" is null and "academy_branches"."geofence_longitude" is null) or ("academy_branches"."geofence_latitude" is not null and "academy_branches"."geofence_longitude" is not null and "academy_branches"."geofence_latitude" between -90 and 90 and "academy_branches"."geofence_longitude" between -180 and 180));--> statement-breakpoint
ALTER TABLE "academy_branches" ADD CONSTRAINT "academy_branches_geofence_radius_chk" CHECK ("academy_branches"."geofence_radius_meters" between 25 and 1000);
