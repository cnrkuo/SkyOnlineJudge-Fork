CREATE TABLE "attachments" (
	"problem_id" integer NOT NULL,
	"name" varchar(64) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_problem_id_name_pk" PRIMARY KEY("problem_id","name")
);
--> statement-breakpoint
CREATE TABLE "codepads" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "codepads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"hash" varchar(32) NOT NULL,
	"owner_id" integer,
	"language" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contest_problems" (
	"contest_id" integer NOT NULL,
	"problem_id" integer NOT NULL,
	"tag" varchar(8) NOT NULL,
	"state" integer NOT NULL,
	"priority" integer NOT NULL,
	CONSTRAINT "contest_problems_contest_id_problem_id_pk" PRIMARY KEY("contest_id","problem_id")
);
--> statement-breakpoint
CREATE TABLE "contest_users" (
	"contest_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"state" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contest_users_contest_id_user_id_pk" PRIMARY KEY("contest_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"style" varchar(16) NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"register_type" integer NOT NULL,
	"register_password" varchar(100) DEFAULT '' NOT NULL,
	"freeze_sec" integer DEFAULT 3600 NOT NULL,
	"penalty_sec" integer DEFAULT 1200 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judges" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "judges_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(64) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "problems_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"content_access" integer NOT NULL,
	"submit_open" boolean DEFAULT false NOT NULL,
	"codeview_access" integer NOT NULL,
	"time_limit_ms" integer DEFAULT 1000 NOT NULL,
	"memory_limit_kb" integer DEFAULT 262144 NOT NULL,
	"score_mode" varchar(16) DEFAULT 'average' NOT NULL,
	"score_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "submissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"problem_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"language" varchar(16) NOT NULL,
	"code" text NOT NULL,
	"verdict" integer DEFAULT 0 NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"time_ms" integer DEFAULT 0 NOT NULL,
	"memory_kb" integer DEFAULT 0 NOT NULL,
	"compile_message" text DEFAULT '' NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"judge_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"judge_started_at" timestamp with time zone,
	"judged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "testcases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "testcases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"problem_id" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"name" varchar(64) NOT NULL,
	"input_sha256" varchar(64) NOT NULL,
	"output_sha256" varchar(64) NOT NULL,
	"input_size" integer NOT NULL,
	"output_size" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" varchar(64) NOT NULL,
	"nickname" varchar(64) NOT NULL,
	"password_hash" text NOT NULL,
	"realname" varchar(30),
	"level" integer NOT NULL,
	"quote" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codepads" ADD CONSTRAINT "codepads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_users" ADD CONSTRAINT "contest_users_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_users" ADD CONSTRAINT "contest_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testcases" ADD CONSTRAINT "testcases_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "codepads_hash_key" ON "codepads" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "codepads_owner_idx" ON "codepads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "contest_problems_problem_idx" ON "contest_problems" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "contest_users_user_idx" ON "contest_users" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "judges_name_key" ON "judges" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "judges_token_key" ON "judges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "submissions_problem_idx" ON "submissions" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "submissions_user_idx" ON "submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "submissions_verdict_idx" ON "submissions" USING btree ("verdict");--> statement-breakpoint
CREATE INDEX "submissions_created_idx" ON "submissions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "testcases_problem_ordinal_key" ON "testcases" USING btree ("problem_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_nickname_key" ON "users" USING btree ("nickname");