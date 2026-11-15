CREATE TABLE "username_changes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "username_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"old_username" varchar(64) NOT NULL,
	"new_username" varchar(64) NOT NULL,
	"changed_by" integer,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "username_changes" ADD CONSTRAINT "username_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "username_changes" ADD CONSTRAINT "username_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "username_changes_user_idx" ON "username_changes" USING btree ("user_id","changed_at");--> statement-breakpoint
-- Usernames are lowercase from now on. Uniqueness was already checked
-- without regard to case, so lowercasing cannot create duplicates. Names
-- that break the other new rules stay as they are until changed.
UPDATE "users" SET "username" = lower("username") WHERE "username" <> lower("username");
