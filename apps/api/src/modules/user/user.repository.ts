import { Inject, Injectable } from '@nestjs/common';
import { count, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { offsetOf, type PageInput } from '../../common/pagination.js';
import { DB, type Database } from '../../database/database.module.js';
import { users } from '../../database/schema.js';

export type UserRow = typeof users.$inferSelect;
export type NewUser = Pick<UserRow, 'email' | 'nickname' | 'passwordHash' | 'level'>;
export type UserPatch = Partial<Pick<UserRow, 'nickname' | 'realname' | 'quote' | 'avatarUrl' | 'passwordHash' | 'level'>>;

@Injectable()
export class UserRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findById(id: number): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row;
  }

  async findByIds(ids: number[]): Promise<UserRow[]> {
    if (ids.length === 0) return [];
    return this.db.select().from(users).where(inArray(users.id, ids));
  }

  /** Looks a user up by e-mail or nickname (both case-insensitive). */
  async findByIdentifier(identifier: string): Promise<UserRow | undefined> {
    const needle = identifier.toLowerCase();
    const [row] = await this.db
      .select()
      .from(users)
      .where(or(eq(sql`lower(${users.email})`, needle), eq(sql`lower(${users.nickname})`, needle)));
    return row;
  }

  async emailOrNicknameTaken(email: string, nickname: string, exceptId = 0): Promise<'email' | 'nickname' | null> {
    const rows = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        or(eq(sql`lower(${users.email})`, email.toLowerCase()), eq(sql`lower(${users.nickname})`, nickname.toLowerCase())),
      );
    const clash = rows.find((row) => row.id !== exceptId);
    if (!clash) return null;
    return clash.email.toLowerCase() === email.toLowerCase() ? 'email' : 'nickname';
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(users);
    return row?.n ?? 0;
  }

  async create(data: NewUser): Promise<UserRow> {
    const [row] = await this.db.insert(users).values(data).returning();
    return row!;
  }

  async update(id: number, patch: UserPatch): Promise<UserRow | undefined> {
    const [row] = await this.db.update(users).set(patch).where(eq(users.id, id)).returning();
    return row;
  }

  async list(page: PageInput, search?: string): Promise<{ rows: UserRow[]; total: number }> {
    const where = search
      ? or(ilike(users.nickname, `%${search}%`), ilike(users.email, `%${search}%`))
      : undefined;
    const [rows, [total]] = await Promise.all([
      this.db.select().from(users).where(where).orderBy(users.id).limit(page.pageSize).offset(offsetOf(page)),
      this.db.select({ n: count() }).from(users).where(where),
    ]);
    return { rows, total: total?.n ?? 0 };
  }
}
