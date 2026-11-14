CREATE TABLE "board_problems" (
	"board_id" integer NOT NULL,
	"problem_id" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"note" varchar(100) DEFAULT '' NOT NULL,
	CONSTRAINT "board_problems_board_id_problem_id_pk" PRIMARY KEY("board_id","problem_id")
);
--> statement-breakpoint
CREATE TABLE "board_users" (
	"board_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "board_users_board_id_user_id_pk" PRIMARY KEY("board_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "boards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"announce" text DEFAULT '' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"allow_join" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quote_ref" varchar(80);--> statement-breakpoint
ALTER TABLE "board_problems" ADD CONSTRAINT "board_problems_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_problems" ADD CONSTRAINT "board_problems_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_users" ADD CONSTRAINT "board_users_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_users" ADD CONSTRAINT "board_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;