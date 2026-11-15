import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gte, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { offsetOf, type PageInput } from '../../common/pagination.js';
import { type Database, DB } from '../../database/database.module.js';
import { usernameChanges, users } from '../../database/schema.js';

export type UserRow = typeof users.$inferSelect;
export type NewUser = Pick<UserRow, 'email' | 'username' | 'passwordHash' | 'level'>;
export type UserPatch = Partial<
  Pick<UserRow, 'username' | 'nickname' | 'introduction' | 'avatarUrl' | 'passwordHash' | 'level'>
>;

@Injectable()
export class UserRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findById(id: number): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row;
  }

  /** Usernames are unique without regard to case, so the lookup ignores it. */
  async findByUsername(username: string): Promise<UserRow | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.username})`, username.toLowerCase()));
    return row;
  }

  async findByIds(ids: number[]): Promise<UserRow[]> {
    if (ids.length === 0) return [];
    return this.db.select().from(users).where(inArray(users.id, ids));
  }

  /** Looks a user up by e-mail or username (both case-insensitive). */
  async findByIdentifier(identifier: string): Promise<UserRow | undefined> {
    const needle = identifier.toLowerCase();
    const [row] = await this.db
      .select()
      .from(users)
      .where(or(eq(sql`lower(${users.email})`, needle), eq(sql`lower(${users.username})`, needle)));
    return row;
  }

  /** Which of a new account's identifiers is already in use, if any (case-insensitive). */
  async registrationClash(email: string, username: string): Promise<'email' | 'username' | null> {
    const [clash] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(
        or(
          eq(sql`lower(${users.email})`, email.toLowerCase()),
          eq(sql`lower(${users.username})`, username.toLowerCase()),
        ),
      )
      .limit(1);
    if (!clash) return null;
    return clash.email.toLowerCase() === email.toLowerCase() ? 'email' : 'username';
  }

  /** Whether another account than `exceptUserId` already uses `username` (case-insensitive). */
  async usernameTaken(username: string, exceptUserId: number): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(sql`lower(${users.username})`, username.toLowerCase()), ne(users.id, exceptUserId)))
      .limit(1);
    return row !== undefined;
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(users);
    return row?.n ?? 0;
  }

  async create(data: NewUser): Promise<UserRow> {
    const [row] = await this.db.insert(users).values(data).returning();
    return row!;
  }

  /**
   * Saves a patch. A new username in it is recorded in the username history
   * as changed by `changedBy`, in the same transaction.
   */
  async update(id: number, patch: UserPatch, changedBy?: number): Promise<UserRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [before] = patch.username ? await tx.select().from(users).where(eq(users.id, id)) : [];
      const [row] = await tx.update(users).set(patch).where(eq(users.id, id)).returning();
      if (row && before && before.username !== row.username) {
        await tx.insert(usernameChanges).values({
          userId: id,
          oldUsername: before.username,
          newUsername: row.username,
          changedBy: changedBy ?? id,
        });
      }
      return row;
    });
  }

  /** When the user changed their own username since `since`, oldest first. */
  async ownUsernameChangesSince(userId: number, since: Date): Promise<Date[]> {
    const rows = await this.db
      .select({ at: usernameChanges.changedAt })
      .from(usernameChanges)
      .where(
        and(
          eq(usernameChanges.userId, userId),
          eq(usernameChanges.changedBy, userId),
          gte(usernameChanges.changedAt, since),
        ),
      )
      .orderBy(asc(usernameChanges.changedAt));
    return rows.map((row) => row.at);
  }

  async list(page: PageInput, search?: string): Promise<{ rows: UserRow[]; total: number }> {
    const where = search ? or(ilike(users.username, `%${search}%`), ilike(users.email, `%${search}%`)) : undefined;
    const [rows, [total]] = await Promise.all([
      this.db.select().from(users).where(where).orderBy(users.id).limit(page.pageSize).offset(offsetOf(page)),
      this.db.select({ n: count() }).from(users).where(where),
    ]);
    return { rows, total: total?.n ?? 0 };
  }
}
