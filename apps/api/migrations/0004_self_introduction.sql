-- Profiles: the quote and its source become one Markdown self-introduction.
-- An existing quote is kept as a blockquote (every line prefixed with "> "),
-- with its source as the last line, so it still reads as a quotation.
ALTER TABLE "users" ADD COLUMN "introduction" text;--> statement-breakpoint
UPDATE "users"
SET "introduction" = regexp_replace("quote", '^', '> ', 'gn')
  || CASE WHEN coalesce("quote_ref", '') <> '' THEN E'\n>\n> — ' || "quote_ref" ELSE '' END
WHERE coalesce("quote", '') <> '';--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "quote";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "quote_ref";
