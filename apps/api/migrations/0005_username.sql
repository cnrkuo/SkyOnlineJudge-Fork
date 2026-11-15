-- The unique handle is now the username (it was the nickname), and the
-- optional display name is now the nickname (it was the real name).
ALTER TABLE "users" RENAME COLUMN "nickname" TO "username";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "realname" TO "nickname";--> statement-breakpoint
ALTER INDEX "users_nickname_key" RENAME TO "users_username_key";
